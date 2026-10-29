// Author: yunnuo <ymz@ebox.vip>
// Description: Restricted rich email content and explicit variable expansion; no executable templates or external assets.
package mailcontent

import (
	"encoding/json"
	"errors"
	xhtml "golang.org/x/net/html"
	"html"
	"io"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

var ErrInvalid = errors.New("invalid mail template")

type Template struct {
	Subject string `json:"subject"`
	Body    string `json:"body"`
}

var Purposes = []string{"test", "verify", "login", "reset", "notification"}

func Known(p string) bool {
	for _, v := range Purposes {
		if p == v {
			return true
		}
	}
	return false
}
func Key(p string) string { return "mail.template." + p }
func Default(p string) Template {
	title, body := "邮件服务已连接", "<p>这封测试邮件确认当前 SMTP 配置可以发送邮件。</p>"
	switch p {
	case "verify":
		title = "验证邮箱，开始使用"
		body = "<p>欢迎加入 {{site_name}}。请输入以下验证码，完成邮箱验证并启用账号。</p>"
	case "login":
		title = "登录你的工作空间"
		body = "<p>你正在登录 {{site_name}}。请输入以下验证码，继续访问你的工作空间。</p>"
	case "reset":
		title = "重新设置密码"
		body = "<p>我们收到了你在 {{site_name}} 的密码重置申请。请输入以下验证码并设置新密码，完成后所有旧会话都会退出。</p>"
	case "notification":
		title = "{{title}}"
		body = "<p>{{detail}}</p>"
	}
	if p == "verify" || p == "login" || p == "reset" {
		body += "<p>验证码：<strong>{{code}}</strong></p><p>验证码 {{expires_minutes}} 分钟内有效。请勿向他人透露。</p>"
	}
	return Template{Subject: "{{site_name}} · " + title, Body: body}
}
func Variables(p string) []string {
	v := []string{"site_name", "site_url"}
	if p == "verify" || p == "login" || p == "reset" {
		v = append(v, "code", "expires_minutes")
	}
	if p == "notification" {
		v = append(v, "title", "detail")
	}
	return v
}

var variable = regexp.MustCompile(`\{\{\s*([a-z_]+)\s*\}\}`)
var tags = map[string]bool{"p": true, "br": true, "strong": true, "b": true, "em": true, "i": true, "u": true, "ul": true, "ol": true, "li": true, "a": true, "blockquote": true}

func ValidLink(value string) bool {
	if value == "{{site_url}}" {
		return true
	}
	u, e := url.Parse(value)
	return e == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil && !strings.ContainsAny(value, "\r\n\x00")
}
func Validate(p string, t Template) error {
	if !Known(p) || !utf8.ValidString(t.Subject+t.Body) || strings.TrimSpace(t.Subject) == "" || utf8.RuneCountInString(t.Subject) > 160 || strings.ContainsAny(t.Subject, "\r\n\x00") || strings.TrimSpace(t.Body) == "" || utf8.RuneCountInString(t.Body) > 12000 || len(t.Body) > 24000 {
		return ErrInvalid
	}
	allowed := map[string]bool{}
	for _, v := range Variables(p) {
		allowed[v] = true
	}
	for _, value := range []string{t.Subject, t.Body} {
		for _, m := range variable.FindAllStringSubmatch(value, -1) {
			if !allowed[m[1]] {
				return ErrInvalid
			}
		}
		rest := variable.ReplaceAllString(value, "")
		if strings.Contains(rest, "{{") || strings.Contains(rest, "}}") || strings.ContainsAny(rest, "\x00") {
			return ErrInvalid
		}
	}
	if p == "verify" || p == "login" || p == "reset" {
		found := false
		for _, m := range variable.FindAllStringSubmatch(Plain(t.Body), -1) {
			if m[1] == "code" {
				found = true
			}
		}
		if !found {
			return ErrInvalid
		}
	}
	return ValidateHTML(t.Body)
}
func ValidateHTML(body string) error {
	z := xhtml.NewTokenizer(strings.NewReader(body))
	text := strings.Builder{}
	for {
		kind := z.Next()
		switch kind {
		case xhtml.ErrorToken:
			if z.Err() != io.EOF {
				return ErrInvalid
			}
			if strings.TrimSpace(text.String()) == "" {
				return ErrInvalid
			}
			return nil
		case xhtml.TextToken:
			text.Write(z.Text())
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken, xhtml.EndTagToken:
			tok := z.Token()
			if !tags[tok.Data] {
				return ErrInvalid
			}
			for _, a := range tok.Attr {
				if tok.Data != "a" || a.Key != "href" || !ValidLink(a.Val) {
					return ErrInvalid
				}
			}
		default:
			return ErrInvalid
		}
	}
}
func Read(values map[string]string, p string) (Template, bool, error) {
	if !Known(p) {
		return Template{}, false, ErrInvalid
	}
	raw := values[Key(p)]
	if raw == "" {
		return Default(p), false, nil
	}
	var t Template
	e := json.Unmarshal([]byte(raw), &t)
	if e != nil {
		return t, true, ErrInvalid
	}
	return t, true, Validate(p, t)
}
func Expand(value string, values map[string]string, escape bool) string {
	return variable.ReplaceAllStringFunc(value, func(m string) string {
		v := values[variable.FindStringSubmatch(m)[1]]
		if escape {
			return html.EscapeString(v)
		}
		return v
	})
}
func Plain(value string) string {
	z := xhtml.NewTokenizer(strings.NewReader(value))
	var out strings.Builder
	for {
		switch z.Next() {
		case xhtml.ErrorToken:
			return strings.TrimSpace(out.String())
		case xhtml.TextToken:
			out.Write(z.Text())
		case xhtml.StartTagToken, xhtml.EndTagToken, xhtml.SelfClosingTagToken:
			tag, _ := z.TagName()
			if string(tag) == "p" || string(tag) == "li" || string(tag) == "br" {
				out.WriteByte('\n')
			}
		}
	}
}
