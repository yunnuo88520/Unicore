// Author: yunnuo <ymz@ebox.vip>
// Description: Runtime monitor surface: super-admin platform snapshot and events, the standalone local read-only views and the storage probe.
package httpadapter

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/monitor"
	"github.com/yunnuo/unicore/internal/runtime"
)

func mountMonitor(api chi.Router, config Config) {
	manager := config.Install
	guardAdmin := func(w http.ResponseWriter, r *http.Request) bool {
		if _, _, _, profile := manager.Services(); profile != runtime.WebPlatform {
			failure(w, 404, "NOT_FOUND", "此运行形态不提供该能力")
			return false
		}
		if _, ok := require(manager, w, r, "monitor:read"); !ok {
			return false
		}
		if config.Monitor == nil {
			failure(w, 503, "NOT_READY", "监控尚未就绪")
			return false
		}
		return true
	}
	guardLocal := func(w http.ResponseWriter, r *http.Request) bool {
		if _, _, _, profile := manager.Services(); profile != runtime.WebStandalone {
			failure(w, 404, "NOT_FOUND", "请使用受保护的平台监控接口")
			return false
		}
		if !manager.Installed() {
			failure(w, 409, "INSTALL_REQUIRED", "请先完成安装")
			return false
		}
		if config.Monitor == nil {
			failure(w, 503, "NOT_READY", "监控尚未就绪")
			return false
		}
		return true
	}
	api.Get("/admin/monitor", func(w http.ResponseWriter, r *http.Request) {
		if !guardAdmin(w, r) {
			return
		}
		success(w, config.Monitor.Snapshot(r.Context()))
	})
	api.Get("/admin/monitor/events", func(w http.ResponseWriter, r *http.Request) {
		if !guardAdmin(w, r) {
			return
		}
		success(w, config.Monitor.Events(100))
	})
	api.Get("/admin/monitor/alert-rules", func(w http.ResponseWriter, r *http.Request) {
		if !guardAdmin(w, r) {
			return
		}
		engine := config.Monitor.AlertEngine()
		if engine == nil {
			failure(w, 503, "NOT_READY", "告警引擎尚未就绪")
			return
		}
		success(w, engine.RulesContract())
	})
	api.Put("/admin/monitor/alert-rules", func(w http.ResponseWriter, r *http.Request) {
		if !guardAdmin(w, r) {
			return
		}
		engine := config.Monitor.AlertEngine()
		if engine == nil {
			failure(w, 503, "NOT_READY", "告警引擎尚未就绪")
			return
		}
		var submitted contracts.MonitorAlertRules
		if err := json.NewDecoder(r.Body).Decode(&submitted); err != nil {
			failure(w, 400, "VALIDATION_FAILED", "请求体不是合法的规则集")
			return
		}
		normalized, err := engine.ApplyContract(submitted)
		if err != nil {
			failure(w, 400, "VALIDATION_FAILED", err.Error())
			return
		}
		if config.AlertRulesStore != nil {
			if err := config.AlertRulesStore.SaveRulesJSON(r.Context(), monitor.EncodeRules(monitor.RulesFromContract(normalized))); err != nil {
				failure(w, 503, "NOT_READY", "规则持久化失败")
				return
			}
		}
		success(w, normalized)
	})
	api.Get("/admin/monitor/storage-probe", func(w http.ResponseWriter, r *http.Request) {
		if !guardAdmin(w, r) {
			return
		}
		location := r.URL.Query().Get("location")
		if location == "" {
			failure(w, 400, "VALIDATION_FAILED", "缺少位置标识")
			return
		}
		success(w, config.Monitor.ProbeStorage(r.Context(), location))
	})
	api.Get("/monitor", func(w http.ResponseWriter, r *http.Request) {
		if !guardLocal(w, r) {
			return
		}
		success(w, config.Monitor.Snapshot(r.Context()))
	})
	api.Get("/monitor/events", func(w http.ResponseWriter, r *http.Request) {
		if !guardLocal(w, r) {
			return
		}
		success(w, config.Monitor.Events(100))
	})
}
