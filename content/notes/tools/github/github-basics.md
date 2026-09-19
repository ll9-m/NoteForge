---
标题: GitHub 项目创建与使用
日期: 2026.09.19
科目: Tools
标签: 基础, 协作, GitHub, 部署
状态: 草稿
练习: 真
---

## 一句话总结

GitHub 是基于 Git 的代码托管平台，提供远程仓库、协作、Actions 自动化和 Pages 静态托管。

## 笔记

### 它和 Git 的关系
- Git 是本地工具，GitHub 是远程平台
- GitHub 用 Git 做版本控制，但额外提供网页界面、协作、部署
- 没有 GitHub 也能用 Git；没有 Git 就用不了 GitHub

### 核心概念
- Repository 仓库：一个项目一个仓库
- Remote 远程：本地仓库关联的 GitHub 仓库，通常叫 `origin`
- Issue：问题/任务记录
- Pull Request (PR)：请求把你的改动合并进某个分支
- Actions：CI/CD，push 后自动跑脚本
- Pages：免费静态网站托管
- Fork：把别人的仓库复制一份到自己账号
- Template：模板仓库，别人可一键生成自己的新仓库

### 新建仓库
1. 右上角 `+` → New repository
2. 填 Repository name，如 `note-forge`
3. 选 Public（免费，Pages 可用）或 Private
4. 勾选 Add a README file（建议勾）
5. 选 .gitignore 模板（Node 项目选 Node）
6. 选 License（开源一般选 MIT）
7. Create repository

### 把本地仓库推上去

    git remote add origin git@github.com:用户名/仓库名.git
    git branch -M main
    git push -u origin main

### 或从远程拉下来

    git clone git@github.com:用户名/仓库名.git

### 两种连接方式
- HTTPS：`https://github.com/...`，要输账号 + Token
- SSH：`git@github.com:...`，配一次公钥后免密，推荐

> GitHub 早已不能用账号密码 push，HTTPS 方式要用 Personal Access Token (PAT)，别把 token 写进代码或提交进仓库。

### README.md
仓库首页自动展示的文件，用 Markdown 写。
作用：让别人（和未来的你）三秒看懂这个项目是什么、怎么用。

### GitHub Pages
1. 仓库 Settings → Pages
2. Source 选 `GitHub Actions`（推荐）或某个分支
3. 访问地址通常是 `https://用户名.github.io/仓库名/`

> 这个子路径就是 VitePress 配置里的 `base`，必须和仓库名一致。

### GitHub Actions
- 配置文件放在 `.github/workflows/*.yml`
- 由 push、PR 等事件触发
- NoteForge 用它自动构建 VitePress 并部署到 Pages

### Use this template
把仓库 Settings 里勾选 Template repository 后，
别人在你仓库页面点 `Use this template` 就能生成一份自己的副本。
这是 NoteForge 分发给别人的核心方式。

### Issue 与 PR
- 发现 bug / 想加功能 → 开 Issue
- 改完代码 → 开 PR 请求合并
- 即使是个人项目，也可以自己开 Issue 记录待办

### 学生优惠
GitHub Student Developer Pack 可白嫖一些域名、云服务。
非初期必需，但值得注册。

## 复习记录
- 2026-09-19：创建，梳理了仓库创建流程和 Pages/Actions 概念。

## 实践
- [ ] 在 GitHub 上建一个仓库并勾选 README
- [ ] 本地 clone 下来，改 README，push 回去
- [ ] 在仓库网页上直接编辑一个 .md 文件，commit
- [ ] Settings → Pages 打开，确认能访问

## 参考
- GitHub 官方文档：https://docs.github.com/
- GitHub Skills（交互式教程）：https://skills.github.com/
- Student Pack：https://education.github.com/pack