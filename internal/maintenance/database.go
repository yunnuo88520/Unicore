// Author: yunnuo <ymz@ebox.vip>
// Description: Native PostgreSQL/MySQL backup tools receive credentials via environment, never command arguments or logs.
package maintenance

import (
	"context"
	"errors"
	"github.com/go-sql-driver/mysql"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"strings"
)

func databaseName(driver, dsn string) (string, error) {
	if driver == "mysql" {
		c, e := mysql.ParseDSN(dsn)
		if e != nil || c.DBName == "" {
			return "", errors.New("invalid target database")
		}
		return c.DBName, nil
	}
	u, e := url.Parse(dsn)
	if e != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || strings.TrimPrefix(u.Path, "/") == "" {
		return "", errors.New("PostgreSQL maintenance requires a postgres URL")
	}
	return strings.TrimPrefix(u.Path, "/"), nil
}
func runDatabaseTool(ctx context.Context, driver, dsn, container string, restore bool, in io.Reader, out io.Writer) error {
	env := append([]string{}, os.Environ()...)
	var executable string
	var args []string
	var names []string
	if driver == "postgres" {
		if _, e := databaseName(driver, dsn); e != nil {
			return e
		}
		u, _ := url.Parse(dsn)
		host, port := u.Hostname(), u.Port()
		if host == "" {
			return errors.New("PostgreSQL maintenance requires a URL host")
		}
		if port == "" {
			port = "5432"
		}
		if container != "" {
			host = "127.0.0.1"
			port = "5432"
		}
		values := map[string]string{"PGHOST": host, "PGPORT": port, "PGDATABASE": strings.TrimPrefix(u.Path, "/"), "PGCONNECT_TIMEOUT": "10"}
		if u.User != nil {
			values["PGUSER"] = u.User.Username()
			values["PGPASSWORD"], _ = u.User.Password()
		}
		supported := map[string]string{"sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT", "sslcert": "PGSSLCERT", "sslkey": "PGSSLKEY", "sslpassword": "PGSSLPASSWORD", "target_session_attrs": "PGTARGETSESSIONATTRS", "application_name": "PGAPPNAME", "connect_timeout": "PGCONNECT_TIMEOUT"}
		for key, items := range u.Query() {
			name, ok := supported[key]
			if !ok || len(items) != 1 {
				return errors.New("unsupported PostgreSQL maintenance URL option")
			}
			values[name] = items[0]
		}
		for name, value := range values {
			env = append(env, name+"="+value)
			names = append(names, name)
		}
		executable = "pg_dump"
		args = []string{"--no-owner", "--no-privileges", "--schema=public", "--clean", "--if-exists"}
		if restore {
			executable = "psql"
			args = []string{"--no-psqlrc", "--single-transaction", "--set=ON_ERROR_STOP=1"}
		}
	} else if driver == "mysql" {
		c, e := mysql.ParseDSN(dsn)
		if e != nil || c.Net != "tcp" {
			return errors.New("MySQL maintenance requires a TCP DSN")
		}
		host, port, e := net.SplitHostPort(c.Addr)
		if e != nil {
			return errors.New("invalid MySQL address")
		}
		if container != "" {
			host = "127.0.0.1"
			port = "3306"
		}
		env = append(env, "MYSQL_PWD="+c.Passwd)
		names = []string{"MYSQL_PWD"}
		args = []string{"--host=" + host, "--port=" + port, "--user=" + c.User, "--default-character-set=utf8mb4"}
		switch c.TLSConfig {
		case "", "false":
			args = append(args, "--ssl-mode=DISABLED")
		case "true":
			args = append(args, "--ssl-mode=VERIFY_IDENTITY")
		default:
			return errors.New("maintenance does not accept custom or insecure MySQL TLS profiles")
		}
		executable = "mysqldump"
		if restore {
			executable = "mysql"
		} else {
			args = append(args, "--single-transaction", "--skip-lock-tables", "--no-tablespaces", "--set-gtid-purged=OFF", "--routines", "--triggers")
		}
		args = append(args, c.DBName)
	} else {
		return errors.New("unsupported database tool")
	}
	if container != "" {
		docker := []string{"exec", "-i"}
		for _, name := range names {
			docker = append(docker, "-e", name)
		}
		args = append(append(docker, container, executable), args...)
		executable = "docker"
	}
	command := exec.CommandContext(ctx, executable, args...)
	command.Env = env
	command.Stdin = in
	command.Stdout = out
	command.Stderr = io.Discard
	if err := command.Run(); err != nil {
		return errors.New("database backup/restore utility failed; verify matching native tools, connectivity and privileges")
	}
	return nil
}
