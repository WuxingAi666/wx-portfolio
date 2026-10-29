# 仵星的作品集网站 × RAG 问答助手

完整全栈主工程。公开入口：**http://cloud.8-152-192-126.sslip.io/wx/**。
前端与后端统一在云服务器运行，GitHub 保存源码，本网站不启用 Pages。
桌面成品集中在 WX-项目成品/：01 是独立 RAG，02 是独立前端，03（本目录）是后续唯一主工程。

## 目录

| 目录 | 内容 |
| --- | --- |
| frontend/ | 完整作品集、六项目、实习、简历和森林绿问答小窗 |
| backend/ | LangChain / BGE-M3 / FAISS / DeepSeek / FastAPI，15 份公开 TXT |
| deploy/native/ | Nginx HTTP 同域代理、systemd 和生产配置模板 |
| deploy/ci/ | 可选检查模板；当前没有启用 GitHub Actions |
| scripts/ | 内容同步、离线检查、本地启动、打包与发布激活 |
| docs/ | 当前架构、部署、维护与状态，历史说明已移出主工程 |

## 本机运行

首次安装 backend/requirements.txt，复制 backend/.env.example 为 backend/.env 并私下配置模型密钥。
本机整理目录已保留配置，避免覆盖。当前已验证的解释器是 D:/jiqixuexi/python.exe。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -PythonExe D:/jiqixuexi/python.exe
```

网站 http://127.0.0.1:8931/；API 文档 http://127.0.0.1:8010/docs。
只运行一套本机 API；独立前端也可以连接同一 API。修改与测试仍先在本地完成。

## 检查与三份成品

```powershell
python -B scripts/sync-project-content.py
python -B scripts/sync-knowledge.py
python -B scripts/check-local.py
python -B scripts/build-deliverables.py
```

最后一步从本主工程同步 01 独立 RAG、02 独立前端，并在成品压缩包/ 生成三个 ZIP。
真实 .env、storage、原稿和本机维护目录不进入公开包；本机目录保留配置便于运行。
独立版是可交付副本，统一修改请在本目录完成后再生成，避免出现多套不一致的源码。

## 云端

Nginx 在 /wx/ 提供前端，并代理 /wx/api/、/wx/health/ 到 127.0.0.1:3001。
systemd 使用 wxrag 专用用户运行 API；私有配置和持久化数据独立于代码 release。
完整步骤见 docs/DEPLOYMENT.md，实际验收状态见 docs/PROJECT-STATUS.md。
新地址借助 sslip.io 公共 DNS 解析到自有服务器，不是本人注册的独立域名；以后可替换为自有域名。
