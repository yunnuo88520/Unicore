// Author: yunnuo <ymz@ebox.vip>
// Description: Safe Markdown and restricted HTML; no scripts, remote images, styles, frames or unsafe links.
package content

import (
	"bytes"
	"errors"
	"github.com/yuin/goldmark"
	xhtml "golang.org/x/net/html"
	"io"
	"net/url"
	"strings"
)

var errUnsafe = errors.New("unsafe announcement content")
var allowed = map[string]bool{"p": true, "br": true, "strong": true, "b": true, "em": true, "i": true, "u": true, "ul": true, "ol": true, "li": true, "a": true, "blockquote": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true, "code": true, "pre": true, "hr": true}

func Announcement(source, format string) (string, error) {
	value := source
	if format == "markdown" {
		var b bytes.Buffer
		if err := goldmark.Convert([]byte(source), &b); err != nil {
			return "", err
		}
		value = b.String()
	} else if format != "html" {
		return "", errUnsafe
	}
	z := xhtml.NewTokenizer(strings.NewReader(value))
	var out strings.Builder
	var text strings.Builder
	for {
		switch z.Next() {
		case xhtml.ErrorToken:
			if z.Err() != io.EOF || strings.TrimSpace(text.String()) == "" {
				return "", errUnsafe
			}
			return out.String(), nil
		case xhtml.CommentToken:
			// Goldmark emits comments in place of unsafe raw HTML. Never expose them.
		case xhtml.TextToken:
			tok := z.Token()
			text.WriteString(tok.Data)
			out.WriteString(tok.String())
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken, xhtml.EndTagToken:
			tok := z.Token()
			if !allowed[tok.Data] {
				return "", errUnsafe
			}
			for _, a := range tok.Attr {
				if tok.Data != "a" || a.Key != "href" {
					return "", errUnsafe
				}
				u, e := url.Parse(a.Val)
				if e != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || strings.ContainsAny(a.Val, "\r\n\x00") {
					return "", errUnsafe
				}
			}
			out.WriteString(tok.String())
		default:
			return "", errUnsafe
		}
	}
}
