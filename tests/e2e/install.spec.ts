// Author: yunnuo <ymz@ebox.vip>
// Description: Real structured installation, explicit reset consent and durable restart on all three databases.
import { mkdir } from 'node:fs/promises';
import { test, expect } from './fixtures';

const DATABASE_LABELS = { mysql: 'MySQL · 在线部署推荐', postgres: 'PostgreSQL · 在线部署推荐', sqlite: 'SQLite · 本机或小型测试' } as const;

test('owner unlock: protected reinstallation, explicit consent and automatic relock', async ({ page, instance }) => {
  const initial = { profile: 'web-platform', database: { driver: 'sqlite', dsn: '' }, site_name: 'Original site', base_url: instance.url, admin_username: 'oldadmin', admin_email: 'old@example.test', admin_password: 'Admin@123456' };
  expect((await instance.request.post('/api/v1/install/complete', { headers: { 'X-Bootstrap-Token': instance.token }, data: initial })).status()).toBe(200);
  expect((await page.request.get(`${instance.url}/install`, { maxRedirects: 0 })).status()).toBe(303);
  const token = await instance.unlockForReinstall();
  expect(token).not.toBe(instance.token);
  expect((await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': instance.token }, data: initial })).status()).toBe(403);
  await page.goto(`${instance.url}/install`);
  await page.getByLabel('一次性安装凭据', { exact: true }).fill(token);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('combobox', { name: '数据库类型' }).click();await page.getByRole('option', { name: DATABASE_LABELS.sqlite, exact: true }).click();
  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText('已识别为本站原数据库。重新安装会删除原账号、设置和业务数据，不会保留原站内容。')).toBeVisible();
  await expect(page.getByRole('button', { name: '下一步' })).toBeDisabled();
  expect((await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': token }, data: initial })).status()).toBe(409);
  await page.getByLabel('我已备份，确认清空目标数据库并初始化').check();
  await page.getByLabel('输入数据库名确认').fill('wrong');
  await expect(page.getByRole('button', { name: '下一步' })).toBeDisabled();
  await page.getByLabel('输入数据库名确认').fill('unicore.db');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('站点名称', { exact: true }).fill('Replacement site');
  await page.getByLabel('管理员账号').fill('newadmin');
  await page.getByLabel('管理员邮箱').fill('new@example.test');
  await page.getByLabel('管理员密码', { exact: true }).fill('Admin@123456');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '完成安装' }).click();
  await expect(page.getByRole('heading', { name: '安装完成', exact: true })).toBeVisible();
  await instance.restart();
  expect((await page.request.get(`${instance.url}/install`, { maxRedirects: 0 })).status()).toBe(303);
  expect((await page.request.post(`${instance.url}/api/v1/install/complete`, { headers: { 'X-Bootstrap-Token': token }, data: initial })).status()).toBe(409);
  const serialized = await page.evaluate(() => JSON.stringify(localStorage));
  expect(serialized).not.toContain(token);
});

test('installer centers variable steps and keeps standalone an explicit choice', async ({ page, instance }, info) => {
  const directory = `build/acceptance/public-entry/${info.project.name}`;
  await mkdir(directory, { recursive: true });
  await page.goto(instance.url);
  const progress = page.getByRole('navigation', { name: '安装步骤', exact: true });
  await expect(progress.getByRole('listitem')).toHaveCount(5);
  const assertCentered = async () => {
    const box = await progress.getByRole('list').boundingBox();
    const items = progress.getByRole('listitem');
    const first = (await items.first().boundingBox())!;
    const last = (await items.last().boundingBox())!;
    expect(Math.abs((first.x + first.width / 2 - box!.x) - (box!.x + box!.width - last.x - last.width / 2))).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await assertCentered();
  await page.getByLabel('一次性安装凭据', { exact: true }).fill(instance.token);
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('radio', { name: /多用户平台/ })).toBeChecked();
  await page.screenshot({ path: `${directory}/install-platform.png`, fullPage: true });
  await page.getByRole('radio', { name: /单机模式/ }).check();
  await expect(progress.getByRole('listitem')).toHaveCount(4);
  await assertCentered();
  await page.screenshot({ path: `${directory}/install-standalone.png`, fullPage: true });
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await page.screenshot({ path: `${directory}/install-en-dark.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Change language', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '中文', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  const port = (await page.getByLabel('数据库端口', { exact: true }).boundingBox())!;
  expect(port.width).toBeLessThanOrEqual(160);
  await page.getByRole('combobox', { name: '数据库类型' }).click();await page.getByRole('option', { name: DATABASE_LABELS.sqlite, exact: true }).click();
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await expect(page.getByText('连接测试成功', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: '确认安装', exact: true })).toBeVisible();
  await expect(page.getByLabel('管理员账号', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '完成安装', exact: true }).click();
  await expect(page.getByRole('heading', { name: '安装完成', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '进入工作空间', exact: true }).click();
  await expect(page.getByRole('heading', { name: '工作台概览', exact: true })).toBeVisible();
});

for (const driver of ['sqlite','mysql','postgres'] as const) test(`installer ${driver}: fields, test, consent and repeated restart`,async({page,instance},info)=>{
  test.setTimeout(60000);
  const databaseName=`${process.env.UNICORE_INSTALL_DATABASE_PREFIX??'unicore_ui'}_${info.project.name}`;
  const port=process.env[`UNICORE_INSTALL_${driver.toUpperCase()}_PORT`];
  test.skip(driver!=='sqlite'&&!port,'Requires a disposable installer database for each viewport.');
  const directory=`build/acceptance/install/${info.project.name}`;await mkdir(directory,{recursive:true});
  await page.goto(instance.url);await expect(page).toHaveURL(/\/install$/);
  await expect(page.getByLabel('服务访问地址',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'生成新凭据',exact:true})).toHaveCount(0);
  expect((await page.request.post(`${instance.url}/api/v1/install/token/rotate`,{data:{}})).status()).toBe(404);
  await page.getByLabel('一次性安装凭据',{exact:true}).fill(instance.token);
  const wrong='x'.repeat(40);
  expect((await page.request.post(`${instance.url}/api/v1/install/verify-db`,{headers:{'X-Bootstrap-Token':wrong},data:{driver:'sqlite',dsn:''}})).status()).toBe(403);
  await page.getByRole('button',{name:'下一步'}).click();await page.getByRole('radio',{name:/多用户平台/}).check();await page.getByRole('button',{name:'下一步'}).click();
  const databaseType=page.getByRole('combobox',{name:'数据库类型'});
  await expect(databaseType).toHaveTextContent(DATABASE_LABELS.mysql);await expect(page.getByLabel('数据库地址',{exact:true})).toHaveValue('127.0.0.1');await expect(page.getByLabel('数据库端口',{exact:true})).toHaveValue('3306');await expect(page.getByLabel('数据库名',{exact:true})).toHaveValue('unicore');await expect(page.getByLabel('数据库用户名',{exact:true})).toHaveValue('root');
  await expect(page.getByRole('button',{name:'下一步'})).toBeDisabled();
  await databaseType.click();await page.getByRole('option',{name:DATABASE_LABELS[driver],exact:true}).click();
  if(driver!=='sqlite'){
    if(driver==='postgres'){await expect(page.getByLabel('数据库端口',{exact:true})).toHaveValue('5432');await expect(page.getByLabel('数据库用户名',{exact:true})).toHaveValue('postgres');}
    await page.getByLabel('数据库端口',{exact:true}).fill(port!);await page.getByLabel('数据库名',{exact:true}).fill(databaseName);await page.getByLabel('数据库密码',{exact:true}).fill('wrong-password');
    await page.getByRole('button',{name:'测试连接'}).click();await expect(page.getByRole('alert')).toContainText('无法连接');await expect(page.getByRole('button',{name:'下一步'})).toBeDisabled();
    await page.getByLabel('数据库密码',{exact:true}).fill(process.env.UNICORE_INSTALL_TEST_PASSWORD!);
  }
  await page.getByRole('button',{name:'测试连接'}).click();await expect(page.getByText('连接测试成功',{exact:true})).toBeVisible();
  if(driver!=='sqlite'){
    await expect(page.getByText('检测到 2 个表或视图。完成安装将删除这些对象及其数据，此操作无法撤销；请先备份。',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'下一步'})).toBeDisabled();
    await page.getByLabel('我已备份，确认清空目标数据库并初始化').check();await page.getByLabel('输入数据库名确认').fill('wrong');await expect(page.getByRole('button',{name:'下一步'})).toBeDisabled();
    await page.getByLabel('输入数据库名确认').fill(databaseName);
  }
  await page.screenshot({path:`${directory}/${driver}-database.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'下一步'}).click();await page.getByLabel('站点名称',{exact:true}).fill(`安装验收 ${driver}`);await page.getByLabel('管理员账号').fill('admin');await page.getByLabel('管理员邮箱').fill('admin@example.test');await page.getByLabel('管理员密码',{exact:true}).fill('Admin@123456');await page.getByRole('button',{name:'下一步'}).click();
  await page.getByRole('button',{name:'完成安装'}).click();await expect(page.getByRole('heading',{name:'安装完成',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:`${instance.url}/`,exact:true})).toHaveAttribute('href',`${instance.url}/`);await expect(page.getByRole('link',{name:`${instance.url}/admin`,exact:true})).toHaveAttribute('href',`${instance.url}/admin`);
  await page.getByRole('button',{name:'进入工作空间'}).click();await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
  const before=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`,{headers:{}})).json()).data;
  for(let attempt=0;attempt<2;attempt++){
    await instance.restart();await page.reload();await expect(page.getByRole('heading',{name:'工作台概览'})).toBeVisible();
    const current=(await(await page.request.get(`${instance.url}/api/v1/admin/bootstrap`,{headers:{}})).json()).data;expect(current.installed).toBe(true);expect(current.site_name).toBe(`安装验收 ${driver}`);expect(current.current_user.id).toBe(before.current_user.id);
    expect((await page.request.get(`${instance.url}/install`,{maxRedirects:0})).status()).toBe(303);
    expect((await page.request.post(`${instance.url}/api/v1/install/verify-db`,{headers:{'X-Bootstrap-Token':instance.token},data:{driver:'sqlite',dsn:''}})).status()).toBe(409);
  }
  await page.screenshot({path:`${directory}/${driver}-restarted.png`,fullPage:true});
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));expect(storage).not.toContain(instance.token);expect(storage).not.toContain(process.env.UNICORE_INSTALL_TEST_PASSWORD??'test-password-strong');
});
