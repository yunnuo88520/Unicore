<!-- Author: yunnuo <ymz@ebox.vip> -->
# @unicore/theme

Unicore 设计令牌与客户端偏好层：单一设计源 `assets/theme/tokens.json` 经构建脚本生成本包的 CSS 令牌，运行时提供偏好存储、主题应用与 accent 派生。

## 生成链（不要手改生成物）

```
assets/theme/tokens.json ──scripts/generate-theme.mjs──▶ packages/theme/src/tokens.gen.css   （CSS 令牌，DO NOT EDIT）
                                                      ├▶ packages/theme/src/modes.gen.json    （运行时派生基底）
                                                      └▶ packages/theme/src/resolved.gen.json （默认 accent 的完整解析结果）
```

accent → 变量的派生数学在本包 `src/derive.mjs`，构建脚本与运行时共用同一份实现（金测锁定两者一致）。改色值只能改 `tokens.json`，然后 `pnpm design:generate`；CI 有 `--check` 陈旧检测。

## 样式入口

`@unicore/theme/styles.css` 是 Tailwind v4 入口：`@import "tailwindcss"`、`@source` 扫描 UI 源码目录、`@theme inline` 语义映射。应用入口：

```tsx
import '@unicore/theme/styles.css';
```

## 运行时

```tsx
import { useTheme, useResolvedTheme, setCustomAccent } from '@unicore/theme';
import { getPreferences, setPreferences, usePreferences } from '@unicore/theme/preferences';
```

- `useTheme(defaultTheme?)`：把 light/dark/system、accent 预设、密度/圆角/布局偏好写入 `documentElement`（`data-*` + 三个缩放变量），跟随系统并持久化到 `localStorage`；
- `setCustomAccent('#RRGGBB')`：实例级品牌主色（通常来自服务端 bootstrap 的 `branding.accent`），运行时用 `derive.mjs` 派生整套 accent 变量；仅在用户停留在默认 `brand` 预设时生效，显式预设优先；
- `preferences.ts`：九维偏好（locale/theme/accent/radius/density/sidebar/layout/content/navCollapsed）的校验、迁移、跨标签同步与降级存储。

## 消费方式

工作区内直接消费源码；`pnpm --filter @unicore/theme build` 产出 `dist/`（ESM + d.ts，JSON 调色板内联）。
