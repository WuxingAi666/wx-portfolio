# 独立 RAG 问答项目

这是完整全栈作品中的独立 Python 后端，可独立运行与展示，不依赖作品集前端。
支持终端多轮问答、FastAPI JSON 问答及 SSE 流式接口。

链路：TextLoader → RecursiveCharacterTextSplitter（420/80）→ BGE-M3 Embedding → FAISS → DeepSeek。
每个块附带所属文档标题，减少上下文丢失。默认使用云端模型 API，也支持可选本地 BGE。
FAISS 索引与 SQLite 额度保存在 storage/；接口含输入校验、并发及调用额度管理。

## 运行

使用 Python 3.12 或 3.13，在本目录打开终端：

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

首次将 .env.example 复制为 .env，私下填写 DeepSeek 与 Embedding 密钥；已有 .env 不要覆盖。
本机整理出的源码目录已有可用配置时可直接运行，公开 ZIP 始终不包含真实 .env。
在已安装依赖的终端运行（或使用对应虚拟环境的 python）：

```powershell
python main.py
```

打开 http://127.0.0.1:8010/docs ，测试 POST /api/v1/qa；问题示例：

```json
{"question":"仵星的 RAG 项目有哪些核心技术？","history":[]}
```

另开一个终端体验连续对话：

```powershell
python chat.py
```

云端全栈接口可用 `python chat.py --api http://8.152.192.126/wx` 测试。
本机现成环境为 D:/jiqixuexi/python.exe，可替代以上 python，避免 PATH 误选解释器。
来源链接指向完整网站；没有启动作品集前端也能检索与生成回答。

## 维护与验证

- 编辑 data/public/ 中的 TXT 和 manifest.json；重启 API 后自动按指纹重建索引。
- `python -m app.cli info` 检查索引；首次或知识变化时会调用 Embedding API。
- `python -m unittest discover -s tests -v` 执行离线边界测试，不调用付费模型。
- `python evaluate.py` 为真实模型小样本评估，会产生模型调用费用。
- 本地 BGE 方案安装 requirements-local.txt 并设置 EMBEDDING_PROVIDER=local_bge。

本项目使用公开资料，默认生成与向量化仍调用外部 API，不宣称全离线推理。
真实密钥、storage、日志与原始历史资料不进入 GitHub 和公开成品包。
