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
	PublishAt                                        int
	CreatedBy, UpdatedBy                             string
}

func (a Announcement) Validate() error {
	if !utf8.ValidString(a.Content+a.Note) || strings.TrimSpace(a.Content) == "" || utf8.RuneCountInString(a.Content) > 500 || utf8.RuneCountInString(a.Note) > 100 || strings.ContainsAny(a.Content+a.Note, "\x00") || (a.Format != "markdown" && a.Format != "html") || (a.Status != "draft" && a.Status != "published") || a.PublishAt < 1 || a.PublishAt > 4102444800 {
		return ErrAnnouncementInvalid
	}
	switch a.Type {
	case "info", "success", "warning", "error":
		return nil
	}
	return ErrAnnouncementInvalid
}
func (a Announcement) Visible(enabled bool, now int) bool {
	return enabled && a.DeletedAt == 0 && a.Status == "published" && a.PublishAt <= now
}
