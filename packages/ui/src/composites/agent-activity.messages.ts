// Author: yunnuo <ymz@ebox.vip>
// Description: Agent and activity additions kept separate from parallel composite message changes.
import { defineMessages, t } from '../i18n';

export const agentActivityMessages = defineMessages({
  'Profile preview': '资料预览',
  'Untitled agent': '未命名智能体',
  'Add a description to introduce this agent.': '添加描述来介绍此智能体。',
  'Identity': '身份资料',
  'Behavior': '行为指令',
  'Optional preferences': '可选偏好',
  'Language': '语言',
  'Voice': '语音',
  'Preferences': '偏好',
  'Local profile only. Connecting services is managed by the host application.': '仅编辑本地资料。服务连接由宿主应用管理。',
  'squircle': '柔角方形',
  'capsule': '胶囊形',
  'star': '星芒形',
  'flower': '花瓣形',
  'shield': '盾形',
  'curious': '好奇',
  'joyful': '欣喜',
  'wink': '眨眼',
  'No tasks': '暂无任务',
  'No search sources': '暂无搜索来源',
  'Open source': '打开来源',
  'Indeterminate progress': '进度未知',
  '{{value}}% complete': '已完成 {{value}}%',
  '{{complete}} of {{total}} steps complete': '已完成 {{complete}} 步，共 {{total}} 步',
});
export function agentActivityT(key: keyof typeof agentActivityMessages, parameters?: Record<string, unknown>): string {
  return t(agentActivityMessages[key], parameters);
}
