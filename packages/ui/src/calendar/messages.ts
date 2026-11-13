// Author: yunnuo <ymz@ebox.vip>
// Description: Calendar-local Chinese source keys and English fallbacks, independent of host catalog readiness.
import { defineMessages, useLocale } from '../i18n';

/** English keys map to Chinese source messages; hosts may copy the inverse into their English catalog. */
export const calendarMessages = defineMessages({
  'Date calendar': '日期日历',
  'Previous month': '上个月',
  'Next month': '下个月',
  'Choose date': '选择日期',
  'Choose date range': '选择日期范围',
  'Start date': '开始日期',
  'End date': '结束日期',
  'Date': '日期',
  'Year': '年',
  'Month': '月',
  'Day': '日',
  'Use YYYY-MM-DD': '按 YYYY-MM-DD 格式填写',
  'Quick ranges': '快捷日期范围',
  'Enter an available date or complete date range in YYYY-MM-DD format.': '请以 YYYY-MM-DD 格式输入可用日期或完整日期范围。',
  'Cancel': '取消',
  'Apply': '应用',
  'Meeting scheduler': '会议时间选择',
  'Time zone': '时区',
  'Time format': '时间格式',
  '12-hour': '12 小时制',
  '24-hour': '24 小时制',
  'Available times': '可选时间',
  'No available times for this date.': '此日期没有可选时间。',
  'All day': '全天',
  '{{count}} more events on {{date}}': '{{date}}还有 {{count}} 个日程',
  '+{{count}} more': '另有 {{count}} 个',
  'Events on {{date}}': '{{date}}的日程',
});

/** Explicit locale controls both Intl formatting and labels; otherwise subscribe to the host preference. */
export function useCalendarI18n(override?: string) {
  const hostLocale = useLocale();
  const locale = override ?? hostLocale;
  function t(key: keyof typeof calendarMessages, parameters?: Record<string, unknown>): string {
    const message = /^zh(?:-|$)/i.test(locale) ? calendarMessages[key] : key;
    return message.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(parameters?.[name] ?? `{{${name}}}`));
  }
  return { locale, t };
}
