# 本地开发与三份成品

唯一主工程：桌面/WX-项目成品/03-完整全栈项目。
01-RAG独立项目与02-个人网站前端是从本工程生成的独立交付副本。
原稿在历史原稿（仅本机）/，Git 仓库与运维证据在本机维护/，都不进入公开 ZIP。

本机：scripts/preview.cmd，或 PowerShell 执行 scripts/start-local.ps1 -PythonExe D:/jiqixuexi/python.exe。
网站 8931、API 8010。独立前端可单开 8932，连接同一 API；不要重复启动占用相同端口。

修改项目事实：frontend/content/projects.json；其他经历：frontend/index.html。
依次运行 sync-project-content.py、sync-knowledge.py、check-local.py。
知识变化后重启 API，首次生成新索引会调用 Embedding；样式或说明变化不重建。
check-local.py 不请求模型或 GitHub，真实 evaluate.py 需单独按需运行。

运行 scripts/build-deliverables.py 同步独立副本并生成三个公开 ZIP。
私有 .env 只保留在本机源码目录，不进入 ZIP；首次在其他电脑解压需要填写配置。
后续效果仍先本地验收，确认成品后才更新 GitHub 和云端。
