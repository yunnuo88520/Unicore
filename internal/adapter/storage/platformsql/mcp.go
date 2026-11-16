// Author: yunnuo <ymz@ebox.vip>
// Description: MCP governance storage: CAS control anchor, capability open policies and content-free call metadata.
package platformsql

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/adapter/storage/sqlstore"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/mcp"
	"github.com/yunnuo/unicore/internal/platform"
)

// ErrMCPConflict reports a lost CAS race on the control revision or a
// capability policy version; callers surface it as a refresh-and-retry.
var ErrMCPConflict = errors.New("mcp governance state changed concurrently")

func (r *Repository) controlRevision(ctx context.Context, q sqlstore.Runner, lock bool) (int64, error) {
	query := "SELECT revision FROM unicore_mcp_control WHERE id=1"
	if lock {
		query = sqlstore.LockQuery(r.Store.Dialect, query)
	}
	var revision int64
	if err := r.row(ctx, q, query).Scan(&revision); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// The seed row rides the migration; an unseeded database starts at 0.
			return 0, nil
		}
		return 0, err
	}
	return revision, nil
}

// MCPControlRevision reads the current governance revision without locking.
func (r *Repository) MCPControlRevision(ctx context.Context) (int64, error) {
	return r.controlRevision(ctx, r.Store.DB, false)
}

// mcpTransaction opens a write transaction serialized on the control anchor.
func (r *Repository) mcpTransaction(ctx context.Context) (*sql.Tx, int64, error) {
	tx, err := r.Store.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, 0, err
	}
	revision, err := r.controlRevision(ctx, tx, true)
	if err != nil {
		_ = tx.Rollback()
		return nil, 0, err
	}
	return tx, revision, nil
}

func (r *Repository) bumpControl(ctx context.Context, tx *sql.Tx, revision int64, actor string, now int64) error {
	_, err := r.exec(ctx, tx, "UPDATE unicore_mcp_control SET revision=?,updated_at=?,updated_by=? WHERE id=1 AND revision=?", revision+1, now, actor, revision)
	return err
}

// UpdateMCPConfig persists changed setting values and bumps the control
// revision in one transaction. Callers pass the revision they based the edit
// on; a mismatch fails with ErrMCPConflict instead of overwriting another
// administrator's save. Setting validation stays in the settings service.
func (r *Repository) UpdateMCPConfig(ctx context.Context, expectedRevision int64, values map[string]string, actor string) (int64, error) {
	if len(values) == 0 {
		return 0, platform.ErrInput
	}
	tx, revision, err := r.mcpTransaction(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	if revision != expectedRevision {
		return 0, ErrMCPConflict
	}
	now := time.Now().Unix()
	for key, value := range values {
		if _, err = r.exec(ctx, tx, "DELETE FROM unicore_system_settings WHERE setting_key=?", key); err != nil {
			return 0, err
		}
		if _, err = r.exec(ctx, tx, "INSERT INTO unicore_system_settings(setting_key,setting_value) VALUES(?,?)", key, value); err != nil {
			return 0, err
		}
	}
	if err = r.bumpControl(ctx, tx, revision, actor, now); err != nil {
		return 0, err
	}
	if err = r.audit(audit.Target(ctx, "mcp/config", ""), tx, actor, "mcp.config.updated"); err != nil {
		return 0, err
	}
	return revision + 1, tx.Commit()
}

func (r *Repository) policyRow(ctx context.Context, q sqlstore.Runner, kind mcp.Kind, name string) (mcp.Policy, error) {
	var p mcp.Policy
	var enabled int
	err := r.row(ctx, q, "SELECT kind,name,enabled,accepted_fingerprint,accepted_version,version FROM unicore_mcp_capability_policies WHERE kind=? AND name=?", string(kind), name).Scan(&p.Kind, &p.Name, &enabled, &p.AcceptedFingerprint, &p.AcceptedVersion, &p.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return mcp.Policy{Kind: kind, Name: name}, nil
	}
	if err != nil {
		return p, err
	}
	p.Enabled = enabled != 0
	return p, nil
}

// MCPPolicy reads one capability policy; a missing row is the zero policy.
func (r *Repository) MCPPolicy(ctx context.Context, kind mcp.Kind, name string) (mcp.Policy, error) {
	return r.policyRow(ctx, r.Store.DB, kind, name)
}

// MCPPolicies lists every stored policy ordered by kind and name.
func (r *Repository) MCPPolicies(ctx context.Context) ([]mcp.Policy, error) {
	rows, err := r.rows(ctx, r.Store.DB, "SELECT kind,name,enabled,accepted_fingerprint,accepted_version,version FROM unicore_mcp_capability_policies ORDER BY kind,name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []mcp.Policy{}
	for rows.Next() {
		var p mcp.Policy
		var enabled int
		if err = rows.Scan(&p.Kind, &p.Name, &enabled, &p.AcceptedFingerprint, &p.AcceptedVersion, &p.Version); err != nil {
			return nil, err
		}
		p.Enabled = enabled != 0
		result = append(result, p)
	}
	return result, rows.Err()
}

// UpdateMCPPolicy accepts or revokes one capability open policy behind the
// control anchor. expectedVersion 0 registers an unseen capability; the
// fingerprint must match the caller-audited definition or the write fails.
func (r *Repository) UpdateMCPPolicy(ctx context.Context, expected mcp.Policy, fingerprint string, actor string) (mcp.Policy, error) {
	tx, revision, err := r.mcpTransaction(ctx)
	if err != nil {
		return mcp.Policy{}, err
	}
	defer tx.Rollback()
	current, err := r.policyRow(ctx, tx, expected.Kind, expected.Name)
	if err != nil {
		return mcp.Policy{}, err
	}
	if current.Version != expected.Version {
		return mcp.Policy{}, ErrMCPConflict
	}
	now := time.Now().Unix()
	next := expected
	next.Version = expected.Version + 1
	if next.AcceptedFingerprint != fingerprint {
		return mcp.Policy{}, ErrMCPConflict
	}
	if current.Version == 0 {
		id := platform.Token()
		if _, err = r.exec(ctx, tx, "INSERT INTO unicore_mcp_capability_policies(id,kind,name,enabled,accepted_fingerprint,accepted_version,version,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)", id, string(next.Kind), next.Name, boolInt(next.Enabled), next.AcceptedFingerprint, next.AcceptedVersion, next.Version, now, now, actor); err != nil {
			return mcp.Policy{}, err
		}
	} else {
		if _, err = r.exec(ctx, tx, "UPDATE unicore_mcp_capability_policies SET enabled=?,accepted_fingerprint=?,accepted_version=?,version=?,updated_at=?,updated_by=? WHERE kind=? AND name=? AND version=?", boolInt(next.Enabled), next.AcceptedFingerprint, next.AcceptedVersion, next.Version, now, actor, string(next.Kind), next.Name, expected.Version); err != nil {
			return mcp.Policy{}, err
		}
	}
	if err = r.bumpControl(ctx, tx, revision, actor, now); err != nil {
		return mcp.Policy{}, err
	}
	if err = r.audit(audit.Target(ctx, "mcp/policy/"+next.Name, "kind="+string(next.Kind)+"; enabled="+boolText(next.Enabled)), tx, actor, "mcp.policy.updated"); err != nil {
		return mcp.Policy{}, err
	}
	if err = tx.Commit(); err != nil {
		return mcp.Policy{}, err
	}
	return next, nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func boolText(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

// BeginMCPCall persists the content-free start record. Execution must not
// start when this write fails.
func (r *Repository) BeginMCPCall(ctx context.Context, start mcp.CallStart) error {
	_, err := r.exec(ctx, r.Store.DB, "INSERT INTO unicore_mcp_calls(id,request_id,actor_id,credential_id,role_id,auth_method,kind,name,capability_version,policy_revision,protocol_version,client_name,client_version,status,started_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		start.RequestID, start.RequestID, start.ActorID, start.CredentialID, start.RoleID, start.AuthMethod, string(start.Kind), start.Name, start.CapabilityVersion, start.PolicyRevision, start.ProtocolVersion, start.ClientName, start.ClientVersion, "running", start.StartedAt)
	return err
}

// FinishMCPCall closes one call record. A failed finish is an operational
// error for the caller to log; it never re-runs the business call.
func (r *Repository) FinishMCPCall(ctx context.Context, requestID string, finish mcp.CallFinish) error {
	_, err := r.exec(ctx, r.Store.DB, "UPDATE unicore_mcp_calls SET status=?,error_code=?,finished_at=?,duration_ms=? WHERE request_id=?", finish.Status, finish.ErrorCode, finish.FinishedAt, finish.DurationMs, requestID)
	return err
}

// MCPCallFilter bounds the admin call-history query; zero fields are wildcards.
type MCPCallFilter struct {
	ActorID       string
	Kind          string
	Name          string
	Status        string
	StartedAfter  int64
	StartedBefore int64
	Page          int
	PageSize      int
}

// MCPCallRecord joins one call's content-free metadata with the display
// names known at read time; deleted actors fall back to the stored id and
// deleted credentials keep a deleted marker instead of vanishing.
type MCPCallRecord struct {
	Start             mcp.CallStart
	Finish            mcp.CallFinish
	ActorName         string
	CredentialName    string
	CredentialDeleted bool
}

const mcpCallSelect = "SELECT c.request_id,c.actor_id,c.credential_id,c.role_id,c.auth_method,c.kind,c.name,c.capability_version,c.policy_revision,c.protocol_version,c.client_name,c.client_version,c.status,c.error_code,c.started_at,c.finished_at,c.duration_ms,COALESCE(NULLIF(p.display_name,''),u.username,c.actor_id),COALESCE(cred.name,''),cred.id IS NULL OR cred.revoked=1 FROM unicore_mcp_calls c LEFT JOIN unicore_users u ON u.id=c.actor_id LEFT JOIN unicore_personal_accounts p ON p.user_id=c.actor_id LEFT JOIN unicore_api_credentials cred ON cred.id=c.credential_id"

func (r *Repository) scanMCPCall(rows *sql.Rows) (MCPCallRecord, error) {
	var record MCPCallRecord
	var kind, authMethod string
	var deleted int
	if err := rows.Scan(&record.Start.RequestID, &record.Start.ActorID, &record.Start.CredentialID, &record.Start.RoleID, &authMethod, &kind, &record.Start.Name, &record.Start.CapabilityVersion, &record.Start.PolicyRevision, &record.Start.ProtocolVersion, &record.Start.ClientName, &record.Start.ClientVersion, &record.Finish.Status, &record.Finish.ErrorCode, &record.Start.StartedAt, &record.Finish.FinishedAt, &record.Finish.DurationMs, &record.ActorName, &record.CredentialName, &deleted); err != nil {
		return record, err
	}
	record.Start.Kind, record.Start.AuthMethod = mcp.Kind(kind), authMethod
	record.CredentialDeleted = deleted != 0
	return record, nil
}

func (r *Repository) ListMCPCalls(ctx context.Context, filter MCPCallFilter) ([]MCPCallRecord, int, error) {
	where := " WHERE 1=1"
	args := []any{}
	if filter.ActorID != "" {
		where += " AND c.actor_id=?"
		args = append(args, filter.ActorID)
	}
	if filter.Kind != "" {
		where += " AND c.kind=?"
		args = append(args, filter.Kind)
	}
	if filter.Name != "" {
		where += " AND c.name=?"
		args = append(args, filter.Name)
	}
	if filter.Status != "" {
		where += " AND c.status=?"
		args = append(args, filter.Status)
	}
	if filter.StartedAfter > 0 {
		where += " AND c.started_at>=?"
		args = append(args, filter.StartedAfter)
	}
	if filter.StartedBefore > 0 {
		where += " AND c.started_at<=?"
		args = append(args, filter.StartedBefore)
	}
	var total int
	if err := r.row(ctx, r.Store.DB, "SELECT COUNT(*) FROM unicore_mcp_calls c"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	page, size := filter.Page, filter.PageSize
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 50
	}
	args = append(args, size, (page-1)*size)
	rows, err := r.rows(ctx, r.Store.DB, mcpCallSelect+where+" ORDER BY c.started_at DESC,c.id LIMIT ? OFFSET ?", args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	records := []MCPCallRecord{}
	for rows.Next() {
		record, err := r.scanMCPCall(rows)
		if err != nil {
			return nil, 0, err
		}
		records = append(records, record)
	}
	return records, total, rows.Err()
}

// GetMCPCall reads one call record by its server request id.
func (r *Repository) GetMCPCall(ctx context.Context, requestID string) (MCPCallRecord, error) {
	rows, err := r.rows(ctx, r.Store.DB, mcpCallSelect+" WHERE c.request_id=?", requestID)
	if err != nil {
		return MCPCallRecord{}, err
	}
	defer rows.Close()
	if !rows.Next() {
		return MCPCallRecord{}, platform.ErrInput
	}
	record, err := r.scanMCPCall(rows)
	if err != nil {
		return record, err
	}
	return record, rows.Err()
}

// SweepMCPCalls deletes finished call metadata older than the retention
// window in bounded batches; unfinished records survive until they close.
// The batch is selected first so all three dialects share one code path.
func (r *Repository) SweepMCPCalls(ctx context.Context, retentionDays int, now int64) (int64, error) {
	if retentionDays <= 0 {
		return 0, nil
	}
	cutoff := now - int64(retentionDays)*86400
	var removed int64
	for {
		rows, err := r.rows(ctx, r.Store.DB, "SELECT id FROM unicore_mcp_calls WHERE finished_at>0 AND finished_at<? LIMIT 500", cutoff)
		if err != nil {
			return removed, err
		}
		ids := []any{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return removed, err
			}
			ids = append(ids, id)
		}
		err = rows.Err()
		rows.Close()
		if err != nil || len(ids) == 0 {
			return removed, err
		}
		query := "DELETE FROM unicore_mcp_calls WHERE id IN (?" + strings.Repeat(",?", len(ids)-1) + ")"
		result, err := r.exec(ctx, r.Store.DB, query, ids...)
		if err != nil {
			return removed, err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return removed, err
		}
		removed += affected
		if len(ids) < 500 {
			return removed, nil
		}
	}
}
