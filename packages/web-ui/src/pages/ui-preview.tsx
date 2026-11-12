// Author: yunnuo <ymz@ebox.vip>
// Description: Dev-only component catalog: every @unicore/ui primitive and composite on one page.
// Registered behind import.meta.env.DEV, so production builds never ship the route or this module.
import { useState } from 'react';
import { Activity, Braces, Download, Globe2, Layers3, Monitor, NotebookPen, Plus, Settings2, UserPlus } from 'lucide-react';
import {
  Alert, Avatar, Badge, Breadcrumb, BreadcrumbItem, BreadcrumbSeparator, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
  Checkbox, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Drawer, DrawerContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  EmptyState, Input, Kbd, Label, Modal, NativeSelect, PageHeader, Popover, PopoverContent, PopoverTrigger, Progress, RadioGroup, RadioGroupItem, Separator, SimpleSelect, Skeleton,
  StatCard, Switch, Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, Tabs, Textarea, Tooltip, useMessage,
} from '@unicore/ui';
import { defineMessages, t, useLocale } from '../i18n';
import type { PageProps } from '../router';

const SELECT_OPTIONS = defineMessages([
  { value: 'one', label: '选项一' },
  { value: 'two', label: '选项二' },
  { value: 'three', label: '选项三' },
] as const);

export function UiPreviewPage(_: PageProps) {
  useLocale();
  const message = useMessage();
  const [dialog, setDialog] = useState(false);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [radio, setRadio] = useState('one');
  const [tab, setTab] = useState('overview');
  const [select, setSelect] = useState('one');
  const [checked, setChecked] = useState(true);
  const [switched, setSwitched] = useState(false);
  return <div className="flex flex-col gap-8">
    <PageHeader title={t('组件预览')} description={t('开发环境专用：枚举全部原语与复合组件，自检双主题与双语。')} />

    <section className="flex flex-col gap-3" aria-label={t('按钮')}>
      <PageHeader title={t('按钮')} />
      <div className="flex flex-wrap items-center gap-2">
        <Button>{t('主要')}</Button>
        <Button variant="secondary">{t('次要')}</Button>
        <Button variant="ghost">{t('幽灵')}</Button>
        <Button variant="danger">{t('危险')}</Button>
        <Button variant="dangerSoft">{t('软危险')}</Button>
        <Button variant="link">{t('链接')}</Button>
        <Button pending>{t('等待中')}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm">{t('小')}</Button>
        <Button size="md">{t('中')}</Button>
        <Button size="lg">{t('大')}</Button>
        <Button size="icon" aria-label={t('设置')}><Settings2 size={15} /></Button>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('徽章')}>
      <PageHeader title={t('徽章')} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{t('次要')}</Badge>
        <Badge variant="primary">{t('主要')}</Badge>
        <Badge variant="success">{t('已启用')}</Badge>
        <Badge variant="danger">{t('已禁用')}</Badge>
        <Badge variant="warning">{t('等待中')}</Badge>
        <Badge variant="info">{t('日志')}</Badge>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('输入控件')}>
      <PageHeader title={t('输入控件')} />
      <div className="grid max-w-xl gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preview-input">{t('账号')}</Label>
          <Input id="preview-input" placeholder={t('占位文本')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preview-input-error">{t('邮箱')}</Label>
          <Input id="preview-input-error" defaultValue="not-an-email" aria-invalid />
          <p role="alert" className="text-xs text-danger">{t('出错提示文案')}</p>
        </div>
        <Textarea aria-label={t('占位文本')} placeholder={t('占位文本')} />
        <NativeSelect aria-label={t('状态')} defaultValue="">
          <option value="">{t('状态')}</option>
          <option value="on">{t('已开启')}</option>
          <option value="off">{t('已关闭')}</option>
        </NativeSelect>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('选择与开关')}>
      <PageHeader title={t('选择与开关')} />
      <div className="flex max-w-xl flex-wrap items-center gap-4">
        <SimpleSelect label={t('状态')} value={select} onChange={setSelect} className="w-40" options={SELECT_OPTIONS} />
        <Checkbox checked={checked} onChange={setChecked}>{t('选项一')}</Checkbox>
        <Switch checked={switched} onChange={setSwitched} />
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('选项卡')}>
      <PageHeader title={t('选项卡')} />
      <Tabs id="preview-tabs" label={t('选项卡')} value={tab} onChange={setTab}
        items={[{ id: 'overview', label: t('概览') }, { id: 'details', label: t('明细') }, { id: 'logs', label: t('日志') }]} />
    </section>

    <section className="flex flex-col gap-3" aria-label={t('浮层')}>
      <PageHeader title={t('浮层')} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setDialog(true)}>{t('打开对话框')}</Button>
        <Button variant="secondary" onClick={() => setModal(true)}>{t('打开模态框')}</Button>
        <Button variant="dangerSoft" onClick={() => setConfirm(true)}>{t('打开确认框')}</Button>
      </div>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('对话框标题')}</DialogTitle>
            <DialogDescription>{t('对话框正文文案，用于检查排版与按钮顺序。')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(false)}>{t('取消')}</Button>
            <Button onClick={() => setDialog(false)}>{t('保存')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {modal && <Modal title={t('模态框标题')} onClose={() => setModal(false)}>
        <p className="text-sm text-muted">{t('对话框正文文案，用于检查排版与按钮顺序。')}</p>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setModal(false)}>{t('取消')}</Button>
          <Button onClick={() => { message.success(t('操作成功')); setModal(false); }}>{t('保存')}</Button>
        </DialogFooter>
      </Modal>}
      {confirm && <ConfirmDialog title={t('确认删除这条记录？')} description={t('此操作不可撤销。')} confirmLabel={t('确认删除')} cancelLabel={t('取消')}
        danger pending={false} onConfirm={() => { message.error(t('操作失败')); setConfirm(false); }} onCancel={() => setConfirm(false)} />}
    </section>

    <section className="flex flex-col gap-3" aria-label={t('菜单')}>
      <PageHeader title={t('菜单')} />
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="secondary">{t('打开菜单')}</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{t('操作')}</DropdownMenuLabel>
            <DropdownMenuItem><UserPlus size={14} />{t('导入用户')}</DropdownMenuItem>
            <DropdownMenuItem><Plus size={14} />{t('新建笔记')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger">{t('删除')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('表格')}>
      <PageHeader title={t('表格')} />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>{t('账号')}</TableHead><TableHead>{t('邮箱')}</TableHead><TableHead>{t('状态')}</TableHead><TableHead className="text-end">{t('操作')}</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow><TableCell><span className="font-medium text-ink">unicorn</span></TableCell><TableCell>unicorn@example.com</TableCell><TableCell><Badge variant="success">{t('已启用')}</Badge></TableCell><TableCell className="text-end"><Button variant="link" size="sm">{t('编辑')}</Button></TableCell></TableRow>
            <TableEmpty colSpan={4}>{t('暂无数据')}</TableEmpty>
          </TableBody>
        </Table>
      </CardContent></Card>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('提示')}>
      <PageHeader title={t('提示')} />
      <div><Tooltip label={t('提示文案')}><Button variant="secondary">{t('悬停查看提示')}</Button></Tooltip></div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('统计卡')}>
      <PageHeader title={t('统计卡')} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('当前运行形态')} value={t('Web 平台')} detail="web-platform" icon={Globe2} />
        <StatCard label={t('核心服务')} value={t('运行正常')} detail={t('共享用例已就绪')} icon={Activity} tone="success" />
        <StatCard label={t('连接方式')} value="HTTP API" detail="/api/v1" icon={Braces} />
        <StatCard label={t('框架版本')} value="v0.1.4" detail="development" icon={Layers3} />
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('空状态')}>
      <PageHeader title={t('空状态')} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card><EmptyState icon={Monitor} title={t('对话框标题')} description={t('占位文本')} /></Card>
        <Card><EmptyState icon={NotebookPen} title={t('暂无数据')} description={t('此操作不可撤销。')} action={<Button variant="secondary"><NotebookPen size={15} />{t('新建笔记')}</Button>} /></Card>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('卡片与页头')}>
      <PageHeader title={t('卡片与页头')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('对话框标题')}</CardTitle>
          <CardDescription>{t('对话框正文文案，用于检查排版与按钮顺序。')}</CardDescription>
        </CardHeader>
        <CardContent>{t('占位文本')}</CardContent>
        <CardFooter><Button size="sm" variant="secondary">{t('下载导入模板')}</Button><Button size="sm">{t('保存')}</Button></CardFooter>
      </Card>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('结构件')}>
      <PageHeader title={t('结构件')} />
      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar initials="UC" />
          <Avatar initials="UN" />
        </div>
        <Progress value={66} aria-label={t('进度')} />
        <div className="flex flex-col gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/3" /></div>
        <Separator />
        <p className="text-sm text-muted">{t('占位文本')}</p>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('消息')}>
      <PageHeader title={t('消息')} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => message.success(t('操作成功'))}>{t('触发成功消息')}</Button>
        <Button variant="dangerSoft" onClick={() => message.error(t('操作失败'))}>{t('触发错误消息')}</Button>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('页头与操作')}>
      <PageHeader title={t('页头与操作')} description={t('对话框正文文案，用于检查排版与按钮顺序。')}
        actions={<><Button size="sm" variant="secondary"><Download size={14} />{t('下载导入模板')}</Button><Button size="sm"><UserPlus size={14} />{t('导入用户')}</Button></>} />
    </section>

    <section className="flex flex-col gap-3" aria-label={t('警告横幅')}>
      <PageHeader title={t('警告横幅')} />
      <div className="flex flex-col gap-2">
        <Alert variant="danger" title={t('保存失败')}>{t('网络超时，请重试。')}</Alert>
        <Alert variant="warning">{t('此操作不可撤销。')}</Alert>
        <Alert variant="info">{t('对话框正文文案，用于检查排版与按钮顺序。')}</Alert>
        <Alert variant="success" action={<Button size="sm" variant="secondary">{t('重试')}</Button>}>{t('操作成功')}</Alert>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('抽屉')}>
      <PageHeader title={t('抽屉')} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setDrawer(true)}>{t('打开抽屉')}</Button>
      </div>
      {drawer && <Drawer open onOpenChange={setDrawer}>
        <DrawerContent title={t('面板标题')}>
          <p className="text-sm text-muted">{t('对话框正文文案，用于检查排版与按钮顺序。')}</p>
        </DrawerContent>
      </Drawer>}
    </section>

    <section className="flex flex-col gap-3" aria-label={t('气泡')}>
      <PageHeader title={t('气泡')} />
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild><Button variant="secondary">{t('打开气泡')}</Button></PopoverTrigger>
          <PopoverContent>{t('对话框正文文案，用于检查排版与按钮顺序。')}</PopoverContent>
        </Popover>
        <span className="flex items-center gap-1.5 text-sm text-muted">{t('快捷键')}<Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        <Breadcrumb>
          <BreadcrumbItem>{t('工作空间')}</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem current>{t('面包屑')}</BreadcrumbItem>
        </Breadcrumb>
      </div>
    </section>

    <section className="flex flex-col gap-3" aria-label={t('单选组')}>
      <PageHeader title={t('单选组')} />
      <RadioGroup label={t('单选组')} value={radio} onValueChange={setRadio}>
        <RadioGroupItem value="one" itemLabel={t('选项一')}>{t('选项一')}</RadioGroupItem>
        <RadioGroupItem value="two" itemLabel={t('选项二')}>{t('选项二')}</RadioGroupItem>
        <RadioGroupItem value="three" itemLabel={t('选项三')}>{t('选项三')}</RadioGroupItem>
      </RadioGroup>
    </section>
  </div>;
}
