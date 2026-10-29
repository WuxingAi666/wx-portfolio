# 本地开发与效果验收

2026-10-29 起，调整测试统一在本地进行。同步副本、生成压缩包不会发布网站，也不会启动 GitHub Actions。最终成品得到明确发布指令后再部署。

## 当前电脑如何打开

在主工程目录运行 `scripts/preview.cmd`，或执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 -PythonExe D:/jiqixuexi/python.exe
```

- 网站：http://127.0.0.1:8931/
- API 文档：http://127.0.0.1:8010/docs
- 就绪检查：http://127.0.0.1:8010/health/ready

网页使用本地文件，问答调用本机 API。默认 Embedding 与生成仍使用外部模型 API，实际提问会消耗模型调用；本地预览不等于全离线模型运行。

`start-local.ps1` 支持显式指定 Python；否则优先后端虚拟环境，再使用 PATH。当前电脑 PATH 中的 Python 可能来自其他应用，建议用上面的已验证解释器。已有 `.env` 不要覆盖。首次在别的电脑解压时，按 README 安装依赖并私下配置密钥。

启动脚本仅监听 127.0.0.1；它输出两个 PID 和停止命令，日志在 output 中。端口已占用时先使用现有预览或确认并停止旧进程，不结束未知服务。修改后端或知识后需重启 API；原生前端刷新页面即可，旧样式可用 Ctrl+F5 强制刷新。

电脑浏览器开发者工具中的设备模拟可检查手机宽度。真手机访问电脑需要另配局域网监听、CORS 和 API 地址，本地回环链接不能直接发给另一台设备使用。

## 内容同步与检查

在主工程根目录：

```powershell
python scripts/sync-project-content.py
python scripts/sync-knowledge.py
python scripts/check-local.py
```

第一步生成六项目 HTML、简历项目、流程图和项目 TXT；第二步生成个人、实习、交付、技能、校园、联系和网站指南。不要直接修改生成的 TXT，否则下次同步会覆盖。补充经历应修改对应网站文案或已确认的事实来源。

`check-local.py` 只检查：五个前端 JS 语法、两个同步状态、Python 语法、JSON 及离线服务边界测试。它不写知识、不重建索引、不请求模型、不连接 GitHub。结果写入 output/local-check.json。

知识变化时，在 backend 目录运行 `python -m app.cli index` 并重启 API。缺失或变更的索引会调用 Embedding；启动可自动加载或构建当前版本。样式、文档变化不需要重建。真实生成评估 `python evaluate.py` 单独按需执行，不放进每次离线检查。

## 对齐待发布副本与本地包

```powershell
python scripts/sync-local.py --package
```

该工具仅复制主工程的允许公开文件到已有 `output/github/` 本地工作区，校验一致性与密钥模式，再更新统一全栈包、项目合集包与清单。不执行提交、push、GitHub API、部署或浏览器线上验收；不会复制 `.env`、storage、日志、原始备份。

本地包使用 `wx-fullstack.zip`（完整前后端）和 `AI-Application-Projects.zip`（全部项目合集）文件名；网站仓库现为完整工程结构，不再复制平铺前端，但在定稿前均属于当前本地候选包；是否部署以 PROJECT-STATUS.md 为准。所有开发仍在主工程完成，不要在副本中单独改页面。
