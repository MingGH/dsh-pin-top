# dsh-pin-top — 侧边栏置顶会话 + macOS 式颜色标签 + 定位/收起/展开

一个 DSH（DeepSeek Harness）桌面端插件，做三件事：

1. **置顶会话进侧边栏**：被置顶的会话直接排在左侧边栏顶部，每会话一行，**点一下就打开**；
2. **macOS 式颜色标签**：右键任意会话 → 选一个颜色 → 它自动置顶到最上面，行底色与圆点跟着变色；
3. **工作区标题栏三个按钮**：定位到当前会话、全部收起、全部展开。

三块功能互不依赖：缺任意一个服务时只降级该块，不影响其它块，也绝不会让宿主启动失败。

- 目录：[它长什么样](#它长什么样) · [一次点击打开](#一次点击打开不是置顶页) · [颜色标签](#颜色标签右键) ·
  [定位与收起展开](#定位全部收起与全部展开) · [状态](#置顶行的会话状态) · [调参](#调参tuning) ·
  [结构](#结构加座位与一处注入) · [存储](#颜色标签存哪) · [安装](#安装与生效) · [验证](#验证) · [边界](#已知边界)

## 它长什么样

```
⊕ 新会话
◇ 插件
🕐 自动化任务
置顶                          ← 分区小标题（11px，不可点）
● 前端UI设计优化与问题分析                       ← 空闲：行首画该会话的颜色圆点
 ◐ 两个项目从 master 新建分支                    ← 忙碌：行首换成宿主同款状态指示
● 插件实现置顶对话侧边栏        〔图钉〕          ← 行尾常驻「取消置顶」，静息时与宿主置顶徽标同形
⋯ 更多                        ← shell 固定渲染在面板列表最后一行
─────────────────────────
工作区                    ◎ ⤓⤒ ⤒⤓  🔍  ⚙  ＋   ← 本插件注入的三个按钮
├ deepseek-harness
└ qeeq-and-zcc  ● 检查工作区是否干净       ● 1天   ← 内置树照旧，只在时间左边多一颗颜色圆点
```

![侧边栏置顶区实拍](docs/screenshots/pinned-section.png)

实拍：分区小标题「置顶」、每会话一行的置顶区（行尾为「取消置顶」图钉）、「更多」行，
以及工作区标题栏右侧本插件注入的三个按钮（定位 / 全部收起 / 全部展开）。

- 每个置顶会话一行：行首状态/颜色、标题、行尾「取消置顶」。
- 行底色跟着标签颜色走（同色 14% 混合，悬停 24%）；没有标签的置顶行用品牌色淡底。
- 顺序即 Host 的置顶顺序（最近置顶在前）；置顶 / 取消置顶 / 重命名 / 归档后自动增删更新，不需要刷新。
- 默认排在「插件 / 自动化任务」之后；**「更多」是 shell 硬编码的最后一行，无法被超越**，想更靠上就改 `TUNING.order`。

## 一次点击打开（不是置顶页）

第一版做的是「置顶」导航行 + 主区域聚合页，实际用起来是**两次点击**，比直接在列表里点还慢。现在改成每个置顶会话直接占侧边栏一行：

| 槽位 | 注册 | 作用 |
| --- | --- | --- |
| `sidebar.panellist`（list） | id `pin-session:<sessionId>` | 一行，label 是 thunk（改名/换语言自动重读） |
| `main`（keyed） | key 与行 id 相同 | 桥接面板：挂载时在 **layout effect** 里 `openSession(id)`，再 `selectPanel(null)` 回到会话 |

点击路径：点行 → shell 选中 `pin-session:<id>` 面板 → 桥接面板在**同一次提交、绘制之前**打开会话并清空面板键 →
直接落在会话视图。没有中转页，也没有可见空白帧；桥接面板渲染 `null`。

## 颜色标签（右键）

右键**任意会话行**（工作区树里的，或本插件置顶区里的）→ 菜单里出现 **「标签颜色 ▸」**：

```
置顶会话 / 取消置顶
重命名…            （以上是宿主原有动作）
分支…
标签颜色 ▸
   无颜色                  ← 清色比选色常用，排第一行
   ──────────
   ✓ 红色
   橙色 黄色 绿色 蓝色 紫色 灰色
复制会话 ID
归档会话
```

![右键菜单：标签颜色](docs/screenshots/color-menu.png)

选择标签颜色：右键会话 →「标签颜色 ▸」，子菜单第一行是「无颜色」，其后是七种 macOS 系统色。

![选色后的置顶行](docs/screenshots/color-picked.png)

选色后的效果：置顶行行首换成该色圆点、行底色同色淡染，行尾仍是「取消置顶」图钉。

- **七种 macOS 系统色**：红 `#FF3B30`、橙 `#FF9500`、黄 `#FFCC00`、绿 `#34C759`、蓝 `#007AFF`、紫 `#AF52DE`、灰 `#8E8E93`，
  深色主题自动换 dark 变体。每个会话最多一种颜色，当前颜色前面带 `✓`。
- **选色即置顶**：选颜色会 `uiWorkspace.pinSession` 把它顶到最上面；已经是置顶的不重复 pin。
  **「无颜色」只清颜色、不动置顶**；行内「取消置顶」只取消置顶、不删颜色（位置和标签是两件事）。
- 颜色显示在两处：本插件置顶区的**行底色 + 行首圆点**，以及内置会话行**时间左侧的 8px 圆点**
  （悬停该行时圆点让位给操作按钮，与宿主自己的 `…`/置顶图标一致）。
- 两个圆点都加了 1px 内描边（混入主文字色），所以浅色主题下的黄色也不会糊在背景里。
- **菜单位置、键盘导航、焦点归还、Esc、子菜单**全部是宿主 `ctx.contextMenus` 的原生行为，插件只贡献一个子菜单。
- 打开它的两条路：内置会话行由 shell 自己绑右键与 `Shift+F10`/菜单键；本插件置顶区的行由插件补一个捕获阶段的
  `contextmenu` + `keydown` 监听，打开的是**同一个**菜单（键盘触发时锚在该行下沿）。右键行内任意位置都有效。
- Host 侧不可用时（例如刚换了路由还没重启），子菜单只剩一条灰掉的「标签颜色（重启应用后可用）」，不会假装能用。

## 定位、全部收起与全部展开

「工作区」标题栏右侧、搜索与设置之间多了三个按钮（IDEA 风格的图标，随主题取 `currentColor`，24×28 与宿主按钮同高）：

```
工作区                      ◎  ⤓⤒  ⤒⤓   🔍  ⚙  ＋
├ deepseek-harness
└ qeeq-and-zcc                      ← 全部收起后只剩分组行
```

![实拍：工作区标题栏的三个按钮](docs/screenshots/header-buttons.png)

定位对话 / 收起对话 / 展开对话：三个按钮就落在搜索与设置之间（图中「定位」正被悬停），
下面一行里还能看到颜色圆点与行尾的取消置顶图钉。

![三个按钮的图标](docs/header-glyphs.png)

（左：定位；中：全部收起；右：全部展开。此图按代码里的坐标渲染，实际跟随主题前景色。）

- **◎ 定位到当前会话**：把当前会话滚回视野。若它被折叠的分组挡住，先按**路径前缀**逐级展开**它自己的祖先链**
  （不碰无关分组），再滚动到该行并短暂描一圈品牌色（1.2 秒后自动移除）。它**不选中、不打开**会话，
  语义是「在树里找到我」。
- **⤓⤒ 全部收起**：关闭所有展开的工作区分组，列表只剩分组标题（之后单独点某个标题仍然照旧）。
- **⤒⤓ 全部展开**：展开所有分组；树模式下被父级打开后才出现的子分组，会在**下一拍**补上，直到没有可展开的为止。
- 实现方式：**点击宿主自己的分组行**（`[data-row-key^="workspace:"]`），不另存一份展开状态 ——
  所以宿主的持久化（`dsh.workspace.view.v5`）、水位数、拖拽、右键菜单全都照旧，行为与手点完全一致。
  会话行（`session:` 前缀）与「还有 N 个会话」（`overflow:` 前缀）永远不会被这些按钮碰到。
- 连续点两个按钮时，**后一条命令会取消前一条还没跑完的补拍**，不会被「展开」重新打开刚收起的分组。
- 「当前会话」取法与宿主浏览器一致：`sessions.list.byId[*].retainedBy.mainView > 0`；命中行是
  `[data-row-key^="session:"][aria-selected="true"]`。
- 这一行在宿主里**没有槽位**，所以按钮是插件把 DOM 插进 shipped 头部（作为 `.headerActions` 的前一个兄弟，
  随它一起隐藏）；React 重建头部时观察器会把按钮补回来（只补一份，会收养孤儿节点而不是叠第二份），
  插件卸载时容器与观察器一起移除。**不改动、不移动、不重绘任何 shipped 节点。**
- 窄栏（rail）模式、以及搜索展开时按钮自动隐藏，与宿主自己的头部按钮一致。

## 取消置顶

每条置顶行行尾常驻**一枚和宿主置顶徽标完全相同的实心图钉**（同一份 `pin-fill` path 数据、同一个 `label-caption`
颜色、同样 14px），静息时两处看起来是同一个标记；鼠标移上去时图钉淡到 28%、斜线浮现 —— 这时它明确是「取消置顶」按钮：

- 点它只取消置顶，**不会打开会话**。shell 把整行渲染成 `<button>`，所以由 **document 捕获阶段的 click 监听**先接管
  （`preventDefault` + `stopPropagation` + `stopImmediatePropagation`），从被点元素读 `data-pintop-session` 再取消置顶；
  插件卸载时监听器随 `ctx.effect` 移除。不依赖 React 合成事件冒泡。
- 这枚图标是**纯指针**目标（位于 shell 标记为 `aria-hidden` 的图标格里）；键盘与读屏用户走会话行 `…` 菜单里的「取消置顶」。
- 样式**按行抑制了 shell 自带的「从面板列表移除」按钮**（`~[class*="panelUnpin"]{display:none}`，只作用于本插件的行）——
  两者占同一格，不抑制的话点下去只会把行藏起来、会话依然置顶。

## 置顶行的会话状态

置顶行的行首格就是宿主的会话状态指示（只在空闲时才让位给颜色圆点）：

| 状态 | 外观（与宿主 `StateDot` 同尺寸） | 来源 |
| --- | --- | --- |
| 运行中 | 14px 旋转环（1.5s 转 + 虚线绕圈；`prefers-reduced-motion` 下静止） | `running: true` |
| 等待你处理 | 10px 点（warn 色，可见圆 6px），提示「等待确认 / 计划待审 / 等待回答」 | `pendingInteraction` |
| 有新完成 | 10px 点（success 色），提示「已完成，未读」，标题加粗一档 | `completionUnread: true` |
| 空闲 | 有标签画颜色圆点，否则留空（格子仍占 16px，标题列不跳） | — |

优先级与宿主一致：待处理 > 运行中 > 未读完成。打开会话后宿主自动清掉 `completionUnread`，绿点随之消失。

## 调参（TUNING）

外观集中在 `client.js` 顶部的 `TUNING`，改完存盘即热更新：

| 字段 | 默认 | 作用 |
| --- | --- | --- |
| `order` | `100` | 面板列表起始位置（插件 0、自动化任务 10；负值即回到顶部） |
| `menuOrder` | `350` | 右键菜单里「标签颜色」的位置（宿主：置顶 100 / 重命名 200 / 分支 300 / 复制 ID 450 / 归档 600） |
| `rowHeight` / `rowPaddingY` | `32` / `5` | 置顶行高度与上下内边距（与 shell 面板行 `min-height:32px; padding:5px` 对齐） |
| `groupGap` | `4` | 置顶行之间的间距 |
| `labelTint` / `labelTintHover` | `14` / `24` | 标签色在行底上的混合百分比 |
| `tintDark` / `tintDarkHover` / `tintLight` / `tintLightHover` | 品牌色 8–20% | 没有标签的置顶行的底色 / 悬停色（深色与浅色各一对） |
| `dotSize` / `swatchSize` | `8` / `12` | 会话行圆点 / 菜单色块的直径 |
| `glyphGap` | `16` | 控制行左侧留白（与标题文字左对齐） |
| `headerFontSize` / `headerGap` | `11` / `6` | 小标题字号、与上一行的间距 |
| `controlFontSize` | `12` | 「还有 N 个置顶…」「收起」的字号 |
| `maxVisible` | `4` | 超过就折叠，末尾出现「还有 N 个置顶…」 |
| `rowActionSize` | `28` | 行尾图钉按钮的边长（与 shell 的 `panelUnpin` 同格同尺寸） |

调色板在文件顶部 `COLORS`（每个颜色一对 light/dark 取值），样式里通过 `--pintop-c-<颜色>` 变量发布，
`[data-pintop-label="red"]` 再把 `--pintop-c` 别名到对应变量 —— 换色只改 `COLORS` 一处。

样式只命中本插件自己的标记（`data-pintop-row` / `data-pintop-header` / `data-pintop-control` / `data-pintop-label` /
`data-pintop-bulk*`），内置面板行与内置会话行本身不被重绘；`color-mix` 不可用时退回中性底色（`@supports` 兜底，界面不塌）。

## 结构（加座位与一处注入）

| 槽位 | 注册 | 作用 |
| --- | --- | --- |
| `sidebar.panellist`（list） | `pin-top-header`、`pin-session:<id>`、`pin-top-more` / `pin-top-less` | 分区小标题、每个置顶一行、折叠控制 |
| `main`（keyed） | key 与行 id 相同 | 桥接面板：一次点击打开（见上） |
| `sidebar.session.row.trailing`（list） | `pin-top-label-dot` | 内置会话行时间左侧的颜色圆点（无颜色时不渲染） |
| `contextMenus.register`（`target: 'session'`） | `pin-top.labels` | 右键菜单里的「标签颜色 ▸」子菜单 |
| `contextMenu.icon`（keyed） | `pin-top.label.<color>` + `pin-top.label.none` | 菜单里的八个色块 |
| — （注入 DOM） | `[data-pintop-bulk]` | 工作区标题栏的「定位 / 全部收起 / 全部展开」（宿主此行没有槽位） |

内置列表的浏览区（`sidebar.workspaces`）是**单占位槽**（`kind: 'single'`）：占它就得自己重画搜索、菜单、拖拽，
所以本插件一律不碰，只在它周围加座位。
所有注册都**不声明 children**、不覆盖任何 shipped 登记，因此不会遮蔽内置 UI。

## 数据来源

- `ctx.get('workspaces').list` → `{ phase, items, pinnedSessionIds, archivedSessionIds }`；
  `pinnedSessionIds` 本身就是置顶顺序（最近置顶在前），置顶与归档互斥。
  `items[].sessionIds / .path` 用来把「当前会话」映射回所在工作区（定位时按 `path` 前缀算祖先链）。
- `ctx.get('sessions').list` → `{ phase, ids, byId }`；`byId[id].title / .blank` 提供标题，
  `byId[id].retainedBy.mainView > 0` 表示「这就是当前会话」。
- 打开 / 置顶 / 取消置顶：`uiWorkspace.openSession / pinSession / unpinSession`。
- 关闭桥接面板：`ctx.get('layout').selectPanel(null)`。
- 会话状态：行注入的 `useSessionStatus`（宿主发布的状态快照）。
- 颜色标签：本 bundle 的 Host 半边（见下）。

## 颜色标签存哪

- **Host 侧** `~/.dsh/pin-top/labels.json`：`{ "version": 2, "bySession": { "<sessionId>": "<color>" } }`，
  临时文件 + `rename` 原子写，读改写串行化；文件损坏时降级为「无标签」，不会崩。
  不放 `localStorage`：桌面端每次启动端口不同，origin 会变，存在浏览器里会丢。
- 客户端通过本 bundle Host 半边的两个路由读写：`GET /pin-top/labels`、`POST /pin-top/labels { sessionId, color }`。
  两个路由都走宿主 `connection.requestRejection`（Host/Origin 信任 + 活跃已认证 peer）：401/403 原样返回，
  **fence 抛错按 500 拒绝**（失败即关闭，不放行），组合里没有该服务时直接 403。
- **只接受调色板里的颜色**：未知颜色、非字符串、缺 `sessionId` 一律 400，不会被当成「清空」；
  客户端清除时发送 `color: null`（Host 也接受空字符串 `""`）。手工改坏的取值在读取时被丢弃。
- 旧版文本标签的 `~/.dsh/pin-top/tags.json` 既不读取也不删除（文本标签没有颜色可迁移）。

## 安装与生效

从 GitHub 直接安装，两种方式任选。

**命令行**（`dsh plugin` 会把参数转交给 profile 目录里的 pnpm，和装其它 DSH 插件一样）：

```
# Web 端
dsh plugin --profile web add github:MingGH/dsh-pin-top#v2.2.0

# 桌面端（内置 CLI；macOS）
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add github:MingGH/dsh-pin-top#v2.2.0

# 桌面端（Windows）
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add github:MingGH/dsh-pin-top#v2.2.0
```

**图形界面**：左侧 **「插件」** 页 →「添加插件」→ 粘贴 `github:MingGH/dsh-pin-top#v2.2.0` → 安装：

![添加插件对话框：粘贴 GitHub 地址](docs/screenshots/install-dialog.png)

安装后**重启** `dsh web` 或 DSH 桌面端，再到左侧 **「插件」** 页确认 `dsh-pin-top` 的开关是打开的：
`dsh plugin add` 只把包装进 profile，**启用开关**才会把它写进 `dsh.profile.bundles`、随组合加载。

- 包名 `dsh-pin-top`；**仓库根就是插件包**（`package.json` 与 `cordis.patch.yml` 都在根），
  pnpm 的 git 依赖因此能直接解析到它。bundle patch 只插入一行 Host 行，`dsh.client` 声明 `web` 平台与四个注入依赖。
- **首次安装后需重启一次应用**（Host 会缓存客户端包元数据）。
- 更新：先 `dsh plugin --profile desktop remove dsh-pin-top`，再 `add` 新版本号（例如 `#v2.3.0`），然后重启。
  包名没变，`dsh.profile.bundles` 里的条目会继续生效，无需重新开启。
- 之后只改 `client.js` **不用重启**：Host 会 stat 轮询客户端产物并通过 `/plugins/events` SSE 推送 `rebuilt`，
  浏览器热替换该模块（刷新页面最稳）。
- **改 `index.js`（Host 半边）必须重启。** 从旧的「文本标签」版本升级上来时，路由已由 `/pin-top/tags` 变为
  `/pin-top/labels`：重启之前客户端取不到数据，右键菜单会显示「标签颜色（重启应用后可用）」，
  置顶区与定位/收起/展开不受影响。
- 卸载：`dsh plugin --profile desktop remove dsh-pin-top`，并在「插件」页关掉开关（或从 profile 的
  `dsh.profile.bundles` 移除 `dsh-pin-top`）。
- 本地源码调试：`dsh plugin --profile desktop add file:<本仓库绝对路径>`（改源码后重装才生效），
  或用 DSH 的 `plugin_manager` `install_bundle`，target = 本仓库根目录。

## 目录

```
package.json          # dsh.bundle.patch + dsh.client（web / immediately / inject）+ 导出表
cordis.patch.yml      # insert: [{ id: pin-top, name: 'dsh-pin-top' }]
index.js              # Host 半边：颜色存储（~/.dsh/pin-top/labels.json）+ GET/POST /pin-top/labels
client.js             # Client 半边：置顶区 + 桥接面板 + 状态指示 + 颜色菜单/圆点 + 定位/收起/展开 + 样式 + zh/en 词典
locale/{zh,en}.json   # 插件展示元数据（meta.title / meta.description）
icon.svg              # 原创图钉图标
docs/
  header-glyphs.png   # 三个标题栏按钮图标的渲染预览（README 插图）
  screenshots/        # 实机截图：置顶区、颜色标签、标题栏按钮、安装对话框（README 插图）
_test/
  smoke.mjs           # 离线冒烟测试：假模块加载器 / Cordis 上下文 / React / 可观察 store / fetch / DOM
README.md
LICENSE               # MIT
```

## 验证

```
node _test/smoke.mjs
node --check client.js
node --check index.js
```

当前 **256 项断言全绿**。覆盖：

- **契约**：模块加载器（id / factory / 导出）、slot 注册参数（槽名 / id / key / order / locale、不声明 children）、
  zh/en 词典键集一致且每个键都被引用、展示元数据。
- **置顶区**：分区结构与顺序、行 label 是 thunk、一次点击（桥接面板在 layout effect 里打开并清空面板）、
  折叠/展开与计数、颜色与状态标记。
- **会话状态**：空闲 / 运行中 / 待处理 / 未读完成的尺寸与文案、优先级、不串台、无状态服务仍渲染。
- **取消置顶**：动作存在与命名、捕获监听在 document 上、`data-pintop-session`、无关点击不受影响、指针-only。
- **颜色标签**：启动即 GET、行底色/圆点标记、菜单贡献的 target/order/子菜单、「无颜色」排第一、当前色打勾、
  选色 POST + 自动置顶、已置顶不重复 pin、清色只清色、色块按 key 上色、右键行内任意位置、`Shift+F10` 锚在行上、
  别处右键不受影响、写后乱序响应不覆盖新状态、Host 404 与 500 分别给出不同提示。
- **Host 半边真实调用**：无 fence 403、fence 抛错 500、401、403、GET、POST、清除、未知颜色/非字符串 400、405、
  手工写入的坏颜色被丢弃、落盘是版本化 JSON。
- **定位 / 收起 / 展开**：自带一套假 DOM（属性选择器 + MutationObserver 都真跑）——
  插在 shipped 按钮之前且不改动它们、三个按钮的顺序/文案/图标形状（横杠数、箭头数、圆环+四刻度）、
  定位会滚动并描边、被折叠挡住时只展开自己的祖先链、无关分组不动、无法定位时只退化一次后停止、没有当前会话时不动、
  收起/展开只点应当点的分组行、树模式多拍补子分组、同一行不重复点、后一条命令取消前一条的补拍、会话行永不触发、
  头部重建后只补一份、卸载后容器与观察器一并消失。
- **健壮性**：取消置顶 / 改名 / 归档后成对增删重建、未变化不重复注册、座位声明晚于激活时重试、
  注册持续失败不会自我重排、无 store 与注册失败时 `apply` 绝不抛出。
- **样式**：调色板变量与两套主题、标签底色与兜底、窄栏隐藏、按钮几何与焦点环、描边动画与 reduced-motion。

## 变更记录

| 版本 | 变化 |
| --- | --- |
| 1.0 | 侧边栏「置顶」分区：每会话一行 + 桥接面板，**一次点击**打开；行首用宿主同款状态指示；行尾可取消置顶 |
| 1.1 | 行尾图钉改成与宿主置顶徽标**同一枚 `pin-fill`**，斜线只在悬停时出现；行高与宿主面板行对齐（32/5） |
| 2.0 | 文本标签 → **macOS 式颜色标签**：右键任意会话选色（选色即置顶、清色不动置顶），行底色 + 颜色圆点；存储从 `tags.json` 迁到 `labels.json`，路由 `tags` → `labels`（**需重启一次**） |
| 2.1 | 「无颜色」提到子菜单第一行；右键可从**整行任意位置**打开；补 `Shift+F10`/菜单键；乱序响应与离线重试加固 |
| 2.2 | 工作区标题栏三按钮：**定位 / 全部收起 / 全部展开**（IDEA 风格图标），后一条命令取消前一条的补拍 |

## 已知边界

- 置顶区最多 `maxVisible + 2` 行（默认 4 个置顶 = 6 行）。
- 小标题行与控制行也是面板行（shell 只认这种行），所以小标题靠 `pointer-events:none` 做成不可点，
  但键盘 Tab 仍会经过它一次，回车等于「回到会话」。
- 这些行是「全局面板」那组槽位里的真实条目，默认处于已置顶状态，所以不会出现在「更多」菜单里；
  插件又按行抑制了 shell 自带的「从面板列表移除」按钮（`.panelUnpin`），因此**置顶区只能由插件增删**：
  想整体隐藏它，目前要卸载插件或改 `TUNING`（可以加一个开关，但还没做）。
- 行首状态/颜色位于 shell 标记为 `aria-hidden` 的图标格里：屏幕阅读器读不到；颜色名只做成悬停提示。
  内置会话行尾的颜色圆点是纯装饰，不另设标题（悬停该行时它本来就让位给操作按钮）。
- 折叠成窄栏时每行只剩图标，多个置顶看起来是同一颗点；展开后可见标题。
- 每个会话**一种**颜色（不是多标签）；颜色存本地，不跟随会话同步到其它机器。
- 词典只有 zh / en，其余语言按宿主语言链回落到 en。
- 「定位 / 全部收起 / 展开」这一组按钮是**唯一**通过 DOM 注入实现的面板（宿主头部没有可注册的槽位）；
  其余功能全部走正式槽位。
- 「定位」会在目标行上短暂加 `data-pintop-located` 做描边（1.2 秒后自动移除），这是唯一一处临时改动 shipped 行的地方；
  `prefers-reduced-motion` 下不做动画、只留静描边。
- 三个按钮共 72px，窄侧栏里「工作区」标题会被挤短（宿主自己的标题本来就有 45% 上限与省略号，不会溢出）。
- 视觉呈现未经浏览器自动化验证：本机没有可用的浏览器控制通道，渲染与交互由离线冒烟测试 + 对
  `dsh-client-ui-workspace` / `dsh-client-ui-sidebar` 源码与产物中 DOM 钩子的核对来保证。
