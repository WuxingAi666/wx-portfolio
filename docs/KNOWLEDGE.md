# 公开知识维护

项目事实维护在 frontend/content/projects.json，其余经历维护在 frontend/index.html。
运行 sync-project-content.py 同步六项目、简历与项目 TXT，再运行 sync-knowledge.py 同步其他主题。
共有 15 份 UTF-8 TXT，由 manifest.json 指定标题、资料 ID 和网站锚点；不采集聊天、密钥或客户内部文档。

TextLoader 加载，420 字符分块、80 重叠，每块附带本人和所属文档标题。
模型、知识、清单和切分配置共同形成索引指纹；更换资料后重启 API 按指纹建库，纯样式不重建。
实际块数和维度以当前 metadata.json 为准，不沿用旧索引数字冒称本轮结果。

完整工程先同步检查再发布，独立 RAG 拷贝同一公开知识。运行中服务不会读取开发电脑的新 TXT。
公开入口是 http://8.152.192.126/wx/ ，来源锚点与网站同域。
默认向量与生成使用外部 API，不是全离线系统；材料缺失或职责边界必须明确，不虚构模型指标或个人成果。
