// Author: yunnuo <ymz@ebox.vip>
// Description: Typed defaults, environment and flag precedence; secret values remain in composition roots.
package config

import (
	"flag"
	"fmt"
	"io"
	"net"
	"strconv"
	"time"
)

type Lookup func(string) string

// Log carries boot-time logging knobs; retention for the platform profile is
// overridden at runtime through the logging.retention_days setting.
type Log struct {
	Level, Format string
	File          bool
	MaxAgeDays    int
	MaxSizeMB     int
	MaxTotalMB    int
}

func Logging(lookup Lookup) (Log, error) {
	options := Log{Level: value(lookup, "APP_LOG_LEVEL", "info"), Format: value(lookup, "APP_LOG_FORMAT", "json")}
	file, err := fileFlag(lookup("APP_LOG_FILE"), false)
	if err != nil {
		return Log{}, err
	}
	options.File = file
	if options.MaxAgeDays, err = intValue(lookup("APP_LOG_MAX_AGE_DAYS"), 0); err != nil {
		return Log{}, err
	}
	if options.MaxSizeMB, err = intValue(lookup("APP_LOG_MAX_SIZE_MB"), 10); err != nil {
		return Log{}, err
	}
	if options.MaxTotalMB, err = intValue(lookup("APP_LOG_MAX_TOTAL_MB"), 500); err != nil {
		return Log{}, err
	}
	return options, options.Validate()
}

func fileFlag(raw string, fallback bool) (bool, error) {
	if raw == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback, fmt.Errorf("log file must be true/false")
	}
	return parsed, nil
}

// intValue parses an optional integer option; range checks live in Log.Validate.
func intValue(raw string, fallback int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil {
		return fallback, fmt.Errorf("log size and retention options must be integers")
	}
	return parsed, nil
}
func (options Log) Validate() error {
	if options.Level != "debug" && options.Level != "info" && options.Level != "warn" && options.Level != "error" {
		return fmt.Errorf("log level must be debug/info/warn/error")
	}
	if options.Format != "json" && options.Format != "text" {
		return fmt.Errorf("log format must be json/text")
	}
	if options.MaxAgeDays < 0 || options.MaxAgeDays > 36500 {
		return fmt.Errorf("log max age days must be between 0 and 36500")
	}
	if options.MaxSizeMB < 1 || options.MaxSizeMB > 512 {
		return fmt.Errorf("log max size MB must be between 1 and 512")
	}
	if options.MaxTotalMB < 0 || options.MaxTotalMB > 1048576 {
		return fmt.Errorf("log max total MB must be between 0 and 1048576")
	}
	if options.MaxTotalMB != 0 && options.MaxTotalMB < options.MaxSizeMB {
		return fmt.Errorf("log total size must be zero (unlimited) or at least the single-file size")
	}
	return nil
}

type Web struct {
	Listen, Profile, DataDir, Deployment, MonitorListen string
	Log                                                 Log
	ShutdownTimeout, ReadinessTimeout                   time.Duration
	APIDocs                                             bool
}

type webFlags struct {
	Web
	configPath, shutdown, ready, docs  string
	logFile, logAge, logSize, logTotal string
}

func LoadWeb(args []string, lookup Lookup) (Web, error) {
	parsed, err := parseWeb(args, lookup)
	if err != nil {
		return Web{}, err
	}
	if parsed.configPath != "" {
		lookup, err = webFileLookup(parsed.configPath, lookup)
		if err != nil {
			return Web{}, err
		}
		parsed, err = parseWeb(args, lookup)
		if err != nil {
			return Web{}, err
		}
	}
	return parsed.validate()
}

func parseWeb(args []string, lookup Lookup) (webFlags, error) {
	parsed := webFlags{}
	options := &parsed.Web
	flags := flag.NewFlagSet("server", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&parsed.configPath, "config", lookup("APP_CONFIG"), "optional startup YAML/JSON configuration")
	flags.StringVar(&options.Listen, "listen", value(lookup, "APP_LISTEN", "127.0.0.1:3000"), "HTTP listen address")
	flags.StringVar(&options.Profile, "profile", lookup("APP_PROFILE"), "initial profile; persisted after install")
	flags.StringVar(&options.DataDir, "data-dir", value(lookup, "APP_DATA_DIR", "data"), "private data directory")
	flags.StringVar(&options.Deployment, "deployment", value(lookup, "APP_DEPLOYMENT_KIND", "development"), "development/tar/docker")
	flags.StringVar(&options.Log.Level, "log-level", value(lookup, "APP_LOG_LEVEL", "info"), "debug/info/warn/error")
	flags.StringVar(&options.Log.Format, "log-format", value(lookup, "APP_LOG_FORMAT", "json"), "json/text")
	flags.StringVar(&parsed.logFile, "log-file", lookup("APP_LOG_FILE"), "true/false: also write logs under <data-dir>/logs")
	flags.StringVar(&parsed.logAge, "log-max-age-days", lookup("APP_LOG_MAX_AGE_DAYS"), "rotated log retention in days; 0 keeps them forever")
	flags.StringVar(&parsed.logSize, "log-max-size-mb", lookup("APP_LOG_MAX_SIZE_MB"), "single log file rotation threshold in MB")
	flags.StringVar(&parsed.logTotal, "log-max-total-mb", lookup("APP_LOG_MAX_TOTAL_MB"), "total rotated log cap in MB; 0 disables the cap")
	flags.StringVar(&options.MonitorListen, "monitor-listen", lookup("APP_MONITOR_LISTEN"), "optional literal loopback monitoring listener")
	flags.StringVar(&parsed.shutdown, "shutdown-timeout", value(lookup, "APP_SHUTDOWN_TIMEOUT", "5s"), "request drain deadline")
	flags.StringVar(&parsed.ready, "readiness-timeout", value(lookup, "APP_READINESS_TIMEOUT", "2s"), "dependency probe deadline")
	flags.StringVar(&parsed.docs, "api-docs", value(lookup, "APP_API_DOCS", "false"), "true/false: publish offline contract reference")
	if err := flags.Parse(args); err != nil {
		return parsed, fmt.Errorf("invalid server arguments: %w", err)
	}
	if flags.NArg() != 0 {
		return parsed, fmt.Errorf("unexpected positional server argument")
	}
	var emptyConfig bool
	flags.Visit(func(option *flag.Flag) {
		if option.Name == "config" && parsed.configPath == "" {
			emptyConfig = true
		}
	})
	if emptyConfig {
		return parsed, fmt.Errorf("--config requires a path")
	}
	return parsed, nil
}

func (parsed webFlags) validate() (Web, error) {
	options := parsed.Web
	file, err := fileFlag(parsed.logFile, false)
	if err != nil {
		return options, err
	}
	options.Log.File = file
	if options.Log.MaxAgeDays, err = intValue(parsed.logAge, 0); err != nil {
		return options, err
	}
	if options.Log.MaxSizeMB, err = intValue(parsed.logSize, 10); err != nil {
		return options, err
	}
	if options.Log.MaxTotalMB, err = intValue(parsed.logTotal, 500); err != nil {
		return options, err
	}
	if err = options.Log.Validate(); err != nil {
		return options, err
	}
	if options.Profile != "" && options.Profile != "web-platform" && options.Profile != "web-standalone" {
		return options, fmt.Errorf("invalid Web profile")
	}
	if options.Deployment != "development" && options.Deployment != "tar" && options.Deployment != "docker" {
		return options, fmt.Errorf("invalid deployment kind")
	}
	if _, _, err := net.SplitHostPort(options.Listen); err != nil {
		return options, fmt.Errorf("invalid HTTP listen address")
	}
	if options.DataDir == "" {
		return options, fmt.Errorf("data directory is required")
	}
	if options.ShutdownTimeout, err = time.ParseDuration(parsed.shutdown); err != nil || options.ShutdownTimeout < 100*time.Millisecond || options.ShutdownTimeout > 2*time.Minute {
		return options, fmt.Errorf("shutdown timeout must be between 100ms and 2m")
	}
	if options.ReadinessTimeout, err = time.ParseDuration(parsed.ready); err != nil || options.ReadinessTimeout < 100*time.Millisecond || options.ReadinessTimeout > 10*time.Second {
		return options, fmt.Errorf("readiness timeout must be between 100ms and 10s")
	}
	if options.APIDocs, err = strconv.ParseBool(parsed.docs); err != nil {
		return options, fmt.Errorf("api-docs must be true/false")
	}
	if options.MonitorListen != "" {
		host, port, err := net.SplitHostPort(options.MonitorListen)
		if err != nil {
			return options, fmt.Errorf("invalid monitoring listen address")
		}
		ip := net.ParseIP(host)
		number, e := strconv.Atoi(port)
		if ip == nil || !ip.IsLoopback() || e != nil || number < 0 || number > 65535 {
			return options, fmt.Errorf("monitoring listener must use a literal loopback IP and valid port")
		}
	}
	return options, nil
}
func value(lookup Lookup, key, fallback string) string {
	if found := lookup(key); found != "" {
		return found
	}
	return fallback
}

const WebUsage = `Web server
Priority: flags > APP_* environment > explicit YAML/JSON file > defaults.
  --config PATH               APP_CONFIG (optional startup YAML/JSON file)
  --listen ADDRESS            APP_LISTEN (127.0.0.1:3000)
  --profile PROFILE           APP_PROFILE (installation choice)
  --data-dir PATH             APP_DATA_DIR (data)
  --deployment KIND           APP_DEPLOYMENT_KIND (development/tar/docker)
  --log-level LEVEL           APP_LOG_LEVEL (info)
  --log-format FORMAT         APP_LOG_FORMAT (json/text)
  --log-file=true|false       APP_LOG_FILE (false; desktop always writes files)
  --log-max-age-days DAYS     APP_LOG_MAX_AGE_DAYS (0 = keep rotated logs forever)
  --log-max-size-mb MB        APP_LOG_MAX_SIZE_MB (10)
  --log-max-total-mb MB       APP_LOG_MAX_TOTAL_MB (500; 0 = unlimited)
  --shutdown-timeout DURATION  APP_SHUTDOWN_TIMEOUT (5s)
  --readiness-timeout DURATION APP_READINESS_TIMEOUT (2s)
  --api-docs=true|false       APP_API_DOCS (false)
  --monitor-listen ADDRESS    APP_MONITOR_LISTEN (off; literal loopback only)
`
