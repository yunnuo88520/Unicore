// Author: yunnuo <ymz@ebox.vip>
// Description: Validate the supported OpenAPI schema subset without coupling domain types to HTTP.
package apispec

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

func ValidateJSON(name string, raw []byte) map[string]string {
	fields := map[string]string{}
	schema, ok := document.Components.Schemas[name]
	if !ok {
		fields["$form"] = "未登记的输入结构"
		return fields
	}
	var value any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if decoder.Decode(&value) != nil || decoder.Decode(new(any)) != io.EOF {
		fields["$form"] = "JSON 格式不正确"
		return fields
	}
	validate(schema, value, "", fields, 0)
	return fields
}

func validate(schema Schema, value any, path string, fields map[string]string, depth int) {
	if len(fields) >= 20 {
		return
	}
	key := path
	if key == "" {
		key = "$form"
	}
	fail := func(message string) {
		if _, exists := fields[key]; !exists && len(fields) < 20 {
			fields[key] = message
		}
	}
	if depth > 32 {
		fail("输入层级过深")
		return
	}
	if schema.Ref != "" {
		target, ok := document.Components.Schemas[strings.TrimPrefix(schema.Ref, "#/components/schemas/")]
		if !ok {
			fail("未登记的输入结构")
			return
		}
		validate(target, value, path, fields, depth+1)
		return
	}
	if len(schema.Enum) > 0 {
		data, _ := json.Marshal(value)
		found := false
		for _, item := range schema.Enum {
			encoded, _ := json.Marshal(item)
			if bytes.Equal(data, encoded) {
				found = true
			}
		}
		if !found {
			fail("请选择有效选项")
			return
		}
	}
	switch schema.Type {
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			fail("应为对象")
			return
		}
		for _, name := range schema.Required {
			if _, exists := object[name]; !exists {
				if len(fields) < 20 {
					fields[join(path, name)] = "此项为必填"
				}
			}
		}
		for name, child := range object {
			if childSchema, exists := schema.Properties[name]; exists {
				validate(childSchema, child, join(path, name), fields, depth+1)
			} else if schema.Additional == false {
				if len(fields) < 20 {
					fields[join(path, name)] = "未定义的字段"
				}
			} else if additional, ok := schema.Additional.(map[string]any); ok {
				raw, _ := json.Marshal(additional)
				var childSchema Schema
				_ = json.Unmarshal(raw, &childSchema)
				validate(childSchema, child, join(path, name), fields, depth+1)
			}
		}
	case "string":
		text, ok := value.(string)
		if !ok {
			fail("应为文本")
			return
		}
		length := utf8.RuneCountInString(text)
		if schema.MinLength != nil && length < *schema.MinLength {
			fail(fmt.Sprintf("至少 %d 个字符", *schema.MinLength))
		}
		if schema.MaxLength != nil && length > *schema.MaxLength {
			fail(fmt.Sprintf("最多 %d 个字符", *schema.MaxLength))
		}
		if schema.MaxBytes != nil && len(text) > *schema.MaxBytes {
			fail(fmt.Sprintf("最多 %d 字节", *schema.MaxBytes))
		}
		if schema.Pattern != "" {
			matched, err := regexp.MatchString(schema.Pattern, text)
			if err != nil || !matched {
				fail("格式不正确")
			}
		}
		if schema.Format == "email" {
			matched, _ := regexp.MatchString(`^[^\s@]+@[^\s@]+\.[^\s@]+$`, text)
			if !matched {
				fail("请输入有效邮箱")
			}
		}
		if schema.Format == "uri" {
			matched, _ := regexp.MatchString(`^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$`, text)
			if !matched {
				fail("请输入有效地址")
			}
		}
		if schema.Format == "date-time" {
			if _, err := time.Parse(time.RFC3339, text); err != nil {
				fail("请输入有效时间")
			}
		}
	case "integer":
		number, ok := value.(json.Number)
		if !ok {
			fail("应为整数")
			return
		}
		numeric, err := number.Float64()
		if err != nil || math.Trunc(numeric) != numeric || math.Abs(numeric) > 9007199254740991 {
			fail("应为整数")
			return
		}
		if schema.Minimum != nil && numeric < *schema.Minimum {
			fail("数值低于最小值")
		}
		if schema.Maximum != nil && numeric > *schema.Maximum {
			fail("数值超过最大值")
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			fail("应为布尔值")
		}
	case "array":
		array, ok := value.([]any)
		if !ok {
			fail("应为列表")
			return
		}
		if schema.MinItems != nil && len(array) < *schema.MinItems {
			fail("列表项目不足")
		}
		if schema.MaxItems != nil && len(array) > *schema.MaxItems {
			fail("列表项目过多")
		}
		seen := []string{}
		for index, child := range array {
			if schema.Unique {
				raw, _ := json.Marshal(child)
				if slices.Contains(seen, string(raw)) {
					fail("列表项目不能重复")
				}
				seen = append(seen, string(raw))
			}
			if schema.Items != nil {
				validate(*schema.Items, child, fmt.Sprintf("%s[%d]", path, index), fields, depth+1)
			}
		}
	default:
		fail("不支持的输入类型")
	}
}

func join(parent, child string) string {
	if parent == "" {
		return child
	}
	return parent + "." + child
}
