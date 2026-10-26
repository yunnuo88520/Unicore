// Author: yunnuo <ymz@ebox.vip>
// Description: Shared structured logging; callers choose stdout for Web and stderr for CLI/desktop.
package logging

import (
	"github.com/yunnuo/unicore/internal/config"
	"io"
	"log/slog"
)

func New(writer io.Writer, options config.Log, profile string) (*slog.Logger, error) {
	if err := options.Validate(); err != nil {
		return nil, err
	}
	levels := map[string]slog.Level{"debug": slog.LevelDebug, "info": slog.LevelInfo, "warn": slog.LevelWarn, "error": slog.LevelError}
	handlerOptions := &slog.HandlerOptions{Level: levels[options.Level]}
	var handler slog.Handler = slog.NewJSONHandler(writer, handlerOptions)
	if options.Format == "text" {
		handler = slog.NewTextHandler(writer, handlerOptions)
	}
	return slog.New(handler).With("service", "unicore", "profile", profile), nil
}
