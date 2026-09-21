# 仵星 · 个人作品集（wx-portfolio）

求职向单页作品集 · 原生 HTML/CSS/JS · 无框架 · 可直接部署 GitHub Pages。

## 目录结构

```
wx-portfolio/
├── index.html          ← 站点主体（6 板块，每块有中文注释标记，改文字直接搜）
├── css/style.css       ← 样式（配色/间距在顶部 :root 变量统一调整）
├── js/main.js          ← 交互（移动端菜单 / 滚动渐显 / 导航高亮 / 进度条）
├── assets/
│   ├── avatar.jpg        证件照
│   ├── resume.pdf        简历（Hero 与底部"下载简历"按钮指向此文件）
│   ├── fruit-sample.png  果蔬项目真实样例图
│   ├── boss-dash.svg     BOSS 看板截图【占位，可换 png】
│   ├── speech-ui.svg     语音系统截图【占位，可换 png】
│   ├── ledger-ui.svg     记账本截图【占位，可换 png】
│   └── favicon.svg       站点图标
├── 部署指南.md           ← 仓库创建 → 推送 → 开 Pages → 验证
└── 代码评审摘要.md       ← 各项目源码评审结论与重写说明
```

## 快速本地预览

直接双击 `index.html` 即可（无构建步骤）。或用 VS Code 的 Live Server 插件获得更好的预览体验。

## 常见修改

| 想改什么 | 在哪里改 |
|---------|---------|
| 文字内容 | `index.html` 搜索对应中文文案 |
| 项目截图 | 把 `xxx.png` 放进 `assets/`，改 `index.html` 中对应 `<img src="assets/xxx.svg">` 为 `xxx.png` |
| 配色 | `css/style.css` 顶部 `--accent`（主色）/ `--bg` 等变量 |
| 联系方式 | `index.html` ⑧ 联系方式 板块 |
| 简历文件 | 替换 `assets/resume.pdf`（保持文件名不变最省事） |

## 部署

见《部署指南.md》。上线后地址：`https://wuxingai66.github.io/wx-portfolio/`
