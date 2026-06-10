# 变更记录

本文件用于说明项目当前文件、常用 Git 命令，以及每次重要变更的摘要。

## 当前文件说明

- `index.html`：网页结构和页面入口。
- `styles.css`：页面样式。
- `app.js`：截图、锁牌、存票、本地保存、导入导出逻辑。
- `README.md`：项目说明和使用方式。
- `REVIEW.md`：前期执行复盘。
- `CHANGELOG.md`：当前文件说明、常用 Git 命令和变更记录。

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
