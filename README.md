# @jinngoo/dsh-transcript-view-dock

DSH Web UI 插件：**把「设置 → 通用设置 → 工作步骤展示」搬到输入框下方那行 dock 的最左侧**——
一个紧凑按钮显示当前档位，点开就是同样的四档（简洁 / 标准 / 详细 / 完全展开），随时切换，
不必再翻进设置里点两层。
Pins the Work details switcher under the composer so Compact / Standard / Detailed / Verbose are one click away.

## 它做什么

- 在 `conversation.composer.dock`（输入框卡片下方那行，「内容宽度」滑杆所在的那一行）注册一个条目，
  `order: -1`，因此排在 `activity` / `usage` 徽标和宽度滑杆之前——就是这一行的**最左侧**。
- 按钮形如 `≡ 详细 ▾`（14px 步骤图标 + 当前档位 + 下拉箭头）：点开向上弹出菜单，菜单里是四档 + 主题名/说明，
  当前档位打勾（`role="menuitemradio"` + `aria-checked`）。「工作步骤展示」这个完整名称在
  `aria-label` 与悬停 `title` 里，所以按钮不必占宽度显示整句。
- 外观对齐宿主自己的 dock 条目规范（`ui-chat` 的耗时/用量胶囊、`ui-conversation` 的上下文计量）：
  透明底、`--dsw-alias-label-tertiary`、悬停才出 `--dsw-alias-interactive-bg-hover`、
  `--dsw-radius-sm`、`--dsh-content-font-size-secondary` 字号、等宽数字；弹层用宿主 popover 皮肤
  （`--dsw-specific-menu` 兜底 overlay + `--dsw-elevation-prominent` + `--dsw-radius-lg`）。
- 点选即写 Host 设置 `ui-chat.transcriptView`，会话里的显示立刻变化（Chat 读的是同一个 Host 设置段）。
- **设置页原来的那一行保持不动**：本插件只是给同一个偏好加了随身入口，没有搬走或隐藏它。

## 安装

```
dsh plugin --profile web add E:\Work\Git\deepseek-plugin\dsh-transcript-view-dock
```

或在 DSH 会话里用 `plugin_manager`，`action: install_bundle`、`target` 用上面的绝对目录。
装完刷新页面（新的 Client 包需要重新加载 Web 资产）。卸载：

```
dsh plugin --profile web remove @jinngoo/dsh-transcript-view-dock
```

## 机制（为什么这么写）

### 值走 ui-chat 的 Host 设置段，不另存一份

`ctx.configForms.get('ui-chat')` 是 Client 侧公共 Service，按命名空间共享**同一个** `ConfigForm`
实例。所以本控件和设置页那一行：

- 共用一个写队列与同一套 revision 栅栏（`ConfigForm.mutate` 内部串行 + 最新 revision），
  两边同时改不会互相覆盖；
- 宿主拒绝写入时会由同一个实例自动回读，本控件跟着回退；
- 外部改动（设置页、onboarding 写同一段）会通过 `subscribe` 到达本控件，按钮上的档位自动跟随。

取值规则与 ui-chat 的 `TranscriptViewPolicy` 对齐：

| 保存值 | 显示 |
|---|---|
| `compact` / `standard` / `detailed` / `verbose` | 原样 |
| `normal`、`expanded`（旧世代） | 读作 `detailed`，且**不再写回** |
| 缺失 / 认不出来 | Web 默认 `detailed`；桌面默认 `standard`（`'dshDesktop' in globalThis`） |

### 只在 Host 真的服务 `ui-chat` 时出现

注册走 `ctx.configForms.whileServed(['ui-chat'], …)`：命名空间没有被服务（例如换了组合、ui-chat 被禁用）
时本控件不会挂出来——没有可写的地方，就不该有一个点了没反应的按钮。

### 只读与失败

- 「设置」文档不可写（`ConfigFormSnapshot.writable === false`）时按钮 `disabled`，`title` 说明原因。
- 点选先做一次乐观更新，`form.set()` 返回 `false`（宿主拒绝）或 reject（传输失败）时回退到宿主现值。

### 不碰宿主 DOM / 样式

按钮、菜单、图标都是自带元素，颜色只用 `--dsw-alias-*` / `--dsw-elevation-*` 主题 token；
不读宿主选择器，宿主改版最多掉样式，不会崩渲染。

## 边界与取舍

- 只常驻**会话内**：`conversation.composer.dock` 只在有会话的 composer 里渲染，落地页（Hero）没有这一行，
  所以在「新会话」页面上看不到它——那里的设置页入口照旧可用。
- 菜单向上弹出，会盖住一点输入框卡片；这是 popover 的正常行为。
- 宿主若把 `ui-chat` 的字段名 `transcriptView` 改掉，本插件会读不到值并回落到默认档，
  写入也会被宿主 schema 拒绝（不会崩）；改 `client.js` 顶部的 `SETTINGS_FIELD` 即可。
- 旧值 `normal` / `expanded` 只做读映射，不写回；界面不会提供这两个档位。

## 验证

已做（0.1.0）：

- `plugin_manager install_bundle` → `application: applied`，无 `warnings`。
- 安装后**当前已连接页面**里立即出现该登记项（无需重启 Host）：
  `conversation.composer.dock` 的 occupants = `transcript-view(order:-1)`、`activity(0)`、`usage(1)`、
  `conversation-width(10)`，`active: true`。
- `tests/client-render.check.mjs`：用真实 `client.js` + 真 React 做 SSR 与状态机检查，29 项全部通过——
  模块 id、槽位/id/order、默认渲染（图标 + `详细`、`aria-label`/`title` 完整语义、菜单收起）、
  点选写入 `ui-chat.transcriptView`、外部改动跟随、旧值映射、拒绝/失败回退、不可写时 disabled。
- 未做：视觉与真实点击的浏览器截图验证（本会话没有浏览器控制），需要人眼确认一次。

## 变更记录

### 0.1.1

- **外观改为与宿主 dock 条目同一套规范**（`ui-chat` 的 `StatsPills.module.css` / `ui-conversation` 的
  `ContextMeter.module.css`）：透明底、`label-tertiary`、悬停才出 `interactive-bg-hover`、
  `--dsw-radius-sm`、`--dsh-content-font-size-secondary` 字号、行高 `calc(20px + delta)`、`tabular-nums`。
- **按钮结构收敛为「图标 + 当前值 + 箭头」**：新增 14px 步骤图标，去掉可见的「步骤展示」文字
  （完整名称进 `aria-label` / `title`）；弹层皮肤对齐宿主 popover（`--dsw-specific-menu` 兜底 overlay、
  `--dsw-menu-backdrop-filter`、`--dsw-elevation-prominent`、`--dsw-radius-lg`），菜单项圆角改 `--dsw-radius-sm`。
- **未改**：设置读写路径（`ui-chat.transcriptView` 共享 `ConfigForm`）、旧值映射、失败回退、
  只在 `ui-chat` 被服务时挂出、`order: -1` 的位置。

### 0.1.0

- 首个版本：dock 最左侧的「工作步骤展示」快捷切换（紧凑按钮 + 四档菜单），读写 `ui-chat.transcriptView`。
