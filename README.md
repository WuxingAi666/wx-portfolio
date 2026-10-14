# 仵星 · 个人作品集（wx-portfolio）

求职向单页作品集 · 原生 HTML / CSS / JS · 无框架 · 双端独立适配 · 部署于 GitHub Pages。

> 定位：**AI 应用开发为主**（视觉检测 / 语音情感识别 / RAG 与智能体工作流 / 大模型 API 落地），兼具央国企 OA 系统驻场交付经验。

线上地址：https://wuxingai666.github.io/wx-portfolio/

## 快速预览

无构建步骤。推荐通过本地静态服务器打开（双击 `index.html` 在部分浏览器下会因 file 协议导致字体/动画表现不一致）：

```bash
cd wx-portfolio
python -m http.server 8931 --bind 127.0.0.1
# 浏览器访问 http://127.0.0.1:8931
```

Windows 用户也可双击根目录下的 `启动本地预览.bat`。

## 目录结构

```
wx-portfolio/
├── index.html              ← 站点主体（9 板块：首屏 / 关于我 / 实习经历 / OA 能力 /
│                              校园经历 / 项目作品 / 技能栈 / 在线简历 / 联系方式）
├── css/style.css           ← 样式（配色/间距在顶部 :root 变量统一调整；含双端适配、动效与打印样式）
├── js/main.js              ← 交互（滚动渐显 / 导航高亮 / 进度条 / 平滑滚动 /
│                              移动端横滑导航条 / 在线简历区块打印）
├── assets/
│   ├── avatar.jpg            证件照（首屏，108×108）
│   ├── og-cover.png          微信/BOSS/牛客分享封面（1200×630）
│   ├── fruit-sample.jpg      果蔬成熟度检测识别样例（通栏大图 1536w）
│   ├── fruit-sample-480.jpg  同上 · 移动端小图（480w，srcset 响应式加载）
│   ├── boss-dashboard.jpg    BOSS 直聘自动投递助手实时看板（通栏大图 1536w）
│   ├── speech-emotion.jpg    中文语音情感识别系统分析界面
│   ├── coze-workflow.jpg     AI 智能体工作流编排示意
│   ├── ledger-live.jpg       网页记账本系统真实运行界面
│   └── favicon.svg           站点图标
└── README.md               ← 本文件
```

> 配图已按页面真实显示尺寸重采样：通栏大图 1536w、三列卡片 900w，单张均 < 240KB。

## 常见修改

| 想改什么 | 在哪里改 |
|---|---|
| 文字内容 | `index.html` 搜索对应中文文案 |
| 项目截图 | 把图片放进 `assets/`，替换 `index.html` 中对应 `<img src>`（通栏大图 1536w、三列卡片 900w，建议单张 < 240KB） |
| 配色 | `css/style.css` 顶部 `--accent`（主色）/ `--bg` 等变量 |
| 技能熟练度颜色 | `css/style.css` 中 `.tag.l4/.l3/.l2/.l1`（精通/熟练/掌握/了解） |
| 联系方式 | `index.html` 联系方式板块 |
| 简历内容 | `index.html` 的 `#resume` 区块（**在线简历**，改完即生效，无需替换任何文件） |
| 分享封面 | 替换 `assets/og-cover.png`（1200×630） |

## 技术亮点

- **在线简历取代 PDF 下载**：简历以网页区块呈现，底部「打印 / 存为 PDF」只打印该区块。网页即最新版，**从根上杜绝「站点与附件简历版本漂移」**。
- **移动端导航**：固定顶栏 + 横向滑动导航条（替代汉堡抽屉），一次点击直达，当前项自动滚入视野。
- **OA 流程能力**：内嵌手绘 SVG 多级审批链路图（条件分支 / 驳回退回），体现低代码实施交付实战经验。
- **双端独立适配**：桌面 ≥1024px、平板 769–1023px、移动 ≤768px 三套布局，触控区 ≥48px。
- **动效克制**：原生 CSS transition + IntersectionObserver，支持 `prefers-reduced-motion` 降级。
- **性能与可访问性**：配图按真实显示尺寸重采样 + `srcset` 响应式 + 懒加载；含 JSON-LD 结构化数据、skip-link、语义化标签与 `aria-label`。
- **零依赖**：无框架、无构建、无 CDN 外链，纯原生实现。

## 部署

提交到 GitHub 仓库 `wuxingai666/wx-portfolio` 的 `main` 分支并开启 GitHub Pages 即可自动发布。
