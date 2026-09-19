---
标题: Git 基础与常用命令
日期: 2026.09.19
科目: Tools
标签: 基础, 版本控制, Git
状态: 草稿
练习: 真
---

## 一句话总结

Git 是分布式版本控制系统，记录文件的每一次变化，让任何改动都能回退、比对、协作。

## 笔记

### 为什么用它
- 每改一次留一个快照，随时能回退
- 分支很便宜，敢开分支试错
- 本地就能 commit，不依赖网络
- GitHub 建立在 Git 之上，学 GitHub 先学 Git

### 四个区域
- 工作区 working directory：你正在编辑的文件
- 暂存区 staging area / index：`git add` 之后进去，准备提交的内容
- 本地仓库 repository：`git commit` 之后进去，存在 `.git/` 里
- 远程仓库 remote：GitHub 上的那一份

数据流：

    工作区 --add--> 暂存区 --commit--> 本地仓库 --push--> 远程仓库
    工作区 <--pull--------------------------------------- 远程仓库

### 首次配置（只做一次）

    git config --global user.name "你的名字"
    git config --global user.email "你的邮箱"
    git config --global init.defaultBranch main

查看当前配置：

    git config --list

### 创建 / 获取仓库

    git init                 # 在本地目录初始化一个新仓库
    git clone <url>          # 把远程仓库克隆到本地

### 日常流程（最常用，先背这四条）

    git status               # 看现在改了哪些文件
    git add <file>           # 把某个文件放进暂存区
    git add .                # 把当前目录所有改动放进暂存区
    git commit -m "说明"     # 提交一次快照
    git push                 # 推到远程

### 查看历史与差异

    git log                          # 完整提交历史
    git log --oneline                # 一行一条，简洁
    git log --oneline --graph --all  # 带分支图
    git diff                         # 工作区 vs 暂存区
    git diff --staged                # 暂存区 vs 上次提交

### 分支

    git branch                  # 列出分支
    git branch <name>           # 新建分支
    git switch <name>           # 切换分支
    git switch -c <name>        # 新建并切换（等于 branch + switch）
    git merge <name>            # 把 name 分支合并进当前分支
    git branch -d <name>        # 删除分支

> 老教程里用 `git checkout`，现在切分支推荐 `git switch`，语义更清楚。

### 撤销（容易记混，重点）

    git restore <file>              # 丢弃工作区里未暂存的修改
    git restore --staged <file>     # 把文件从暂存区撤回，改动还在
    git reset --soft HEAD~1         # 撤销上一次 commit，改动保留在暂存区
    git commit --amend              # 修改上一次的提交信息

> `restore` 只影响工作区/暂存区，不碰历史；`reset` 会动 commit 历史，慎用。

### 远程仓库

    git remote add origin <url>     # 绑定远程，习惯叫 origin
    git remote -v                   # 查看已绑定的远程
    git push -u origin main         # 首次推送并绑定上游，之后直接 git push
    git pull                        # 拉取远程并合并到本地
    git fetch                       # 只拉取，不自动合并

### .gitignore

不想让某些文件进版本库，写在仓库根目录的 `.gitignore` 里：

    node_modules/
    dist/
    .env
    *.log

注意：**已经被 Git 跟踪的文件，加进 .gitignore 不会生效**，要先移除跟踪：

    git rm --cached <file>

## 复习记录
- 2026-09-19：创建，过了一遍四区域和常用命令。

## 实践
- [x] 配置 user.name / user.email
- [ ] 本地 `git init` 一个测试目录，走一遍 add → commit → log
- [ ] 开一个分支改点东西，再 merge 回来

## 参考
- Pro Git 中文版：https://git-scm.com/book/zh/v2
- Git 官方文档：https://git-scm.com/docs