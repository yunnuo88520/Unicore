// Author: yunnuo <ymz@ebox.vip>
// Description: Fail-closed upload policies and server-approved relative path selection.
package files

import (
	"context"
	"github.com/yunnuo/unicore/internal/contracts"
	"strings"
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
	// An omitted path selects the first configured path, or the managed root.
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
	if target != "" {
		target += "/"
	}
	return "objects/" + target + id(), nil
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
