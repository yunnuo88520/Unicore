// Author: yunnuo <ymz@ebox.vip>
// Description: Credentials are encoded by database drivers and initialization excludes system targets.
package webdb

import (
	"testing"

	"github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5"
	"github.com/yunnuo/unicore/internal/contracts"
)

func TestStructuredCredentialsAndTLS(t *testing.T) {
	password := "p:a@/ss ?#%"
	for _, driver := range []string{"mysql", "postgres"} {
		input := contracts.DatabaseInput{Driver: driver, Password: &password}
		dsn, name, err := Resolve(input)
		if err != nil || name != "unicore" {
			t.Fatal(driver, err)
		}
		if driver == "mysql" {
			c, err := mysql.ParseDSN(dsn)
			if err != nil || c.Passwd != password || c.User != "root" || c.Addr != "127.0.0.1:3306" || c.DBName != name || c.TLSConfig != "false" {
				t.Fatal("mysql fields did not round trip", err)
			}
		} else {
			c, err := pgx.ParseConfig(dsn)
			if err != nil || c.Password != password || c.User != "postgres" || c.Port != 5432 || c.Database != name || c.TLSConfig != nil {
				t.Fatal("postgres fields did not round trip", err)
			}
		}
		host := "db.example.test"
		input.Host = &host
		dsn, _, err = Resolve(input)
		if err != nil {
			t.Fatal(err)
		}
		if driver == "mysql" {
			c, err := mysql.ParseDSN(dsn)
			if err != nil || c.TLSConfig != "true" {
				t.Fatal("remote TLS policy", err)
			}
		} else {
			c, err := pgx.ParseConfig(dsn)
			if err != nil || c.TLSConfig == nil || c.TLSConfig.InsecureSkipVerify || len(c.Fallbacks) > 0 {
				t.Fatal("remote TLS policy", err)
			}
		}
	}
}

func TestInvalidTargetsAndMixedInputs(t *testing.T) {
	for _, name := range []string{"mysql", "postgres", "information_schema", "template1", "bad;DROP DATABASE", ""} {
		if _, _, err := Resolve(contracts.DatabaseInput{Driver: "mysql", Name: &name}); err == nil {
			t.Fatal("unsafe target accepted")
		}
	}
	port := 0
	host := "127.0.0.1"
	tls := "skip-verify"
	for _, input := range []contracts.DatabaseInput{
		{Driver: "mysql", Port: &port}, {Driver: "mysql", Dsn: "root@tcp(127.0.0.1:3306)/unicore", Host: &host}, {Driver: "sqlite", Password: &host}, {Driver: "postgres", Tls: &tls},
	} {
		if _, _, err := Resolve(input); err == nil {
			t.Fatal("invalid or ambiguous input accepted")
		}
	}
}
