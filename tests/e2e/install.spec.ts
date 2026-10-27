// Author: yunnuo <ymz@ebox.vip>
// Description: Real structured installation, explicit reset consent and durable restart on all three databases.
import { mkdir } from 'node:fs/promises';
import { test, expect } from './fixtures';

for (const driver of ['sqlite','mysql','postgres'] as const) test(`installer ${driver}: fields, test, consent and repeated restart`,async({page,instance},info)=>{
  test.setTimeout(60000);
  const databaseName=`${process.env.UNICORE_INSTALL_DATABASE_PREFIX??'unicore_ui'}_${info.project.name}`;
  const port=process.env[`UNICORE_INSTALL_${driver.toUpperCase()}_PORT`];
  test.skip(driver!=='sqlite'&&!port,'Requires a disposable installer database for each viewport.');
  const directory=`build/acceptance/install/${info.project.name}`;await mkdir(directory,{recursive:true});
  await page.goto(instance.url);await expect(page).toHaveURL(/\/install$/);
  await expect(page.getByLabel('服务访问地址',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'生成新凭据',exact:true})).toBeDisabled();
  expect((await page.request.post(`${instance.url}/api/v1/install/token/rotate`,{data:{}})).status()).toBe(403);
  await page.getByLabel('一次性安装凭据',{exact:true}).fill(instance.token);
  await page.getByRole('button',{name:'生成新凭据',exact:true}).click();await expect(page.getByText('新凭据已填入并保存到服务器 bootstrap.token，旧凭据已失效。',{exact:true})).toBeVisible();
  const token=await page.getByLabel('一次性安装凭据',{exact:true}).inputValue();expect(token).not.toBe(instance.token);
  expect((await page.request.post(`${instance.url}/api/v1/install/verify-db`,{headers:{'X-Bootstrap-Token':instance.token},data:{driver:'sqlite',dsn:''}})).status()).toBe(403);
  await page.getByLabel('站点名称',{exact:true}).fill(`安装验收 ${driver}`);
  await page.getByRole('button',{name:'下一步'}).click();await page.getByRole('radio',{name:/多用户平台/}).check();await page.getByRole('button',{name:'下一步'}).click();
  await expect(page.getByLabel('数据库类型')).toHaveValue('mysql');await expect(page.getByLabel('数据库地址',{exact:true})).toHaveValue('127.0.0.1');await expect(page.getByLabel('数据库端口',{exact:true})).toHaveValue('3306');await expect(page.getByLabel('数据库名',{exact:true})).toHaveValue('unicore');await expect(page.getByLabel('数据库用户名',{exact:true})).toHaveValue('root');
  await expect(page.getByRole('button',{name:'下一步'})).toBeDisabled();
  await page.getByLabel('数据库类型').selectOption(driver);
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
  await page.getByRole('button',{name:'下一步'}).click();await page.getByLabel('管理员账号').fill('admin');await page.getByLabel('管理员邮箱').fill('admin@example.test');await page.getByLabel('管理员密码').fill('Admin@123456');await page.getByRole('button',{name:'下一步'}).click();
  await page.getByRole('button',{name:'完成安装'}).click();await expect(page.getByRole('heading',{name:'安装完成',exact:true})).toBeVisible();await expect(page.getByText(`${instance.url}/`,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'进入工作空间'}).click();await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
  const before=(await(await page.request.get(`${instance.url}/api/v1/bootstrap`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data;
  for(let attempt=0;attempt<2;attempt++){
    await instance.restart();await page.reload();await expect(page.getByRole('heading',{name:'一份核心，无限可能.'})).toBeVisible();
    const current=(await(await page.request.get(`${instance.url}/api/v1/bootstrap`,{headers:{"X-Unicore-Identity":"administrator"}})).json()).data;expect(current.installed).toBe(true);expect(current.site_name).toBe(`安装验收 ${driver}`);expect(current.current_user.id).toBe(before.current_user.id);
    expect((await page.request.get(`${instance.url}/install`,{maxRedirects:0})).status()).toBe(303);
    expect((await page.request.post(`${instance.url}/api/v1/install/token/rotate`,{headers:{'X-Bootstrap-Token':token},data:{}})).status()).toBe(409);
  }
  await page.screenshot({path:`${directory}/${driver}-restarted.png`,fullPage:true});
  const storage=await page.evaluate(()=>JSON.stringify(localStorage));expect(storage).not.toContain(token);expect(storage).not.toContain(process.env.UNICORE_INSTALL_TEST_PASSWORD??'test-password-strong');
});
