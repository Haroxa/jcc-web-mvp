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
