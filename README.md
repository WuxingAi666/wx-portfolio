# 仵星 · 个人作品集（wx-portfolio）

求职向单页作品集 · 原生 HTML / CSS / JS · 无框架 · 双端独立适配 · 可直接部署 GitHub Pages。

## 快速预览

直接双击 `index.html` 即可（无构建步骤）。或用 VS Code 的 Live Server 插件获得更真实的本地预览（含移动端视口模拟）。

## 目录结构

```
wx-portfolio/
├── index.html            ← 站点主体（6 板块，每块有中文注释标记，改文字直接搜）
├── css/style.css         ← 样式（配色/间距在顶部 :root 变量统一调整；含双端适配与动效）
├── js/main.js            ← 交互（移动端菜单 / 滚动渐显 / 导航高亮 / 进度条 / 平滑滚动）
├── assets/
│   ├── resume.pdf        简历（首屏与底部「下载简历」按钮指向此文件）
│   ├── avatar.jpg        证件照（已压缩至 6KB）
│   ├── fruit-sample.jpg  果蔬项目样例图（桌面 800w）
│   ├── fruit-sample-480.jpg 同上·移动端小图（srcset 响应式加载）
│   ├── boss-dash.svg     BOSS 项目示意
│   ├── speech-ui.svg     语音系统示意
│   ├── ledger-ui.svg     记账本示意
│   ├── coze-agent.svg    Coze 智能体示意
│   ├── coze-workflow.svg Coze 工作流示意
│   ├── rag-reserved.svg  RAG 预留位示意
│   └── favicon.svg       站点图标
├── 优化说明.md           ← 双端适配 / 动效 / 性能 / 修改点清单
├── 部署验证指南.md        ← 仓库创建 → 推送 → 开 Pages → 验证
├── review-summary.md      ← 各项目源码评审结论与重写说明
├── README.md             ← 本文件
└── deploy.bat            ← 一键部署脚本（走本机已缓存的 GitHub 凭据）
```

## 常见修改

| 想改什么 | 在哪里改 |
|---|---|
| 文字内容 | `index.html` 搜索对应中文文案 |
| 项目截图 | 把图片放进 `assets/`，替换 `index.html` 中对应 `<img src>`（建议压缩到单张 < 200KB） |
| 配色 | `css/style.css` 顶部 `--accent`（主色）/ `--bg` 等变量 |
| 技能熟练度颜色 | `css/style.css` 中 `.tag.l4/.l3/.l2/.l1`（精通/熟练/掌握/了解） |
| 联系方式 | `index.html` 联系方式板块 |
| 简历文件 | 替换 `assets/resume.pdf`（保持文件名不变最省事） |

## 部署

见《部署验证指南.md》。上线后地址：`https://wuxingai666.github.io/wx-portfolio/`

> ⚠️ 上线前请确认：GitHub 账号 `wuxingai666` 及 `boss-automation` / `xiaozhangben` 仓库真实可达；实习量化数字、校园活动数字、RAG 项目内容已替换为真实信息（详见《优化说明》第七节）。
