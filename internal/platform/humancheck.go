// Author: yunnuo <ymz@ebox.vip>
// Description: Click-through human verification port: provider settings resolve to one verification call.
package platform

import (
	"context"
	"errors"
	"strings"
)

var ErrHumanCheck = errors.New("human verification failed")
var ErrHumanCheckConfig = errors.New("human verification is not configured")

// HumanCheckConfig carries the resolved provider settings for one verification attempt.
type HumanCheckConfig struct {
	Provider              string
	TurnstileSecretKey    string
	TencentAppID          string
	TencentAppSecretKey   string
	TencentSecretID       string
	TencentSecretKey      string
	TencentRegion         string
	AliyunAccessKeyID     string
	AliyunAccessKeySecret string
	AliyunSceneID         string
	AliyunRegion          string
}

// Ready reports whether the selected provider has every required credential.
func (c HumanCheckConfig) Ready() bool {
	switch c.Provider {
	case "turnstile":
		return c.TurnstileSecretKey != ""
	case "tencent":
		return c.TencentAppID != "" && c.TencentAppSecretKey != "" && c.TencentSecretID != "" && c.TencentSecretKey != ""
	case "alibaba":
		return c.AliyunAccessKeyID != "" && c.AliyunAccessKeySecret != "" && c.AliyunSceneID != ""
	default:
		return false
	}
}

// HumanCheckPort verifies click-through human verification tokens with the configured provider.
type HumanCheckPort interface {
	Verify(ctx context.Context, config HumanCheckConfig, token, randstr, ip string) error
}

// HumanCheckConfigFromSettings resolves the protection-group settings into one provider configuration.
func HumanCheckConfigFromSettings(values map[string]string) HumanCheckConfig {
	trim := values["security.human_check_provider"]
	return HumanCheckConfig{
		Provider:              trim,
		TurnstileSecretKey:    values["security.turnstile_secret_key"],
		TencentAppID:          values["security.tencent_captcha_app_id"],
		TencentAppSecretKey:   values["security.tencent_captcha_app_secret_key"],
		TencentSecretID:       values["security.tencent_captcha_secret_id"],
		TencentSecretKey:      values["security.tencent_captcha_secret_key"],
		TencentRegion:         values["security.tencent_captcha_region"],
		AliyunAccessKeyID:     values["security.aliyun_captcha_access_key_id"],
		AliyunAccessKeySecret: values["security.aliyun_captcha_access_key_secret"],
		AliyunSceneID:         values["security.aliyun_captcha_scene_id"],
		AliyunRegion:          values["security.aliyun_captcha_region"],
	}
}

// verifyHumanCheck enforces one click-through verification; it fails closed when
// enabled but unconfigured and never runs for realms without an injected port.
func (s *Service) verifyHumanCheck(ctx context.Context, token, randstr, ip string) error {
	if s.HumanCheck == nil {
		return ErrHumanCheck
	}
	values, err := s.Settings.Raw(ctx)
	if err != nil {
		return err
	}
	config := HumanCheckConfigFromSettings(values)
	if !config.Ready() {
		return ErrHumanCheckConfig
	}
	if strings.TrimSpace(token) == "" {
		return ErrHumanCheck
	}
	return s.HumanCheck.Verify(ctx, config, token, randstr, ip)
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
