// Author: yunnuo <ymz@ebox.vip>
// Description: Embed the authoritative contract and generated offline reference in Web binaries.
package apispec

import (
	"embed"
	"encoding/json"
)

//go:embed openapi.json reference.gen.html
var Assets embed.FS

type Policy struct {
	StreamingUpload bool     `json:"streamingUpload"`
	SignedDownload  bool     `json:"signedDownload"`
	MaxBodyBytes    int      `json:"maxBodyBytes"`
	Profiles        []string `json:"profiles"`
	Access          string   `json:"access"`
	Permissions     []string `json:"permissions"`
	PermissionMode  string   `json:"permissionMode"`
	SuperAdmin      bool     `json:"superAdmin"`
	CSRF            bool     `json:"csrf"`
}

type Operation struct {
	ID          string `json:"operationId"`
	Policy      Policy `json:"x-unicore"`
	RequestBody struct {
		Content map[string]struct{ Schema Schema } `json:"content"`
	} `json:"requestBody"`
}

type Schema struct {
	Ref        string            `json:"$ref"`
	Type       string            `json:"type"`
	Required   []string          `json:"required"`
	Properties map[string]Schema `json:"properties"`
	Additional any               `json:"additionalProperties"`
	Items      *Schema           `json:"items"`
	Enum       []any             `json:"enum"`
	MinLength  *int              `json:"minLength"`
	MaxLength  *int              `json:"maxLength"`
	MinItems   *int              `json:"minItems"`
	MaxItems   *int              `json:"maxItems"`
	Minimum    *float64          `json:"minimum"`
	Maximum    *float64          `json:"maximum"`
	Pattern    string            `json:"pattern"`
	Format     string            `json:"format"`
	MaxBytes   *int              `json:"x-max-utf8-bytes"`
	Unique     bool              `json:"uniqueItems"`
}

type Document struct {
	Paths      map[string]map[string]json.RawMessage `json:"paths"`
	Components struct {
		Schemas map[string]Schema `json:"schemas"`
	} `json:"components"`
}

var document = func() Document {
	data, err := Assets.ReadFile("openapi.json")
	if err != nil {
		panic(err)
	}
	var doc Document
	if err := json.Unmarshal(data, &doc); err != nil {
		panic(err)
	}
	return doc
}()

func Lookup(method, path string) (Operation, bool) {
	raw, ok := document.Paths[path][method]
	if !ok {
		return Operation{}, false
	}
	var operation Operation
	if json.Unmarshal(raw, &operation) != nil || operation.ID == "" {
		return Operation{}, false
	}
	return operation, true
}

func Operations() map[string]Operation {
	result := map[string]Operation{}
	for path, methods := range document.Paths {
		for method := range methods {
			if operation, ok := Lookup(method, path); ok {
				result[method+" "+path] = operation
			}
		}
	}
	return result
}
