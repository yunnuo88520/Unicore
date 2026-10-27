// Author: yunnuo <ymz@ebox.vip>
// Description: Platform identity port and permission policy; never imported by Desktop/CLI.
package platform

import (
	"context"
	"net/mail"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
)

type Account struct {
	User         contracts.User
	PasswordHash string
}
type Store interface {
	FindAccount(context.Context, string) (Account, error)
	CreateUser(context.Context, contracts.UserCreate, string, string) (contracts.User, error)
	UpdateUser(context.Context, string, contracts.UserUpdate, string) (contracts.User, error)
	ListUsers(context.Context, string, int, int) (contracts.UserList, error)
	CreateSession(context.Context, string, string, int, string) error
	Session(context.Context, string) (contracts.User, int, error)
	DeleteSession(context.Context, string) error
	SystemLogs(context.Context) (contracts.AuditLogList, error)
	Dashboard(context.Context) (contracts.Dashboard, error)
	ListRoles(context.Context) (contracts.RoleList, error)
	RoleOptions(context.Context, string) (contracts.RoleOptions, error)
	ChangePassword(context.Context, string, string, string) error
}

func (s *Service) ChangePassword(ctx context.Context, user contracts.User, input contracts.ChangePasswordInput, ip string) error {
	if !s.Limiter.Allow("password:"+user.ID+":"+ip, 6, time.Minute) {
		return ErrRateLimited
	}
	select {
	case s.loginSlots <- struct{}{}:
		defer func() { <-s.loginSlots }()
	case <-ctx.Done():
		return ctx.Err()
	}
	account, err := s.Store.FindAccount(ctx, user.Username)
	if err != nil || account.User.ID != user.ID || !VerifyPassword(account.PasswordHash, input.CurrentPassword) {
		return ErrCredentials
	}
	hash, err := HashPassword(input.Password)
	if err != nil {
		return err
	}
	return s.Store.ChangePassword(ctx, user.ID, account.PasswordHash, hash)
}

type Service struct {
	Store      Store
	Limiter    *Limiter
	Captchas   *Captchas
	dummy      string
	loginSlots chan struct{}
	once       sync.Once
}

func New(store Store) *Service {
	return &Service{Store: store, Limiter: NewLimiter(), Captchas: NewCaptchas(), loginSlots: make(chan struct{}, 4)}
}
func ValidateAccount(username, email, password string) bool {
	address, err := mail.ParseAddress(email)
	return regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$`).MatchString(username) && err == nil && address.Address == email && len(email) <= 254 && len(password) >= 12 && len(password) <= 128
}
func Has(user contracts.User, permission string) bool {
	if !IsSuper(user) || !SuperOnly(permission) {
		return false
	}
	for _, p := range user.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}

func (s *Service) Login(ctx context.Context, input contracts.LoginInput, ip string, captcha bool, hours int) (contracts.Session, string, error) {
	if len(input.Username) > 254 || len(input.Password) > 128 {
		return contracts.Session{}, "", ErrCredentials
	}
	key := strings.ToLower(strings.TrimSpace(input.Username))
	if !s.Limiter.Allow("ip:"+ip, 40, time.Minute) || !s.Limiter.Allow("account:"+key, 8, 15*time.Minute) {
		return contracts.Session{}, "", ErrRateLimited
	}
	if captcha && !s.Captchas.Consume(input.CaptchaID, input.CaptchaAnswer) {
		return contracts.Session{}, "", ErrCaptcha
	}
	select {
	case s.loginSlots <- struct{}{}:
		defer func() { <-s.loginSlots }()
	case <-ctx.Done():
		return contracts.Session{}, "", ctx.Err()
	}
	s.once.Do(func() { s.dummy, _ = HashPassword(Token()) })
	account, err := s.Store.FindAccount(ctx, key)
	hash := account.PasswordHash
	if err != nil {
		hash = s.dummy
	}
	valid := VerifyPassword(hash, input.Password)
	if err != nil || !valid || account.User.Status != "active" {
		return contracts.Session{}, "", ErrCredentials
	}
	return s.issue(ctx, account.User, hours, account.PasswordHash)
}
func (s *Service) Issue(ctx context.Context, user contracts.User, hours int) (contracts.Session, string, error) {
	return s.issue(ctx, user, hours, "")
}
func (s *Service) issue(ctx context.Context, user contracts.User, hours int, credentialHash string) (contracts.Session, string, error) {
	token := Token()
	expires := int(time.Now().Add(time.Duration(hours) * time.Hour).Unix())
	if err := s.Store.CreateSession(ctx, Hash(token), user.ID, expires, credentialHash); err != nil {
		return contracts.Session{}, "", err
	}
	return contracts.Session{User: user, CsrfToken: CSRF(token), ExpiresAt: expires}, token, nil
}
func (s *Service) Session(ctx context.Context, token string) (contracts.Session, error) {
	if len(token) != 43 {
		return contracts.Session{}, ErrCredentials
	}
	user, expires, err := s.Store.Session(ctx, Hash(token))
	if err != nil || user.Status != "active" || expires <= int(time.Now().Unix()) {
		return contracts.Session{}, ErrCredentials
	}
	return contracts.Session{User: user, ExpiresAt: expires, CsrfToken: CSRF(token)}, nil
}
func (s *Service) Create(ctx context.Context, input contracts.UserCreate, actor string) (contracts.User, error) {
	input.Username = strings.ToLower(strings.TrimSpace(input.Username))
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	if !ValidateAccount(input.Username, input.Email, input.Password) || !BuiltinRole(input.Role) {
		return contracts.User{}, ErrInput
	}
	hash, err := HashPassword(input.Password)
	if err != nil {
		return contracts.User{}, err
	}
	input.Password = ""
	return s.Store.CreateUser(ctx, input, hash, actor)
}
