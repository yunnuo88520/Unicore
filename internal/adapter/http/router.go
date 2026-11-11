// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned HTTP adapter; JSON API errors never fall through to SPA HTML.
package httpadapter

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/logging"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/audit"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/monitor"
	"github.com/yunnuo/unicore/internal/observability"
	"github.com/yunnuo/unicore/internal/platform"
	"github.com/yunnuo/unicore/internal/realtime"
	"github.com/yunnuo/unicore/internal/updateport"
	"github.com/yunnuo/unicore/internal/usecase"
	apispec "github.com/yunnuo/unicore/packages/contracts"
)

type Config struct {
	Updates          updateport.API
	Metadata         contracts.Bootstrap
	Core             usecase.Executor
	Assets           fs.FS
	Logger           *slog.Logger
	Install          *install.Manager
	APIDocs          bool
	ReadinessTimeout time.Duration
	Metrics          *observability.Metrics
	Hub              *realtime.Hub
	LogBroadcast     *logging.BroadcastWriter
	Monitor          *monitor.Service
	AlertRulesStore  monitor.AlertRuleStore
}

func New(config Config) http.Handler {
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	if config.ReadinessTimeout <= 0 {
		config.ReadinessTimeout = 2 * time.Second
	}
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			w = wrapped
			start := time.Now()
			var record func(string, string, int, time.Duration)
			if config.Metrics != nil {
				record = config.Metrics.Begin()
			}
			requestID := presenter.RequestID()
			w.Header().Set("X-Request-ID", requestID)
			if strings.HasPrefix(r.URL.Path, "/api/") {
				w.Header().Set("Cache-Control", "no-store")
			}
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Referrer-Policy", "same-origin")
			connect := "'self'"
			scripts := "'self'"
			images := "'self' data:"
			frames := ""
			if config.Install != nil {
				if fs := config.Install.Files(); fs != nil {
					connect += " " + strings.Join(fs.Origins(r.Context()), " ")
				}
				// Click-through human verification loads the provider widget; widen
				// script/frame/connect/img only while a switch is enabled.
				if origins := config.Install.HumanCheckOrigins(r.Context()); len(origins) > 0 {
					joined := strings.Join(origins, " ")
					scripts += " " + joined
					connect += " " + joined
					images += " " + joined
					frames = " frame-src " + joined + ";"
				}
			}
			w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src "+scripts+"; style-src 'self' 'unsafe-inline'; img-src "+images+"; connect-src "+connect+";"+frames+" frame-ancestors 'none'; base-uri 'self'")
			defer func() {
				if recovered := recover(); recovered != nil {
					if wrapped.Status() == 0 {
						writeJSON(w, 500, contracts.ErrorResponse{Code: "INTERNAL_ERROR", Message: "操作失败，请重试", RequestID: requestID})
					}
					config.Logger.Error("request panic", "event", "http.panic", "request_id", requestID)
				}
				status := wrapped.Status()
				if status == 0 {
					status = 200
				}
				route := chi.RouteContext(r.Context()).RoutePattern()
				if route == "" {
					route = "unmatched"
				}
				if record != nil {
					record(r.Method, route, status, time.Since(start))
				}
				config.Logger.Info("request completed", "event", "http.request", "request_id", requestID, "method", r.Method, "route", route, "status", status, "duration_ms", time.Since(start).Milliseconds())
			}()
			if config.Install != nil && config.Install.Identity(administratorRequest(r)) != nil {
				realm := "user"
				if administratorRequest(r) {
					realm = "administrator"
				}
				r = r.WithContext(audit.With(r.Context(), audit.Metadata{IP: ip(r), Realm: realm, Target: r.URL.Path}))
			}
			r = r.WithContext(platform.WithDevice(r.Context(), ip(r), r.UserAgent()))
			if strings.HasSuffix(r.URL.Path, "/bootstrap") || strings.HasSuffix(r.URL.Path, "/auth/session") || strings.HasSuffix(r.URL.Path, "/account/sessions") {
				r = r.WithContext(platform.WithPassive(r.Context()))
			}
			next.ServeHTTP(w, r)
		})
	})
	if config.Install != nil {
		router.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if sameOrigin(r) {
					next.ServeHTTP(w, r)
					return
				}
				failure(w, 403, "ORIGIN_REJECTED", "请求来源不受信任")
			})
		})
	}
	if config.Install != nil {
		router.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasSuffix(r.URL.Path, "/auth/login") || strings.HasSuffix(r.URL.Path, "/auth/mfa") || strings.Contains(r.URL.Path, "/auth/email/login/") || strings.Contains(r.URL.Path, "/auth/oidc/") {
					if identity := config.Install.Identity(administratorRequest(r)); identity != nil {
						if err := identity.LoginAllowed(r.Context(), ip(r)); err != nil {
							webError(w, err)
							return
						}
					}
				}
				// Admin recovery, public metadata and probes remain reachable during maintenance.
				path := r.URL.Path
				if strings.HasPrefix(path, "/api/v1/") && path != "/api/v1/bootstrap" && !strings.HasPrefix(path, "/api/v1/admin/") && !strings.HasPrefix(path, "/api/v1/health/") {
					_, service, _, profile := config.Install.Services()
					if profile == "web-platform" && service != nil {
						values, err := service.Store.ReadSettings(r.Context())
						if err != nil {
							failure(w, 503, "NOT_READY", "存储尚未就绪")
							return
						}
						if values["maintenance.enabled"] == "true" {
							w.Header().Set("Retry-After", "60")
							failure(w, 503, "MAINTENANCE_MODE", "站点维护中，请稍后再试")
							return
						}
					}
				}
				next.ServeHTTP(w, r)
			})
		})
	}
	if config.APIDocs {
		router.Get("/openapi.json", func(w http.ResponseWriter, r *http.Request) {
			content, _ := apispec.Assets.ReadFile("openapi.json")
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			_, _ = w.Write(content)
		})
		router.Get("/docs/api", func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "/api-docs", http.StatusFound)
		})
	} else {
		router.Get("/openapi.json", http.NotFound)
		router.Get("/docs/api", http.NotFound)
	}
	router.Get("/site.webmanifest", func(w http.ResponseWriter, r *http.Request) { serveBrandManifest(config, w, r) })
	router.Get("/brand-assets/{name}", func(w http.ResponseWriter, r *http.Request) { serveBrandAsset(config, w, r) })
	router.Head("/brand-assets/{name}", func(w http.ResponseWriter, r *http.Request) { serveBrandAsset(config, w, r) })
	router.Route("/api/v1", func(api chi.Router) {
		mountAPI(api, config)
	})
	apiError := func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 404, contracts.ErrorResponse{Code: "NOT_FOUND", Message: "接口不存在", RequestID: w.Header().Get("X-Request-ID")})
	}
	router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/brand-assets/") {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			apiError(w, r)
			return
		}
		if config.Install != nil && r.Method == http.MethodGet {
			if !config.Install.Installed() && r.URL.Path != "/install" && !strings.Contains(path.Base(r.URL.Path), ".") {
				http.Redirect(w, r, "/install", http.StatusSeeOther)
				return
			}
			if config.Install.Installed() && r.URL.Path == "/install" {
				http.Redirect(w, r, "/", http.StatusSeeOther)
				return
			}
			_, _, identity, _ := config.Install.Services()
			prefix := config.Install.AdminPath(r.Context())
			if r.URL.Path == "/admin.html" || (r.URL.Path == "/admin" && prefix != "/admin") {
				http.NotFound(w, r)
				return
			}
			if r.URL.Path == prefix || strings.HasPrefix(r.URL.Path, prefix+"/") {
				if identity == nil {
					http.NotFound(w, r)
					return
				}

				serveEntry(config.Assets, "admin.html", w, r)
				return
			}
		}
		serveSPA(config.Assets, w, r)
	})
	router.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 405, contracts.ErrorResponse{Code: "METHOD_NOT_ALLOWED", Message: "请求方法不受支持", RequestID: w.Header().Get("X-Request-ID")})
	})
	return router
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func serveEntry(assets fs.FS, name string, w http.ResponseWriter, r *http.Request) {
	content, err := fs.ReadFile(assets, name)
	if err != nil {
		http.Error(w, "Frontend not built. Run pnpm build first.", 503)
		return
	}
	if serveWithETag(w, r, content, "no-cache") {
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if r.Method == http.MethodGet {
		_, _ = w.Write(content)
	}
}

// serveWithETag answers conditional requests with 304 and stamps the entity
// tag for the caller-chosen Cache-Control policy; it reports whether the
// response was written.
func serveWithETag(w http.ResponseWriter, r *http.Request, content []byte, cacheControl string) bool {
	etag := `"` + fmt.Sprintf("%x", sha256.Sum256(content))[:16] + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", cacheControl)
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	for _, candidate := range strings.Split(r.Header.Get("If-None-Match"), ",") {
		if candidate = strings.TrimSpace(candidate); candidate == etag || candidate == "W/"+etag || candidate == "*" {
			w.WriteHeader(http.StatusNotModified)
			return true
		}
	}
	return false
}

func serveSPA(assets fs.FS, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", 405)
		return
	}
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "" {
		name = "index.html"
	}
	content, err := fs.ReadFile(assets, name)
	if err != nil {
		if strings.Contains(path.Base(name), ".") || strings.HasPrefix(name, "assets/") {
			http.NotFound(w, r)
			return
		}
		name = "index.html"
		content, err = fs.ReadFile(assets, name)
	}
	if err != nil {
		http.Error(w, "Frontend not built. Run pnpm build first; use port 5173 in development.", 503)
		return
	}
	w.Header().Set("Content-Type", mime.TypeByExtension(path.Ext(name)))
	if strings.HasPrefix(name, "assets/") {
		if serveWithETag(w, r, content, "public, max-age=31536000, immutable") {
			return
		}
	} else if serveWithETag(w, r, content, "no-cache") {
		return
	}
	if r.Method == http.MethodGet {
		_, _ = w.Write(content)
	}
}
