// Author: yunnuo <ymz@ebox.vip>
// Description: SMTP with verified TLS/mandatory STARTTLS and loopback-only plaintext.
package mailadapter

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"

	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/settings"
)

// roots is only injected by adapter tests; production uses system certificate roots.
type SMTP struct{ roots *x509.CertPool }

func (s SMTP) Send(ctx context.Context, config mailer.Config, message mailer.Message) error {
	if !settings.ValidEmail(config.From) || !settings.ValidEmail(message.To) || strings.ContainsAny(message.Subject+message.FromName, "\r\n") {
		return errors.New("invalid mail envelope")
	}
	if config.TLS != "tls" && config.TLS != "starttls" && config.TLS != "plain" {
		return errors.New("invalid TLS mode")
	}
	if config.TLS == "plain" {
		address := net.ParseIP(config.Host)
		if config.Host != "localhost" && (address == nil || !address.IsLoopback()) {
			return errors.New("plaintext SMTP requires loopback")
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	connection, err := (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(config.Host, config.Port))
	if err != nil {
		return err
	}
	defer connection.Close()
	rawConnection := connection
	stop := context.AfterFunc(ctx, func() { _ = rawConnection.Close() })
	defer stop()
	deadline, _ := ctx.Deadline()
	_ = connection.SetDeadline(deadline)
	tlsConfig := &tls.Config{ServerName: config.Host, MinVersion: tls.VersionTLS12, RootCAs: s.roots}
	if config.TLS == "tls" {
		secure := tls.Client(connection, tlsConfig)
		if err = secure.HandshakeContext(ctx); err != nil {
			return err
		}
		connection = secure
	}
	client, err := smtp.NewClient(connection, config.Host)
	if err != nil {
		return err
	}
	defer client.Close()
	if config.TLS == "starttls" {
		if supported, _ := client.Extension("STARTTLS"); !supported {
			return errors.New("STARTTLS required")
		}
		if err = client.StartTLS(tlsConfig); err != nil {
			return err
		}
	}
	if config.Username != "" {
		if err = client.Auth(smtp.PlainAuth("", config.Username, config.Password, config.Host)); err != nil {
			return err
		}
	}
	if err = client.Mail(config.From); err != nil {
		return err
	}
	if err = client.Rcpt(message.To); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	data, encodeErr := encodeMessage(config, message)
	if encodeErr != nil {
		return encodeErr
	}
	_, err = writer.Write(data)
	if err != nil {
		return err
	}
	if err = writer.Close(); err != nil {
		return err
	}
	// DATA acknowledgement commits delivery; a failed QUIT must not duplicate it.
	_ = client.Quit()
	return nil
}
