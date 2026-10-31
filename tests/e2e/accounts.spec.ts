// Author: yunnuo <ymz@ebox.vip>
// Description: Real browser registration/recovery against the Go server and an isolated SMTP sink.
import { createServer, type Socket } from 'node:net';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { capture } from './visual';

async function smtpSink() {
  const messages: string[] = []; const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    socket.write('220 localhost SMTP test\r\n');
    let buffer = ''; let body: string[] | null = null;
    socket.on('data', data => {
      buffer += data.toString();
      for (;;) {
        const index = buffer.indexOf('\r\n'); if (index < 0) break;
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
        if (body) { if (line === '.') { messages.push(body.join('\n')); body = null; socket.write('250 Accepted\r\n'); } else body.push(line.replace(/^\.\./, '.')); continue; }
        const command = line.split(' ')[0].toUpperCase();
        if (command === 'EHLO') socket.write('250-localhost\r\n250 OK\r\n');
        else if (command === 'DATA') { body = []; socket.write('354 Continue\r\n'); }
        else if (command === 'QUIT') socket.end('221 Bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return { messages, port: (server.address() as { port: number }).port, close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
async function solveCaptcha(page: Page) {
  const image = page.getByAltText('六位数字验证码，点击刷新'); await expect(image).toBeVisible();
  const source = (await image.getAttribute('src'))!;
  const answer = [...Buffer.from(source.split(',')[1], 'base64').toString().matchAll(/>([0-9])<\/text>/g)].map(match => match[1]).join('');
  await page.getByLabel('图形验证码', { exact: true }).fill(answer);
}

test('SMTP settings, verified registration and password recovery revoke old sessions', async ({ page, instance }, info) => {
  const smtp = await smtpSink();
  try {
    const installed = await instance.request.post('/api/v1/install/complete', { headers: { 'X-Bootstrap-Token': instance.token }, data: { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Mail Unicore', base_url: instance.url, admin_username: 'admin', admin_email: 'admin@example.test', admin_password: 'test-password-strong' } });
    expect(installed.status()).toBe(200);
    await page.context().addCookies((await instance.request.storageState()).cookies);
    await page.goto(`${instance.url}/admin#mail`);
    await page.getByLabel('SMTP 主机').fill('127.0.0.1');
    await page.getByLabel('SMTP 端口').fill(String(smtp.port));
    await page.getByLabel('SMTP 加密方式').selectOption('plain');
    await page.getByLabel('发件邮箱').fill('sender@example.test');
    await page.getByLabel('发件人别名', { exact: true }).fill('Unicore Notices');
    await page.getByLabel('SMTP 密钥', { exact: true }).fill('synthetic-smtp-secret');
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByText('设置已保存', { exact: true })).toBeVisible();
    await expect(page.getByLabel('SMTP 密钥', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('SMTP 密钥', { exact: true })).toHaveAttribute('placeholder', '已配置 · 留空保留');
    await page.getByRole('button', { name: '发送测试', exact: true }).click();
    await page.getByLabel('测试收件邮箱').fill('recipient@example.test');
    await page.getByRole('button', { name: '发送测试邮件', exact: true }).click();
    await expect(page.getByText('测试邮件已发送，可开启邮件账号流程。')).toBeVisible();
    expect(smtp.messages[0]).toContain('From: "Unicore Notices" <sender@example.test>');
    await expect(page.getByRole('dialog',{name:'发送测试邮件',exact:true})).toHaveCount(0);
    await page.getByLabel('邮件找回密码', { exact: true }).check();
    await page.getByLabel('邮箱验证码登录', { exact: true }).check();
    await page.getByRole('button', { name: '保存设置' }).click();
    await expect(page.getByRole('button', { name: '保存设置' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await capture(page, info, 'mail-settings');
    await page.goto(`${instance.url}/admin#site?tab=security`);
    await page.getByRole('switch',{name:'开放注册（需验证邮箱）'}).check();
    await page.getByRole('button',{name:'保存设置',exact:true}).click();
    await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'账号菜单',exact:true}).click();
    await page.getByRole('button',{name:'退出登录',exact:true}).click();
    await page.goto(instance.url);
    await page.getByRole('button', { name: '重发验证邮件', exact: true }).click();
    await expect(page.getByRole('heading', { name: '重新验证邮箱' })).toBeVisible();
    await capture(page, info, 'resend-form');
    await page.getByRole('button', { name: '返回登录', exact: true }).click();
    await page.getByRole('button', { name: '注册账号', exact: true }).click();
    await capture(page, info, 'register-form');
    await page.getByLabel('账号', { exact: true }).fill('browsermember');
    await page.getByLabel('邮箱', { exact: true }).fill('browsermember@example.test');
    await page.getByLabel('密码', { exact: true }).fill('original-password-strong');
    await solveCaptcha(page);
    await page.getByRole('button', { name: '注册并验证邮箱' }).click();
    await expect(page.getByRole('heading', { name: '验证邮箱', exact: true })).toBeVisible();
    await expect.poll(() => smtp.messages.length).toBe(2);
    const mailCode = () => {
      const raw = smtp.messages.at(-1)!.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      const decoded = Buffer.from(raw, 'binary').toString('utf8');
      return decoded.match(/验证码：([0-9]{6})/)![1];
    };
    await capture(page, info, 'register-code');
    await page.getByLabel('邮箱验证码', { exact: true }).fill(mailCode());
    await page.getByRole('button', { name: '确认验证邮箱' }).click();
    await expect(page.getByRole('status')).toContainText('邮箱验证成功');
    await capture(page, info, 'register-success');
    await page.getByRole('button', { name: '返回登录' }).click();
    await page.getByLabel('账号或邮箱').fill('browsermember');
    await page.getByLabel('密码', { exact: true }).fill('original-password-strong');
    await solveCaptcha(page);
    await page.getByRole('button', { name: '登录工作空间' }).click();
    await expect(page.getByRole('heading', { name: '一份核心，无限可能.' })).toBeVisible();
    const oldCookies = await page.context().cookies();
    // A second browser context requests reset while the first remains authenticated.
    const recovery = await page.context().browser()!.newContext({ viewport: page.viewportSize()! });
    try {
      const resetPage = await recovery.newPage(); await resetPage.goto(instance.url);
      await resetPage.getByRole('button', { name: '找回密码', exact: true }).click();
      await resetPage.getByLabel('邮箱', { exact: true }).fill('browsermember@example.test');
      await solveCaptcha(resetPage);
      await capture(resetPage, info, 'forgot-form');
      await resetPage.getByRole('button', { name: '发送重置验证码' }).click();
      await expect(resetPage.getByRole('heading', { name: '设置新密码', exact: true })).toBeVisible();
      await expect.poll(() => smtp.messages.length).toBe(3);
      await capture(resetPage, info, 'reset-code');
      await resetPage.getByLabel('邮箱验证码', { exact: true }).fill(mailCode());
      await resetPage.getByLabel('新密码', { exact: true }).fill('changed-password-strong');
      await resetPage.getByRole('button', { name: '保存新密码' }).click();
      await expect(resetPage.getByRole('status')).toContainText('密码已更新');
      await capture(resetPage, info, 'reset-success');
      await resetPage.getByRole('button', { name: '返回登录' }).click();
      await resetPage.getByLabel('账号或邮箱').fill('browsermember');
      await resetPage.getByLabel('密码', { exact: true }).fill('changed-password-strong');
      await solveCaptcha(resetPage);
      await resetPage.getByRole('button', { name: '登录工作空间' }).click();
      await expect(resetPage.getByRole('button', { name: '账号菜单', exact: true })).toBeAttached();
    } finally { await recovery.close(); }
    expect(oldCookies.some(cookie => cookie.name === 'unicore_session')).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: '登录 Mail Unicore' })).toBeVisible();
    await capture(page, info, 'password-login');
    await page.getByRole('button', { name: '邮箱验证码登录', exact: true }).click();
    await page.getByLabel('邮箱', { exact: true }).fill('browsermember@example.test');
    await solveCaptcha(page);
    await capture(page, info, 'email-login-form');
    await page.getByRole('button', { name: '发送登录验证码' }).click();
    await expect(page.getByRole('heading', { name: '输入登录验证码' })).toBeVisible();
    await expect.poll(() => smtp.messages.length).toBe(4);
    await capture(page, info, 'email-login-code');
    const actualCode = mailCode();
    await page.getByLabel('邮箱验证码', { exact: true }).fill(actualCode === '000000' ? '000001' : '000000');
    await page.getByRole('button', { name: '验证并登录' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await capture(page, info, 'email-code-error');
    await page.getByLabel('邮箱验证码', { exact: true }).fill(actualCode);
    await page.getByRole('button', { name: '验证并登录' }).click();
    await expect(page.getByRole('heading', { name: '一份核心，无限可能.' })).toBeVisible();
    await page.goto(`${instance.url}/#users`);
    await expect(page.getByText('没有访问权限')).toBeVisible();
    await capture(page, info, 'permission-denied');
  } finally { await smtp.close(); }
});
