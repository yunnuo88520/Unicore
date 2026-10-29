// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator-only audit browsing and bounded CSV export with spreadsheet formula protection.
package httpadapter

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"github.com/yunnuo/unicore/internal/contracts"
	apispec "github.com/yunnuo/unicore/packages/contracts"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func logQuery(r *http.Request) (contracts.AuditLogQuery, bool) {
	q := contracts.AuditLogQuery{Action: r.URL.Query().Get("action"), Search: r.URL.Query().Get("search"), Page: 1, PageSize: 20, Sort: "created_at", Direction: "desc"}
	for key, target := range map[string]*int{"page": &q.Page, "page_size": &q.PageSize, "start": &q.Start, "end": &q.End} {
		if v := r.URL.Query().Get(key); v != "" {
			parsed, e := strconv.Atoi(v)
			if e != nil {
				return q, false
			}
			*target = parsed
		}
	}
	if v := r.URL.Query().Get("sort"); v != "" {
		q.Sort = v
	}
	if v := r.URL.Query().Get("direction"); v != "" {
		q.Direction = v
	}
	raw, _ := json.Marshal(q)
	return q, len(apispec.ValidateJSON("AuditLogQuery", raw)) == 0 && (q.End == 0 || q.Start < q.End)
}
func csvSafe(s string) string {
	trimmed := strings.TrimLeft(s, " \t\r\n")
	if (len(trimmed) > 0 && strings.ContainsRune("=+-@", rune(trimmed[0]))) || strings.HasPrefix(s, "\t") || strings.HasPrefix(s, "\r") {
		return "'" + s
	}
	return s
}
func mountLogs(api chi.Router, config Config) {
	for _, export := range []bool{false, true} {
		path := "/admin/logs"
		if export {
			path += "/export"
		}
		api.Get(path, func(w http.ResponseWriter, r *http.Request) {
			if _, ok := require(config.Install, w, r, "logs:read"); !ok {
				return
			}
			q, ok := logQuery(r)
			if !ok {
				failure(w, 400, "INVALID_INPUT", contracts.ErrorCatalog["INVALID_INPUT"].Message)
				return
			}
			if export {
				q.Page = 1
				q.PageSize = 10000
			}
			data, e := config.Install.Identity(true).Store.SystemLogs(r.Context(), q)
			if e != nil {
				webError(w, e)
				return
			}
			if !export {
				success(w, data)
				return
			}
			var body bytes.Buffer
			body.WriteString("\xef\xbb\xbf")
			writer := csv.NewWriter(&body)
			_ = writer.Write([]string{"ID", "Action", "Actor", "Realm", "Target", "Detail", "IP address", "Time (UTC)"})
			for _, v := range data.Items {
				row := []string{v.ID, v.Action, v.ActorName, v.Realm, v.Target, v.Detail, v.IpAddress, time.Unix(int64(v.CreatedAt), 0).UTC().Format(time.RFC3339)}
				for i := range row {
					row[i] = csvSafe(row[i])
				}
				_ = writer.Write(row)
			}
			writer.Flush()
			success(w, contracts.AuditLogExport{Filename: "operation-logs-" + time.Now().UTC().Format("20060102-150405") + ".csv", Content: body.String(), Total: data.Total, Exported: len(data.Items), Truncated: data.Total > len(data.Items)})
		})
	}
}
