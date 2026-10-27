// Author: yunnuo <ymz@ebox.vip>
// Description: Installation, authenticated platform routes and local settings; permissions are enforced here.
package httpadapter

import (
	"bytes"
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
	"github.com/yunnuo/unicore/internal/branding"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mailer"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
	"github.com/yunnuo/unicore/internal/settings"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

const sessionCookie = "unicore_session"

func failure(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, contracts.ErrorResponse{Code: code, Message: message, RequestID: w.Header().Get("X-Request-ID")})
}
func webError(w http.ResponseWriter, err error) {
	code := "INTERNAL_ERROR"
	switch {
	case errors.Is(err, branding.ErrInvalid):
		code = "BRAND_INVALID"
	case errors.Is(err, platform.ErrOIDCUnavailable):
		code = "OIDC_UNAVAILABLE"
	case errors.Is(err, platform.ErrOIDC), errors.Is(err, platform.ErrOIDCLinkRequired):
		code = "OIDC_FAILED"
	case errors.Is(err, platform.ErrLocalLoginRequired):
		code = "LOCAL_PASSWORD_REQUIRED"
	case errors.Is(err, settings.ErrMailNotReady):
		code = "MAIL_NOT_READY"
	case errors.Is(err, mailer.ErrUnavailable):
		code = "MAIL_DELIVERY_FAILED"
	case errors.Is(err, platform.ErrFlowDisabled):
		code = "ACCOUNT_FLOW_DISABLED"
	case errors.Is(err, platform.ErrAccountToken):
		code = "TOKEN_INVALID"
	case errors.Is(err, install.ErrToken):
		code = "BOOTSTRAP_TOKEN_INVALID"
	case errors.Is(err, install.ErrInstalled):
		code = "ALREADY_INSTALLED"
	case errors.Is(err, install.ErrTaken):
		code = "DATABASE_INITIALIZED"
	case errors.Is(err, install.ErrNotEmpty):
		code = "DATABASE_NOT_EMPTY"
	case errors.Is(err, install.ErrDatabase):
		code = "DATABASE_UNAVAILABLE"
	case errors.Is(err, install.ErrInput), errors.Is(err, platform.ErrInput), errors.Is(err, settings.ErrInvalid):
		code = "INVALID_INPUT"
	case errors.Is(err, platform.ErrCredentials):
		code = "INVALID_CREDENTIALS"
	case errors.Is(err, platform.ErrForbidden):
		code = "PERMISSION_DENIED"
	case errors.Is(err, platform.ErrConflict):
		code = "ACCOUNT_EXISTS"
	case errors.Is(err, platform.ErrLastAdmin):
		code = "LAST_SUPER_ADMIN"
	case errors.Is(err, platform.ErrRateLimited):
		code = "RATE_LIMITED"
	case errors.Is(err, platform.ErrCaptcha):
		code = "CAPTCHA_INVALID"
	}
	definition := contracts.ErrorCatalog[code]
	failure(w, definition.Status, code, definition.Message)
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
	limit := 64 * 1024
	if operation, ok := apispec.Lookup(strings.ToLower(r.Method), chi.RouteContext(r.Context()).RoutePattern()); ok && operation.Policy.MaxBodyBytes > 0 {
		limit = operation.Policy.MaxBodyBytes
	}
	r.Body = http.MaxBytesReader(w, r.Body, int64(limit))
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		failure(w, 413, "BODY_TOO_LARGE", "请求体过大")
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(value); err != nil {
		failure(w, 400, "INVALID_JSON", "JSON 格式不正确或请求体过大")
		return false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		failure(w, 400, "INVALID_JSON", "只允许一个 JSON 对象")
		return false
	}
	operation, ok := apispec.Lookup(strings.ToLower(r.Method), chi.RouteContext(r.Context()).RoutePattern())
	if ok {
		schema := operation.RequestBody.Content["application/json"].Schema.Ref
		if schema != "" {
			return validationResult(w, apispec.ValidateJSON(strings.TrimPrefix(schema, "#/components/schemas/"), raw))
		}
	}
	return true
}

func validateInput(w http.ResponseWriter, r *http.Request, value any) bool {
	operation, ok := apispec.Lookup(strings.ToLower(r.Method), chi.RouteContext(r.Context()).RoutePattern())
	if !ok {
		return true
	}
	schema := operation.RequestBody.Content["application/json"].Schema.Ref
	if schema == "" {
		return true
	}
	raw, _ := json.Marshal(value)
	return validationResult(w, apispec.ValidateJSON(strings.TrimPrefix(schema, "#/components/schemas/"), raw))
}
func validationResult(w http.ResponseWriter, fields map[string]string) bool {
	if len(fields) == 0 {
		return true
	}
	definition := contracts.ErrorCatalog["INVALID_INPUT"]
	writeJSON(w, definition.Status, contracts.ErrorResponse{Code: "INVALID_INPUT", Message: definition.Message, RequestID: w.Header().Get("X-Request-ID"), Fields: &fields})
	return false
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
func administratorRequest(r *http.Request) bool {
	return r.Header.Get("X-Unicore-Identity") == "administrator"
}
func identityCookie(r *http.Request) string {
	if administratorRequest(r) {
		return "unicore_administrator_session"
	}
	return sessionCookie
}
func rawSession(r *http.Request) string {
	cookie, err := r.Cookie(identityCookie(r))
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
	_, _, _, profile := manager.Services()
	identity := manager.Identity(administratorRequest(r))
	if profile != runtime.WebPlatform || identity == nil {
		failure(w, 404, "NOT_FOUND", "此运行形态不提供平台接口")
		return contracts.Session{}, false
	}
	session, err := identity.Session(r.Context(), rawSession(r))
	if err != nil {
		failure(w, 401, "AUTH_REQUIRED", contracts.ErrorCatalog["AUTH_REQUIRED"].Message)
		return session, false
	}
	if r.Method != "GET" && r.Method != "HEAD" && !platform.Equal(r.Header.Get("X-CSRF-Token"), session.CsrfToken) {
		failure(w, 403, "CSRF_INVALID", "请求校验已失效，请刷新页面")
		return session, false
	}
	if permission != "" && (!platform.Has(session.User, permission) || (platform.SuperOnly(permission) && !platform.IsSuper(session.User))) {
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
	_, service, _, profile := config.Install.Services()
	identity := config.Install.Identity(administratorRequest(r))
	data := runtime.Metadata(profile, config.Metadata.DeploymentKind)
	data.Stage = "M3b"
	data.Installed = config.Install.Installed()
	data.SiteName = "Unicore"
	data.AdminPath = config.Install.AdminPath(r.Context())
	realm := "user"
	if administratorRequest(r) {
		realm = "administrator"
	}
	data.IdentityRealm = &realm
	data.Capabilities.Installation = true
	data.Capabilities.Database = data.Installed
	data.Capabilities.Settings = data.Installed
	data.Capabilities.Authentication = data.Installed && identity != nil
	if service != nil {
		if service.Branding != nil {
			if value, err := service.Branding.Snapshot(r.Context(), false); err == nil {
				data.Branding = &value
			}
		}
		if name, err := service.Value(r.Context(), "site.name"); err == nil {
			data.SiteName = name
		}
		if value, err := service.Value(r.Context(), "site.description"); err == nil {
			data.SiteDescription = &value
		}
		if value, err := service.Value(r.Context(), "site.copyright"); err == nil {
			data.SiteCopyright = &value
		}
		if value, err := service.Value(r.Context(), "site.icp_number"); err == nil {
			data.SiteIcpNumber = &value
		}
		if value, err := service.Value(r.Context(), "site.icp_url"); err == nil {
			data.SiteIcpUrl = &value
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
func setSession(manager *install.Manager, w http.ResponseWriter, token string, expires int, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: identityCookie(r), Value: token, Path: "/", HttpOnly: true, Secure: strings.HasPrefix(manager.BaseURL(), "https://"), SameSite: http.SameSiteLaxMode, Expires: time.Unix(int64(expires), 0), MaxAge: expires - int(time.Now().Unix())})
}
func ip(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
func super(user contracts.User) bool {
	return platform.IsSuper(user)
}

func mountWeb(api chi.Router, config Config) {
	mountBranding(api, config)
	manager := config.Install
	mountAccounts(api, config)
	mountRoles(api, config)
	mountOIDC(api, config)
	limiter := platform.NewLimiter()
	api.Get("/install/status", func(w http.ResponseWriter, r *http.Request) { success(w, manager.Status()) })
	api.Post("/install/token/rotate", func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow("install:"+ip(r), 15, time.Minute) {
			webError(w, platform.ErrRateLimited)
			return
		}
		var input contracts.InstallTokenRotate
		if !decode(w, r, &input) {
			return
		}
		result, err := manager.RotateToken(r.Header.Get("X-Bootstrap-Token"))
		if err != nil {
			webError(w, err)
			return
		}
		success(w, result)
	})
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
		result, err := manager.Verify(ctx, r.Header.Get("X-Bootstrap-Token"), input)
		if err != nil {
			webError(w, err)
			return
		}
		success(w, result)
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
			identity := manager.Identity(true)
			r.Header.Set("X-Unicore-Identity", "administrator")
			session, token, err := identity.Issue(ctx, user, 24)
			if err != nil {
				failure(w, 500, "INSTALL_COMMITTED", "安装已完成，请前往登录页面")
				return
			}
			setSession(manager, w, token, session.ExpiresAt, r)
		}
		success(w, result)
	})
	api.Get("/auth/captcha", func(w http.ResponseWriter, r *http.Request) {
		identity := manager.Identity(administratorRequest(r))
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
		_, service, _, _ := manager.Services()
		identity := manager.Identity(administratorRequest(r))
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
		setSession(manager, w, token, session.ExpiresAt, r)
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
		identity := manager.Identity(administratorRequest(r))
		if err := identity.Store.DeleteSession(r.Context(), platform.Hash(rawSession(r))); err != nil {
			webError(w, err)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: identityCookie(r), Path: "/", HttpOnly: true, Secure: strings.HasPrefix(manager.BaseURL(), "https://"), SameSite: http.SameSiteLaxMode, MaxAge: -1})
		success(w, contracts.ActionResult{Success: true})
	})
	api.Post("/account/password", func(w http.ResponseWriter, r *http.Request) {
		actor, ok := require(manager, w, r, "")
		if !ok {
			return
		}
		var input contracts.ChangePasswordInput
		if !decode(w, r, &input) {
			return
		}
		identity := manager.Identity(administratorRequest(r))
		if err := identity.ChangePassword(r.Context(), actor.User, input, ip(r)); err != nil {
			webError(w, err)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: identityCookie(r), Path: "/", HttpOnly: true, Secure: strings.HasPrefix(manager.BaseURL(), "https://"), SameSite: http.SameSiteLaxMode, MaxAge: -1})
		success(w, contracts.ActionResult{Success: true})
	})
	api.Get("/admin/logs", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := require(manager, w, r, "logs:read"); !ok {
			return
		}
		identity := manager.Identity(administratorRequest(r))
		data, err := identity.Store.SystemLogs(r.Context())
		if err != nil {
			webError(w, err)
			return
		}
		success(w, data)
	})
	for _, administrators := range []bool{false, true} {
		path, permission, role := "/admin/users", "users", "user"
		if administrators {
			path, permission, role = "/admin/administrators", "administrators", "super_admin"
		}
		api.Get(path, func(w http.ResponseWriter, r *http.Request) {
			if _, ok := require(manager, w, r, permission+":read"); !ok {
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
			identity := manager.Identity(administrators)
			data, err := identity.Store.ListUsers(r.Context(), search, page, size)
			if err != nil {
				webError(w, err)
				return
			}
			success(w, data)
		})
		api.Post(path, func(w http.ResponseWriter, r *http.Request) {
			actor, ok := require(manager, w, r, permission+":create")
			if !ok {
				return
			}
			var input contracts.UserCreate
			if !decode(w, r, &input) {
				return
			}
			if input.Role != role {
				webError(w, platform.ErrInput)
				return
			}
			identity := manager.Identity(administrators)
			data, err := identity.Create(r.Context(), input, actor.User.ID)
			if err != nil {
				webError(w, err)
				return
			}
			success(w, data)
		})
		api.Patch(path+"/{id}", func(w http.ResponseWriter, r *http.Request) {
			actor, ok := require(manager, w, r, permission+":update")
			if !ok {
				return
			}
			var input contracts.UserUpdate
			if !decode(w, r, &input) {
				return
			}
			if input.Role != role {
				webError(w, platform.ErrInput)
				return
			}
			identity := manager.Identity(administrators)
			data, err := identity.Store.UpdateUser(r.Context(), chi.URLParam(r, "id"), input, actor.User.ID)
			if err != nil {
				webError(w, err)
				return
			}
			success(w, data)
		})
	}

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
