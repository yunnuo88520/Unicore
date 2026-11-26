// Author: yunnuo <ymz@ebox.vip>
// Description: Fail-closed upload policies and server-approved relative path selection.
package files

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/yunnuo/unicore/internal/contracts"
)

func policyLines(value string) []string {
	result := []string{}
	for _, line := range strings.Split(value, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			result = append(result, line)
		}
	}
	return result
}
func (s *Service) uploadRules(ctx context.Context) ([]string, []string, error) {
	paths, err := s.Settings.Value(ctx, "storage.upload_paths")
	if err != nil {
		return nil, nil, ErrUnavailable
	}
	extensions, err := s.Settings.Value(ctx, "storage.allowed_extensions")
	if err != nil {
		return nil, nil, ErrUnavailable
	}
	return policyLines(paths), policyLines(extensions), nil
}

// dirSegmentPattern keeps folder names to letters, digits, hyphen and
// underscore; control characters, separators and traversal tricks fail closed.
var dirSegmentPattern = regexp.MustCompile(`^[\p{L}\p{N}][\p{L}\p{N}_-]*$`)

// cleanRelativeDir validates a business-supplied relative folder before it is
// joined into an object key. Empty selects the managed default folder.
func cleanRelativeDir(selected string) (string, error) {
	if selected == "" {
		return "", nil
	}
	if strings.Contains(selected, "\\") || strings.HasPrefix(selected, "/") || strings.HasSuffix(selected, "/") || len(selected) > 256 {
		return "", ErrInvalid
	}
	for _, segment := range strings.Split(selected, "/") {
		if segment == "" || segment == "." || segment == ".." || len(segment) > 64 || !dirSegmentPattern.MatchString(segment) {
			return "", ErrInvalid
		}
	}
	return selected, nil
}

// objectExtension returns a lowercased alnum extension for the physical file
// name. Names without a parseable extension store extensionless objects; the
// original display name always keeps its real extension.
func objectExtension(name string) string {
	dot := strings.LastIndexByte(name, '.')
	if dot < 0 || dot == len(name)-1 {
		return ""
	}
	ext := strings.ToLower(name[dot+1:])
	if len(ext) > 12 {
		return ""
	}
	for _, r := range ext {
		if r < 'a' || r > 'z' {
			if r < '0' || r > '9' {
				return ""
			}
		}
	}
	return ext
}

// buildObjectKey lays out managed objects as
// objects/{folder}/{YYYY}/{MM}/{random_id}.{ext}: one folder per month keeps
// directories browsable while the random name makes collisions impossible.
func buildObjectKey(folder, name, objectID string, now time.Time) string {
	key := "objects/" + folder + "/" + now.Format("2006/01") + "/" + objectID
	if ext := objectExtension(name); ext != "" {
		key += "." + ext
	}
	return key
}
func (s *Service) uploadTarget(ctx context.Context, name string, selected *string) (string, error) {
	paths, extensions, err := s.uploadRules(ctx)
	if err != nil {
		return "", err
	}
	allowed := len(extensions) == 0
	for _, ext := range extensions {
		if strings.HasSuffix(strings.ToLower(name), "."+strings.TrimPrefix(strings.ToLower(ext), ".")) {
			allowed = true
			break
		}
	}
	if !allowed {
		return "", ErrInvalid
	}
	// An omitted path selects the first configured path, or the managed default
	// folder. A configured whitelist stays fail-closed: only exact members pass.
	target := ""
	if selected != nil {
		target = *selected
	} else if len(paths) > 0 {
		target = paths[0]
	}
	if len(paths) > 0 {
		found := false
		for _, p := range paths {
			if p == target {
				found = true
				break
			}
		}
		if !found {
			return "", ErrInvalid
		}
	} else if target != "" {
		return "", ErrInvalid
	}
	folder := "default"
	if target != "" {
		if folder, err = cleanRelativeDir(target); err != nil {
			return "", err
		}
	}
	return buildObjectKey(folder, name, id(), s.now()), nil
}
func (s *Service) UploadPolicy(ctx context.Context) contracts.UploadPolicy {
	paths, extensions, _ := s.uploadRules(ctx)
	if paths == nil {
		paths = []string{}
	}
	if extensions == nil {
		extensions = []string{}
	}
	return contracts.UploadPolicy{MaxSize: s.policy(ctx, "max_size_mb", 100) * 1024 * 1024, PartSize: s.policy(ctx, "part_size_mb", 8) * 1024 * 1024, Parallelism: s.policy(ctx, "parallelism", 3), ResumeHours: s.policy(ctx, "pending_hours", 24), UploadPaths: paths, AllowedExtensions: extensions}
}
