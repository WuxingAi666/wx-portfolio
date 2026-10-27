# 仵星 · AI 应用与全栈开发作品集

[线上网站](https://wuxingai666.github.io/wx-portfolio/) · [六个项目源码与说明](https://github.com/WuxingAi666/ai-application-projects)

原生 HTML / CSS / JavaScript，无前端构建依赖。延续蓝白风格，通过独立内容面板、统一项目卡片和概要 / 详情分层组织求职作品与企业实习经历。

## 运行

```powershell
python -m http.server 8931 --bind 127.0.0.1
```

打开 http://127.0.0.1:8931 。完整 RAG 工程可通过上级目录 `scripts/start-local.ps1` 同时启动前后端。

## 阅读结构

首屏 → 关于 → 项目作品 → 实习经历 → 业务交付 → 技能 → 校园经历 → 在线简历 → 联系方式。

- 六个项目全部保留，仅使用 01–06 当前序号，按 RAG、语音、BOSS、记账本、果蔬、Coze 排列。
- 电脑端项目统一两列，平板窄屏和手机单列；预览展示业务价值、实现要点、状态和精选技术。
- 详情保留完整介绍、实现职责、处理链路、设计取舍、当前边界、完整技术栈和相关入口。
- JavaScript 将原生 details 内容移入一个原生 dialog：桌面右侧面板，手机全屏。支持 Escape、关闭按钮、浏览器前进 / 后退、直接链接和焦点恢复。
- 无 JavaScript 或不支持 dialog 时，保留原生 details 展开阅读。完整项目内容直接写入 HTML，不依赖运行时拉取。
- 项目详情链接示例：`#details-rag`、`#details-speech`；原 `#rag-project` 等卡片锚点继续有效。
- 全部实习、OA 业务交付和校园经历保留。在线简历支持单独打印 / 保存 PDF。

## 问答助手

浮动入口为「问问仵星的RAG问答助手」，窗口为「仵星的RAG问答助手」，采用独立墨绿与暖白配色。

电脑端支持拖动、八向缩放、放大还原、最小化；手机端聊天全屏，入口在首屏展示名称，滚动阅读时收为可拖动的紧凑图标，键盘聚焦后展示完整提示。保留流式回答、停止、重试、连续追问和参考来源。

`js/assistant-config.js` 的 `apiBase` 只填写公开后端 HTTPS 地址。模型密钥配置在服务器环境中，不能放入本目录。

本地默认连接 http://127.0.0.1:8010 。GitHub Pages 未配置后端时明确提示问答准备中；Pages 只托管静态文件，不能运行 Python API。

## 文件维护

| 文件 | 用途 |
| --- | --- |
| `index.html` | 全部静态内容、项目预览与完整详情、在线简历 |
| `content/projects.json` | 六个项目的统一事实、预览、排序与链接 |
| `css/style.css` | 蓝白基础主题、OA 展示、简历与原有组件 |
| `css/layout.css` | 模块面板、统一项目网格、详情面板和响应式排版 |
| `js/main.js` | 导航、平滑定位、渐显与简历打印 |
| `js/projects.js` | 项目详情、地址历史与焦点管理 |
| `css/assistant.css` / `js/assistant.js` | 独立问答组件 |
| `assets/project-*.svg` | 自动生成的桌面 / 手机处理流程示意 |

在完整工程根目录修改项目 JSON 后运行：

```powershell
python scripts/sync-project-content.py
python scripts/sync-project-content.py --check
```

同步项目预览、完整详情、简历、公开知识与流程图。其他经历直接维护对应 HTML 和公开 TXT。动效尊重减少动画设置，触控设备不启用悬停位移。

## 发布

本目录内容对应 `wx-portfolio` 仓库 main 分支根目录，由 GitHub Pages 发布。后端及部署配置位于项目合集的 `projects/portfolio-rag`，按其中 `docs/DEPLOYMENT.md` 单独部署。

不上传本地密钥、后端运行数据、录音、训练集和内部审阅材料。
