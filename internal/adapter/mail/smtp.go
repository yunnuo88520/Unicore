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
	"net/textproto"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/settings"
)

// roots is only injected by adapter tests; production uses system certificate roots.
type SMTP struct{ roots *x509.CertPool }

func (s SMTP) Send(ctx context.Context, config mailer.Config, message mailer.Message) error {
	if !settings.ValidEmail(config.From) || !settings.ValidEmail(message.To) || strings.ContainsAny(message.Subject+message.FromName+config.FromName, "\r\n\x00") {
		return &mailer.DeliveryFailure{Code: mailer.FailureSMTPConfigInvalid, Detail: "invalid mail envelope"}
	}
	if config.TLS != "tls" && config.TLS != "starttls" && config.TLS != "plain" {
		return &mailer.DeliveryFailure{Code: mailer.FailureSMTPConfigInvalid, Detail: "invalid TLS mode"}
	}
	if config.TLS == "plain" {
		address := net.ParseIP(config.Host)
		if config.Host != "localhost" && (address == nil || !address.IsLoopback()) {
			return &mailer.DeliveryFailure{Code: mailer.FailureSMTPConfigInvalid, Detail: "plaintext SMTP requires loopback"}
		}
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	connection, err := (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(config.Host, config.Port))
	if err != nil {
		return classifySMTP(err)
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
			return classifySMTP(err)
		}
		connection = secure
	}
	client, err := smtp.NewClient(connection, config.Host)
	if err != nil {
		return classifySMTP(err)
	}
	defer client.Close()
	if config.TLS == "starttls" {
		if supported, _ := client.Extension("STARTTLS"); !supported {
			return &mailer.DeliveryFailure{Code: mailer.FailureSMTPConfigInvalid, Detail: "STARTTLS required"}
		}
		if err = client.StartTLS(tlsConfig); err != nil {
			return classifySMTP(err)
		}
	}
	if config.Username != "" {
		if err = client.Auth(smtp.PlainAuth("", config.Username, config.Password, config.Host)); err != nil {
			return classifySMTP(err)
		}
	}
	if err = client.Mail(config.From); err != nil {
		return classifySMTP(err)
	}
	if err = client.Rcpt(message.To); err != nil {
		return classifySMTP(err)
	}
	writer, err := client.Data()
	if err != nil {
		return classifySMTP(err)
	}
	data, encodeErr := encodeMessage(config, message)
	if encodeErr != nil {
		return &mailer.DeliveryFailure{Code: mailer.FailureSMTPConfigInvalid, Detail: "message encoding failed"}
	}
	_, err = writer.Write(data)
	if err != nil {
		return classifySMTP(err)
	}
	if err = writer.Close(); err != nil {
		return classifySMTP(err)
	}
	// DATA acknowledgement commits delivery; a failed QUIT must not duplicate it.
	_ = client.Quit()
	return nil
}

// classifySMTP maps transport and protocol errors to stable delivery codes.
// Server rejections (5xx) and authentication failures cannot succeed by
// retrying and stop the queue early; timeouts and transient 4xx stay
// retryable. Unclassified errors degrade to a retryable generic code.
func classifySMTP(err error) error {
	if err == nil {
		return nil
	}
	var failure *mailer.DeliveryFailure
	if errors.As(err, &failure) {
		return err
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return &mailer.DeliveryFailure{Code: mailer.FailureTimeout, Retryable: true}
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return &mailer.DeliveryFailure{Code: mailer.FailureTimeout, Retryable: true}
	}
	var textErr *textproto.Error
	if errors.As(err, &textErr) {
		switch {
		case textErr.Code == 530 || textErr.Code == 534 || textErr.Code == 535 || textErr.Code == 538:
			return &mailer.DeliveryFailure{Code: mailer.FailureSMTPAuth}
		case textErr.Code >= 500:
			return &mailer.DeliveryFailure{Code: mailer.FailureSMTPRejected}
		case textErr.Code >= 400:
			return &mailer.DeliveryFailure{Code: mailer.FailureSMTPUnavailable, Retryable: true}
		}
	}
	return &mailer.DeliveryFailure{Code: mailer.FailureSMTPUnavailable, Retryable: true}
}
