// Author: yunnuo <ymz@ebox.vip>
// Description: Platform event catalog, routing defaults and bounded plain-text templates.
package notifycontent

import (
	"errors"
	"github.com/yunnuo/unicore/internal/contracts"
	"regexp"
	"strings"
	"unicode/utf8"
)

var ErrInvalid = errors.New("invalid notification template")
var token = regexp.MustCompile(`\{\{([a-z][a-z0-9_]*)\}\}`)

func Known(event string) bool { _, ok := DefinitionFor(event); return ok }
func Defaults() contracts.NotifyConfiguration {
	c := contracts.NotifyConfiguration{Provider: "wecom", Rules: []contracts.NotifyRule{}, Templates: []contracts.NotifyTemplate{}}
	for _, d := range Definitions() {
		c.Rules = append(c.Rules, d.Rule)
		c.Templates = append(c.Templates, d.Template)
	}
	return c
}

// MergeDefaults backfills rules and templates for events introduced after a
// configuration was saved, preserving templates and applicable routing choices.
// User routes with no possible audience are normalized to off.
func MergeDefaults(c contracts.NotifyConfiguration) contracts.NotifyConfiguration {
	hasRule := func(event string) bool {
		for _, r := range c.Rules {
			if r.Event == event {
				return true
			}
		}
		return false
	}
	hasTemplate := func(event string) bool {
		for _, t := range c.Templates {
			if t.Event == event {
				return true
			}
		}
		return false
	}
	defaults := Defaults()
	for _, rule := range defaults.Rules {
		if !hasRule(rule.Event) {
			c.Rules = append(c.Rules, rule)
		}
	}
	for _, template := range defaults.Templates {
		if !hasTemplate(template.Event) {
			c.Templates = append(c.Templates, template)
		}
	}
	for i := range c.Rules {
		d, known := DefinitionFor(c.Rules[i].Event)
		if known && !d.UserEmailAllowed {
			c.Rules[i].UserEmail = false
		}
	}
	return c
}
func Validate(t contracts.NotifyTemplate) error {
	d, ok := DefinitionFor(t.Event)
	if !ok {
		return ErrInvalid
	}
	variables := variablesFor(d)
	// Older built-in templates accepted the shared alert variables even on
	// account events, where they render empty. Preserve those saved templates.
	if d.legacy && !strings.HasPrefix(d.ID, "alert_") {
		alert, _ := DefinitionFor("alert_triggered")
		variables = append(variables, alert.Variables...)
	}
	return validateTemplate(t, variables)
}
func validateTemplate(t contracts.NotifyTemplate, variables []Variable) error {
	if strings.TrimSpace(t.Title) == "" || strings.TrimSpace(t.Body) == "" || !utf8.ValidString(t.Title+t.Body) || utf8.RuneCountInString(t.Title) > 160 || utf8.RuneCountInString(t.Body) > 4000 || strings.ContainsAny(t.Title, "\r\n\x00") || strings.ContainsAny(t.Body, "\x00<>") || strings.ContainsAny(t.Title, "<>") {
		return ErrInvalid
	}
	rest := token.ReplaceAllStringFunc(t.Title+t.Body, func(s string) string {
		key := s[2 : len(s)-2]
		for _, v := range variables {
			if key == v.Key {
				return ""
			}
		}
		return s
	})
	if strings.Contains(rest, "{{") || strings.Contains(rest, "}}") {
		return ErrInvalid
	}
	return nil
}
func Render(t contracts.NotifyTemplate, vars map[string]string) (contracts.NotifyPreview, error) {
	if err := Validate(t); err != nil {
		return contracts.NotifyPreview{}, err
	}
	render := func(s string) string {
		return token.ReplaceAllStringFunc(s, func(x string) string { return vars[x[2:len(x)-2]] })
	}
	title := strings.NewReplacer("\r", " ", "\n", " ", "\x00", "").Replace(render(t.Title))
	body := render(t.Body)
	if utf8.RuneCountInString(title) > 512 || utf8.RuneCountInString(body) > 12000 {
		return contracts.NotifyPreview{}, ErrInvalid
	}
	return contracts.NotifyPreview{Title: title, Body: body}, nil
}
func ValidConfiguration(c contracts.NotifyConfiguration) bool {
	if c.Provider != "wecom" && c.Provider != "webhook" || len(c.Rules) != len(EventIDs()) || len(c.Templates) != len(EventIDs()) {
		return false
	}
	seen := map[string]bool{}
	for _, r := range c.Rules {
		_, known := DefinitionFor(r.Event)
		if !known || seen[r.Event] {
			return false
		}
		seen[r.Event] = true
	}
	seen = map[string]bool{}
	for _, t := range c.Templates {
		if Validate(t) != nil || seen[t.Event] {
			return false
		}
		seen[t.Event] = true
	}
	return true
}
