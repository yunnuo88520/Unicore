// Author: yunnuo <ymz@ebox.vip>
// Description: Installation, authenticated platform routes and local settings; permissions are enforced here.
package httpadapter

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/settings"
)

const sessionCookie = "unicore_session"

func failure(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, contracts.ErrorResponse{Code: code, Message: message, RequestID: w.Header().Get("X-Request-ID")})
}
func webError(w http.ResponseWriter, err error) {
	status, code, message := 500, "INTERNAL_ERROR", "操作未完成，请重试"
	switch {
	case errors.Is(err, install.ErrToken):
		status, code, message = 403, "BOOTSTRAP_TOKEN_INVALID", "安装凭据无效，请读取部署数据目录中的 bootstrap.token"
	case errors.Is(err, install.ErrInstalled):
		status, code, message = 409, "ALREADY_INSTALLED", "此实例已安装，不能重复初始化"
	case errors.Is(err, install.ErrTaken):
		status, code, message = 409, "DATABASE_INITIALIZED", "数据库已有安装记录，请恢复原实例配置或使用空数据库"
	case errors.Is(err, install.ErrDatabase):
		status, code, message = 400, "DATABASE_UNAVAILABLE", "无法连接或初始化数据库，请检查配置与权限后重试"
	case errors.Is(err, install.ErrInput), errors.Is(err, platform.ErrInput), errors.Is(err, settings.ErrInvalid):
		status, code, message = 400, "INVALID_INPUT", "请检查输入类型、范围及当前形态是否支持"
	case errors.Is(err, platform.ErrCredentials):
		status, code, message = 401, "AUTH_REQUIRED", "账号或密码不正确，或登录已失效"
	case errors.Is(err, platform.ErrForbidden):
		status, code, message = 403, "PERMISSION_DENIED", "你没有执行此操作的权限"
	case errors.Is(err, platform.ErrConflict):
		status, code, message = 409, "ACCOUNT_EXISTS", "账号或邮箱已存在"
	case errors.Is(err, platform.ErrLastAdmin):
		status, code, message = 409, "LAST_SUPER_ADMIN", "不能禁用或降权最后一个启用的超级管理员"
	case errors.Is(err, platform.ErrRateLimited):
		status, code, message = 429, "RATE_LIMITED", "尝试过于频繁，请稍后重试"
	case errors.Is(err, platform.ErrCaptcha):
		status, code, message = 400, "CAPTCHA_INVALID", "验证码不正确或已过期，请刷新后重试"
	}
	failure(w, status, code, message)
}
func success(w http.ResponseWriter, data any) {
	writeJSON(w, 200, struct {
		Code      string `json:"code"`
		Message   string `json:"message"`
		Data      any    `json:"data"`
		RequestID string `json:"request_id"`
	}{"OK", "", data, w.Header().Get("X-Request-ID")})
}
func decode(w http.ResponseWriter, r *http.Request, value any) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		failure(w, 415, "UNSUPPORTED_MEDIA_TYPE", "请使用 application/json")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(value); err != nil {
		failure(w, 400, "INVALID_JSON", "JSON 格式不正确或请求体过大")
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		failure(w, 400, "INVALID_JSON", "只允许一个 JSON 对象")
		return false
	}
	return true
}
func sameOrigin(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == "GET" || r.Method == "HEAD" {
		return true
	}
	if origin := r.Header.Get("Origin"); origin != "" {
		u, err := url.Parse(origin)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host != r.Host || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
			failure(w, 403, "ORIGIN_REJECTED", "请求来源不受信任")
			return false
		}
	}
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		failure(w, 403, "ORIGIN_REJECTED", "请求来源不受信任")
		return false
	}
	return true
}
func rawSession(r *http.Request) string {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return ""
	}
	return cookie.Value
}
func require(manager *install.Manager, w http.ResponseWriter, r *http.Request, permission string) (contracts.Session, bool) {
	if !manager.Installed() {
		failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
		return contracts.Session{}, false
	}
	_, _, identity, profile := manager.Services()
	if profile != runtime.WebPlatform || identity == nil {
		failure(w, 404, "NOT_FOUND", "此运行形态不提供平台接口")
		return contracts.Session{}, false
	}
	session, err := identity.Session(r.Context(), rawSession(r))
	if err != nil {
		webError(w, platform.ErrCredentials)
		return session, false
	}
	if r.Method != "GET" && r.Method != "HEAD" && !platform.Equal(r.Header.Get("X-CSRF-Token"), session.CsrfToken) {
		failure(w, 403, "CSRF_INVALID", "请求校验已失效，请刷新页面")
		return session, false
	}
	if permission != "" && !platform.Has(session.User, permission) {
		webError(w, platform.ErrForbidden)
		return session, false
	}
	return session, true
}
func coreAccess(manager *install.Manager, w http.ResponseWriter, r *http.Request) bool {
	if !manager.Installed() {
		failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
		return false
	}
	_, _, _, profile := manager.Services()
	if profile == runtime.WebPlatform {
		_, ok := require(manager, w, r, "")
		return ok
	}
	return true
}
func metadata(config Config, r *http.Request) contracts.Bootstrap {
	_, service, identity, profile := config.Install.Services()
	data := runtime.Metadata(profile, config.Metadata.DeploymentKind)
	data.Stage = "M2a"
	data.Installed = config.Install.Installed()
	data.SiteName = "Unicore"
	data.AdminPath = config.Install.AdminPath(r.Context())
	data.Capabilities.Installation = true
	data.Capabilities.Database = data.Installed
	data.Capabilities.Settings = data.Installed
	data.Capabilities.Authentication = data.Installed && identity != nil
	if service != nil {
		if name, err := service.Value(r.Context(), "site.name"); err == nil {
			data.SiteName = name
		}
		if value, err := service.Value(r.Context(), "site.description"); err == nil {
			data.SiteDescription = &value
		}
		if value, err := service.Value(r.Context(), "site.copyright"); err == nil {
			data.SiteCopyright = &value
		}
		if value, err := service.Value(r.Context(), "appearance.theme"); err == nil {
			data.Theme = &value
		}
	}
	if identity != nil {
		if session, err := identity.Session(r.Context(), rawSession(r)); err == nil {
			data.CurrentUser = &session.User
			data.CsrfToken = &session.CsrfToken
		}
	}
	return data
}
func setSession(manager *install.Manager, w http.ResponseWriter, token string, expires int) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: strings.HasPrefix(manager.BaseURL(), "https://"), SameSite: http.SameSiteLaxMode, Expires: time.Unix(int64(expires), 0), MaxAge: expires - int(time.Now().Unix())})
}
func ip(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
func super(user contracts.User) bool {
	for _, role := range user.Roles {
		if role == "super_admin" {
			return true
		}
	}
	return false
}

func mountWeb(api chi.Router, config Config) {
	manager := config.Install
	limiter := platform.NewLimiter()
	api.Get("/install/status", func(w http.ResponseWriter, r *http.Request) { success(w, manager.Status()) })
	api.Post("/install/verify-db", func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow("install:"+ip(r), 15, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		var input contracts.DatabaseInput
		if !decode(w, r, &input) {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 7*time.Second)
		defer cancel()
		if err := manager.Verify(ctx, r.Header.Get("X-Bootstrap-Token"), input); err != nil {
			webError(w, err)
			return
		}
		success(w, contracts.ActionResult{Success: true})
	})
	api.Post("/install/complete", func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow("install:"+ip(r), 15, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		var input contracts.InstallInput
		if !decode(w, r, &input) {
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()
		result, user, err := manager.Complete(ctx, r.Header.Get("X-Bootstrap-Token"), input)
		if err != nil {
			webError(w, err)
			return
		}
		if user.ID != "" {
			_, _, identity, _ := manager.Services()
			session, token, err := identity.Issue(ctx, user, 24)
			if err != nil {
				failure(w, 500, "INSTALL_COMMITTED", "安装已完成，请前往登录页面")
				return
			}
			setSession(manager, w, token, session.ExpiresAt)
		}
		success(w, result)
	})
	api.Get("/auth/captcha", func(w http.ResponseWriter, r *http.Request) {
		_, _, identity, _ := manager.Services()
		if identity == nil {
			failure(w, 404, "NOT_FOUND", "接口不存在")
			return
		}
		if !limiter.Allow("captcha:"+ip(r), 30, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		id, image := identity.Captchas.Create()
		if id == "" {
			webError(w, platform.ErrRateLimited)
			return
		}
		success(w, contracts.Captcha{ID: id, Image: image})
	})
	api.Post("/auth/login", func(w http.ResponseWriter, r *http.Request) {
		_, service, identity, _ := manager.Services()
		if identity == nil {
			failure(w, 404, "NOT_FOUND", "接口不存在")
			return
		}
		var input contracts.LoginInput
		if !decode(w, r, &input) {
			return
		}
		captcha, err := service.Value(r.Context(), "security.login_captcha")
		if err != nil {
			webError(w, err)
			return
		}
		hoursValue, err := service.Value(r.Context(), "security.session_hours")
		if err != nil {
			webError(w, err)
			return
		}
		hours, _ := strconv.Atoi(hoursValue)
		session, token, err := identity.Login(r.Context(), input, ip(r), captcha == "true", hours)
		if err != nil {
			webError(w, err)
			return
		}
		setSession(manager, w, token, session.ExpiresAt)
		success(w, session)
	})
	api.Get("/auth/session", func(w http.ResponseWriter, r *http.Request) {
		if session, ok := require(manager, w, r, ""); ok {
			success(w, session)
		}
	})
	api.Post("/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, ""); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		if err := identity.Store.DeleteSession(r.Context(), platform.Hash(rawSession(r))); err != nil {
			webError(w, err)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: sessionCookie, Path: "/", HttpOnly: true, Secure: strings.HasPrefix(manager.BaseURL(), "https://"), SameSite: http.SameSiteLaxMode, MaxAge: -1})
		success(w, contracts.ActionResult{Success: true})
	})
	api.Get("/admin/dashboard", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "dashboard:read"); !ok {
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.Dashboard(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Get("/admin/users", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "users:read"); !ok {
			return
		}
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		size, _ := strconv.Atoi(r.URL.Query().Get("page_size"))
		if page < 1 {
			page = 1
		}
		if page > 100000 {
			page = 100000
		}
		if size < 1 || size > 50 {
			size = 20
		}
		search := r.URL.Query().Get("search")
		if len(search) > 128 {
			webError(w, platform.ErrInput)
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.ListUsers(r.Context(), search, page, size)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Post("/admin/users", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "users:create")
		if !ok {
			return
		}
		var input contracts.UserCreate
		if !decode(w, r, &input) {
			return
		}
		if input.Role == "super_admin" && !super(actor.User) {
			webError(w, platform.ErrForbidden)
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Create(r.Context(), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	api.Patch("/admin/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "users:update")
		if !ok {
			return
		}
		var input contracts.UserUpdate
		if !decode(w, r, &input) {
			return
		}
		if !super(actor.User) {
			webError(w, platform.ErrForbidden)
			return
		}
		_, _, identity, _ := manager.Services()
		data, err := identity.Store.UpdateUser(r.Context(), chi.URLParam(r, "id"), input, actor.User.ID)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	for _, admin := range []bool{false, true} {
		prefix := "/settings"
		if admin {
			prefix = "/admin/settings"
		}
		check := func(w http.ResponseWriter, r *http.Request) (*settings.Service, string, bool) {
			_, service, _, profile := manager.Services()
			if service == nil {
				failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
				return nil, "", false
			}
			if admin {
				permission := "settings:read"
				if r.Method == "PATCH" {
					permission = "settings:write"
				}
				session, ok := require(manager, w, r, permission)
				return service, session.User.ID, ok
			}
			if profile == runtime.WebPlatform {
				failure(w, 404, "NOT_FOUND", "请使用受保护的平台设置接口")
				return nil, "", false
			}
			return service, "local", true
		}
		api.Get(prefix, func(w http.ResponseWriter, r *http.Request) {
			service, _, ok := check(w, r)
			if !ok {
				return
			}
			data, err := service.List(r.Context())
			if err != nil {
				webError(w, err)
				return
			}
			success(w, data)
		})
		api.Patch(prefix, func(w http.ResponseWriter, r *http.Request) {
			service, actor, ok := check(w, r)
			if !ok {
				return
			}
			var input contracts.SettingPatch
			if !decode(w, r, &input) {
				return
			}
			data, err := service.Patch(r.Context(), input, actor)
			if err != nil {
				webError(w, err)
				return
			}
			success(w, data)
		})
	}
}
