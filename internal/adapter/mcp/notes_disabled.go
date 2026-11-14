//go:build no_notes

// Author: yunnuo <ymz@ebox.vip>
// Description: Empty Notes MCP contribution for trimmed builds: no tool registration, no business dependency.
package mcp

import (
	"github.com/yunnuo/unicore/internal/install"
	"github.com/yunnuo/unicore/internal/mcp"
)

// RegisterNotes is the trimmed-build counterpart of the Notes sample: the
// registry stays empty and no notes package is imported.
func RegisterNotes(registry *mcp.Registry, manager *install.Manager, operations mcp.OperationResolver) error {
	return nil
}
