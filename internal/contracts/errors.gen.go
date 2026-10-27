// Code generated from packages/contracts/openapi.json; DO NOT EDIT.
// Author: yunnuo <ymz@ebox.vip>

package contracts

type ErrorDefinition struct {
	Status  int
	Message string
}

var ErrorCatalog = map[string]ErrorDefinition{
	"ACCOUNT_EXISTS":          {Status: 409, Message: "账号或邮箱已存在"},
	"ACCOUNT_FLOW_DISABLED":   {Status: 409, Message: "此实例尚未开放该账号流程"},
	"ALREADY_INSTALLED":       {Status: 409, Message: "此实例已安装，不能重复初始化"},
	"AUTH_REQUIRED":           {Status: 401, Message: "登录已失效，请重新登录"},
	"BODY_TOO_LARGE":          {Status: 413, Message: "请求体过大"},
	"BOOTSTRAP_TOKEN_INVALID": {Status: 403, Message: "安装凭据无效，请读取部署数据目录中的 bootstrap.token"},
	"CAPTCHA_INVALID":         {Status: 400, Message: "验证码不正确或已过期，请刷新后重试"},
	"CSRF_INVALID":            {Status: 403, Message: "请求校验已失效，请刷新页面"},
	"DATABASE_INITIALIZED":    {Status: 409, Message: "目标数据库已有 Unicore 安装记录，请恢复原实例配置，不能重新安装"},
	"DATABASE_UNAVAILABLE":    {Status: 400, Message: "无法连接或初始化数据库，请检查配置与权限后重试"},
	"INSTALL_COMMITTED":       {Status: 500, Message: "安装已完成，请前往登录页面"},
	"INSTALL_REQUIRED":        {Status: 409, Message: "请先完成安装"},
	"INTERNAL_ERROR":          {Status: 500, Message: "操作未完成，请重试"},
	"INVALID_INPUT":           {Status: 400, Message: "请检查输入类型、范围及当前形态是否支持"},
	"INVALID_JSON":            {Status: 400, Message: "JSON 格式不正确"},
	"LAST_SUPER_ADMIN":        {Status: 409, Message: "不能禁用或降权最后一个启用且可用本地密码登录的管理员"},
	"LOCAL_PASSWORD_REQUIRED": {Status: 409, Message: "请先设置本地密码，再更改企业账号绑定"},
	"MAIL_DELIVERY_FAILED":    {Status: 502, Message: "邮件未能送达，请检查 SMTP 配置、TLS 与凭据"},
	"MAIL_NOT_READY":          {Status: 409, Message: "请先保存 SMTP 配置并成功发送测试邮件，再启用邮件账号流程"},
	"METHOD_NOT_ALLOWED":      {Status: 405, Message: "请求方法不受支持"},
	"NOT_AVAILABLE":           {Status: 404, Message: "此运行形态不提供该能力"},
	"NOT_FOUND":               {Status: 404, Message: "接口不存在"},
	"NOT_READY":               {Status: 503, Message: "安装尚未完成"},
	"OIDC_FAILED":             {Status: 409, Message: "企业身份验证未完成，请重新发起或先登录本地账号后绑定"},
	"OIDC_UNAVAILABLE":        {Status: 502, Message: "暂时无法连接企业身份服务，请检查已保存的配置或稍后重试"},
	"ORIGIN_REJECTED":         {Status: 403, Message: "请求来源不受信任"},
	"PERMISSION_DENIED":       {Status: 403, Message: "你没有执行此操作的权限"},
	"RATE_LIMITED":            {Status: 429, Message: "尝试过于频繁，请稍后重试"},
	"TOKEN_INVALID":           {Status: 400, Message: "链接无效、已过期或已经使用，请重新申请"},
	"UNSUPPORTED_MEDIA_TYPE":  {Status: 415, Message: "请使用 application/json"},
	"INVALID_CREDENTIALS":     {Status: 401, Message: "账号或密码不正确"},
	"BRAND_INVALID":           {Status: 400, Message: "请选择不超过 256 KiB、尺寸 16–2048 像素的 PNG/JPEG；站点图标也支持 16–256 像素 ICO"},
	"DATABASE_NOT_EMPTY":      {Status: 409, Message: "目标数据库已有表或视图；请先备份，再明确确认清空初始化"},
}
