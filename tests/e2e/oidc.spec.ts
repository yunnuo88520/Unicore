// Author: yunnuo <ymz@ebox.vip>
// Description: Real browser OIDC authorization, JIT, conflict, explicit binding and local recovery.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { test as base, expect } from './fixtures';
import { capture } from './visual';

const test = base.extend<{ idp: { url: string } }>({ idp: async ({ playwright }, use) => {
  const allocator = createServer(); await new Promise<void>(resolve => allocator.listen(0, '127.0.0.1', resolve));
  const port = (allocator.address() as {port: number}).port; await new Promise<void>(resolve => allocator.close(() => resolve()));
  const child = spawn('build/bin/oidcprovider', ['--listen', `127.0.0.1:${port}`], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`; const api = await playwright.request.newContext();
  try { await expect.poll(async () => {try {return (await api.get(`${url}/.well-known/openid-configuration`)).status();}catch{return 0;}}, {timeout: 15000}).toBe(200); await use({url}); }
  finally { child.kill('SIGTERM'); await new Promise<void>(resolve => child.exitCode !== null ? resolve() : child.once('exit', () => resolve())); await api.dispose(); }
} });

test('enterprise settings, real JIT, explicit binding and password fallback', async ({ page, browser, instance, idp }, info) => {
  test.setTimeout(90000);
  const install = await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: {'X-Bootstrap-Token': instance.token}, data: {profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'} });
  expect(install.status()).toBe(200); await page.goto(`${instance.url}/admin#account`);
  await expect(page.getByRole('heading', {name:'企业账号绑定',exact:true})).toBeVisible();
  await expect(page.getByText('实例尚未启用',{exact:true})).toBeVisible(); await capture(page, info, 'oidc-account-disabled');
  await page.goto(`${instance.url}/admin#site`);
  await page.getByRole('tab', { name: '安全与控制', exact: true }).click();
  await page.getByRole('combobox',{name:'登录图形验证码',exact:true}).selectOption('false');
  await page.getByRole('button',{name:'保存设置',exact:true}).click();
  await expect(page.getByRole('button',{name:'保存设置',exact:true})).toBeDisabled();
  await page.getByRole('tab', { name: '企业登录', exact: true }).click();
  await page.getByLabel('Issuer 地址',{exact:true}).fill('http://127.0.0.1:1');
  await page.getByLabel('Client ID',{exact:true}).fill('unicore-test-client');
  await page.getByLabel('Client Secret',{exact:true}).fill('isolated-test-secret');
  await page.getByRole('button',{name:'保存设置',exact:true}).click(); await expect(page.getByText('设置已保存',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'检查已保存的连接',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('暂时无法连接企业身份服务'); await capture(page,info,'oidc-connection-error');
  await page.getByRole('tab', { name: '企业登录', exact: true }).click();
  await page.getByLabel('Issuer 地址',{exact:true}).fill(idp.url);
  await page.getByRole('combobox',{name:'企业登录',exact:true}).selectOption('true');
  await expect(page.getByRole('combobox',{name:'首次登录创建普通账号',exact:true})).toHaveValue('false');
  await page.getByRole('combobox',{name:'首次登录创建普通账号',exact:true}).selectOption('true');
  await page.getByRole('button',{name:'保存设置',exact:true}).click(); await expect(page.getByText('设置已保存',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Client Secret',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('Client Secret',{exact:true})).toHaveAttribute('placeholder','已配置 · 留空保留');
  await page.getByRole('button',{name:'检查已保存的连接',exact:true}).click(); await expect(page.getByText('发现文档及端点检查通过，请继续验证实际登录。')).toBeVisible();
  await expect(page.locator('.oidc-callback')).toHaveText(`${instance.url}/api/v1/auth/oidc/administrator-callback`); await capture(page,info,'oidc-settings-ready');
  const adminBootstrap = (await (await page.request.get(`${instance.url}/api/v1/bootstrap`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data;
  const originalAdminCookie = (await page.context().cookies()).find(cookie => cookie.name === 'unicore_administrator_session')!.value;
  const employeeContext = await browser.newContext({viewport:page.viewportSize()!,isMobile:info.project.name==='mobile',hasTouch:info.project.name==='mobile'});
  const employee = await employeeContext.newPage();
  try {
    await employee.goto(instance.url); await expect(employee.getByRole('button',{name:'使用企业账号登录',exact:true})).toBeVisible(); await capture(employee,info,'oidc-login-choice');
    await employee.getByRole('button',{name:'使用企业账号登录',exact:true}).focus(); await employee.keyboard.press('Enter');
    await expect(employee.getByRole('heading',{name:'测试企业登录'})).toBeVisible();
    await employee.getByRole('button',{name:'确认企业身份',exact:true}).click();
    await expect(employee.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
    const newUser = (await (await employee.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
    expect(newUser.current_user.roles).toEqual(['user']); expect(newUser.current_user.permissions).toEqual([]);
    expect((await employee.request.get(`${instance.url}/api/v1/admin/users`)).status()).toBe(403);
    await employee.goto(`${instance.url}/#account`); await expect(employee.getByText('已绑定',{exact:true})).toBeVisible();
    await expect(employee.getByText('尚未设置',{exact:true})).toBeVisible(); await expect(employee.getByRole('button',{name:'确认解除绑定',exact:true})).toHaveCount(0); await capture(employee,info,'oidc-jit-account');
    // User email collisions never elevate into the administrator realm.
    await employee.request.post(`${instance.url}/api/v1/auth/logout`,{headers:{'X-CSRF-Token':newUser.csrf_token},data:{}});
    await employee.goto(instance.url); await employee.getByRole('button',{name:'使用企业账号登录',exact:true}).click();
    await employee.getByLabel('企业身份编号',{exact:true}).fill('enterprise-admin'); await employee.getByLabel('企业邮箱',{exact:true}).fill('admin@example.test');
    await employee.getByRole('button',{name:'确认企业身份',exact:true}).click();
    await expect(employee.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
    expect((await(await employee.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data.current_user.roles).toEqual(['user']);
    await employee.goto(`${instance.url}/admin`);
    await employee.getByRole('button',{name:'使用企业账号登录',exact:true}).click();
    await employee.getByLabel('企业身份编号',{exact:true}).fill('enterprise-admin');await employee.getByLabel('企业邮箱',{exact:true}).fill('admin@example.test');
    await employee.getByRole('button',{name:'确认企业身份',exact:true}).click();
    await expect(employee.getByRole('alert')).toContainText('请先使用本地账号登录');await capture(employee,info,'oidc-admin-jit-blocked');
    // Confirm local password, then reauthenticate with the IdP before binding.
    await page.goto(`${instance.url}/admin#account`); await page.getByLabel('确认本地密码',{exact:true}).fill('wrong-password');
    await page.getByRole('button',{name:'验证并绑定企业账号',exact:true}).click(); await expect(page.getByRole('alert')).toContainText('账号或密码不正确'); await capture(page,info,'oidc-binding-password-error');
    await page.getByLabel('确认本地密码',{exact:true}).fill('test-password-strong');
    await page.getByRole('button',{name:'验证并绑定企业账号',exact:true}).click();
    await expect(page).toHaveURL(/prompt=login/); expect(new URL(page.url()).searchParams.get('max_age')).toBe('0');
    await page.getByLabel('企业身份编号',{exact:true}).fill('enterprise-admin'); await page.getByLabel('企业邮箱',{exact:true}).fill('admin@example.test'); await page.getByRole('button',{name:'确认企业身份',exact:true}).click();
    await expect(page.getByText('企业账号已绑定，其他设备的旧会话已退出。')).toBeVisible(); await capture(page,info,'oidc-binding-success');
    const revoked = await instance.request.get('/api/v1/auth/session',{headers:{'X-Unicore-Identity':'administrator',Cookie:`unicore_administrator_session=${originalAdminCookie}`}}); expect(revoked.status()).toBe(401);
    // Same iss/sub signs into the linked local account; IdP email changes cannot redirect it.
    await employee.goto(`${instance.url}/admin`); await employee.getByRole('button',{name:'使用企业账号登录',exact:true}).click();
    await employee.getByLabel('企业身份编号',{exact:true}).fill('enterprise-admin'); await employee.getByLabel('企业邮箱',{exact:true}).fill('different@example.test'); await employee.getByRole('button',{name:'确认企业身份',exact:true}).click();
    await expect(employee.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
    expect((await (await employee.request.get(`${instance.url}/api/v1/bootstrap`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data.current_user.id).toBe(adminBootstrap.current_user.id);
    const ssoCookie = (await employee.context().cookies()).find(cookie=>cookie.name==='unicore_administrator_session')!.value;
    await page.getByLabel('确认本地密码',{exact:true}).fill('test-password-strong'); await capture(page,info,'oidc-unlink-confirm');
    await page.getByRole('button',{name:'确认解除绑定',exact:true}).click(); await expect(page.getByText('企业绑定已解除，本地密码登录可用。')).toBeVisible(); await capture(page,info,'oidc-unlink-success');
    expect((await instance.request.get('/api/v1/auth/session',{headers:{'X-Unicore-Identity':'administrator',Cookie:`unicore_administrator_session=${ssoCookie}`}})).status()).toBe(401);
    const current = (await (await page.request.get(`${instance.url}/api/v1/bootstrap`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data;
    expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers:{'X-Unicore-Identity':'administrator','X-CSRF-Token':current.csrf_token},data:{changes:[{key:'oidc.enabled',value:'false'}]}})).status()).toBe(200);
    await employee.goto(`${instance.url}/admin`); await expect(employee.getByLabel('账号或邮箱')).toBeVisible(); await expect(employee.getByRole('button',{name:'使用企业账号登录',exact:true})).toHaveCount(0);
    await employee.getByLabel('账号或邮箱').fill('admin'); await employee.getByLabel('密码',{exact:true}).fill('test-password-strong'); await employee.getByRole('button',{name:'登录工作空间',exact:true}).click(); await expect(employee.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
    // Follow-system mode on the new page, in addition to the explicit palette captures.
    await employee.evaluate(()=>{localStorage.setItem('unicore.theme','system');}); await employee.emulateMedia({colorScheme:'dark'}); await employee.goto(`${instance.url}/admin#account`);
    await expect(employee.getByRole('heading',{name:'企业账号绑定',exact:true})).toBeVisible();
    await expect(employee.locator('html')).toHaveAttribute('data-theme','dark');
    await employee.screenshot({path:`build/acceptance/m3a/${info.project.name}/system-account.png`,fullPage:true});
    await employee.emulateMedia({colorScheme:'light'}); await expect(employee.locator('html')).toHaveAttribute('data-theme','light');
  } finally {await employeeContext.close();}
});

test('browser proof, replay, callback errors and unavailable provider', async ({page, browser, instance, idp}, info) => {
  test.setTimeout(60000);
  expect((await page.request.post(`${instance.url}/api/v1/install/complete`,{headers:{'X-Bootstrap-Token':instance.token},data:{profile:'web-platform',database:{driver:'sqlite',dsn:''},site_name:'Unicore',base_url:instance.url,admin_username:'admin',admin_email:'admin@example.test',admin_password:'test-password-strong'}})).status()).toBe(200);
  const boot=(await(await page.request.get(`${instance.url}/api/v1/bootstrap`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data;
  expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers:{'X-Unicore-Identity':'administrator','X-CSRF-Token':boot.csrf_token},data:{changes:[{key:'oidc.issuer',value:idp.url},{key:'oidc.client_id',value:'unicore-test-client'},{key:'oidc.client_secret',value:'isolated-test-secret'},{key:'oidc.enabled',value:'true'},{key:'oidc.jit_enabled',value:'true'}]}})).status()).toBe(200);
  const context=await browser.newContext({viewport:page.viewportSize()!,isMobile:info.project.name==='mobile',hasTouch:info.project.name==='mobile'});
  try {
    const guest=await context.newPage();await guest.goto(instance.url);
    let release:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve;});
    await guest.route('**/api/v1/auth/oidc/start',async route=>{await waiting;await route.continue();});
    await guest.getByRole('button',{name:'使用企业账号登录',exact:true}).click();await expect(guest.getByRole('button',{name:'使用企业账号登录',exact:true})).toBeDisabled();await capture(guest,info,'oidc-start-loading');release();
    await expect(guest.getByRole('heading',{name:'测试企业登录'})).toBeVisible();
    const auth=new URL(guest.url());auth.searchParams.set('approve','yes');
    const approved=await guest.request.get(auth.toString(),{maxRedirects:0});expect(approved.status()).toBe(303);
    const callback=approved.headers().location;
    const stranger=await browser.newContext({viewport:page.viewportSize()!,isMobile:info.project.name==='mobile',hasTouch:info.project.name==='mobile'});try {const other=await stranger.newPage();await other.goto(callback);await expect(other.getByRole('alert')).toContainText('企业身份验证未完成或已过期');await capture(other,info,'oidc-browser-proof-error');}finally{await stranger.close();}
    await guest.goto(callback);await expect(guest.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
    const session=(await(await guest.request.get(`${instance.url}/api/v1/bootstrap`)).json()).data;
    await guest.request.post(`${instance.url}/api/v1/auth/logout`,{headers:{'X-CSRF-Token':session.csrf_token},data:{}});
    await guest.goto(callback);await expect(guest.getByRole('alert')).toContainText('企业身份验证未完成或已过期');await capture(guest,info,'oidc-replay-error');
    await guest.getByRole('button',{name:'使用企业账号登录',exact:true}).click();await expect(guest.getByRole('heading',{name:'测试企业登录'})).toBeVisible();
    const invalid=new URL(guest.url());invalid.searchParams.set('approve','yes');invalid.searchParams.set('scenario','nonce');const rejected=await guest.request.get(invalid.toString(),{maxRedirects:0});await guest.goto(rejected.headers().location);await expect(guest.getByRole('alert')).toContainText('企业身份验证未完成或已过期');await capture(guest,info,'oidc-invalid-token');
    expect((await page.request.patch(`${instance.url}/api/v1/admin/settings`,{headers:{'X-Unicore-Identity':'administrator','X-CSRF-Token':boot.csrf_token},data:{changes:[{key:'oidc.issuer',value:'http://127.0.0.1:1'}]}})).status()).toBe(200);
    await guest.goto(instance.url);await guest.getByRole('button',{name:'使用企业账号登录',exact:true}).click();await expect(guest.getByRole('alert')).toContainText('暂时无法连接企业身份服务');await capture(guest,info,'oidc-provider-unavailable');
  }finally{await context.close();}
});
