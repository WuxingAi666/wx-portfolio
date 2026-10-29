# 全栈统一云端部署

正式入口：**https://llywjr.love/wx/**。GitHub 仅保存代码，wx-portfolio 不再启用 Pages。
前端、后端都在同一台 Ubuntu 24.04 云服务器；前端无构建步骤，后端使用 Python 3.12。
已有 Nginx 负责 80/443，systemd 管理仅监听 127.0.0.1:3001 的 FastAPI 单进程。
使用远程 BGE-M3 与 DeepSeek，不需要 GPU、Docker、Redis 或 MySQL。

## 文件与访问关系

```text
/opt/wx-portfolio/
  releases/20261029-.../      每次发布的完整公开源码
  current -> releases/...    当前运行版本
  previous -> releases/...   上次成功版本（首次发布时没有）
  venvs/<requirements-sha>/  按依赖指纹复用的 Python 环境
/var/www/wx-portfolio/wx -> /opt/wx-portfolio/current/frontend
/etc/wx-rag/backend.env     私有模型配置，root:root，600
/var/lib/wx-rag/            wxrag 用户所有，索引和 SQLite 额度持久化
/etc/systemd/system/wx-rag.service
/etc/nginx/sites-available/wx-portfolio
/etc/nginx/snippets/wx-portfolio-locations.conf
```

- `/wx/`：仅允许读取 frontend 静态文件，包含六个项目和完整简历。
- `/wx/api/v1/chat/stream`：流式问答，Nginx 关闭缓冲。
- `/wx/api/v1/qa`：普通 JSON 问答，外部客户端可测试。
- `/wx/health/ready`：资料与索引就绪后返回 200。
- `/wx/api/v1/admin/stats`：管理统计，仍需独立 Bearer 令牌。
- 根路径 `/` 跳转 `/wx/`，HTTP 跳转 HTTPS。后端、源码文档、私有配置不在网站根目录。

## 首次准备（已部署服务器不必重复）

保留原 Nginx default 站点、MySQL、SSH 和防火墙设置。确认域名 A 记录指向服务器；
不要增加错误的 AAAA 记录。证书验证和公网访问要求 80/443 可达。

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends python3-venv libgomp1 certbot unzip
sudo useradd --system --home-dir /var/lib/wx-rag --shell /usr/sbin/nologin wxrag
sudo install -d -m 755 /opt/wx-portfolio/releases /var/www/wx-portfolio /var/www/letsencrypt
sudo install -d -m 750 -o wxrag -g wxrag /var/lib/wx-rag
sudo install -d -m 700 /etc/wx-rag
```

用户已存在时跳过 useradd。上传 wx-fullstack.zip 到服务器临时目录；解压到新的 release，
不要把 ZIP 解压到 /var/www/html，也不要将整个仓库作为静态目录。

```bash
sudo mkdir /opt/wx-portfolio/releases/RELEASE
sudo unzip /tmp/wx-fullstack.zip -d /opt/wx-portfolio/releases/RELEASE
```

复制 deploy/native/backend.env.example 到 /etc/wx-rag/backend.env，私下填写模型密钥。
ADMIN_TOKEN、RATE_LIMIT_SALT 分别填独立的至少 32 字符随机值（如 secrets.token_urlsafe(48)）。
文件保持 root 所有且 chmod 600。systemd 在降权启动前读取它；wxrag 无需读取原文件。
模板使用线上同域 Origin，仅信任本机 Nginx 提供的代理头。当前云端并发上限为 2，
其余默认额度为单 IP 每分钟 6 次、每日 60 次、全局每日 300 次，UTC 日期重置。

```bash
sudo bash /opt/wx-portfolio/releases/RELEASE/scripts/deploy-native.sh /opt/wx-portfolio/releases/RELEASE
```

脚本安装按指纹隔离的依赖、运行离线边界测试、原子切换软链接、启动服务并等待就绪。
就绪失败时尝试恢复上一版本；首次发布没有旧版本可回退。此操作不替换其他 Nginx 站点。

## Nginx 与证书（首次）

先备份已有同名配置；安装 native/nginx-locations.conf 到上述 snippets 路径，
安装 native/nginx-http.conf 为 sites-available/wx-portfolio，创建 sites-enabled 软链接。
执行 nginx -t 成功后 reload，再通过外网确认 HTTP 路径和 ACME challenge 可访问。

```bash
sudo certbot certonly --webroot -w /var/www/letsencrypt -d llywjr.love --non-interactive --agree-tos --register-unsafely-without-email
```

首次安装使用无邮件 ACME 账户；可自行在服务器设置续期联系邮箱。
证书成功后，用 native/nginx-https.conf 替换该虚拟主机配置，再执行 nginx -t 和 reload。
安装 native/renew-nginx.sh 为 /etc/letsencrypt/renewal-hooks/deploy/wx-nginx（755），
启用 certbot.timer，执行 certbot renew --dry-run 验证自动续期链路。
本机默认出站连接证书服务曾间歇超时，因此安装 scripts/certbot-ipv4.py 为 /usr/local/sbin/wx-certbot-ipv4（755），
并将 native/certbot-ipv4.conf 安装到 /etc/systemd/system/certbot.service.d/ipv4.conf。daemon-reload 后，
定时续期仅在该 Certbot 进程内使用 IPv4；不修改系统 IPv6、DNS 或防火墙。用 wx-certbot-ipv4 renew --dry-run 验证。
自定义域名时需同时替换两个 Nginx 模板、私有配置和网站 canonical 元数据。

## 验收与常用操作

```bash
curl -f https://llywjr.love/wx/health/ready
curl -N https://llywjr.love/wx/api/v1/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"question":"介绍一下仵星的 RAG 项目","history":[]}'
sudo systemctl status wx-rag --no-pager
sudo journalctl -u wx-rag -n 80 --no-pager
sudo systemctl restart wx-rag
sudo nginx -t
```

浏览器检查桌面和手机：助手在线、真实流式回答、追问、来源、停止重试、简历与项目详情。
原始 IP 不进入应用日志；Nginx 使用系统默认访问日志，仅运维可读。
关闭开发电脑后线上仍运行；systemd 和 Nginx 均设置开机启动。

## 日常更新与回滚

**仍在本地调整、验收，成品确认后再发布**。无需反复推送看效果。
本地依次执行两个内容同步脚本及 check-local.py，再运行 package.py 生成最新统一包。
上传新包并解压到全新 release，执行 deploy-native.sh。
知识或模型参数变化时启动自动重建索引；纯样式更新复用原索引，不重复向量调用。
不要覆盖、删除 /var/lib/wx-rag 或私有 env；它们不随代码发布变化。

手动回滚：核对 previous 指向的版本，原子更新 current 为该路径并 restart wx-rag。
也可对旧 release 再执行 deploy-native.sh，自动执行测试与就绪检查。
若 Nginx 配置也变更，恢复相应配置备份，先 nginx -t 再 reload。
保留至少两个可用 release 与对应 venv；空间不足时先核对 current/previous，再清理未使用版本。
备份私有 env、公开知识源与持久化目录，备份不进 GitHub、不放网站。

deploy 下原有 Compose/Caddy 文件仅保留为可选的独立 API 示例，
**当前服务器使用 deploy/native，不启动 Compose/Caddy**，避免抢占现有端口。
