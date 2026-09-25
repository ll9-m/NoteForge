# NoteForge

**版本：** V1  
**日期：** 2026-09-25

一个完全离线的 Markdown 笔记应用，数据保存在浏览器 IndexedDB 中，无需服务器即可使用。

## 特性

- **科目管理** — 按科目分类组织笔记，支持拖拽排序、新建、删除、重命名
- **Markdown 编辑** — 桌面端编辑/预览左右分栏并同步滚动，移动端切换显示
- **图片插入** — 图片存入本地数据库，导出时自动打包
- **批量操作** — 多选笔记/科目，支持批量移动、删除
- **导入导出** — 导出为 zip（含 Markdown 文件 + 图片 + 元数据），支持跨设备迁移
- **离线可用** — Service Worker 缓存，无网络也能正常使用
- **PWA 支持** — 可安装到桌面/手机，独立窗口运行
- **主题切换** — 浅色/深色/跟随系统
- **笔记模板** — 自定义新建笔记的初始内容，支持 `{{date}}`、`{{title}}` 变量

## 技术栈

- 纯 HTML + CSS + JavaScript，无构建工具
- IndexedDB 本地存储
- [marked.js](https://github.com/markedjs/marked) — Markdown 渲染
- [fflate](https://github.com/101arrowz/fflate) — zip 压缩/解压
- Service Worker — 离线缓存

## 快速开始

1. 克隆或下载本项目
2. 用任意静态服务器打开（或直接双击 `index.html`）
3. 开始记笔记

### 部署到 GitHub Pages

1. Fork 本仓库
2. 进入 Settings → Pages
3. Source 选择 `main` 分支，根目录 `/`
4. 保存后访问 `https://<你的用户名>.github.io/NoteForge/`

## 数据说明

- 所有数据保存在浏览器 IndexedDB 中
- **清理浏览器数据会丢失笔记**，请定期导出备份
- 导出文件为 zip 格式，包含纯 Markdown 文件，可用任何编辑器打开

## 键盘快捷键

| 操作 | 快捷键 |
|------|--------|
| 新建笔记 | 笔记列表页点击 `+` |
| 新建科目 | 侧边栏点击 `+` |
| 进入选择模式 | 点击 `☑` 按钮 |
| 打开设置菜单 | 点击右上角 `⋮` |

## 项目结构

```
NoteForge/
├── index.html          # 主页面
├── style.css           # 样式
├── app.js              # 应用逻辑
├── sw.js               # Service Worker
├── manifest.json       # PWA 配置
├── icon.svg            # 应用图标
├── marked.umd.js       # Markdown 解析库
└── fflate.umd.js       # zip 压缩库
```

## 许可证

MIT
