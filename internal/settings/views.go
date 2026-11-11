// Author: yunnuo <ymz@ebox.vip>
// Description: Typed views over the settings registry for consumers that read structured values.
package settings

// SessionPolicy is the typed view of the security settings consumed by
// session issuance and login flows across profiles.
type SessionPolicy struct {
	LoginCaptcha      bool `setting:"security.login_captcha" default:"true"`
	HumanCheckEnabled bool `setting:"security.human_check_enabled" default:"false"`
	SessionHours      int  `setting:"security.session_hours" default:"24"`
}
