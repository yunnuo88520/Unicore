// Author: yunnuo <ymz@ebox.vip>
// Description: Committed announcement changes invalidate live clients; rejected writes do not.
package usecase

import (
	"context"
	"errors"
	"testing"

	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
)

type announcementMutationRepository struct {
	AnnouncementRepository
	err error
}

func (r announcementMutationRepository) Save(_ context.Context, a domain.Announcement, _ string, _ bool) (domain.Announcement, error) {
	return a, r.err
}
func (r announcementMutationRepository) Delete(context.Context, []contracts.AnnouncementSelection, string) error {
	return r.err
}
func (r announcementMutationRepository) SetEnabled(context.Context, bool, string) error {
	return r.err
}

type announcementEvents struct{ names []string }

func (e *announcementEvents) Broadcast(name string) { e.names = append(e.names, name) }

func TestAnnouncementChangesInvalidateLiveClients(t *testing.T) {
	input := contracts.AnnouncementInput{Title: "Notice", Content: "Updated notice", Format: "markdown", Type: "info", Status: "draft", PublishAt: 1, Audience: "all", NotifyMode: "silent", RecipientIds: []string{}}
	for _, rejected := range []bool{false, true} {
		for _, mutation := range []string{"create", "archive", "delete", "disable"} {
			t.Run(mutation+map[bool]string{false: "/committed", true: "/rejected"}[rejected], func(t *testing.T) {
				var writeErr error
				if rejected {
					writeErr = errors.New("write rejected")
				}
				events := &announcementEvents{}
				service := &Announcements{Repo: announcementMutationRepository{err: writeErr}, Render: func(body, _ string) (string, error) { return body, nil }, Realtime: events}
				var err error
				switch mutation {
				case "create":
					_, err = service.Create(context.Background(), input, "admin")
				case "archive":
					_, err = service.Update(context.Background(), "notice", contracts.AnnouncementUpdate{Title: input.Title, Content: input.Content, Format: input.Format, Type: input.Type, Status: "archived", PublishAt: input.PublishAt, Audience: input.Audience, NotifyMode: input.NotifyMode, RecipientIds: input.RecipientIds, Version: 1}, "admin")
				case "delete":
					err = service.Delete(context.Background(), contracts.AnnouncementDelete{Items: []contracts.AnnouncementSelection{{ID: "notice", Version: 1}}}, "admin")
				case "disable":
					err = service.SetEnabled(context.Background(), contracts.AnnouncementSetting{Enabled: false}, "admin")
				}
				if !errors.Is(err, writeErr) {
					t.Fatalf("mutation result: %v, want %v", err, writeErr)
				}
				if rejected && len(events.names) != 0 {
					t.Fatalf("rejected change broadcast: %v", events.names)
				}
				if !rejected && (len(events.names) != 1 || events.names[0] != "inbox.new") {
					t.Fatalf("committed change was not broadcast: %v", events.names)
				}
			})
		}
	}
}
