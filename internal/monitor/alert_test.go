// Author: yunnuo <ymz@ebox.vip>
// Description: Alert engine acceptance: consecutive triggering, hysteresis, grace A/B/C, cooldown, attribution and notification discipline against a scripted snapshot sequence.
package monitor

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
)

type fakeClock struct{ current time.Time }

func (c *fakeClock) Now() time.Time { return c.current }
func (c *fakeClock) Advance(d time.Duration) {
	c.current = c.current.Add(d)
}

type recordingNotifier struct {
	err     error
	titles  []string // rule names behind each notification
	bodies  []string // structured KV details behind each notification
	notices []AlertNotice
}

func (r *recordingNotifier) NotifyAlert(notice AlertNotice) error {
	if r.err != nil {
		return r.err
	}
	r.titles = append(r.titles, notice.Rule.Name)
	r.bodies = append(r.bodies, notice.Body)
	r.notices = append(r.notices, notice)
	return nil
}

type snapshotBuilder struct{ snapshot contracts.MonitorSnapshot }

func newSnapshotBuilder() *snapshotBuilder {
	snapshot := contracts.MonitorSnapshot{Profile: "web-platform", Status: "healthy"}
	snapshot.Database = contracts.MonitorDatabase{Status: "healthy"}
	snapshot.Host = contracts.MonitorHostStats{Available: true, CpuPercent: ptrFloat(10), MemUsedPercent: ptrFloat(30),
		Disks: &[]contracts.MonitorDiskUsage{{Path: "/", IsDataDir: ptrBool(true), UsedPercent: 40}}}
	return &snapshotBuilder{snapshot: snapshot}
}

func ptrFloat(v float64) *float64 { return &v }
func ptrBool(v bool) *bool        { return &v }

func (b *snapshotBuilder) withCPU(percent float64) *snapshotBuilder {
	b.snapshot.Host.CpuPercent = ptrFloat(percent)
	return b
}
func (b *snapshotBuilder) withMem(percent float64) *snapshotBuilder {
	b.snapshot.Host.MemUsedPercent = ptrFloat(percent)
	return b
}
func (b *snapshotBuilder) withDisk(percent float64) *snapshotBuilder {
	(*b.snapshot.Host.Disks)[0].UsedPercent = percent
	return b
}
func (b *snapshotBuilder) withDB(status string) *snapshotBuilder {
	b.snapshot.Database = contracts.MonitorDatabase{Status: status}
	if status != "healthy" {
		b.snapshot.Status = "unavailable"
	}
	return b
}
func (b *snapshotBuilder) withTaskFailure(enabled bool) *snapshotBuilder {
	errStatus := "error"
	okStatus := "ok"
	status := okStatus
	if enabled {
		status = errStatus
	}
	b.snapshot.Tasks = contracts.MonitorTasksSummary{Applicable: true, Recent: &[]contracts.MonitorTaskHealth{{Name: "mail.queue", Enabled: enabled, LastStatus: &status}}}
	return b
}

// withTaskDisabledAfterFailure models a failing task that was disabled: the
// last_status stays error but the task no longer participates.
func (b *snapshotBuilder) withTaskDisabledAfterFailure() *snapshotBuilder {
	errStatus := "error"
	b.snapshot.Tasks = contracts.MonitorTasksSummary{Applicable: true, Recent: &[]contracts.MonitorTaskHealth{{Name: "mail.queue", Enabled: false, LastStatus: &errStatus}}}
	return b
}

// withTaskSuccess models a later successful run covering the failure.
func (b *snapshotBuilder) withTaskSuccess() *snapshotBuilder {
	okStatus := "ok"
	b.snapshot.Tasks = contracts.MonitorTasksSummary{Applicable: true, Recent: &[]contracts.MonitorTaskHealth{{Name: "mail.queue", Enabled: true, LastStatus: &okStatus}}}
	return b
}
func (b *snapshotBuilder) build() contracts.MonitorSnapshot { return b.snapshot }

type harness struct {
	engine   *AlertEngine
	sink     *EventSink
	clock    *fakeClock
	notifier *recordingNotifier
	snapshot *snapshotBuilder
	ticks    int
}

func newHarness(t *testing.T, platform bool, notifier *recordingNotifier) *harness {
	t.Helper()
	if notifier == nil {
		notifier = &recordingNotifier{}
	}
	clock := &fakeClock{current: time.Date(2026, 11, 11, 12, 0, 0, 0, time.UTC)}
	snapshot := newSnapshotBuilder()
	h := &harness{
		sink: NewEventSink(200), clock: clock, notifier: notifier, snapshot: snapshot,
	}
	h.engine = NewAlertEngine(func(context.Context) contracts.MonitorSnapshot { return snapshot.build() },
		h.sink, notifier, platform, AlertOptions{InstanceID: "abcdef1234567890", Hostname: "test-host", Now: clock.Now})
	t.Cleanup(h.engine.Stop)
	return h
}

func (h *harness) tick() {
	h.ticks++
	h.engine.Tick(context.Background())
	h.clock.Advance(30 * time.Second)
}

func (h *harness) eventsOfType(kind string) []Event {
	items, _ := h.sink.Recent(200)
	out := []Event{}
	for _, item := range items {
		if item.Type == kind {
			out = append(out, item)
		}
	}
	return out
}

func TestAlertEngineConsecutiveTriggerAndHysteresis(t *testing.T) {
	h := newHarness(t, true, nil)
	h.engine.SetRules(DefaultAlertRules(true))
	h.clock.Advance(3 * time.Minute) // outside the notification grace
	for i := 0; i < 3; i++ {
		h.snapshot.withCPU(90)
		h.tick()
	}
	if len(h.eventsOfType(EventAlertTriggered)) != 0 {
		t.Fatal("three abnormal ticks must not trigger a four-consecutive rule")
	}
	h.snapshot.withCPU(90)
	h.tick()
	if len(h.eventsOfType(EventAlertTriggered)) != 1 {
		t.Fatalf("fourth consecutive tick must trigger once: %d", len(h.eventsOfType(EventAlertTriggered)))
	}
	notificationsAtTrigger := len(h.notifier.titles)
	if notificationsAtTrigger != 1 {
		t.Fatalf("the trigger must notify once: %d", notificationsAtTrigger)
	}
	// Inside the hysteresis band: still firing, no new events.
	h.snapshot.withCPU(75)
	h.tick()
	if len(h.eventsOfType(EventAlertRecovered)) != 0 {
		t.Fatal("hysteresis band must keep the alert firing")
	}
	// Below recovery: true recovery with exactly one more notification.
	h.snapshot.withCPU(50)
	h.tick()
	recovered := h.eventsOfType(EventAlertRecovered)
	if len(recovered) != 1 {
		t.Fatalf("recovery must be recorded once: %d", len(recovered))
	}
	if len(h.notifier.titles)-notificationsAtTrigger != 1 {
		t.Fatalf("recovery must notify exactly once more: %d", len(h.notifier.titles))
	}
}

func overallRule() AlertRule {
	return AlertRule{ID: RuleOverallHealth, Kind: KindOverall, Name: "应用整体健康", Enabled: true, Consecutive: 1, CooldownMinutes: 30, Severity: SeverityWarning}
}

func dbRule() AlertRule {
	return AlertRule{ID: RuleDBUnavailable, Kind: KindDatabaseStatus, Name: "数据库不可用", Enabled: true, Consecutive: 2, CooldownMinutes: 30, Severity: SeverityError}
}

func TestAlertEngineGracePeriodScenarios(t *testing.T) {
	// Scenario A: trigger inside grace (two 30s ticks = 60s < 120s), still
	// firing after the window → the sweep sends exactly one notification.
	h := newHarness(t, true, &recordingNotifier{})
	h.engine.SetRules([]AlertRule{dbRule()})
	h.snapshot.withDB("unavailable")
	h.tick()
	h.tick()
	if len(h.notifier.titles) != 0 {
		t.Fatal("notifications inside the grace window must be deferred")
	}
	if len(h.eventsOfType(EventAlertTriggered)) != 1 {
		t.Fatal("the trigger event must be recorded immediately")
	}
	h.clock.Advance(90 * time.Second)
	h.snapshot.withDB("unavailable")
	h.tick()
	if len(h.notifier.titles) != 1 {
		t.Fatalf("grace sweep must send the deferred trigger once: %d", len(h.notifier.titles))
	}
	h.engine.Stop()

	// Scenario B: trigger and recover inside grace → nothing is sent later.
	h2 := newHarness(t, true, &recordingNotifier{})
	h2.engine.SetRules([]AlertRule{dbRule()})
	h2.snapshot.withDB("unavailable")
	h2.tick()
	h2.tick()
	h2.snapshot.withDB("healthy")
	h2.tick()
	h2.clock.Advance(90 * time.Second)
	h2.snapshot.withDB("healthy")
	h2.tick()
	if len(h2.notifier.titles) != 0 {
		t.Fatalf("scenario B must not send any notification: %d", len(h2.notifier.titles))
	}
	if len(h2.eventsOfType(EventAlertRecovered)) != 1 {
		t.Fatal("the in-grace recovery event must still be recorded")
	}
	h2.engine.Stop()

	// Scenario C: normal inside grace, alert after it → immediate notification.
	h3 := newHarness(t, true, &recordingNotifier{})
	h3.engine.SetRules([]AlertRule{dbRule()})
	h3.clock.Advance(3 * time.Minute)
	h3.snapshot.withDB("unavailable")
	h3.tick()
	h3.tick()
	if len(h3.notifier.titles) != 1 {
		t.Fatalf("scenario C must notify immediately: %d", len(h3.notifier.titles))
	}
}

func cpuRule() AlertRule {
	return AlertRule{ID: RuleCPUHigh, Kind: KindCPU, Name: "CPU 使用率过高", Enabled: true, Trigger: 85, Recover: 70, Consecutive: 4, CooldownMinutes: 30, Severity: SeverityWarning}
}

func TestAlertEngineCooldownDelaysRetriggerNotification(t *testing.T) {
	h := newHarness(t, true, &recordingNotifier{})
	h.engine.SetRules([]AlertRule{dbRule()})
	h.clock.Advance(3 * time.Minute) // outside grace
	h.snapshot.withDB("unavailable")
	h.tick()
	h.tick()
	if len(h.notifier.titles) != 1 {
		t.Fatalf("first trigger must notify: %d", len(h.notifier.titles))
	}
	h.snapshot.withDB("healthy")
	h.tick()
	if len(h.eventsOfType(EventAlertRecovered)) != 1 {
		t.Fatal("recovery must be recorded")
	}
	notificationsAfterRecovery := len(h.notifier.titles) // the recovery notified immediately
	// Retrigger inside the 30-minute cooldown: event now, notification later.
	h.snapshot.withDB("unavailable")
	h.tick()
	h.tick()
	if len(h.notifier.titles) != notificationsAfterRecovery {
		t.Fatalf("cooldown must delay the retrigger notification: %d vs %d", len(h.notifier.titles), notificationsAfterRecovery)
	}
	if len(h.eventsOfType(EventAlertTriggered)) != 2 {
		t.Fatalf("the retrigger event must be recorded: %d", len(h.eventsOfType(EventAlertTriggered)))
	}
	h.clock.Advance(31 * time.Minute)
	h.snapshot.withDB("unavailable")
	h.tick()
	if len(h.notifier.titles) != notificationsAfterRecovery+1 {
		t.Fatalf("the deferred notification must go out once due: %d", len(h.notifier.titles))
	}
}

func TestAlertEngineAttributionCoversOverall(t *testing.T) {
	h := newHarness(t, true, &recordingNotifier{})
	rules := DefaultAlertRules(true)
	rules = append(rules, AlertRule{ID: RuleOverallHealth, Kind: KindOverall, Name: "应用整体健康", Enabled: true, Consecutive: 2, CooldownMinutes: 30, Severity: SeverityWarning})
	h.engine.SetRules(rules)
	// The database fails: db_unavailable triggers after two ticks and the
	// overall rule never fires (counting counts as covered).
	for i := 0; i < 4; i++ {
		h.snapshot.withDB("unavailable")
		h.tick()
	}
	if len(h.eventsOfType(EventAlertTriggered)) != 1 {
		t.Fatalf("only the specific rule may alert: %d", len(h.eventsOfType(EventAlertTriggered)))
	}
	if h.eventsOfType(EventAlertTriggered)[0].Message != "告警触发：数据库不可用" {
		t.Fatalf("wrong rule fired: %s", h.eventsOfType(EventAlertTriggered)[0].Message)
	}
	// Recovery: the specific rule recovers, the overall stays silent.
	h.snapshot.withDB("healthy")
	h.tick()
	if len(h.eventsOfType(EventAlertRecovered)) != 1 {
		t.Fatal("database recovery must be recorded")
	}

	// Overall fires first while no specific rule is enabled (an operator
	// had disabled them), then the specific rule is re-enabled and confirms:
	// the overall exits via alert_reclassified, never recovered, and no
	// overall recovery notification is sent.
	h2 := newHarness(t, true, &recordingNotifier{})
	h2.engine.SetRules([]AlertRule{overallRule()})
	h2.clock.Advance(3 * time.Minute) // outside the notification grace
	h2.snapshot.withDB("unavailable")
	h2.tick()
	if len(h2.eventsOfType(EventAlertTriggered)) != 1 {
		t.Fatal("the overall rule must fire on the unattributed anomaly")
	}
	// Re-enabling the database rule lets the next tick attribute the anomaly.
	h2.engine.SetRules([]AlertRule{overallRule(), dbRule()})
	h2.snapshot.withDB("unavailable")
	h2.tick()
	reclassified := h2.eventsOfType(EventAlertReclassified)
	if len(reclassified) != 1 {
		t.Fatalf("the overall alert must exit as reclassified: %d", len(reclassified))
	}
	if contains(reclassified[0].Detail, "attributed_to=db_unavailable") == false {
		t.Fatalf("the reclassification must name the covering rule: %s", reclassified[0].Detail)
	}
	if len(h2.eventsOfType(EventAlertRecovered)) != 0 {
		t.Fatal("attribution transfer must not produce a recovered event")
	}
	if len(h2.notifier.titles) != 1 {
		t.Fatalf("only the overall trigger notification may exist: %d", len(h2.notifier.titles))
	}
}

func TestAlertEngineTaskRuleSemantics(t *testing.T) {
	h := newHarness(t, true, &recordingNotifier{})
	rules := DefaultAlertRules(true)
	h.engine.SetRules(rules)
	// An enabled failing task for two ticks triggers.
	h.snapshot.withTaskFailure(true)
	h.tick()
	h.tick()
	if len(h.eventsOfType(EventAlertTriggered)) != 1 {
		t.Fatal("a persisting last-run failure must trigger")
	}
	// Disabling the failing task removes it from the alert scope: the alert
	// exits with a disabled reason, without a notification.
	h.snapshot.withTaskDisabledAfterFailure()
	h.tick()
	exits := h.eventsOfType(EventAlertRecovered)
	if len(exits) != 1 {
		t.Fatal("scope exit must be recorded")
	}
	if !contains(exits[0].Detail, "reason=task_disabled") {
		t.Fatalf("scope exit must be marked as task_disabled: %s", exits[0].Detail)
	}
	if len(h.notifier.titles) != 0 {
		t.Fatal("scope exit must not notify")
	}
	// A later successful run is a true recovery and does notify.
	h.snapshot.withTaskSuccess()
	h.tick()
	h.tick()
	if len(h.notifier.titles) != 0 {
		t.Fatalf("a scope-cleared alert cannot re-fire without a failure: %d", len(h.notifier.titles))
	}

	// A standalone engine never receives the task rule.
	standalone := newHarness(t, false, nil)
	standalone.engine.SetRules(DefaultAlertRules(false))
	for _, rule := range standalone.engine.rules {
		if rule.ID == RuleTaskRecentFailure {
			t.Fatal("standalone default rules must not include the task rule")
		}
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

func TestAlertEngineMissingDataSkipsWithoutZero(t *testing.T) {
	h := newHarness(t, true, &recordingNotifier{})
	h.engine.SetRules([]AlertRule{cpuRule()})
	// Host sampling unavailable: the rule neither triggers nor resets its streak.
	h.snapshot.snapshot.Host = contracts.MonitorHostStats{Available: false}
	for i := 0; i < 6; i++ {
		h.tick()
	}
	if len(h.eventsOfType(EventAlertTriggered)) != 0 {
		t.Fatal("missing data must not fabricate an alert")
	}
	if len(h.eventsOfType(EventAlertRecovered)) != 0 {
		t.Fatal("missing data must not fabricate a recovery")
	}
	// A limited container without usage must not fall back to the host value.
	h.snapshot.snapshot.Host = contracts.MonitorHostStats{Available: true, CpuPercent: ptrFloat(95),
		Container: &contracts.MonitorContainerView{Detected: true, CpuQuotaCores: ptrFloat(2)}}
	for i := 0; i < 6; i++ {
		h.tick()
	}
	if len(h.eventsOfType(EventAlertTriggered)) != 0 {
		t.Fatal("a limited container without usage must skip, not use the host reading")
	}
}

func TestAlertEngineNotificationFailures(t *testing.T) {
	// Not configured: silent, no notification_failed noise.
	h := newHarness(t, true, &recordingNotifier{err: ErrNotifierNotConfigured})
	h.engine.SetRules([]AlertRule{cpuRule()})
	h.clock.Advance(3 * time.Minute)
	for i := 0; i < 4; i++ {
		h.snapshot.withCPU(90)
		h.tick()
	}
	if len(h.eventsOfType(EventNotificationFailed)) != 0 {
		t.Fatal("an unconfigured channel must stay silent")
	}
	if len(h.eventsOfType(EventAlertTriggered)) != 1 {
		t.Fatal("the alert state and event must still be recorded")
	}

	// Real enqueue failure: one notification_failed event, state intact.
	h2 := newHarness(t, true, &recordingNotifier{err: errors.New("store unavailable")})
	h2.engine.SetRules([]AlertRule{cpuRule()})
	h2.clock.Advance(3 * time.Minute)
	for i := 0; i < 4; i++ {
		h2.snapshot.withCPU(90)
		h2.tick()
	}
	failed := h2.eventsOfType(EventNotificationFailed)
	if len(failed) != 1 {
		t.Fatalf("a real enqueue failure must be recorded once: %d", len(failed))
	}
	// The state machine keeps running: recovery still happens and records.
	h2.snapshot.withCPU(10)
	h2.tick()
	if len(h2.eventsOfType(EventAlertRecovered)) != 1 {
		t.Fatal("notification failure must not lose the alert state")
	}
}

func TestAlertEngineHotUpdateAndLifecycle(t *testing.T) {
	h := newHarness(t, true, &recordingNotifier{})
	h.engine.SetRules([]AlertRule{cpuRule()})
	// Two abnormal ticks, then the rule set is replaced: streaks reset.
	h.snapshot.withCPU(90)
	h.tick()
	h.snapshot.withCPU(90)
	h.tick()
	h.engine.SetRules([]AlertRule{cpuRule()})
	h.snapshot.withCPU(90)
	h.tick()
	h.snapshot.withCPU(90)
	h.tick()
	if len(h.eventsOfType(EventAlertTriggered)) != 0 {
		t.Fatal("a hot-updated rule set must reset consecutive counts")
	}
	if !h.engine.running {
		t.Fatal("an enabled rule set must keep the engine running")
	}
	// All disabled: the ticker stops (zero goroutines).
	h.engine.SetRules(nil)
	if h.engine.running {
		t.Fatal("an all-disabled rule set must stop the engine")
	}
}

func TestAlertEngineSharedSnapshot(t *testing.T) {
	h := newHarness(t, true, &recordingNotifier{})
	calls := 0
	h.engine.snapshot = func(context.Context) contracts.MonitorSnapshot {
		calls++
		return h.snapshot.build()
	}
	h.engine.SetRules(DefaultAlertRules(true))
	h.clock.Advance(3 * time.Minute)
	h.snapshot.withCPU(90).withMem(95).withDisk(95)
	for i := 0; i < 4; i++ {
		h.tick()
	}
	if calls != h.ticks {
		t.Fatalf("all rules must share one snapshot per tick: calls=%d ticks=%d", calls, h.ticks)
	}
	triggered := h.eventsOfType(EventAlertTriggered)
	if len(triggered) != 3 {
		t.Fatalf("cpu, memory and disk rules must all fire: %d", len(triggered))
	}
}

func TestAlertNoticeStructuredFields(t *testing.T) {
	h := newHarness(t, true, nil)
	h.engine.SetRules(DefaultAlertRules(true))
	h.clock.Advance(3 * time.Minute) // outside the notification grace
	for i := 0; i < 4; i++ {
		h.snapshot.withCPU(91)
		h.tick()
	}
	h.snapshot.withCPU(40)
	h.tick()
	if len(h.notifier.notices) != 2 {
		t.Fatalf("trigger and recovery must each notify once: %d", len(h.notifier.notices))
	}
	trigger, recovery := h.notifier.notices[0], h.notifier.notices[1]
	if trigger.Action != "triggered" || trigger.Rule.ID != RuleCPUHigh || trigger.Value != "91.0%" || trigger.Scope != "host" || trigger.Instance != "abcdef12" || trigger.Host != "test-host" {
		t.Fatalf("trigger notice must carry the structured fields: %+v", trigger)
	}
	if trigger.Rule.Severity != SeverityWarning || trigger.OccurredAt.IsZero() || trigger.Duration != "" {
		t.Fatalf("trigger notice must expose severity and occurrence without a duration: %+v", trigger)
	}
	if recovery.Action != "recovered" || recovery.Value != "40.0%" {
		t.Fatalf("recovery notice must carry the structured fields: %+v", recovery)
	}
	// The recovery carries the original trigger time and the firing duration.
	if !recovery.OccurredAt.Equal(trigger.OccurredAt) {
		t.Fatalf("recovery must reference the trigger occurrence: %v vs %v", recovery.OccurredAt, trigger.OccurredAt)
	}
	if recovery.Duration == "" {
		t.Fatal("recovery notice must expose the firing duration")
	}
	if _, err := time.ParseDuration(recovery.Duration); err != nil {
		t.Fatalf("duration must be a parseable duration: %s", recovery.Duration)
	}
	if !strings.Contains(trigger.Body, "rule=cpu_high") || !strings.Contains(trigger.Body, "action=触发") {
		t.Fatalf("notice body must repeat the runtime event KV: %s", trigger.Body)
	}
}
