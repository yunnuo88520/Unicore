// Author: yunnuo <ymz@ebox.vip>
// Description: Announcement aggregate and publication rules independent of HTTP, identity or SQL.
package domain

import (
	"errors"
	"strings"
	"unicode/utf8"
)

var ErrAnnouncementInvalid = errors.New("invalid announcement")

type Announcement struct {
	BaseEntity
	Content, ContentHTML, Format, Type, Note, Status string
	Title, NotifyMode, Audience                      string
	RecipientIDs                                     []string
	EndsAt, ReadAt                                   int
	PublishAt                                        int
	CreatedBy, UpdatedBy                             string
}

func (a Announcement) Validate() error {
	if !utf8.ValidString(a.Content+a.Note) || strings.TrimSpace(a.Content) == "" || utf8.RuneCountInString(a.Content) > 10000 || utf8.RuneCountInString(a.Note) > 100 || strings.ContainsAny(a.Content+a.Note, "\x00") || (a.Format != "markdown" && a.Format != "html") || (a.Status != "draft" && a.Status != "published" && a.Status != "archived") || a.PublishAt < 1 || a.PublishAt > 4102444800 {
		return ErrAnnouncementInvalid
	}
	if strings.TrimSpace(a.Title) == "" || !utf8.ValidString(a.Title) || utf8.RuneCountInString(a.Title) > 200 || strings.ContainsAny(a.Title, "\x00") || (a.NotifyMode != "silent" && a.NotifyMode != "popup") || (a.EndsAt != 0 && (a.EndsAt <= a.PublishAt || a.EndsAt > 4102444800)) || (a.Audience != "all" && a.Audience != "selected") || len(a.RecipientIDs) > 500 || (a.Audience == "selected" && len(a.RecipientIDs) == 0) || (a.Audience == "all" && len(a.RecipientIDs) > 0) {
		return ErrAnnouncementInvalid
	}
	seen := map[string]bool{}
	for _, id := range a.RecipientIDs {
		if id == "" || len(id) > 64 || seen[id] {
			return ErrAnnouncementInvalid
		}
		seen[id] = true
	}
	switch a.Type {
	case "info", "success", "warning", "error":
		return nil
	}
	return ErrAnnouncementInvalid
}
func (a Announcement) Visible(enabled bool, now int) bool {
	return enabled && a.DeletedAt == 0 && a.Status == "published" && a.PublishAt <= now && (a.EndsAt == 0 || now < a.EndsAt)
}
