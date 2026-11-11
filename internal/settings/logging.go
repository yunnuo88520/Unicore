// Author: yunnuo <ymz@ebox.vip>
// Description: Durable log retention for the platform admin surface; standalone and desktop keep their boot-time limits.
package settings

// LoggingDefinitions registers the runtime log retention. The logging group
// only applies to web-platform (see applies), so desktop and standalone never
// expose it; 0 keeps rotated logs forever.
var LoggingDefinitions = []SettingDefinition{
	{"logging.retention_days", "integer", "logging", "日志保留天数", "30", true, false, integer(0, 36500)},
}
