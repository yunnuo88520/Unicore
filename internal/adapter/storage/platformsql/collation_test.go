// Author: yunnuo <ymz@ebox.vip>
// Description: Upgrade inherited MySQL personal-security key collations without losing account or proof data.
package platformsql

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"
	"github.com/yunnuo/unicore/internal/adapter/storage/webdb"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/migrations/catalogdata"
	"github.com/yunnuo/unicore/migrations/runner"
)

func TestMySQLPersonalKeyCollationsUpgrade(t *testing.T) {
	dsn := os.Getenv("UNICORE_COLLATION_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("dedicated empty utf8mb4_unicode_ci database DSN not provided")
	}
	ctx := t.Context()
	store, err := webdb.Open(ctx, "mysql", dsn, filepath.Join(t.TempDir(), "unused.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if count, err := store.TableCount(ctx); err != nil || count != 0 {
		t.Fatalf("test database must be empty: %d %v", count, err)
	}
	var databaseCollation string
	if err := store.DB.QueryRowContext(ctx, "SELECT @@collation_database").Scan(&databaseCollation); err != nil || databaseCollation != "utf8mb4_unicode_ci" {
		t.Fatalf("fixture must reproduce the inherited unicode collation: %q %v", databaseCollation, err)
	}
	// Clone the real catalog and apply the frozen platform@1 with the real
	// runner. Never recreate an approximation or fabricate ledger rows.
	raw, err := json.Marshal(catalogdata.Catalog)
	if err != nil {
		t.Fatal(err)
	}
	var previous catalogdata.Descriptor
	if err := json.Unmarshal(raw, &previous); err != nil {
		t.Fatal(err)
	}
	for i := range previous.Namespaces {
		n := &previous.Namespaces[i]
		if n.Id == "platform" {
			n.Migrations = n.Migrations[:1]
		}
	}
	opts := runner.Options{Dialect: "mysql", Profile: "web-platform"}
	if err := runner.ApplyDescriptor(ctx, store.DB, previous, opts); err != nil {
		t.Fatal(err)
	}
	mustExec := func(query string, args ...any) {
		t.Helper()
		if _, err := store.Exec(ctx, store.DB, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustExec("INSERT INTO unicore_install_state(id,profile,instance_id,installed_at) VALUES(1,'web-platform','collation-fixture',1)")
	repo := &Repository{Store: store}
	password := "test-password-strong"
	hash, err := platform.HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	admin, err := repo.Seed(ctx, tx, contracts.UserCreate{Username: "admin", Email: "admin@example.test", Role: "super_admin"}, hash)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	name := "既有昵称 / Preserved profile"
	member, err := repo.CreateUser(ctx, contracts.UserCreate{Username: "member", Email: "member@example.test", Role: "user", DisplayName: &name}, hash, admin.ID)
	if err != nil {
		t.Fatal(err)
	}
	expires := int(time.Now().Add(time.Hour).Unix())
	const oldToken = "existing-session"
	oldHash := platform.Hash(oldToken)
	mustExec("INSERT INTO unicore_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)", oldHash, member.ID, expires)
	mustExec("INSERT INTO unicore_session_details(token_hash,user_id,ip_address,user_agent,created_at,last_seen_at,mfa_verified,mfa_attempts) VALUES(?,?,'192.0.2.1','Preserved device',?,?,0,0)", oldHash, member.ID, time.Now().Unix(), time.Now().Unix())
	mustExec("INSERT INTO unicore_email_changes(id,user_id,session_hash,parent_id,original_email,target_email,code_digest,verified,attempts,created_at,expires_at) VALUES('old-proof',?,?,'',?,?,'synthetic-proof',0,1,1,?)", member.ID, oldHash, member.Email, "replacement@example.test", expires)
	mustExec("INSERT INTO unicore_mail_jobs(id,token_hash,payload,state,attempts,created_at,available_at,expires_at,lease_id,lease_until,last_error) VALUES('old-mail','old-proof','synthetic mail','pending',0,1,1,?,'',0,'')", expires)
	if err := repo.CreateSession(ctx, platform.Hash("before-upgrade"), member.ID, expires, hash); err == nil {
		t.Fatal("platform@1 fixture did not reproduce the login failure")
	} else {
		var mysqlErr *mysql.MySQLError
		if !errors.As(err, &mysqlErr) || mysqlErr.Number != 1267 {
			t.Fatalf("expected collation error 1267 before upgrade: %v", err)
		}
	}
	snapshot := func() string {
		t.Helper()
		data := map[string][][]any{}
		for _, table := range []string{"unicore_users", "unicore_user_roles", "unicore_role_permissions", "unicore_personal_accounts", "unicore_sessions", "unicore_session_details", "unicore_email_changes", "unicore_mail_jobs"} {
			rows, err := store.DB.QueryContext(ctx, "SELECT * FROM "+table+" ORDER BY 1,2")
			if err != nil {
				t.Fatal(err)
			}
			columns, err := rows.Columns()
			if err != nil {
				rows.Close()
				t.Fatal(err)
			}
			for rows.Next() {
				values, pointers := make([]any, len(columns)), make([]any, len(columns))
				for i := range pointers {
					pointers[i] = &values[i]
				}
				if err := rows.Scan(pointers...); err != nil {
					rows.Close()
					t.Fatal(err)
				}
				for i, value := range values {
					if bytes, ok := value.([]byte); ok {
						values[i] = string(bytes)
					}
				}
				data[table] = append(data[table], values)
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				t.Fatal(err)
			}
		}
		encoded, err := json.Marshal(data)
		if err != nil {
			t.Fatal(err)
		}
		return string(encoded)
	}
	before := snapshot()
	for range 2 {
		if err := runner.Apply(ctx, store.DB, opts); err != nil {
			t.Fatal(err)
		}
		if err := runner.Verify(ctx, store.DB, opts); err != nil {
			t.Fatal(err)
		}
		if snapshot() != before {
			t.Fatal("upgrade or repeat startup changed existing security data")
		}
	}
	if err := runner.VerifyDescriptor(ctx, store.DB, previous, opts); !errors.Is(err, runner.ErrUnknownApplied) {
		t.Fatalf("old catalog accepted the upgraded database: %v", err)
	}
	for table, columns := range map[string][]string{
		"unicore_personal_accounts": {"user_id"},
		"unicore_session_details":   {"token_hash", "user_id"},
		"unicore_email_changes":     {"id", "user_id", "session_hash", "parent_id"},
	} {
		for _, column := range columns {
			var collation string
			if err := store.DB.QueryRowContext(ctx, "SELECT collation_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?", table, column).Scan(&collation); err != nil || collation != "utf8mb4_0900_ai_ci" {
				t.Fatalf("association key %s.%s = %q: %v", table, column, collation, err)
			}
		}
	}
	if devices, err := repo.LoginDevices(ctx, oldHash); err != nil || len(devices.Items) != 1 {
		t.Fatalf("existing device session lost: %+v %v", devices, err)
	}
	service := platform.New(repo)
	_, token, err := service.Login(ctx, contracts.LoginInput{Username: member.Username, Password: password}, "local", false, false, 1)
	if err != nil {
		t.Fatalf("login after upgrade: %v", err)
	}
	if session, err := service.Session(ctx, token); err != nil || !reflect.DeepEqual(session.User.Roles, member.Roles) {
		t.Fatalf("session after upgrade: %v", err)
	}
	// Exercise the other formerly mixed-collation link (mail -> email proof).
	tx, err = store.DB.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if err := repo.cancelEmailChanges(ctx, tx, member.ID); err != nil {
		t.Fatalf("cancel retained email proof: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	var mailState string
	if err := store.DB.QueryRowContext(ctx, "SELECT state FROM unicore_mail_jobs WHERE id='old-mail'").Scan(&mailState); err != nil || mailState != "cancelled" {
		t.Fatalf("retained email proof was not cancelled: %q %v", mailState, err)
	}
}
