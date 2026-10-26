// Author: yunnuo <ymz@ebox.vip>
// Description: Instance brand JSON operations and public, non-executable normalized PNG delivery.
package httpadapter

import (
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/runtime"
	"io/fs"
	"net/http"
)

func mountBranding(api chi.Router, config Config) {
	for _, admin := range []bool{false, true} {
		path := "/branding"
		if admin {
			path = "/admin/branding"
		}
		for _, method := range []string{"GET", "PUT"} {
			api.MethodFunc(method, path, func(w http.ResponseWriter, r *http.Request) {
				actor := "local"
				if admin {
					permission := "settings:read"
					if method == "PUT" {
						permission = "settings:write"
					}
					session, ok := require(config.Install, w, r, permission)
					if !ok {
						return
					}
					actor = session.User.ID
				}
				_, service, _, profile := config.Install.Services()
				if !admin && profile != runtime.WebStandalone {
					failure(w, 404, "NOT_FOUND", "此运行形态不提供本地品牌接口")
					return
				}
				if service == nil || service.Branding == nil {
					failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
					return
				}
				if method == "GET" {
					data, err := service.Branding.Snapshot(r.Context(), false)
					if err != nil {
						webError(w, err)
						return
					}
					success(w, data)
					return
				}
				var input contracts.BrandingInput
				if !decode(w, r, &input) {
					return
				}
				data, err := service.Branding.Update(r.Context(), input, actor, false)
				if err != nil {
					webError(w, err)
					return
				}
				success(w, data)
			})
		}
	}
}
func serveBrandAsset(config Config, w http.ResponseWriter, r *http.Request) {
	if config.Install == nil {
		http.NotFound(w, r)
		return
	}
	_, service, _, _ := config.Install.Services()
	if service == nil || service.Branding == nil {
		http.NotFound(w, r)
		return
	}
	name := chi.URLParam(r, "name")
	data, err := service.Branding.Asset(r.Context(), name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", `"`+name+`"`)
	if r.Header.Get("If-None-Match") == `"`+name+`"` {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if r.Method != "HEAD" {
		_, _ = w.Write(data)
	}
}

func serveBrandManifest(config Config, w http.ResponseWriter, r *http.Request) {
	if config.Install == nil {
		serveSPA(config.Assets, w, r)
		return
	}
	_, service, _, _ := config.Install.Services()
	if service == nil {
		serveSPA(config.Assets, w, r)
		return
	}
	name, err := service.Value(r.Context(), "site.name")
	if err != nil {
		http.Error(w, "Manifest unavailable", 503)
		return
	}
	raw, err := fs.ReadFile(config.Assets, "site.webmanifest")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	var manifest map[string]any
	if json.Unmarshal(raw, &manifest) != nil {
		http.Error(w, "Manifest unavailable", 503)
		return
	}
	manifest["name"] = name
	manifest["short_name"] = name
	if service.Branding != nil {
		if brand, e := service.Branding.Snapshot(r.Context(), false); e == nil && brand.Favicon != "" {
			manifest["icons"] = []map[string]string{{"src": brand.Favicon, "type": "image/png", "purpose": "any"}}
		}
	}
	w.Header().Set("Content-Type", "application/manifest+json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(manifest)
}
