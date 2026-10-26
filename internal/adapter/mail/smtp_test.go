// Author: yunnuo <ymz@ebox.vip>
// Description: Real SMTP protocol smoke and mandatory transport security checks.
package mailadapter

import (
	"context"
	"crypto/x509"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/testutil"
)

func TestSMTPTransportAndNoTLSDowngrade(t *testing.T) {
	server, err := testutil.StartSMTP()
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	host, port, _ := net.SplitHostPort(server.Listener.Addr().String())
	config := mailer.Config{Host: host, Port: port, TLS: "plain", Username: "synthetic", Password: "synthetic-smtp-password", From: "sender@example.test"}
	message := mailer.Message{To: "recipient@example.test", Subject: "Unicore test", Body: "A\n.B\n你好"}
	if err = (SMTP{}).Send(context.Background(), config, message); err != nil {
		t.Fatal(err)
	}
	if messages := server.Messages(); len(messages) != 1 || !strings.Contains(messages[0], ".B\n你好") {
		t.Fatalf("SMTP data mismatch: %q", messages)
	}
	config.TLS = "starttls"
	if err = (SMTP{}).Send(context.Background(), config, message); err == nil {
		t.Fatal("SMTP silently downgraded TLS")
	}
	config.TLS = "plain"
	config.Host = "mail.example.test"
	if err = (SMTP{}).Send(context.Background(), config, message); err == nil {
		t.Fatal("plaintext allowed outside loopback")
	}
	config.Host = host
	message.Subject = "injected\r\nBcc: leaked@example.test"
	if err = (SMTP{}).Send(context.Background(), config, message); err == nil {
		t.Fatal("header injection accepted")
	}
}

func TestVerifiedTLSAndSTARTTLS(t *testing.T) {
	certificateServer := httptest.NewTLSServer(http.NotFoundHandler())
	configuration := certificateServer.TLS.Clone()
	roots := x509.NewCertPool()
	roots.AddCert(certificateServer.Certificate())
	certificateServer.Close()
	for _, mode := range []string{"tls", "starttls"} {
		t.Run(mode, func(t *testing.T) {
			server, err := testutil.StartSecureSMTP(mode, configuration)
			if err != nil {
				t.Fatal(err)
			}
			defer server.Close()
			host, port, _ := net.SplitHostPort(server.Listener.Addr().String())
			config := mailer.Config{Host: host, Port: port, TLS: mode, From: "sender@example.test", Username: "test", Password: "synthetic-password"}
			message := mailer.Message{To: "recipient@example.test", Subject: "TLS test", Body: "Encrypted SMTP test"}
			if err = (SMTP{}).Send(context.Background(), config, message); err == nil {
				t.Fatal("untrusted certificate accepted")
			}
			if err = (SMTP{roots: roots}).Send(context.Background(), config, message); err != nil {
				t.Fatal("verified TLS send failed", err)
			}
			if len(server.Messages()) != 1 {
				t.Fatal("unexpected delivery count")
			}
		})
	}
}
