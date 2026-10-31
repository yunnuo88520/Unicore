// Author: yunnuo <ymz@ebox.vip>
// Description: Decode captured MIME recursively to assert actual received plaintext.
package testutil

import (
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"net/textproto"
	"strings"
)

func MailText(raw string) string {
	message, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		return ""
	}
	return textPart(textproto.MIMEHeader(message.Header), message.Body)
}
func textPart(header textproto.MIMEHeader, body io.Reader) string {
	kind, params, err := mime.ParseMediaType(header.Get("Content-Type"))
	if err != nil {
		return ""
	}
	if strings.HasPrefix(kind, "multipart/") {
		reader := multipart.NewReader(body, params["boundary"])
		for {
			part, err := reader.NextPart()
			if err != nil {
				return ""
			}
			text := textPart(part.Header, part)
			part.Close()
			if text != "" {
				return text
			}
		}
	}
	if kind == "text/plain" {
		data, _ := io.ReadAll(body)
		return strings.ReplaceAll(string(data), "\r\n", "\n")
	}
	return ""
}
