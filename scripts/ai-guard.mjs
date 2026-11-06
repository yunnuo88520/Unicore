// Author: yunnuo <ymz@ebox.vip>
// Description: PreToolUse reminder for protected framework sources; advisory only, it never blocks edits and exits 0 on anything unrecognized.
import { createInterface } from 'node:readline';

const rules = [
  {
    pattern: /(?:^|\/)migrations\/.*\.sql$|(?:^|\/)migrations\/catalog\.json$/,
    reminder: '受保护：迁移 SQL 字节一经分发即冻结，只追加版本。先读 migrations/README.md、docs/02-standards/database-migrations.md 与 ADR-0024/0025；执行器复用 migrations/runner。',
  },
  {
    pattern: /(?:^|\/)packages\/contracts\/openapi\.json$/,
    reminder: '受保护：openapi.json 是唯一契约源。先声明 operationId 与 x-unicore 访问策略/权限点，改后运行 pnpm generate；运行时对未声明路由 fail-closed。',
  },
  {
    pattern: /\.gen\.(?:go|ts|json|md)$|(?:^|\/)(?:models\.gen\.go|errors\.gen\.go|catalog\.gen\.go|operations\.gen\.ts|schema\.gen\.ts|context\.gen\.md|metadata\.gen\.json)$/,
    reminder: '生成文件禁止手改：修改源头（openapi.json、catalog.json、tokens.json、framework.manifest.json 等）后用 make docs / pnpm generate 再生。',
  },
  {
    pattern: /(?:^|\/)internal\/platform\/roles\.go$/,
    reminder: '受保护：权限目录。新增/变更权限点须同步 docs/api/permissions.md 与 add-platform-permission skill，并验证匿名/普通用户/越权边界。',
  },
];

let raw = '';
const input = createInterface({ input: process.stdin });
for await (const chunk of input) raw += chunk;

try {
  const event = JSON.parse(raw);
  const path = event?.tool_input?.file_path ?? event?.tool_input?.path ?? event?.file_path ?? '';
  if (typeof path === 'string' && path) {
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
    const hit = rules.find(rule => rule.pattern.test(normalized));
    if (hit) {
      process.stdout.write(JSON.stringify({ additionalContext: hit.reminder }));
    }
  }
} catch {
  // Unrecognized payloads pass silently; the guard is advisory by design.
}
