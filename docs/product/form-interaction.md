<!-- Author: yunnuo <ymz@ebox.vip> -->
# 表单交互规范

适用于 Platform、Standalone Web 与 Desktop 的共享界面。组件按字段语义选择；组件库支持某类交互，不代表产品已经增加短信、住宿、地区资料或文件上传服务。CLI 不引入 UI。

## 控件与行为

| 场景 | 统一规则与入口 |
| --- | --- |
| 文本、邮箱、数值、多行输入 | `Input` / `Textarea` 提供真实的浮动 label：空值未聚焦时在框内，聚焦、有内容或浏览器自动填充时缩小移到上边框。label 始终存在，placeholder 只用于示例，不能作为唯一标签。`AppField` 自动传入 label、id 与校验关联；表格内编辑仍保留可访问标签。 |
| 六位验证码 | `AppOTPField` / `InputOTP` 显示六个方格，输入前进、Backspace 后退、选区替换与整段粘贴共用原生文本编辑。一个原生输入保留一个 Tab 停靠点，支持 `autocomplete="one-time-code"` 的浏览器/系统验证码建议；图形验证码传 `autoComplete="off"`，恢复码使用普通文本框。不能据此宣称已经提供短信发送或所有设备都会自动填充。 |
| 文件上传 | `FileUploadDialog` / `FileUploadDropzone` 使用虚线拖放区，提供点击选择与键盘入口，区内在选择前写明类型和单文件大小限制。每个文件显示名称、真实进度、状态及移除入口；暂停、放弃和删除沿用真实 SDK 生命周期。纯选择组件等待上传时进度为 0，不能用计时器制造上传进度；受控 `files` 的移除由宿主 `onRemove` 执行。 |
| 连续起止日期 | `DatePicker mode="range"`，起止之间连续高亮；完整区间检查两端及中间禁用日。手输/快捷区间同步可见月份，Apply 才提交，取消丢弃草稿。住宿等连续日期不拆成互不关联的两个选择器。 |
| 出生日期 | `BirthDatePicker` 使用年、月、日三列可滚动列表，保留键盘操作，切换年月时校正闰日与大小月，禁止越过宿主给定的 min/max；不自动新增用户出生日期存储。 |
| 价格等范围筛选 | `RangeSlider` 使用双端滑块，并提供同步数值输入；两端不能交叉。年龄、身高、端口、限额等精确值优先 `Input type="number"` / `NumberField`。单端 Slider 用于连续调节；需要精度时必须配同步输入。 |
| 大量候选项 | `Combobox` 输入过滤、匹配文字高亮，方向键移动、Enter 选取、Esc 关闭、清除回焦。结果通过 Portal 锚定在输入框下，限制高度并内部滚动，不能以内嵌卡片或列表挤动后续字段。服务端搜索由宿主 debounce/query 驱动；空关键词不请求和不列出全部用户，加载期间隐藏旧结果，选中值与搜索草稿分开。用户名等业务内容传 `translateOptions={false}`。 |
| 省市区等层级 | `Cascader` 选中一级后在相邻列展开下一级，切换父级清除旧后代；窄屏允许弹层内横向滚动，不能撑宽整页。末级选择才提交完整路径。 |
| 兴趣、技能等多值 | `TagInput` 按 Enter 提交标签，IME 确认不提交，标签提供独立删除按钮；空输入 Backspace 聚焦最后一个标签的删除按钮，重复/数量限制给出就地提示。后台字段仍由业务契约决定。 |
| 密码 | 真实密码输入默认提供眼睛按钮，切换后保留值与焦点；设置新密码时显示弱/中/强的分段强度条，由 danger/warning/success 令牌表达，文字同时说明状态。强度仅作本地填写建议，不能替代服务端密码规则。已存储密钥、安装凭据等秘密不按用户密码估分，传 `strength={false}`。 |
| 单值选项 | 表单候选少于 5 项平铺 RadioGroup，5 项起用下拉；大量或需要检索的项用 Combobox。`SimpleSelect` 默认按数量选择（少于 5、5–20、超过 20），宿主可用 `presentation="combobox"` 明确声明搜索语义。紧凑工具栏可显式保留下拉，不把菜单/操作按钮当作表单选项机械替换。布尔值仍用 Switch 或 Checkbox。 |
| 校验与帮助 | 默认失焦校验，提交检查所有适用字段；修改时不逐键新增错误，服务端返回错误立即映射并聚焦。未修改字段的服务端错误不能被失焦清除，避免下方链接在点击过程中跳动；修改该字段后清除旧服务端错误，下次失焦继续本地校验。错误紧贴对应控件下方，说明修改方式；帮助文字常驻其下，写实际长度、格式、单位或保留值规则，输入后不能消失，不用 tooltip/placeholder 代替。两者同时通过 `aria-describedby` 关联。 |
| 必填与选填 | 少量必填字段在 label 后加 danger 色星号，星号不参与可访问名称；大部分字段必填时只标“选填”。`AppForm` 从契约/defaultValues 推导默认方式，条件式/多步骤表单可显式 `requiredMode="optional"`，字段按契约、rules/native required 或显式 required 判断，不能把可选业务字段误标必填。 |

## 接线方式

```tsx
const form = useAppForm({ schema: 'UserCreate', defaultValues, onSubmit });
<AppForm form={form} requiredMode="optional">
  <AppField name="username" label={t('账号')} hint={t('用作登录，创建后不可修改。')}>
    <Input required minLength={3} maxLength={64} autoComplete="username" />
  </AppField>
  <AppField name="password" label={t('初始密码')}>
    <Input type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
  </AppField>
</AppForm>
```

非原生控件使用 `AppControllerField`，把 id/name/ref/onBlur/aria 属性接到真实控件；验证码优先 `AppOTPField`。自定义搜索选择器仍组合共享 `Combobox`，不复制第二套结果面板。文本框宽度由字段含义和父布局决定：端口等短数值限宽，实体编辑和设置分组保留适当最大宽度，移动端不溢出。

## 验证

共享层测试粘贴、删除、IME、失焦、禁用、受控更新、异步搜索旧结果、区间边界与闰日。真实业务页面验证初始焦点、选择与清除后的依赖字段、提交/取消、权限拒绝，以及中英文、明暗和 375px。搜索浮层打开前后，后续字段的位置应保持不变；文件进度必须来自确认字节。截图/trace 放 build/ 或测试产物，不能进源码文档。
