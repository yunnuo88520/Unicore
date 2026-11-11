// Author: yunnuo <ymz@ebox.vip>
// Description: Alert engine shared by Platform and Standalone: single-goroutine ticker, consecutive-sample state machine, attribution and notification discipline over the runtime event buffer.
package monitor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
)

// Alert event types extending the runtime event catalog.
const (
	EventAlertTriggered     = "alert_triggered"
	EventAlertRecovered     = "alert_recovered"
	EventAlertReclassified  = "alert_reclassified"
	EventNotificationFailed = "notification_failed"
)

// Stable rule IDs — never renamed; display names live beside them.
const (
	RuleDBUnavailable     = "db_unavailable"
	RuleCPUHigh           = "cpu_high"
	RuleMemoryHigh        = "memory_high"
	RuleDiskDataDir       = "disk_data_dir"
	RuleTaskRecentFailure = "task_recent_failure"
	RuleOverallHealth     = "overall_health"
)

// AlertKind selects the evaluator for one rule.
type AlertKind string

const (
	KindDatabaseStatus AlertKind = "database_status"
	KindCPU            AlertKind = "cpu"
	KindMemory         AlertKind = "memory"
	KindDisk           AlertKind = "disk"
	KindTasks          AlertKind = "tasks"
	KindOverall        AlertKind = "overall"
)

// AlertRule is one configured rule; thresholds are percent for the resource
// kinds and ignored for the status kinds.
type AlertRule struct {
	ID              string
	Kind            AlertKind
	Name            string
	Enabled         bool
	Trigger         float64
	Recover         float64
	Consecutive     int
	CooldownMinutes int
	Severity        string
	PlatformOnly    bool
}

// DefaultAlertRules returns the built-in rule set: five defaults for Platform
// (overall_health excluded), four for Standalone (the task rule needs the
// platform scheduler and is skipped where tasks do not apply).
func DefaultAlertRules(platform bool) []AlertRule {
	rules := []AlertRule{
		{ID: RuleDBUnavailable, Kind: KindDatabaseStatus, Name: "数据库不可用", Enabled: true, Consecutive: 2, CooldownMinutes: 30, Severity: SeverityError},
		{ID: RuleCPUHigh, Kind: KindCPU, Name: "CPU 使用率过高", Enabled: true, Trigger: 85, Recover: 70, Consecutive: 4, CooldownMinutes: 30, Severity: SeverityWarning},
		{ID: RuleMemoryHigh, Kind: KindMemory, Name: "内存使用率过高", Enabled: true, Trigger: 90, Recover: 80, Consecutive: 4, CooldownMinutes: 30, Severity: SeverityWarning},
		{ID: RuleDiskDataDir, Kind: KindDisk, Name: "数据目录磁盘空间不足", Enabled: true, Trigger: 90, Recover: 85, Consecutive: 2, CooldownMinutes: 30, Severity: SeverityWarning},
	}
	if platform {
		rules = append(rules, AlertRule{ID: RuleTaskRecentFailure, Kind: KindTasks, Name: "任务最近执行失败", Enabled: true, Consecutive: 2, CooldownMinutes: 30, Severity: SeverityWarning, PlatformOnly: true})
	}
	return rules
}

// AlertSnapshotFunc produces one shared snapshot per detection tick.
type AlertSnapshotFunc func(ctx context.Context) contracts.MonitorSnapshot

// AlertNotice carries one notification-worthy transition with the structured
// fields a delivery adapter maps onto template variables; Body repeats the
// runtime event's KV detail for auditability.
type AlertNotice struct {
	Rule       AlertRule
	Action     string // "triggered" or "recovered"
	Value      string
	Scope      string
	Extra      string
	Body       string
	Instance   string
	Host       string
	OccurredAt time.Time // when the alert fired; recoveries carry the original trigger time
	Duration   string    // how long the alert stayed firing; empty for triggers
}

// AlertNotifier delivers one external notification synchronously; Standalone
// uses NoopNotifier and never enters this path. ErrNotifierNotConfigured means
// the mail channel is simply not set up (silent skip), other errors are real
// enqueue failures.
type AlertNotifier interface {
	NotifyAlert(notice AlertNotice) error
}

var ErrNotifierNotConfigured = errors.New("notification channel not configured")

// NoopNotifier is the Standalone exit: alerting never sends externally.
type NoopNotifier struct{}

func (NoopNotifier) NotifyAlert(AlertNotice) error { return ErrNotifierNotConfigured }

// AlertOptions tunes the engine; zero values take the designed defaults.
type AlertOptions struct {
	Interval    time.Duration // detection tick, default 30s
	GracePeriod time.Duration // Platform notification grace, default 2m
	InstanceID  string        // installation instance id (short code)
	Hostname    string        // defaults to os.Hostname
	Now         func() time.Time
}

type alertState struct {
	streak            int
	firing            bool
	suppressedTrigger bool
	lastNotify        time.Time
	pendingDue        time.Time
	pending           *AlertNotice
	firedAt           time.Time // when the current firing episode started
	failedTasks       map[string]bool // names behind the current firing (task rule)
}

// AlertEngine evaluates the enabled rules over one shared snapshot per tick.
// State, events and notifications are three independent layers: the state
// machine and runtime events behave identically on every form, only the
// notification exit differs.
type AlertEngine struct {
	snapshot   AlertSnapshotFunc
	sink       *EventSink
	notifier   AlertNotifier
	platform   bool
	instanceID string
	hostname   string
	interval   time.Duration
	grace      time.Duration
	now        func() time.Time

	mu         sync.Mutex
	rules      []AlertRule
	states     map[string]*alertState
	running    bool
	stop       chan struct{}
	done       chan struct{}
	evaluating bool
	startedAt  time.Time
}

// NewAlertEngine assembles the engine; rules arrive via SetRules.
func NewAlertEngine(snapshot AlertSnapshotFunc, sink *EventSink, notifier AlertNotifier, platform bool, opts AlertOptions) *AlertEngine {
	if opts.Interval <= 0 {
		opts.Interval = 30 * time.Second
	}
	if opts.GracePeriod <= 0 {
		opts.GracePeriod = 2 * time.Minute
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Hostname == "" {
		if name, err := os.Hostname(); err == nil {
			opts.Hostname = name
		}
	}
	if opts.InstanceID == "" {
		opts.InstanceID = "unknown"
	}
	return &AlertEngine{
		snapshot: snapshot, sink: sink, notifier: notifier, platform: platform,
		instanceID: opts.InstanceID, hostname: opts.Hostname,
		interval: opts.Interval, grace: opts.GracePeriod, now: opts.Now,
		rules:  []AlertRule{},
		states: map[string]*alertState{},
		stop:   make(chan struct{}),
		done:   make(chan struct{}),
	}
}

// SetRules atomically replaces the rule set and resets per-rule streaks so a
// modified threshold never inherits the old count. Starts or stops the ticker
// so an all-disabled set costs nothing.
func (e *AlertEngine) SetRules(rules []AlertRule) {
	e.mu.Lock()
	e.rules = append([]AlertRule(nil), rules...)
	// Streaks reset (an old count must not survive a threshold change), but a
	// rule that is actively firing keeps its firing state across the update.
	for id, state := range e.states {
		if state.firing {
			state.streak = 0
			state.suppressedTrigger = false
			state.pendingDue, state.pending = time.Time{}, nil
			continue
		}
		delete(e.states, id)
	}
	shouldRun := false
	for _, rule := range e.rules {
		if rule.Enabled && (!rule.PlatformOnly || e.platform) {
			shouldRun = true
		}
	}
	running := e.running
	e.mu.Unlock()
	if shouldRun && !running {
		e.Start()
	} else if !shouldRun && running {
		e.Stop()
	}
}

// Start launches the detection goroutine; it is a no-op when already running.
func (e *AlertEngine) Start() {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return
	}
	e.running = true
	e.startedAt = e.now()
	stop, done := e.stop, e.done
	e.mu.Unlock()
	go e.loop(stop, done)
}

// Stop releases the ticker and waits for the current tick to finish.
func (e *AlertEngine) Stop() {
	e.mu.Lock()
	if !e.running {
		e.mu.Unlock()
		return
	}
	e.running = false
	close(e.stop)
	e.mu.Unlock()
	<-e.done
}

func (e *AlertEngine) loop(stop chan struct{}, done chan struct{}) {
	defer close(done)
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			e.Tick(context.Background())
		}
	}
}

// Tick runs one detection pass; concurrent or overlapping invocation is
// skipped, and an evaluation panic never takes the process down.
func (e *AlertEngine) Tick(ctx context.Context) {
	e.mu.Lock()
	if e.evaluating {
		e.mu.Unlock()
		return
	}
	e.evaluating = true
	rules := e.enabledRules()
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		e.evaluating = false
		e.mu.Unlock()
		if recovered := recover(); recovered != nil {
			e.appendEvent(EventNotificationFailed, SeverityError, "告警评估异常", fmt.Sprint(recovered))
		}
	}()
	if len(rules) == 0 {
		return
	}
	snapshot := e.snapshot(ctx)
	e.evaluate(rules, snapshot)
}

func (e *AlertEngine) enabledRules() []AlertRule {
	rules := []AlertRule{}
	for _, rule := range e.rules {
		if rule.Enabled && (!rule.PlatformOnly || e.platform) {
			rules = append(rules, rule)
		}
	}
	return rules
}

// evaluate is the per-tick state machine; specific rules run before the
// overall rule so attribution can see their state.
func (e *AlertEngine) evaluate(rules []AlertRule, snapshot contracts.MonitorSnapshot) {
	now := e.now()
	specific := map[string]string{} // rule id -> counting | firing
	results := map[string]alertEvaluation{}
	for _, rule := range rules {
		if rule.Kind == KindOverall {
			continue
		}
		results[rule.ID] = e.evaluateRule(rule, snapshot, now, "", "")
		if results[rule.ID].abnormal {
			if results[rule.ID].firing {
				specific[rule.ID] = "firing"
			} else {
				specific[rule.ID] = "counting"
			}
		}
	}
	for _, rule := range rules {
		if rule.Kind != KindOverall {
			continue
		}
		attributedTo := ""
		for _, id := range []string{RuleDBUnavailable, RuleTaskRecentFailure} {
			if state, ok := specific[id]; ok {
				attributedTo = id
				_ = state
				break
			}
		}
		results[rule.ID] = e.evaluateRule(rule, snapshot, now, "overall", attributedTo)
	}
}

// metric extracts one rule's reading from the shared snapshot and decides
// whether the rule counts as abnormal *right now*, applying the trigger
// threshold before firing and the recovery threshold while firing (hysteresis).
// Missing data answers applicable=false — never a zero, never a host value
// pretending to be the container view.
func (e *AlertEngine) metric(rule AlertRule, snapshot contracts.MonitorSnapshot, mode, attributedTo string) (value, scope string, applicable bool, abnormalNow bool) {
	host := snapshot.Host
	switch rule.Kind {
	case KindDatabaseStatus:
		return snapshot.Database.Status, "instance", true, snapshot.Database.Status != "healthy"
	case KindCPU:
		if !host.Available {
			return "", "", false, false
		}
		if host.Container != nil && host.Container.Detected {
			if host.Container.CpuPercent != nil {
				return fmt.Sprintf("%.1f%%", *host.Container.CpuPercent), "container", true, e.abnormalPercent(rule, *host.Container.CpuPercent)
			}
			if host.Container.CpuQuotaCores != nil {
				// An effective limit exists but usage is missing this pull:
				// skip instead of pretending with the host reading.
				return "", "", false, false
			}
		}
		if host.CpuPercent == nil {
			return "", "", false, false
		}
		return fmt.Sprintf("%.1f%%", *host.CpuPercent), "host", true, e.abnormalPercent(rule, *host.CpuPercent)
	case KindMemory:
		if !host.Available {
			return "", "", false, false
		}
		if host.Container != nil && host.Container.Detected && host.Container.MemoryLimitBytes != nil && *host.Container.MemoryLimitBytes > 0 {
			percent := float64(*host.Container.MemoryUsageBytes) / float64(*host.Container.MemoryLimitBytes) * 100
			return fmt.Sprintf("%.1f%%", percent), "container", true, e.abnormalPercent(rule, percent)
		}
		if host.MemUsedPercent == nil {
			return "", "", false, false
		}
		return fmt.Sprintf("%.1f%%", *host.MemUsedPercent), "host", true, e.abnormalPercent(rule, *host.MemUsedPercent)
	case KindDisk:
		if !host.Available || host.Disks == nil {
			return "", "", false, false
		}
		for _, disk := range *host.Disks {
			if disk.IsDataDir == nil || !*disk.IsDataDir {
				continue
			}
			return fmt.Sprintf("%.1f%%", disk.UsedPercent), "host", true, e.abnormalPercent(rule, disk.UsedPercent)
		}
		// No data-directory row this pull: skip instead of reading zero.
		return "", "", false, false
	case KindTasks:
		return e.taskValue(snapshot)
	case KindOverall:
		unhealthy := snapshot.Status != "healthy"
		if !unhealthy {
			return snapshot.Status, "instance", true, false
		}
		if attributedTo != "" {
			// Covered by a specific rule: not an independent anomaly.
			return snapshot.Status, "instance", true, false
		}
		return snapshot.Status, "instance", true, true
	}
	return "", "", false, false
}

func (e *AlertEngine) abnormalPercent(rule AlertRule, percent float64) bool {
	state := e.states[rule.ID]
	firing := state != nil && state.firing
	if firing {
		// Stay firing until the recovery threshold is met.
		return percent > rule.Recover
	}
	return percent > rule.Trigger
}

// failingTaskNames collects the enabled tasks whose latest run failed.
func failingTaskNames(snapshot contracts.MonitorSnapshot) map[string]bool {
	names := map[string]bool{}
	if snapshot.Tasks.Applicable && snapshot.Tasks.Recent != nil {
		for _, item := range *snapshot.Tasks.Recent {
			if item.Enabled && item.LastStatus != nil && *item.LastStatus == "error" {
				names[item.Name] = true
			}
		}
	}
	return names
}

// taskExitReason classifies why the failing count dropped while firing: an
// empty reason is a true recovery (a listed task now reports success), a
// disabled reason means the failing task left the scope without succeeding,
// and a removed reason means the task (or the whole registry) is gone.
func taskExitReason(state *alertState, snapshot contracts.MonitorSnapshot) string {
	if !snapshot.Tasks.Applicable || snapshot.Tasks.Recent == nil {
		return "reason=not_applicable"
	}
	for _, item := range *snapshot.Tasks.Recent {
		if state.failedTasks[item.Name] {
			if item.Enabled && item.LastStatus != nil && *item.LastStatus != "error" {
				return "" // a successful run covered the failure: true recovery
			}
			if !item.Enabled {
				return "reason=task_disabled"
			}
		}
	}
	return "reason=task_removed"
}

func (e *AlertEngine) taskValue(snapshot contracts.MonitorSnapshot) (string, string, bool, bool) {
	if !snapshot.Tasks.Applicable || snapshot.Tasks.Recent == nil {
		return "", "", false, false
	}
	count := 0
	for _, item := range *snapshot.Tasks.Recent {
		if item.Enabled && item.LastStatus != nil && *item.LastStatus == "error" {
			count++
		}
	}
	state := e.states[RuleTaskRecentFailure]
	firing := state != nil && state.firing
	abnormal := count > 0
	if firing {
		// While firing only a fully clear count recovers; the trigger and
		// recovery thresholds coincide for a count metric.
		abnormal = count > 0
	}
	return fmt.Sprintf("count=%d", count), "instance", true, abnormal
}

// alertEvaluation carries one rule's outcome for attribution ordering.
type alertEvaluation struct {
	abnormal bool
	firing   bool
}

// evaluateRule advances one rule's state machine and produces events and
// notifications per the design's three-layer separation.
func (e *AlertEngine) evaluateRule(rule AlertRule, snapshot contracts.MonitorSnapshot, now time.Time, mode, attributedTo string) alertEvaluation {
	e.mu.Lock()
	state := e.states[rule.ID]
	if state == nil {
		state = &alertState{}
		e.states[rule.ID] = state
	}
	e.mu.Unlock()

	value, scope, applicable, abnormal := e.metric(rule, snapshot, mode, attributedTo)

	// Not applicable (rule's data source absent): leave the alert via a
	// recovered event marked as no longer applicable, never notified.
	if !applicable {
		e.exitRule(rule, state, now, "not_applicable", value, scope)
		return alertEvaluation{}
	}

	switch {
	case abnormal && !state.firing:
		state.streak++
		if state.streak >= rule.Consecutive {
			state.firing = true
			state.firedAt = now
			if rule.Kind == KindTasks {
				state.failedTasks = failingTaskNames(snapshot)
			}
			notice := e.notice(rule, "triggered", value, scope, fmt.Sprintf("连续 %d 拍超过阈值 %.4g", rule.Consecutive, rule.Trigger), now, "")
			e.appendEvent(EventAlertTriggered, rule.Severity, "告警触发："+rule.Name, notice.Body)
			e.sendOrSuppress(state, now, notice)
		}
	case abnormal && state.firing:
		// Sustained: no new events, no new notifications. A trigger
		// notification delayed by the cooldown goes out when it is due.
		e.flushPending(state, now)
	case !abnormal && state.firing:
		if mode == "overall" && attributedTo != "" {
			// The anomaly is now attributable to a specific rule: the
			// overall alert exits as reclassified, never as recovered.
			e.appendEvent(EventAlertReclassified, SeverityInfo, "告警归因转移："+rule.Name, e.body(rule, "归因转移", value, scope, "attributed_to="+attributedTo))
			e.reset(state)
			return alertEvaluation{}
		}
		if rule.Kind == KindTasks {
			// Distinguish a true recovery (a successful run covered the
			// failure) from the failure leaving the scope (disabled or
			// removed): only the former notifies.
			if reason := taskExitReason(state, snapshot); reason != "" {
				e.appendEvent(EventAlertRecovered, SeverityInfo, "告警退出："+rule.Name, e.body(rule, "退出", value, scope, reason))
				e.reset(state)
				return alertEvaluation{abnormal: false, firing: false}
			}
		}
		duration := ""
		if !state.firedAt.IsZero() {
			duration = now.Sub(state.firedAt).Truncate(time.Second).String()
		}
		notice := e.notice(rule, "recovered", value, scope, fmt.Sprintf("已低于恢复阈值 %.4g", rule.Recover), state.firedAt, duration)
		e.appendEvent(EventAlertRecovered, SeverityInfo, "告警恢复："+rule.Name, notice.Body)
		e.reset(state)
		// A true recovery always notifies; cooldown never suppresses it.
		e.notify(now, notice)
	case !abnormal && !state.firing:
		state.streak = 0
	}
	// Grace-period sweep once the window has passed: a still-firing rule
	// receives its one deferred trigger notification, a recovered one discards it.
	if state.suppressedTrigger && !e.inGrace(now) {
		if state.firing {
			state.suppressedTrigger = false
			e.notify(now, state.pending)
		} else {
			state.suppressedTrigger = false
		}
	}
	// A pending cooldown-delayed notification goes out when its window ends,
	// regardless of later recovery being meaningless for this trigger.
	if !state.pendingDue.IsZero() && !now.Before(state.pendingDue) {
		if state.firing {
			e.notify(now, state.pending)
		}
		state.pendingDue, state.pending = time.Time{}, nil
	}
	return alertEvaluation{abnormal: abnormal, firing: state.firing}
}

// exitRule leaves an alert because its data source no longer applies
// (task disabled/removed, disk row gone): an event without notification.
func (e *AlertEngine) exitRule(rule AlertRule, state *alertState, now time.Time, reason, value, scope string) {
	e.mu.Lock()
	firing := state.firing
	e.mu.Unlock()
	if !firing {
		return
	}
	body := e.body(rule, "退出", value, scope, "reason="+reason)
	e.appendEvent(EventAlertRecovered, SeverityInfo, "告警退出："+rule.Name, body)
	e.reset(state)
}

func (e *AlertEngine) reset(state *alertState) {
	state.firing = false
	state.streak = 0
	state.suppressedTrigger = false
	state.pendingDue, state.pending = time.Time{}, nil
	state.firedAt = time.Time{}
	state.failedTasks = nil
}

func (e *AlertEngine) inGrace(now time.Time) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return now.Sub(e.startedAt) < e.grace
}

// sendOrSuppress writes the notification path for a fresh trigger: inside the
// grace window it defers (sweep decides later), the cooldown may delay it to
// a later tick, otherwise it sends now.
func (e *AlertEngine) sendOrSuppress(state *alertState, now time.Time, notice *AlertNotice) {
	if e.inGrace(now) {
		state.suppressedTrigger = true
		state.pending = notice
		return
	}
	cooldown := time.Duration(notice.Rule.CooldownMinutes) * time.Minute
	if !state.lastNotify.IsZero() && now.Before(state.lastNotify.Add(cooldown)) {
		state.pendingDue = state.lastNotify.Add(cooldown)
		state.pending = notice
		return
	}
	e.notify(now, notice)
}

// flushPending sends a cooldown-delayed trigger notification once due.
func (e *AlertEngine) flushPending(state *alertState, now time.Time) {
	if !state.pendingDue.IsZero() && !now.Before(state.pendingDue) {
		e.notify(now, state.pending)
		state.pendingDue, state.pending = time.Time{}, nil
	}
}

// notice assembles the structured payload for one notification-worthy
// transition; Body repeats the runtime event's KV detail.
func (e *AlertEngine) notice(rule AlertRule, action, value, scope, extra string, occurredAt time.Time, duration string) *AlertNotice {
	label := "触发"
	if action == "recovered" {
		label = "恢复"
	}
	return &AlertNotice{
		Rule: rule, Action: action, Value: value, Scope: scope, Extra: extra,
		Body:       e.body(rule, label, value, scope, extra),
		Instance:   shortID(e.instanceID),
		Host:       e.hostname,
		OccurredAt: occurredAt,
		Duration:   duration,
	}
}

// notify sends one external notification; a not-configured channel stays
// silent, a real enqueue failure is recorded as its own runtime event, and
// neither outcome touches the alert state.
func (e *AlertEngine) notify(now time.Time, notice *AlertNotice) {
	if e.notifier == nil || notice == nil || e.inGrace(now) {
		// Standalone has no exit at all; inside the Platform grace window
		// every external notification is silenced (events still record).
		return
	}
	if err := e.notifier.NotifyAlert(*notice); err != nil {
		if !errors.Is(err, ErrNotifierNotConfigured) {
			e.appendEvent(EventNotificationFailed, SeverityWarning, "告警通知入队失败："+notice.Rule.Name, truncateDetail(err.Error(), 200))
		}
		return
	}
	e.mu.Lock()
	state := e.states[notice.Rule.ID]
	if state != nil {
		state.lastNotify = now
	}
	e.mu.Unlock()
}

func (e *AlertEngine) appendEvent(eventType, severity, message, detail string) {
	e.sink.Append(eventType, severity, message, detail)
}

// body renders the structured KV detail shared by events and notifications.
func (e *AlertEngine) body(rule AlertRule, action, value, scope, extra string) string {
	detail := fmt.Sprintf("rule=%s name=%s action=%s value=%s scope=%s instance=%s host=%s pid=%d",
		rule.ID, rule.Name, action, value, scope, shortID(e.instanceID), e.hostname, os.Getpid())
	if runtime.GOOS == "" {
		detail += " (unknown platform)"
	}
	if extra != "" {
		detail += " " + extra
	}
	return truncateDetail(detail, 400)
}

func truncateDetail(detail string, limit int) string {
	if len(detail) <= limit {
		return detail
	}
	return detail[:limit-3] + "..."
}

func shortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// AlertRuleStore persists the rule JSON for Platform; Standalone passes nil
// and uses the built-in defaults.
type AlertRuleStore interface {
	LoadRulesJSON(ctx context.Context) (string, error)
	SaveRulesJSON(ctx context.Context, json string) error
}

// EncodeRules serializes a rule set with a schema version for forward
// compatibility (unknown fields are ignored on read, missing fields take
// the built-in defaults).
func EncodeRules(rules []AlertRule) string {
	payload := struct {
		Version int                          `json:"version"`
		Rules   []contracts.MonitorAlertRule `json:"rules"`
	}{Version: 1}
	for _, rule := range rules {
		payload.Rules = append(payload.Rules, contracts.MonitorAlertRule{
			ID: rule.ID, Enabled: rule.Enabled,
			TriggerValue: rule.triggerPtr(), RecoverValue: rule.recoverPtr(),
			Consecutive: rule.consecutivePtr(), CooldownMinutes: rule.cooldownPtr(),
		})
	}
	data, _ := json.Marshal(payload)
	return string(data)
}

// DecodeRules parses stored JSON against the built-in defaults: rules missing
// from the JSON fall back to their defaults, unknown ids are ignored, and
// absent numeric fields inherit the default thresholds.
func DecodeRules(jsonText string, platform bool) []AlertRule {
	rules := DefaultAlertRules(platform)
	if jsonText == "" {
		return rules
	}
	var payload struct {
		Version int                          `json:"version"`
		Rules   []contracts.MonitorAlertRule `json:"rules"`
	}
	if err := json.Unmarshal([]byte(jsonText), &payload); err != nil {
		return rules
	}
	byID := map[string]contracts.MonitorAlertRule{}
	for _, stored := range payload.Rules {
		byID[stored.ID] = stored
	}
	for i := range rules {
		stored, ok := byID[rules[i].ID]
		if !ok {
			continue
		}
		rules[i].Enabled = stored.Enabled
		if stored.TriggerValue != nil {
			rules[i].Trigger = *stored.TriggerValue
		}
		if stored.RecoverValue != nil {
			rules[i].Recover = *stored.RecoverValue
		}
		if stored.Consecutive != nil && *stored.Consecutive > 0 {
			rules[i].Consecutive = *stored.Consecutive
		}
		if stored.CooldownMinutes != nil && *stored.CooldownMinutes >= 0 {
			rules[i].CooldownMinutes = *stored.CooldownMinutes
		}
	}
	return rules
}

// RulesContract exports the effective rule set as the contract DTO.
func (e *AlertEngine) RulesContract() contracts.MonitorAlertRules {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := contracts.MonitorAlertRules{Version: 1, Rules: []contracts.MonitorAlertRule{}}
	for _, rule := range e.rules {
		out.Rules = append(out.Rules, contracts.MonitorAlertRule{
			ID: rule.ID, Enabled: rule.Enabled,
			TriggerValue: rule.triggerPtr(), RecoverValue: rule.recoverPtr(),
			Consecutive: rule.consecutivePtr(), CooldownMinutes: rule.cooldownPtr(),
		})
	}
	return out
}

// ApplyContract validates and adopts a submitted rule set (unknown ids are
// rejected so clients cannot invent rules) and returns the normalized set.
func (e *AlertEngine) ApplyContract(submitted contracts.MonitorAlertRules) (contracts.MonitorAlertRules, error) {
	if submitted.Version != 1 {
		return contracts.MonitorAlertRules{}, errors.New("unsupported rule version")
	}
	valid := map[string]AlertRule{}
	for _, rule := range DefaultAlertRules(true) {
		valid[rule.ID] = rule
	}
	rules := []AlertRule{}
	seen := map[string]bool{}
	for _, stored := range submitted.Rules {
		base, ok := valid[stored.ID]
		if !ok || seen[stored.ID] {
			return contracts.MonitorAlertRules{}, fmt.Errorf("unknown or duplicate rule id %q", stored.ID)
		}
		seen[stored.ID] = true
		base.Enabled = stored.Enabled
		if stored.TriggerValue != nil {
			base.Trigger = *stored.TriggerValue
		}
		if stored.RecoverValue != nil {
			base.Recover = *stored.RecoverValue
		}
		if stored.Consecutive != nil {
			if *stored.Consecutive < 1 || *stored.Consecutive > 20 {
				return contracts.MonitorAlertRules{}, fmt.Errorf("rule %s: consecutive out of range", stored.ID)
			}
			base.Consecutive = *stored.Consecutive
		}
		if stored.CooldownMinutes != nil {
			if *stored.CooldownMinutes < 0 || *stored.CooldownMinutes > 24*60 {
				return contracts.MonitorAlertRules{}, fmt.Errorf("rule %s: cooldown out of range", stored.ID)
			}
			base.CooldownMinutes = *stored.CooldownMinutes
		}
		rules = append(rules, base)
	}
	e.SetRules(rules)
	return e.RulesContract(), nil
}

// RulesFromContract converts a normalized contract payload back into engine
// rules (persistence path).
func RulesFromContract(payload contracts.MonitorAlertRules) []AlertRule {
	defaults := DefaultAlertRules(true)
	byID := map[string]AlertRule{}
	for _, rule := range defaults {
		byID[rule.ID] = rule
	}
	out := []AlertRule{}
	for _, stored := range payload.Rules {
		base, ok := byID[stored.ID]
		if !ok {
			continue
		}
		base.Enabled = stored.Enabled
		if stored.TriggerValue != nil {
			base.Trigger = *stored.TriggerValue
		}
		if stored.RecoverValue != nil {
			base.Recover = *stored.RecoverValue
		}
		if stored.Consecutive != nil && *stored.Consecutive > 0 {
			base.Consecutive = *stored.Consecutive
		}
		if stored.CooldownMinutes != nil && *stored.CooldownMinutes >= 0 {
			base.CooldownMinutes = *stored.CooldownMinutes
		}
		out = append(out, base)
	}
	return out
}

func (r AlertRule) triggerPtr() *float64 { v := r.Trigger; return &v }
func (r AlertRule) recoverPtr() *float64 { v := r.Recover; return &v }
func (r AlertRule) consecutivePtr() *int { v := r.Consecutive; return &v }
func (r AlertRule) cooldownPtr() *int    { v := r.CooldownMinutes; return &v }

// NotifierFunc adapts a plain function to the AlertNotifier interface.
type NotifierFunc func(notice AlertNotice) error

func (f NotifierFunc) NotifyAlert(notice AlertNotice) error { return f(notice) }
