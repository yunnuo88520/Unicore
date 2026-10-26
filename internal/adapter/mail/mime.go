// Author: yunnuo <ymz@ebox.vip>
// Description: Standards compliant UTF-8 MIME with alternative text and embedded brand image.
package mailadapter

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"github.com/yunnuo/unicore/assets/brand"
	"github.com/yunnuo/unicore/internal/mailer"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"net/textproto"
	"time"
)

func encodeMessage(config mailer.Config, message mailer.Message) ([]byte, error) {
	var output bytes.Buffer
	related := multipart.NewWriter(&output)
	fmt.Fprintf(&output, "From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary=%q\r\n\r\n", (&mail.Address{Name: message.FromName, Address: config.From}).String(), message.To, mime.QEncoding.Encode("UTF-8", message.Subject), time.Now().Format(time.RFC1123Z), related.Boundary())
	var alternatives bytes.Buffer
	alternative := multipart.NewWriter(&alternatives)
	for _, part := range []struct{ kind, body string }{{"text/plain", message.Body}, {"text/html", message.HTML}} {
		if part.body == "" {
			continue
		}
		writer, err := alternative.CreatePart(textproto.MIMEHeader{"Content-Type": {part.kind + "; charset=UTF-8"}, "Content-Transfer-Encoding": {"quoted-printable"}})
		if err != nil {
			return nil, err
		}
		qp := quotedprintable.NewWriter(writer)
		if _, err = qp.Write([]byte(part.body)); err != nil {
			return nil, err
		}
		if err = qp.Close(); err != nil {
			return nil, err
		}
	}
	if err := alternative.Close(); err != nil {
		return nil, err
	}
	p, err := related.CreatePart(textproto.MIMEHeader{"Content-Type": {"multipart/alternative; boundary=" + alternative.Boundary()}})
	if err != nil {
		return nil, err
	}
	if _, err = p.Write(alternatives.Bytes()); err != nil {
		return nil, err
	}
	if message.HTML != "" {
		p, err = related.CreatePart(textproto.MIMEHeader{"Content-Type": {"image/png"}, "Content-ID": {"<unicore-brand>"}, "Content-Disposition": {"inline; filename=unicore.png"}, "Content-Transfer-Encoding": {"base64"}})
		if err != nil {
			return nil, err
		}
		logo := message.Logo
		if len(logo) == 0 {
			logo = brand.EmailLogo
		}
		encoded := base64.StdEncoding.EncodeToString(logo)
		for len(encoded) > 0 {
			n := 76
			if len(encoded) < n {
				n = len(encoded)
			}
			if _, err = fmt.Fprintf(p, "%s\r\n", encoded[:n]); err != nil {
				return nil, err
			}
			encoded = encoded[n:]
		}
	}
	if err = related.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
