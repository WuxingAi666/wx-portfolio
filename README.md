# 仵星的作品集网站 × RAG 问答助手

完整全栈项目：原生 HTML/CSS/JavaScript 作品集与独立 LangChain + FAISS + FastAPI 服务。
正式入口：**https://llywjr.love/wx/**。GitHub 仅保存完整源码，本网站不再使用 GitHub Pages。

网站保留六个项目、实习经历、业务交付闭环、技能和完整可打印简历。
「问问仵星的RAG问答助手」采用独立森林绿风格与嫩芽笑脸头像，桌面默认 400×560，
支持拖动缩放和放大还原，手机适配全屏和软键盘。流式回答默认保留开头供阅读，
提供主动跟随、来源、停止重试、连续追问、复制、导出、草稿和提问灵感。

## 代码结构

| 目录 | 内容 | 运行位置 |
| --- | --- | --- |
| frontend/ | 完整网站、静态图片、聊天组件、项目内容 | 云服务器 Nginx 静态目录 |
| backend/ | FastAPI、RAG 链路、15 份公开 TXT、离线测试 | 云服务器 Python 3.12 + systemd |
| deploy/native/ | systemd、Nginx、生产配置模板、续期钩子 | 同一云服务器 |
| scripts/ | 本地运行、内容同步、检查、打包、版本激活 | 开发电脑 / 云服务器 |
| docs/ | 架构、部署、知识维护和进度 | 开发与运维查阅 |
| deploy/ci/ | 可选 GitHub Actions 检查模板，默认不启用 | GitHub 配置参考 |

公开 ZIP 与仓库不包含真实密钥、运行存储、日志、原始备份或客户文档。
开发配置在本地 backend/.env；生产配置在 /etc/wx-rag/backend.env，通过私有方式维护。

## RAG 实现

TextLoader 加载公开 TXT → RecursiveCharacterTextSplitter（420/80）→
BGE-M3 Embedding → FAISS 归一化向量召回 → Prompt → DeepSeek 流式生成 → SSE 与来源展示。
支持最近对话指代改写；无资料时提示不足，不以手写关键词打分替代向量检索。
默认用硅基流动 BGE-M3 与 DeepSeek Chat API；可切换本地 BGE，需要另装相应依赖。
这是自有服务器托管应用和知识库，**不是全离线推理**。

FAISS 二进制 + JSON 安全持久化，无 pickle；内容指纹支持索引复用与更新。
SQLite 原子预约控制单 IP / 全局请求额度和并发，管理统计独立鉴权。
后端错误不暴露密钥和上游正文，浏览器以安全 DOM 显示模型文本。

## 本地开发

使用 Python 3.12/3.13，安装 backend/requirements.txt。
首次复制 backend/.env.example 为 backend/.env 并私下填模型密钥；已有配置不要覆盖。

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

当前开发电脑可显式加 `-PythonExe D:/jiqixuexi/python.exe`。
网站 http://127.0.0.1:8931/，API http://127.0.0.1:8010/；仅本地开发模式开放 /docs。
修改界面仍在本地查看，成品确认后再发布。

```powershell
python scripts/sync-project-content.py
python scripts/sync-knowledge.py
python scripts/check-local.py
python scripts/package.py
```

最后一步在工程旁生成统一成品包 **wx-fullstack.zip**。包含全部前后端公开代码与部署说明。
check-local.py 检查 JS/Python 语法、内容同步、JSON 及 API/索引/配额边界，不调用模型。
知识变化后启动或重启 API 自动重建索引；仅改样式不重建。

## 云端部署

完整步骤见 [DEPLOYMENT.md](docs/DEPLOYMENT.md)。
Nginx 在 `/wx/` 提供前端，将 `/wx/api/` 和 `/wx/health/` 反向代理到回环端口 3001。
systemd 以专用 wxrag 用户运行后端，自动重启、开机启动。
证书自动续期；私有配置、FAISS 索引和 SQLite 与版本目录分离，支持版本回滚。
现有 MySQL、SSH 和其他站点不参与本项目，不改其配置。
旧 Docker/Caddy 文件保留为可选 API 示例，当前服务器不使用。

进度与实际验收见 [PROJECT-STATUS.md](docs/PROJECT-STATUS.md)，架构见
[ARCHITECTURE.md](docs/ARCHITECTURE.md)，知识维护见 [KNOWLEDGE.md](docs/KNOWLEDGE.md)。

CI 模板保存在 deploy/ci/checks.yml。当前 GitHub 凭据只有 repo 权限，无法创建 Actions 工作流；因此保留完整检查代码为模板，未启用自动工作流，也不部署 Pages。获得 workflow 权限后可复制到 .github/workflows/ 启用；本地和服务器的检查不依赖 Actions。
