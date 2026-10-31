// Author: yunnuo <ymz@ebox.vip>
// Description: Administrator mutations and published user projections through explicit repository and content ports.
package usecase

import (
	"context"
	"github.com/yunnuo/unicore/internal/contracts"
	"github.com/yunnuo/unicore/internal/domain"
	"strings"
	"time"
	"unicode/utf8"
)

type AnnouncementRepository interface {
	List(context.Context, contracts.AnnouncementQuery) ([]domain.Announcement, int, bool, error)
	Feed(context.Context, int, int, int) ([]domain.Announcement, int, bool, error)
	GetPublished(context.Context, string, int) (domain.Announcement, error)
	Save(context.Context, domain.Announcement, string, bool) (domain.Announcement, error)
	Delete(context.Context, []contracts.AnnouncementSelection, string) error
	Enabled(context.Context) (bool, error)
	SetEnabled(context.Context, bool, string) error
}
type Announcements struct {
	Repo   AnnouncementRepository
	Render func(string, string) (string, error)
	Now    func() time.Time
}

func (s *Announcements) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}
func (s *Announcements) Prepare(in contracts.AnnouncementInput) (domain.Announcement, error) {
	a := domain.Announcement{Content: strings.TrimSpace(in.Content), Format: in.Format, Type: in.Type, Note: strings.TrimSpace(in.Note), Status: in.Status, PublishAt: in.PublishAt}
	if err := a.Validate(); err != nil {
		return a, err
	}
	if s.Render == nil {
		return a, domain.ErrAnnouncementInvalid
	}
	var err error
	a.ContentHTML, err = s.Render(a.Content, a.Format)
	if err != nil || len(a.ContentHTML) > 20000 {
		return a, domain.ErrAnnouncementInvalid
	}
	return a, nil
}
func (s *Announcements) Create(ctx context.Context, in contracts.AnnouncementInput, actor string) (domain.Announcement, error) {
	a, err := s.Prepare(in)
	if err != nil {
		return a, err
	}
	a.BaseEntity = domain.NewEntity(s.now())
	a.CreatedBy = actor
	a.UpdatedBy = actor
	return s.Repo.Save(ctx, a, actor, true)
}
func (s *Announcements) Update(ctx context.Context, id string, in contracts.AnnouncementUpdate, actor string) (domain.Announcement, error) {
	a, err := s.Prepare(contracts.AnnouncementInput{Content: in.Content, Format: in.Format, Type: in.Type, Note: in.Note, Status: in.Status, PublishAt: in.PublishAt})
	if err != nil {
		return a, err
	}
	if id == "" || len(id) > 64 || in.Version < 1 {
		return a, domain.ErrAnnouncementInvalid
	}
	a.ID = id
	a.Version = in.Version
	a.UpdatedAt = int(s.now().Unix())
	a.UpdatedBy = actor
	return s.Repo.Save(ctx, a, actor, false)
}
func (s *Announcements) List(ctx context.Context, q contracts.AnnouncementQuery) (contracts.AnnouncementList, error) {
	out := contracts.AnnouncementList{Items: []contracts.AnnouncementEntry{}, Page: q.Page, PageSize: q.PageSize}
	if !domain.ValidPage(q.Page, q.PageSize) || utf8.RuneCountInString(q.Search) > 128 || (q.Status != "" && q.Status != "draft" && q.Status != "published" && q.Status != "scheduled") {
		return out, domain.ErrAnnouncementInvalid
	}
	rows, total, enabled, err := s.Repo.List(ctx, q)
	out.Total = total
	out.Enabled = enabled
	for _, a := range rows {
		out.Items = append(out.Items, AnnouncementDTO(a))
	}
	return out, err
}
func (s *Announcements) Feed(ctx context.Context, page, size int) (contracts.AnnouncementFeed, error) {
	out := contracts.AnnouncementFeed{Items: []contracts.AnnouncementPublic{}, Page: page, PageSize: size}
	if !domain.ValidPage(page, size) {
		return out, domain.ErrAnnouncementInvalid
	}
	rows, total, enabled, err := s.Repo.Feed(ctx, page, size, int(s.now().Unix()))
	out.Total = total
	out.Enabled = enabled
	for _, a := range rows {
		out.Items = append(out.Items, publicAnnouncement(a))
	}
	return out, err
}
func (s *Announcements) Published(ctx context.Context, id string) (contracts.AnnouncementPublic, error) {
	if id == "" || len(id) > 64 {
		return contracts.AnnouncementPublic{}, ErrEntityNotFound
	}
	a, err := s.Repo.GetPublished(ctx, id, int(s.now().Unix()))
	return publicAnnouncement(a), err
}
func (s *Announcements) Delete(ctx context.Context, in contracts.AnnouncementDelete, actor string) error {
	if len(in.Items) < 1 || len(in.Items) > 50 {
		return domain.ErrAnnouncementInvalid
	}
	seen := map[string]bool{}
	for _, a := range in.Items {
		if a.ID == "" || len(a.ID) > 64 || a.Version < 1 || seen[a.ID] {
			return domain.ErrAnnouncementInvalid
		}
		seen[a.ID] = true
	}
	return s.Repo.Delete(ctx, in.Items, actor)
}
func AnnouncementDTO(a domain.Announcement) contracts.AnnouncementEntry {
	return contracts.AnnouncementEntry{ID: a.ID, CreatedAt: a.CreatedAt, UpdatedAt: a.UpdatedAt, Version: a.Version, Content: a.Content, ContentHtml: a.ContentHTML, Format: a.Format, Type: a.Type, Note: a.Note, Status: a.Status, PublishAt: a.PublishAt, CreatedBy: a.CreatedBy, UpdatedBy: a.UpdatedBy}
}
func publicAnnouncement(a domain.Announcement) contracts.AnnouncementPublic {
	return contracts.AnnouncementPublic{ID: a.ID, Content: a.Content, ContentHtml: a.ContentHTML, Format: a.Format, Type: a.Type, PublishAt: a.PublishAt}
}

func (s *Announcements) Enabled(ctx context.Context) (contracts.AnnouncementSetting, error) {
	enabled, err := s.Repo.Enabled(ctx)
	return contracts.AnnouncementSetting{Enabled: enabled}, err
}
func (s *Announcements) SetEnabled(ctx context.Context, in contracts.AnnouncementSetting, actor string) error {
	return s.Repo.SetEnabled(ctx, in.Enabled, actor)
}
