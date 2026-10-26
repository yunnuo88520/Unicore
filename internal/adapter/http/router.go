// Author: yunnuo <ymz@ebox.vip>
// Description: Versioned HTTP adapter; JSON API errors never fall through to SPA HTML.
package httpadapter

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/adapter/presenter"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/usecase"
)

type Config struct {
	Metadata contracts.Bootstrap
	Core     usecase.Executor
	Assets   fs.FS
	Logger   *slog.Logger
	Install  *install.Manager
}

func New(config Config) http.Handler {
	router := chi.NewRouter()
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			requestID := presenter.RequestID()
			w.Header().Set("X-Request-ID", requestID)
			if strings.HasPrefix(r.URL.Path, "/api/") {
				w.Header().Set("Cache-Control", "no-store")
			}
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Referrer-Policy", "same-origin")
			w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")
			defer func() {
				if recovered := recover(); recovered != nil {
					writeJSON(w, 500, contracts.ErrorResponse{Code: "INTERNAL_ERROR", Message: "操作失败，请重试", RequestID: requestID})
					config.Logger.Error("request panic", "event", "http.panic", "request_id", requestID)
				}
				config.Logger.Info("request completed", "event", "http.request", "request_id", requestID, "method", r.Method, "duration_ms", time.Since(start).Milliseconds())
			}()
			next.ServeHTTP(w, r)
		})
	})
	if config.Install != nil {
		router.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if sameOrigin(w, r) {
					next.ServeHTTP(w, r)
				}
			})
		})
	}
	router.Route("/api/v1", func(api chi.Router) {
		api.Get("/bootstrap", func(w http.ResponseWriter, r *http.Request) {
			data := config.Metadata
			if config.Install != nil {
				data = metadata(config, r)
			}
			writeJSON(w, 200, contracts.BootstrapResponse{Code: "OK", Data: data, RequestID: w.Header().Get("X-Request-ID")})
		})
		for _, route := range []string{"/health/live", "/health/ready"} {
			api.Get(route, func(w http.ResponseWriter, r *http.Request) {
				if config.Install != nil && r.URL.Path == "/api/v1/health/ready" {
					store, _, _, _ := config.Install.Services()
					if store == nil {
						failure(w, 503, "NOT_READY", "安装尚未完成")
						return
					}
					if err := store.DB.PingContext(r.Context()); err != nil {
						failure(w, 503, "NOT_READY", "存储尚未就绪")
						return
					}
				}
				writeJSON(w, 200, contracts.HealthResponse{Code: "OK", Data: contracts.Health{Status: "ok"}, RequestID: w.Header().Get("X-Request-ID")})
			})
		}
		api.Post("/core/execute", func(w http.ResponseWriter, r *http.Request) {
			if config.Install != nil && !coreAccess(config.Install, w, r) {
				return
			}
			requestID := w.Header().Get("X-Request-ID")
			fail := func(status int, code, message string) {
				writeJSON(w, status, contracts.ErrorResponse{Code: code, Message: message, RequestID: requestID})
			}
			if origin := r.Header.Get("Origin"); origin != "" {
				parsed, err := url.Parse(origin)
				if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host != r.Host || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
					fail(403, "ORIGIN_REJECTED", "请求来源不受信任")
					return
				}
			}
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
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
		if config.Install != nil {
			mountWeb(api, config)
		}
	})
	apiError := func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 404, contracts.ErrorResponse{Code: "NOT_FOUND", Message: "接口不存在", RequestID: w.Header().Get("X-Request-ID")})
	}
	router.NotFound(func(w http.ResponseWriter, r *http.Request) {
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
			if r.URL.Path == "/admin" && prefix != "/admin" {
				http.NotFound(w, r)
				return
			}
			if r.URL.Path == prefix || strings.HasPrefix(r.URL.Path, prefix+"/") {
				if identity == nil {
					http.NotFound(w, r)
					return
				}
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
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}
	if r.Method == http.MethodGet {
		_, _ = w.Write(content)
	}
}
