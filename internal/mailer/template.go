// Author: yunnuo <ymz@ebox.vip>
// Description: Responsive branded transactional mail, with plain text and CID logo.
package mailer

import (
	"bytes"
	"encoding/base64"
	"github.com/yunnuo/unicore/assets/brand"
	"github.com/yunnuo/unicore/assets/theme"
	"github.com/yunnuo/unicore/internal/contracts"
	"html/template"
)

var emailTemplate = template.Must(template.New("mail").Parse(`<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><style>@media(prefers-color-scheme:dark){.canvas{background:{{index .Dark "bg"}}!important}.card{background:{{index .Dark "surface"}}!important;color:{{index .Dark "text"}}!important;border-color:{{index .Dark "border"}}!important}.muted{color:{{index .Dark "muted"}}!important}.code{background:{{index .Dark "primary-soft"}}!important;color:{{index .Dark "primary"}}!important;border-color:{{index .Dark "border"}}!important}.separator{border-color:{{index .Dark "border"}}!important}.accent{color:{{index .Dark "primary"}}!important}}</style></head><body class="canvas" style="margin:0;background:{{index .Light "bg"}};font-family:{{.Font}};color:{{index .Light "text"}}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px"><table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:{{index .Light "surface"}};border-radius:20px;border:1px solid {{index .Light "border"}}"><tr><td style="padding:32px 28px 20px"><img src="{{.Logo}}" width="42" height="42" alt="" style="vertical-align:middle;border-radius:12px"><span style="font-size:23px;font-weight:700;vertical-align:middle;padding-left:12px">{{.Site}}</span></td></tr><tr><td style="padding:12px 28px 32px"><p class="accent" style="font-size:11px;letter-spacing:2px;color:{{index .Light "primary"}}">{{.Site}} · 账号安全</p><h1 style="font-size:25px;margin:12px 0 18px">{{.Title}}</h1><p class="muted" style="font-size:15px;line-height:1.9;color:{{index .Light "muted"}}">{{.Intro}}</p>{{if .Code}}<div class="code" style="background:{{index .Light "primary-soft"}};border:1px solid {{index .Light "border"}};border-radius:12px;text-align:center;padding:22px 4px;margin:24px 0;font-family:monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:{{index .Light "primary"}}">{{.Code}}</div><p class="muted" style="color:{{index .Light "muted"}};font-size:13px;line-height:1.9">验证码 <strong>10 分钟</strong>内有效，仅限本次{{.Action}}使用。请返回刚才的页面输入，勿向他人透露。</p>{{end}}<hr class="separator" style="border:0;border-top:1px solid {{index .Light "border"}};margin:26px 0"><p class="muted" style="font-size:12px;line-height:1.9;color:{{index .Light "muted"}}">{{.Notice}}<br>这是一封自动邮件，请勿直接回复。</p></td></tr></table><p class="muted" style="text-align:center;font-size:11px;color:{{index .Light "muted"}};line-height:1.8;padding:12px">{{.Site}} · {{.Copyright}}<br>一份核心，无限可能。</p></td></tr></table></body></html>`))

func Render(site, copyright, purpose, code, recipient string, preview bool, logos ...[]byte) Message {
	image := brand.EmailLogo
	if len(logos) > 0 && len(logos[0]) > 0 {
		image = logos[0]
	}
	title, intro, action := "邮件服务已连接", "这封测试邮件确认当前 SMTP 配置可以发送邮件。你可以返回实例设置，开启需要的账号邮件流程。", ""
	notice := "若你没有请求此测试，请联系实例管理员。"
	switch purpose {
	case "verify":
		title, intro, action = "验证邮箱，开始使用", "欢迎加入 "+site+"。请输入以下验证码，完成邮箱验证并启用账号。", "邮箱验证"
	case "login":
		title, intro, action = "登录你的工作空间", "你正在登录 "+site+"。请输入以下验证码，继续访问你的工作空间。", "登录"
	case "reset":
		title, intro, action = "重新设置密码", "我们收到了你在 "+site+" 的密码重置申请。请输入以下验证码并设置新密码，完成后所有旧会话都会退出。", "密码重置"
	}
	if code != "" {
		notice = "如果不是你本人操作，请忽略此邮件；账号不会因此发生变更。"
	}
	logo := "cid:unicore-brand"
	if preview {
		logo = "data:image/png;base64," + base64.StdEncoding.EncodeToString(image)
	}
	data := struct {
		Site, Copyright, Title, Intro, Action, Notice, Code string
		Logo                                                template.URL
		Font                                                template.CSS
		Light, Dark                                         map[string]string
	}{site, copyright, title, intro, action, notice, code, template.URL(logo), template.CSS(theme.Current.Typography.Sans), theme.Current.Light, theme.Current.Dark}
	var body bytes.Buffer
	if err := emailTemplate.Execute(&body, data); err != nil {
		panic(err)
	}
	text := site + " · " + title + "\n\n" + intro + "\n"
	if code != "" {
		text += "\n验证码：" + code + "\n10 分钟内有效，仅限本次" + action + "使用。请勿向他人透露。\n"
	}
	text += "\n" + notice + "\n" + site + " · " + copyright
	return Message{To: recipient, FromName: site, Subject: site + " · " + title, Body: text, HTML: body.String(), Logo: append([]byte(nil), image...)}
}
func Previews(site, copyright string, logos ...[]byte) contracts.MailTemplateList {
	result := contracts.MailTemplateList{Items: []contracts.MailTemplate{}}
	for _, purpose := range []string{"test", "verify", "login", "reset"} {
		code := "654321"
		if purpose == "test" {
			code = ""
		}
		message := Render(site, copyright, purpose, code, "", true, logos...)
		result.Items = append(result.Items, contracts.MailTemplate{Purpose: purpose, Subject: message.Subject, Html: message.HTML, Text: message.Body})
	}
	return result
}
