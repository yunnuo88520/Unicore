// Author: yunnuo <ymz@ebox.vip>
// Description: Registered-type delivery facade over the personal inbox: modules
// deliver user notifications through one controlled surface and refresh
// connected clients through the realtime hub. It does not replace the mail,
// WeCom or webhook delivery queues.

package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/realtime"
)

// Definition describes one registered notification type. Type is the stable
// identifier stored in unicore_inbox_messages.type; the bilingual titles let
// hosts label sources without re-reading rows.
type Definition struct {
	Type    string
	TitleZh string
	TitleEn string
}

// Registry is the assembly-time allowlist of notification types. Deliveries
// with unregistered types are rejected, so a typo inside a module cannot spray
// unlabelled rows into every user inbox.
type Registry struct {
	mu    sync.RWMutex
	types map[string]Definition
}

func NewRegistry() *Registry {
	return &Registry{types: map[string]Definition{}}
}

// Register adds one type; duplicates are rejected so two modules cannot claim
// the same identifier.
func (r *Registry) Register(def Definition) error {
	def.Type = strings.TrimSpace(def.Type)
	if def.Type == "" || len(def.Type) > 32 || strings.ContainsAny(def.Type, "\r\n") {
		return fmt.Errorf("notify: invalid type %q", def.Type)
	}
	if strings.TrimSpace(def.TitleZh) == "" || strings.TrimSpace(def.TitleEn) == "" {
		return fmt.Errorf("notify: type %q needs bilingual titles", def.Type)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.types[def.Type]; exists {
		return fmt.Errorf("notify: type %q already registered", def.Type)
	}
	r.types[def.Type] = def
	return nil
}

// Registered returns the snapshot ordered by type for diagnostics.
func (r *Registry) Registered() []Definition {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]Definition, 0, len(r.types))
	for _, def := range r.types {
		list = append(list, def)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Type < list[j].Type })
	return list
}

func (r *Registry) registered(messageType string) (Definition, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	def, ok := r.types[messageType]
	return def, ok
}

// InboxDeliverer is the storage contract; *platformsql.Repository satisfies it.
type InboxDeliverer interface {
	DeliverInbox(ctx context.Context, runner sqlstore.Runner, recipients []string, messageType, sourceID, title, body, actions string) error
}

// InboxFunc adapts a lazy or dynamic deliverer (the platform store only exists
// after installation) into InboxDeliverer.
type InboxFunc func(ctx context.Context, runner sqlstore.Runner, recipients []string, messageType, sourceID, title, body, actions string) error

func (fn InboxFunc) DeliverInbox(ctx context.Context, runner sqlstore.Runner, recipients []string, messageType, sourceID, title, body, actions string) error {
	return fn(ctx, runner, recipients, messageType, sourceID, title, body, actions)
}

// Broadcaster refreshes connected clients; *realtime.Hub satisfies it.
type Broadcaster interface {
	PublishMany(userIDs []string, event realtime.Event)
}

// ErrUnregisteredType is returned for deliveries whose type was never
// registered at assembly time.
var ErrUnregisteredType = errors.New("notify: unregistered notification type")

// Notifier is the module-facing delivery facade.
type Notifier struct {
	Registry *Registry
	Inbox    InboxDeliverer
	Hub      Broadcaster
}

// Deliver stores one notification batch inside the caller's transaction.
// With a nonempty sourceID an existing (recipient, type, source_id) row is
// updated in place, preserving read state and created_at; an empty sourceID
// always inserts independent messages. actions carries module-defined buttons
// (id/label/href, at most four) rendered by the bell panel; nil means none.
// Publish inbox.new after the caller commits, never inside the transaction.
func (n *Notifier) Deliver(ctx context.Context, runner sqlstore.Runner, recipients []string, messageType, sourceID, title, body string, actions []contracts.InboxAction) error {
	if _, ok := n.Registry.registered(messageType); !ok {
		return fmt.Errorf("%w: %q", ErrUnregisteredType, messageType)
	}
	payload := ""
	if len(actions) > 0 {
		encoded, err := json.Marshal(actions)
		if err != nil {
			return err
		}
		payload = string(encoded)
	}
	return n.Inbox.DeliverInbox(ctx, runner, recipients, messageType, sourceID, title, body, payload)
}

// NotifyUsers is the convenience path for deliveries that do not belong to a
// caller transaction: it delivers on the store itself and publishes inbox.new
// to every recipient once storage succeeded. Publish is best effort — clients
// recover through the next bootstrap or window-focus refetch.
func (n *Notifier) NotifyUsers(ctx context.Context, store sqlstore.Runner, recipients []string, messageType, sourceID, title, body string, actions []contracts.InboxAction) error {
	if err := n.Deliver(ctx, store, recipients, messageType, sourceID, title, body, actions); err != nil {
		return err
	}
	if n.Hub != nil && len(recipients) > 0 {
		n.Hub.PublishMany(recipients, realtime.Event{Name: "inbox.new"})
	}
	return nil
}
