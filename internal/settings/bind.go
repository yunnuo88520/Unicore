// Author: yunnuo <ymz@ebox.vip>
// Description: Reflection binding from the settings KV map to typed structs, so callers stop hand-parsing strings.
package settings

import (
	"fmt"
	"reflect"
	"strconv"
)

// Bind decodes a raw settings map into the struct pointed to by target.
// Every exported field must carry a `setting:"key"` tag; string, bool and
// int fields are parsed from the map, and a parse failure is reported as an
// error naming the key instead of silently zeroing the field. Keys missing
// from the map fall back to the field's `default:"..."` tag when present,
// otherwise the field keeps its zero value. Ranges stay the registry's
// write-side responsibility; Bind only parses types.
func Bind(values map[string]string, target any) error {
	value := reflect.ValueOf(target)
	if value.Kind() != reflect.Pointer || value.IsNil() || value.Elem().Kind() != reflect.Struct {
		return fmt.Errorf("settings bind: target must be a non-nil struct pointer")
	}
	structure := value.Elem()
	for i := 0; i < structure.NumField(); i++ {
		field := structure.Type().Field(i)
		if !field.IsExported() {
			continue
		}
		key, ok := field.Tag.Lookup("setting")
		if !ok {
			return fmt.Errorf("settings bind: field %s has no setting tag", field.Name)
		}
		raw, present := values[key]
		if !present {
			if fallback, tagged := field.Tag.Lookup("default"); tagged {
				raw, present = fallback, true
			}
		}
		if !present {
			continue
		}
		if err := assign(structure.Field(i), key, raw); err != nil {
			return err
		}
	}
	return nil
}

func assign(field reflect.Value, key, raw string) error {
	switch field.Kind() {
	case reflect.String:
		field.SetString(raw)
	case reflect.Bool:
		parsed, err := strconv.ParseBool(raw)
		if err != nil {
			return fmt.Errorf("settings bind: %s: %w", key, err)
		}
		field.SetBool(parsed)
	case reflect.Int:
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return fmt.Errorf("settings bind: %s: %w", key, err)
		}
		field.SetInt(int64(parsed))
	default:
		return fmt.Errorf("settings bind: %s: unsupported field kind %s", key, field.Kind())
	}
	return nil
}
