// Author: yunnuo <ymz@ebox.vip>
// Description: Local bilingual defaults until host catalogs integrate the independent controls.
import { defineMessages, useI18n } from '../i18n';

export const controlMessagesZh = defineMessages({
  'Close': '关闭', 'Dismiss announcement': '关闭公告', 'Dismiss notification': '关闭通知', 'Loading': '加载中',
  'Hex color for {{label}}': '{{label}}的十六进制颜色', 'Color palette for {{label}}': '{{label}}的调色板',
  'Choose color {{color}}': '选择颜色 {{color}}', 'Enter a six-digit hex color in #RRGGBB format.': '请输入 #RRGGBB 格式的六位十六进制颜色。',
  'Clear search': '清除搜索', 'Decrease value': '减少数值', 'Increase value': '增加数值',
  'Remove {{label}}': '移除{{label}}', 'Choose files': '选择文件', 'Or drop files here': '或将文件拖放到此处',
  'No results': '无匹配结果', 'Commands': '命令', 'Search commands': '搜索命令',
  'carousel': '轮播', 'slide': '幻灯片', 'Slide {{current}} of {{total}}': '第 {{current}} 张，共 {{total}} 张',
  'Previous slide': '上一张', 'Next slide': '下一张', 'Collapse {{label}}': '折叠{{label}}', 'Expand {{label}}': '展开{{label}}',
  'Pagination': '分页', 'Previous page': '上一页', 'Next page': '下一页', 'Page {{page}}': '第 {{page}} 页',
});

export function useControlI18n() {
  const { locale, t, setLocale } = useI18n();
  return { locale, setLocale, t: (key: string, parameters?: Record<string, unknown>) => {
    const source = locale.startsWith('zh') && Object.prototype.hasOwnProperty.call(controlMessagesZh, key) ? controlMessagesZh[key as keyof typeof controlMessagesZh] : key;
    return t(source, parameters);
  } };
}
