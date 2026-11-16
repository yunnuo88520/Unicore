// Author: yunnuo <ymz@ebox.vip>
// Description: Startup-only business settings registration with bilingual presentation metadata.
package settings

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/yunnuo/unicore/internal/contracts"
)

// FieldDefinition describes an instance-wide Platform setting. Validate adds
// business constraints to the built-in string/boolean/integer type check.
type FieldDefinition struct {
	Key, Type, Label, LabelEN, Default string
	Description, DescriptionEN         string
	Sensitive, Multiline               bool
	Options                            []contracts.SettingOption
	Validate                           func(string) bool
}

type GroupDefinition struct {
	ID, Label, LabelEN, Description, DescriptionEN string
	Order                                          int
	Fields                                         []FieldDefinition
}

var businessGroups []contracts.SettingGroup
var businessFields = map[string]FieldDefinition{}
var groupID = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,39}$`)
var settingKey = regexp.MustCompile(`^[a-z][a-z0-9_.-]{0,119}$`)

// Register is called once during composition, before installation or requests.
// The complete batch is validated before any definitions become visible.
// Built-in groups/keys cannot be overwritten. All registered fields retain
// the existing global settings permissions, encryption and audit behavior.
func Register(groups ...GroupDefinition) error {
	// These section IDs exist even when they have no directly editable fields.
	seenGroups, seenKeys := map[string]bool{"branding": true, "logs": true}, map[string]bool{}
	for _, d := range Definitions {
		seenGroups[d.Group], seenKeys[d.Key] = true, true
	}
	for _, group := range groups {
		if !groupID.MatchString(group.ID) || seenGroups[group.ID] || strings.TrimSpace(group.Label) == "" || strings.TrimSpace(group.LabelEN) == "" || len(group.Fields) == 0 || (group.Description == "") != (group.DescriptionEN == "") {
			return fmt.Errorf("invalid or duplicate setting group %q", group.ID)
		}
		seenGroups[group.ID] = true
		for _, field := range group.Fields {
			if !settingKey.MatchString(field.Key) || !strings.HasPrefix(field.Key, group.ID+".") || seenKeys[field.Key] || strings.TrimSpace(field.Label) == "" || strings.TrimSpace(field.LabelEN) == "" || (field.Description == "") != (field.DescriptionEN == "") || (field.Sensitive && (field.Default != "" || field.Type != "string" || len(field.Options) > 0)) || (field.Multiline && (field.Type != "string" || field.Sensitive || len(field.Options) > 0)) || !validField(field, field.Default) {
				return fmt.Errorf("invalid or duplicate setting %q", field.Key)
			}
			options := map[string]bool{}
			for _, option := range field.Options {
				if strings.TrimSpace(option.Label) == "" || strings.TrimSpace(option.LabelEn) == "" || options[option.Value] || !validField(field, option.Value) {
					return fmt.Errorf("invalid options for %q", field.Key)
				}
				options[option.Value] = true
			}
			seenKeys[field.Key] = true
		}
	}
	for _, group := range groups {
		businessGroups = append(businessGroups, contracts.SettingGroup{ID: group.ID, Label: group.Label, LabelEn: group.LabelEN, Description: group.Description, DescriptionEn: group.DescriptionEN, Order: group.Order})
		for _, field := range group.Fields {
			field.Options = append([]contracts.SettingOption(nil), field.Options...)
			businessFields[field.Key] = field
			definition := field
			Definitions = append(Definitions, SettingDefinition{Key: field.Key, Type: field.Type, Group: group.ID, Label: field.Label, Default: field.Default, PlatformOnly: true, Sensitive: field.Sensitive, Validate: func(value string) bool { return validField(definition, value) }})
		}
	}
	return nil
}

func validFieldType(kind, value string) bool {
	switch kind {
	case "string":
		return text(16000)(value)
	case "boolean":
		return value == "true" || value == "false"
	case "integer":
		_, err := strconv.Atoi(value)
		return err == nil
	default:
		return false
	}
}
func validField(field FieldDefinition, value string) bool {
	if !validFieldType(field.Type, value) || field.Validate != nil && !field.Validate(value) {
		return false
	}
	if len(field.Options) == 0 {
		return true
	}
	for _, option := range field.Options {
		if option.Value == value {
			return true
		}
	}
	return false
}

func registeredGroups() *[]contracts.SettingGroup {
	groups := append([]contracts.SettingGroup{}, businessGroups...)
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].Order == groups[j].Order {
			return groups[i].ID < groups[j].ID
		}
		return groups[i].Order < groups[j].Order
	})
	return &groups
}

func presentField(entry *contracts.SettingEntry) {
	field, ok := businessFields[entry.Key]
	if !ok {
		return
	}
	entry.LabelEn = &field.LabelEN
	entry.Description, entry.DescriptionEn = &field.Description, &field.DescriptionEN
	entry.Multiline = &field.Multiline
	options := append([]contracts.SettingOption{}, field.Options...)
	entry.Options = &options
}
