// Author: yunnuo <ymz@ebox.vip>
// Description: Contract-driven route policy middleware; every matched API route must declare its access policy in openapi.json or it is refused.
package httpadapter

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/runtime"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

// policySessionKey carries the session resolved by the policy middleware so
// require() never has to resolve the same session twice per request.
type policySessionKey struct{}

// policyRouter wraps route registration so every versioned API handler runs
// behind the contract policy check. Fail closed: a route without an
// x-unicore policy in packages/contracts/openapi.json returns 500 instead of
// serving.
type policyRouter struct {
	chi.Router
	config Config
}

func (p policyRouter) Get(pattern string, h http.HandlerFunc) {
	p.Router.With(policyHandler(p.config)).Get(pattern, h)
}

func (p policyRouter) Post(pattern string, h http.HandlerFunc) {
	p.Router.With(policyHandler(p.config)).Post(pattern, h)
}

func (p policyRouter) Put(pattern string, h http.HandlerFunc) {
	p.Router.With(policyHandler(p.config)).Put(pattern, h)
}

func (p policyRouter) Patch(pattern string, h http.HandlerFunc) {
	p.Router.With(policyHandler(p.config)).Patch(pattern, h)
}

func (p policyRouter) Delete(pattern string, h http.HandlerFunc) {
	p.Router.With(policyHandler(p.config)).Delete(pattern, h)
}

func (p policyRouter) Head(pattern string, h http.HandlerFunc) {
	p.Router.With(policyHandler(p.config)).Head(pattern, h)
}

// mountAPI registers every versioned API route behind the contract policy middleware.
func mountAPI(api chi.Router, config Config) {
	guarded := policyRouter{Router: api, config: config}
	if config.Install != nil {
		mountUpdates(guarded, config)
	}
	for _, bootstrapPath := range []string{"/bootstrap", "/admin/bootstrap"} {
		guarded.Get(bootstrapPath, func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(bootstrapPath, "/admin/") && (config.Install == nil || config.Install.Identity(true) == nil) {
				failure(w, 404, "NOT_FOUND", "接口不存在")
				return
			}
			data := config.Metadata
			if config.Install != nil {
				data = metadata(config, r)
			}
			writeJSON(w, 200, contracts.BootstrapResponse{Code: "OK", Data: data, RequestID: w.Header().Get("X-Request-ID")})
		})
	}
	for _, route := range []string{"/health/live", "/health/ready"} {
		guarded.Get(route, func(w http.ResponseWriter, r *http.Request) {
			if config.Install != nil && r.URL.Path == "/api/v1/health/ready" {
				store, _, _, _ := config.Install.Services()
				if store == nil {
					failure(w, 503, "NOT_READY", "安装尚未完成")
					return
				}
				ctx, cancel := context.WithTimeout(r.Context(), config.ReadinessTimeout)
				defer cancel()
				if err := store.DB.PingContext(ctx); err != nil {
					failure(w, 503, "NOT_READY", "存储尚未就绪")
					return
				}
			}
			writeJSON(w, 200, contracts.HealthResponse{Code: "OK", Data: contracts.Health{Status: "ok"}, RequestID: w.Header().Get("X-Request-ID")})
		})
	}
	for _, corePath := range []string{"/core/execute", "/admin/core/execute"} {
		guarded.Post(corePath, func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(corePath, "/admin/") && (config.Install == nil || config.Install.Identity(true) == nil) {
				failure(w, 404, "NOT_FOUND", "接口不存在")
				return
			}
			if config.Install != nil && !coreAccess(config.Install, w, r) {
				return
			}
			requestID := w.Header().Get("X-Request-ID")
			fail := func(status int, code, message string) {
				writeJSON(w, status, contracts.ErrorResponse{Code: code, Message: message, RequestID: requestID})
			}
			if !sameOrigin(r) {
				fail(403, "ORIGIN_REJECTED", "请求来源不受信任")
				return
			}
			contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || contentType != "application/json" {
				fail(415, "UNSUPPORTED_MEDIA_TYPE", "请使用 application/json")
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, 512*1024)
			decoder := json.NewDecoder(r.Body)
			decoder.DisallowUnknownFields()
			var input contracts.ExecuteInput
			if err := decoder.Decode(&input); err != nil {
				var tooLarge *http.MaxBytesError
				if errors.As(err, &tooLarge) {
					fail(413, "BODY_TOO_LARGE", "请求体过大")
				} else {
					fail(400, "INVALID_JSON", "JSON 格式不正确")
				}
				return
			}
			if err := decoder.Decode(&struct{}{}); err != io.EOF {
				fail(400, "INVALID_JSON", "只允许一个 JSON 对象")
				return
			}
			if !validateInput(w, r, input) {
				return
			}
			output, err := config.Core.Execute(r.Context(), input)
			if err != nil {
				response := presenter.Error(err, requestID)
				status := 500
				if response.Code == "INVALID_INPUT" {
					status = 400
				}
				writeJSON(w, status, response)
				return
			}
			writeJSON(w, 200, contracts.ExecuteResponse{Code: "OK", Data: output, RequestID: requestID})
		})
	}
	if config.Install != nil {
		mountWeb(guarded, config)
	}
}

// policyHandler enforces the access policy declared on the matched OpenAPI
// operation. Session access classes resolve the session once, verify contract
// permissions and superAdmin flags, then stash the session in the request
// context for require() to reuse. Public, install-token and local accesses
// keep their handler-side guards.
func policyHandler(config Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			route := chi.RouteContext(r.Context()).RoutePattern()
			operation, ok := apispec.Lookup(strings.ToLower(r.Method), route)
			if !ok {
				config.Logger.Error("api route is not declared in the contract", "event", "http.policy_undeclared", "method", r.Method, "route", route)
				failure(w, 500, "ROUTE_POLICY_UNDECLARED", "接口缺少契约声明，已拒绝执行")
				return
			}
			switch operation.Policy.Access {
			case "public", "install-token", "local":
				next.ServeHTTP(w, r)
				return
			case "session", "authenticated", "platform-session":
			default:
				config.Logger.Error("api route declares an unsupported access policy", "event", "http.policy_unsupported", "method", r.Method, "route", route, "access", operation.Policy.Access)
				failure(w, 500, "ROUTE_POLICY_UNSUPPORTED", "接口访问策略不受支持，已拒绝执行")
				return
			}
			if operation.Policy.Access == "session" && (strings.HasSuffix(r.URL.Path, "/auth/mfa") || strings.HasSuffix(r.URL.Path, "/auth/mfa/cancel")) {
				// MFA completion routes accept pending sessions by design; their
				// handlers validate the pending token and CSRF themselves.
				next.ServeHTTP(w, r)
				return
			}
			if config.Install == nil {
				next.ServeHTTP(w, r)
				return
			}
			if operation.Policy.Access == "platform-session" {
				// Core execution stays open to the local surface outside web-platform.
				if _, _, _, profile := config.Install.Services(); profile != runtime.WebPlatform {
					next.ServeHTTP(w, r)
					return
				}
			}
			session, ok := resolveSession(config.Install, w, r)
			if !ok {
				return
			}
			for _, permission := range operation.Policy.Permissions {
				if !platform.Has(session.User, permission) || (platform.SuperOnly(permission) && !platform.IsSuper(session.User)) {
					webError(w, platform.ErrForbidden)
					return
				}
			}
			if operation.Policy.SuperAdmin && !platform.IsSuper(session.User) {
				webError(w, platform.ErrForbidden)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), policySessionKey{}, session)))
		})
	}
}

// resolveSession performs the shared session gate: installation state, profile
// identity availability, session cookie validation and CSRF for unsafe
// methods. Both the policy middleware and require() rely on it.
func resolveSession(manager *install.Manager, w http.ResponseWriter, r *http.Request) (contracts.Session, bool) {
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
		if errors.Is(err, platform.ErrMFA) {
			webError(w, err)
			return session, false
		}
		if administratorRequest(r) && rawSession(r) == "" {
			if cookie, e := r.Cookie(sessionCookie); e == nil {
				if userIdentity := manager.Identity(false); userIdentity != nil {
					if _, e = userIdentity.Session(r.Context(), cookie.Value); e == nil {
						webError(w, platform.ErrForbidden)
						return session, false
					}
				}
			}
		}
		failure(w, 401, "AUTH_REQUIRED", contracts.ErrorCatalog["AUTH_REQUIRED"].Message)
		return session, false
	}
	if r.Method != "GET" && r.Method != "HEAD" && !platform.Equal(r.Header.Get("X-CSRF-Token"), session.CsrfToken) {
		failure(w, 403, "CSRF_INVALID", "请求校验已失效，请刷新页面")
		return session, false
	}
	return session, true
}
