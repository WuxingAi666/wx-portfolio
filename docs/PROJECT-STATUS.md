# 项目进度与版本对齐

更新日期：2026-10-29。用户已明确授权整合全部前后端、推送 GitHub、停止本网站 Pages 并统一部署云服务器。

## 当前交付

- 主工程：`C:/Users/84208/Desktop/RAG-Portfolio-Delivery`，保留六项目、实习、业务交付和完整简历。
- 统一成品包：工程旁的 `wx-fullstack.zip`，完整 frontend/backend/deploy/scripts/docs，不含真实凭据和运行数据。
- 正式入口：`https://llywjr.love/wx/`。当前服务器内部 HTTPS 正常，外网 443 仍待阿里云安全组放行；未将此状态写成外网验收通过。
- 完整源码仓库：`https://github.com/WuxingAi666/wx-portfolio`，从平铺前端迁移为完整工程；保留 Git 历史，不再启用 Pages。
- 项目合集：`https://github.com/WuxingAi666/ai-application-projects`，同步 portfolio-rag，保留其余五个项目。
- 以前的 `37cd063`、`11fbb20` 是 2026-10-28 历史发布基线，本次统一云端发布取代旧方案。
- Desktop/RAG、WorkBuddy 原始站点及 backups 均未修改。

## 已落地

| 范围 | 当前状态 |
| --- | --- |
| 前端 | 完整原生网站、六项目详情、可打印简历、手机适配；同域 /wx/ 挂载 |
| 助手 | 森林绿 / 嫩芽头像，400×560 默认窗口、拖动缩放、灵感浮层、保留回答开头 |
| 问答 | BGE-M3 / FAISS 向量召回、DeepSeek SSE、多轮追问、来源、停止重试与额度控制 |
| 知识 | 15 TXT / 41 块 / 1024 维；分块补充本人及文档标题，避免技术正文失去所属主题 |
| 云端 | Ubuntu 24.04 / Python 3.12，systemd 专用 wxrag 用户、单进程回环 3001、Nginx 同域代理 |
| 存储 | /var/lib/wx-rag 独立保存索引与 SQLite；/etc/wx-rag/backend.env 私有配置 |
| HTTPS | Let's Encrypt 已签发，有效期至 2027-01-27；certbot.timer 启用，续期演练成功 |
| 源码 | 完整工程统一目录；旧 Pages 发布脚本移除；CI 检查保留为模板，当前凭据无 workflow 权限，未启用 Actions |
| 运维 | release / current / previous 版本管理、按依赖指纹隔离 venv、就绪失败回滚 |

## 验证记录

- 本地 11 项检查通过：全部 JS、Python 语法、JSON、两份内容同步和离线服务边界。
- Linux Python 3.12 实际安装成功，pip check 无冲突，5 项 API/索引/配额边界测试通过。
- 分块上下文改进后，22 条真实 Embedding 召回小样本命中 21 条；一个未指定项目的“个人助手工程问题”问法未命中特定 RAG 文档。小样本不等于完整回答准确率。
- 已通过服务器内部可信 HTTPS 调用真实 DeepSeek 流，实际完成问答及追问；最终外网和浏览器验收待安全组入口就绪后补充。
- 服务器 UFW 已允许 443，Nginx 已监听 443，本机 TLS 正常；开发电脑及服务器经公网 IP 连接 443 均超时，已向用户提供阿里云安全组操作步骤。
- GitHub Pages 已通过 API 关闭并验证 has_pages=false；提交与推送结果以实际仓库 main 为准。
- 开发过程私有证据在 output/，不进入公开仓库和成品 ZIP。

## 后续工作规则

后续仍先本地调整与验收，用户确认成品更新时再推送 / 部署；本次是用户明确要求的统一发布。
项目文案改动先执行 sync-project-content.py 和 sync-knowledge.py；知识变动后再重建索引和重启。
不把样式检查冒称为真实生成验收，不把内部可用冒称为公网已可用，不增加未知项目成果指标。
运维见 DEPLOYMENT.md；本地操作见 LOCAL-DEVELOPMENT.md。
