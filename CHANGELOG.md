# 变更记录

本文件用于说明项目当前文件、常用 Git 命令，以及每次重要变更的摘要。

## 当前文件说明

- `index.html`：网页结构和页面入口。
- `styles.css`：页面样式。
- `app.js`：截图、锁牌、存票、本地保存、导入导出逻辑。
- `README.md`：项目说明和使用方式。
- `AGENTS.md`：Codex 在本项目中的工作规则。
- `REVIEW.md`：前期执行复盘。
- `CHANGELOG.md`：当前文件说明、常用 Git 命令和变更记录。
- `data/玩家.txt`：候选玩家原始文本资料。
- `data/五费卡.txt`：五费卡原始文本资料。
- `docs/项目状态.md`：当前功能状态、未验证项和维护原则。
- `docs/风险清单.md`：当前已知风险和发布前检查项。

## 常用 Git 命令

### 查看当前文件状态

```powershell
git status
```

用途：查看哪些文件新增、修改或还没有提交。

### 查看具体修改内容

```powershell
git diff
```

用途：在提交前检查具体改了什么。

### 把文件加入本次提交

```powershell
git add .
```

用途：把当前文件夹里的改动加入待提交列表。

### 只加入某个文件

```powershell
git add CHANGELOG.md
```

用途：只把指定文件加入待提交列表。

### 提交一个版本

```powershell
git commit -m "本次变更摘要"
```

用途：保存一个可以回看的版本点。引号里的内容要简短说明这次改了什么。

### 查看提交历史

```powershell
git log --oneline
```

用途：用简短形式查看之前提交过哪些版本。

### 查看最近一次提交详情

```powershell
git show --stat
```

用途：查看最近一次提交改动了哪些文件。

## 变更记录

### 2026-06-11 11:28 增加对局历史快照

#### 摘要

- 锁牌管理新增“对局历史”区域。
- 支持输入名称并保存当前对局快照。
- 对局快照会记录本场玩家、本场五费和当前锁牌状态。
- 历史对局支持恢复，恢复时会替换当前本场配置和锁牌状态。
- 历史对局支持删除。
- 导入导出 JSON 会包含历史对局快照。

#### 说明

这是历史对局的最小版本，暂时不把截图图片和存票流水归入单局历史。这样可以先验证“保存和恢复一局锁牌配置”是否有价值，再决定后续是否扩展为完整对局档案。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
node --check .\app.js
git diff --check
git add app.js index.html styles.css README.md CHANGELOG.md docs/项目状态.md
git commit -m "增加对局历史快照"
git log --oneline -5
```

### 2026-06-11 11:11 压缩本场五费配置样式

#### 摘要

- 本场五费分组外框、标题、间距和标签高度进一步压缩。
- 正常五费和解锁五费默认收起，减少进入锁牌管理时的空白区域。
- 可选五费默认展开，方便确认“已选 X / 2”。

#### 说明

这次只做视觉密度调整，不改变数据结构和配置规则。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
node --check .\app.js
git diff --check
git add app.js styles.css CHANGELOG.md docs/项目状态.md
git commit -m "压缩本场五费配置样式"
git log --oneline -5
```

### 2026-06-11 10:59 优化八人配置和赛季标签选卡

#### 摘要

- 本场玩家标签不再显示编号，只显示玩家名称和移除按钮。
- 候选玩家编号改为当前筛选结果的顺序编号，不再使用基础资料中的实际编号。
- 本场玩家固定展示 8 个槽位，缺少玩家时显示灰色虚线占位。
- 锁牌表固定补足 8 行，缺少玩家行置灰且不可操作。
- 本场五费标签样式收紧，减少配置区高度占用。
- 五费标签筛选文案改为“赛季/标签”。
- 新增“按标签配置”：选择一个赛季/标签后，自动启用该标签下的正常五费和解锁五费，并启用前 2 张可选五费。
- 可选五费分组标题显示“已选 X / 2”，便于控制本局可选五费数量。

#### 说明

这次仍然沿用现有 `tags` 字段承载赛季和机制信息，没有拆分新的数据结构。后续如果真实资料里赛季标签和机制标签混用较多，再考虑拆成明确的赛季字段和机制字段。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
node --check .\app.js
git diff --check
git add app.js index.html styles.css README.md CHANGELOG.md docs/项目状态.md
git commit -m "优化八人配置和赛季标签选卡"
git log --oneline -5
```

### 2026-06-11 10:44 优化本场配置添加体验

#### 摘要

- 已锁五费和可用五费统一按基础资料中的五费顺序展示。
- 本场配置默认只显示当前参与玩家和当前启用五费，不再让未参与资料占用主区域。
- 本场玩家改为“当前清单 + 添加玩家”模式，支持搜索候选玩家并添加。
- 本场五费改为按分类分组展示，每组可以折叠或展开。
- 本场五费支持移除、搜索候选五费、按分类筛选、按标签筛选。
- 添加五费支持一键添加当前筛选结果，方便批量添加正常五费或某个标签下的五费。

#### 说明

这次没有引入真正弹窗，而是使用页面内展开面板。这样实现更轻、移动端更稳，也保留后续升级“创建对局流程”的空间。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
node --check .\app.js
git diff --check
git add app.js index.html styles.css README.md CHANGELOG.md docs/项目状态.md
git commit -m "优化本场配置添加体验"
git log --oneline -5
```

### 2026-06-11 10:32 优化分页和本场配置样式

#### 摘要

- 基础资料分页从“当前显示范围 / 总条数”改为“第 X / Y 页 · 共 N 条”。
- 每页数量选项调整为 5、10、15、20、30，默认每页 10 条。
- 玩家资料和五费资料列表删除“本场”状态列，避免和锁牌管理页的本场配置入口重复。
- 玩家资料和五费资料列表改为固定高度，减少翻页或筛选时页面高度跳动。
- 锁牌管理的本场配置区新增已选数量摘要。
- 本场配置区改为紧凑网格选择，并修复复选框被全局输入框样式放大的问题。

#### 说明

这次继续保持轻量流程：不强制进入锁牌管理前先完成配置，而是在锁牌管理页提供清晰的本场配置入口。这样当前使用更顺手，后续如果要做“创建对局”或“历史对局”，再升级成正式步骤页。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
node --check .\app.js
git diff --check
git add app.js index.html styles.css README.md CHANGELOG.md docs/项目状态.md
git commit -m "优化分页和本场配置样式"
git log --oneline -5
```

### 2026-06-11 10:14 整理内部关联和本场配置入口

#### 摘要

- 锁牌记录从按名称关联升级为按 `playerId` / `cardId` 关联，后续修改昵称、游戏名或五费外号时不容易影响历史记录。
- 存票记录新增 `playerId` 关联，并继续兼容旧的玩家名称记录。
- 锁牌管理新增“本场玩家与五费配置”区域，本场玩家和本场五费选择集中在锁牌页执行。
- 基础资料列表保留当前状态展示，不再承担本场勾选入口。
- 玩家资料和五费资料列表新增顺序编号、搜索筛选和轻量分页。
- 锁牌、存票和导入导出继续兼容旧数据结构。

#### 说明

这次属于内部结构整理加入口调整。核心目标是让“长期资料库”和“本场比赛配置”分开：基础资料负责维护和查看资料，锁牌管理负责当前这一局到底有哪些玩家、哪些五费参与。分页先做轻量版本，满足资料变多后的基本可用性，暂不引入复杂表格组件。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
node --check .\app.js
git diff --check
git add app.js index.html styles.css README.md CHANGELOG.md docs/项目状态.md
git commit -m "整理内部关联和本场配置入口"
git log --oneline -5
```

### 2026-06-11 09:49 增加多名称和外号展示

#### 摘要

- 玩家资料从单一名称扩展为昵称、抖音名、微信名和游戏名。
- 旧数据中的 `name` 会自动兼容为昵称。
- 五费卡资料新增外号字段。
- 基础资料表格新增玩家多名称列和五费外号列。
- 玩家批量解析支持 `昵称 | 抖音名 | 微信名 | 游戏名`。
- 五费批量解析支持 `正式名|外号 分类 标签`。
- 锁牌管理新增玩家展示模式：昵称、游戏名、抖音名、微信名。
- 锁牌管理新增五费展示模式：正式名、外号优先。
- 展示字段为空时会自动回退：玩家回退到昵称，五费回退到正式名。

#### 说明

这次只做资料字段扩展和展示模式切换，不做底层 `playerId` / `cardId` 大迁移。现有锁牌、存票和导入导出继续兼容旧数据，后续如果要做云端或长期历史对局，再考虑把内部关联从名称迁移为稳定 id。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add app.js index.html styles.css README.md CHANGELOG.md docs/项目状态.md
git commit -m "增加多名称和外号展示"
git log --oneline -5
```

### 2026-06-10 18:31 增强淘汰锁牌记录和按钮样式

#### 摘要

- 淘汰玩家不再清空锁牌记录。
- 淘汰玩家的锁牌记录可以继续修改，但不占用存活玩家的五费选择。
- 存活玩家的五费选择只受其他存活玩家锁牌影响。
- 锁牌管理新增排名列，根据淘汰顺序自动计算名次。
- 恢复存活时会清空淘汰时间，重新淘汰时重新计算名次。
- 强化顶部操作按钮字体、高度、行高和字重，解决导入/导出按钮字体不一致。

#### 说明

这次调整锁牌管理的核心规则：淘汰玩家的锁牌视为历史记录，保留用于复盘；存活玩家的锁牌才视为当前占用。这样淘汰记录修改和存活玩家选择互不影响，更符合水友赛追五费记录需求。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add app.js styles.css README.md CHANGELOG.md docs/项目状态.md
git commit -m "增强淘汰锁牌记录和按钮样式"
git log --oneline -5
```

### 2026-06-10 17:55 优化资料表格和锁牌筛选体验

#### 摘要

- 统一顶部导入、导出、清空数据按钮样式。
- 修复基础资料表格横向溢出，改为表格内部横向滚动。
- 优化基础资料在窄屏下的展示，避免整页横向撑开。
- 锁牌管理的已锁和可用五费改为彩色标签展示。
- 五费名称文本只显示名称，分类通过颜色和悬停说明表达。
- 锁牌管理新增五费分类筛选，添加锁牌时可按全部、正常五费、解锁五费、可选五费过滤。

#### 说明

这次主要处理页面可用性和多端适配问题，没有改变数据保存方式，也没有引入新依赖。五费分类不再写进名称文本里，避免列表和标签过长；分类含义由颜色和 `title` 说明承载。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add index.html styles.css app.js README.md CHANGELOG.md docs/项目状态.md
git commit -m "优化资料表格和锁牌筛选体验"
git log --oneline -5
```

### 2026-06-10 12:39 增强本场资料配置

#### 摘要

- 基础资料中的玩家改为候选库，支持勾选本场参与玩家。
- 五费卡支持勾选本场可用。
- 五费分类新增 `解锁五费`，并按分类显示不同颜色。
- 五费批量解析支持 `正常五费`、`解锁五费`、`可选五费`。
- 基础资料表格改为固定高度，内容过多时内部滚动。
- 锁牌和存票只读取本场启用的玩家和五费。
- 将 `data/玩家.txt` 和 `data/五费卡.txt` 纳入项目资料。

#### 说明

这次围绕真实水友赛配置做增强：候选玩家可以多于 8 人，但本场参与限制为 1 到 8 人；五费资料可以很多，但锁牌只显示本场可用五费。排名和淘汰自动名次暂未实现，留到下一轮锁牌管理增强。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add index.html styles.css app.js README.md CHANGELOG.md docs/项目状态.md docs/风险清单.md data/玩家.txt data/五费卡.txt
git commit -m "增强本场资料配置"
git log --oneline -5
```

### 2026-06-10 12:06 拆分基础资料管理

#### 摘要

- 新增 `基础资料` 页签，集中维护玩家名单和五费卡资料。
- 玩家名单支持批量文本解析，当前版本保留 8 个上场玩家。
- 五费卡资料支持名称、分类、标签和备注。
- 五费卡批量解析支持“正常五费”和“可选五费”，其他词会作为标签。
- 锁牌管理和存票管理改为复用基础资料。
- 更新 `README.md`、`docs/项目状态.md` 和 `docs/风险清单.md`。

#### 说明

这次把上一版放在锁牌管理里的玩家和五费设置拆成独立资料页，方便后续复用。数据结构升级为 `players` 和带分类/标签的 `cards`，并兼容旧版本字符串五费列表和旧锁牌数据。当前仍然不引入后端、登录、云同步或赛季模板库。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add index.html styles.css app.js README.md CHANGELOG.md docs/项目状态.md docs/风险清单.md
git commit -m "拆分基础资料管理"
git log --oneline -4
```

### 2026-06-10 11:35 增加名单和五费名称设置

#### 摘要

- 记录 Cloudflare Pages 部署地址：`https://jcc-web-mvp.pages.dev/`。
- 在锁牌管理中新增玩家名单和五费名称设置。
- 五费名称会保存到本地数据，并参与导入导出。
- 玩家名称会同步影响锁牌管理和存票管理。
- 更新 `README.md`、`docs/项目状态.md` 和 `docs/风险清单.md`。

#### 说明

这次继续保持纯静态、本地保存，不引入登录、后端、数据库或云同步。旧数据会自动兼容：没有五费名称配置的旧浏览器数据会继续使用默认 `五费1` 到 `五费8`。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add index.html styles.css app.js README.md CHANGELOG.md docs/项目状态.md docs/风险清单.md
git commit -m "增加名单和五费名称设置"
git log --oneline -3
```

### 2026-06-10 11:06 建立最小项目文档

#### 摘要

- 新增项目专属 `AGENTS.md`。
- 完善 `README.md`，补充项目用途、启动方式、技术栈和目录结构。
- 新增 `docs/项目状态.md`，记录当前功能状态和未验证项。
- 新增 `docs/风险清单.md`，记录本地数据、截图存储、公开部署等风险。
- 更新 `CHANGELOG.md` 的当前文件说明和本次变更记录。

#### 说明

这次参考 Codex Knowledge 经验库中的项目规则模板、项目启动模板、Git 操作说明、任务结束检查清单、前端开发检查清单、项目状态模板和风险清单模板。落地时只保留适合当前纯静态网页 MVP 的内容，没有引入后端、支付、权限、数据库等当前项目不存在的复杂规则。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff
git add AGENTS.md README.md CHANGELOG.md docs/项目状态.md docs/风险清单.md
git commit -m "建立最小项目文档"
git log --oneline -3
```

### 2026-06-10 10:58 调整变更记录结构

#### 摘要

- 调整 `CHANGELOG.md` 的内容顺序。
- 将当前文件说明和常用 Git 命令放到变更记录前面。
- 统一变更记录格式，时间精确到分钟。
- 每次记录增加摘要、说明和本次变更的 Git 命令。

#### 说明

这次只调整文档结构，不修改网页功能。调整后，新手可以先看到项目文件分别做什么，再看到常用 Git 命令，最后查看每次变更历史。

#### 本次变更的 Git 命令

```powershell
git status --short --branch
git diff -- CHANGELOG.md
git add CHANGELOG.md
git commit -m "调整变更记录结构"
git log --oneline -2
```

### 2026-06-10 10:49 初始化项目版本管理

#### 摘要

- 建立 `JCC-Web-MVP` 的 Git 版本管理。
- 新增 `CHANGELOG.md`，记录项目变更摘要和常用 Git 命令。
- 将当前 MVP 保存为第一个 Git 版本。

#### 说明

当前项目是一个纯静态网页，可直接打开 `index.html` 使用。当前包含截图管理、锁牌管理、存票管理三个主要工具。数据保存在当前浏览器本地，支持导入和导出 JSON 数据。当前不包含登录、后端、数据库、云同步和官方游戏素材。

#### 本次变更的 Git 命令

```powershell
git init
git status --short --branch
git add .
git commit -m "初始化项目版本管理"
git log --oneline -1
```
