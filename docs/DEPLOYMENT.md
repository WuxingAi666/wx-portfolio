# 当前云端部署

入口：**http://8.152.192.126/wx/**。Nginx 直接提供 HTTP，前后端同域；不跳转旧域名，公众网站不依赖 443 放行；私有看板需要 HTTPS 和 TCP 443。
GitHub 只保存代码，Pages 已停用。直接使用服务器公网 IP，无需域名解析；以前分享的长链接跳转到此入口。

## 运行目录

```text
/opt/wx-portfolio/releases/RELEASE/   完整公开代码
/opt/wx-portfolio/current           当前 release 软链接
/opt/wx-portfolio/previous          上次成功版本
/opt/wx-portfolio/venvs/HASH/        按 requirements 指纹复用的环境
/var/www/wx-portfolio/wx            链接到 current/frontend
/etc/wx-rag/backend.env             私有配置，root 所有，600
/var/lib/wx-rag/                    FAISS 索引和 SQLite，wxrag 所有
```

Nginx 仅把 frontend 放入静态根目录，将 /wx/api/、/wx/health/ 转到回环 3001；
不公开 backend、docs、环境变量、索引或管理令牌。

## 首次部署

Ubuntu 24.04 / Python 3.12，先安装 python3-venv、libgomp1、Nginx。
创建无登录权限的 wxrag 用户和上述目录，保持现有 SSH、防火墙与 MySQL 设置。
模型由外部 API 提供，无需本机加载重模型。
上传成品压缩包/03-wx-fullstack.zip 并解压到全新 release。
按 deploy/native/backend.env.example 私下配置 /etc/wx-rag/backend.env，
ADMIN_TOKEN 与 RATE_LIMIT_SALT 分别使用至少 32 字符的独立随机值。
运行 scripts/set-admin-password.py 生成私有 ADMIN_PASSWORD_HASH，并只把哈希配置到服务器；不要把真实密码放入源码、命令参数或公开包。

```bash
sudo bash /opt/wx-portfolio/releases/RELEASE/scripts/deploy-native.sh /opt/wx-portfolio/releases/RELEASE
```

脚本按 requirements.txt 与 requirements-tooling.txt 的联合指纹创建隔离环境，先安装固定版本的 pip，再检查依赖和边界测试、原子切换 current、重启 systemd 并等待就绪；失败时尝试恢复旧 release。
安装 native/nginx-locations.conf 到 /etc/nginx/snippets/wx-portfolio-locations.conf，
安装 native/nginx-http.conf 到 /etc/nginx/sites-available/wx-portfolio，创建 sites-enabled 软链接。
保留默认站点，先 nginx -t 再 reload；仅发布 frontend/。

## 常用检查

```bash
curl -f http://8.152.192.126/wx/health/ready
curl -N http://8.152.192.126/wx/api/v1/chat/stream -H 'Content-Type: application/json' -d '{"question":"介绍仵星的 RAG 项目","history":[]}'
sudo systemctl status wx-rag --no-pager
sudo journalctl -u wx-rag -n 60 --no-pager
sudo nginx -t
```

当前额度：单 IP 每分钟 6 次、每日 60 次，全局每日 300 次；最多 2 个并发，UTC 日期重置。
管理统计需要独立 Bearer 鉴权，令牌不放浏览器；应用日志不保存问题和回答正文。

## 更新与回滚

本地同步内容、检查、生成三份交付，再上传全新 release 并执行激活脚本。
知识变化时按指纹自动重建；样式变化复用索引。私有 env 和 /var/lib/wx-rag 不随代码覆盖。
回滚可对 previous 指向的旧 release 再执行激活脚本；Nginx 也变更时恢复对应配置备份再校验 reload。
保留当前与上一个已验证版本；历史源码与 Git 提交在本机维护仓库中保存。
HTTP 页面不要提交敏感信息；正式使用自有域名时可再配置对应 HTTPS。当前项目仅使用本人公开资料。

## 当前管理入口

2026-10-30 已验证并启用密钥登录，管理账户 wxadmin，SSH 端口 22222；密码登录与远程 root 登录已关闭。
日常通过本机成品根目录「连接云服务器.cmd」登录，管理员命令使用 sudo。
本机私钥、连接配置与恢复说明保存在用户私有目录和本机维护目录，不放入公开成品。
换电脑需安全迁移密钥或安装新公钥；丢失密钥时走 ECS 的 VNC / 管理终端恢复，不能依赖普通 SSH 密码连接。

## 对话后台与 HTTPS

看板：https://8.152.192.126/wx/kanban/；快捷路径 /wx-kanban 自动跳转。兼容 /wx/admin/。登录密码与内部 API 令牌分开配置，详见 CONVERSATIONS.md。
Nginx HTTPS 站点使用 deploy/native/nginx-https.conf。公网 HTTP 管理请求会被拒绝；安全组需允许 TCP 443，未放行时可使用 SSH 隧道。

IP 证书使用隔离环境 /opt/wx-certbot 中的 Certbot 5.9 或更高版本，Let’s Encrypt shortlived profile、HTTP-01 验证（80 端口）。签发命令：

```bash
sudo /opt/wx-certbot/bin/certbot certonly --webroot -w /var/www/letsencrypt --ip-address 8.152.192.126 --required-profile shortlived --cert-name wx-ip --non-interactive --agree-tos --register-unsafely-without-email --preferred-challenges http --key-type ecdsa
```

证书有效期很短，必须自动续期：安装 wx-certbot-ipv4.py 到 /usr/local/sbin/wx-certbot-ipv4（755），服务 ExecStart 使用该包装器 -q renew；把 certbot-timer.conf 安装到 certbot.timer.d/wx-shortlived.conf，每四小时检查一次；保留成功续期后 nginx -t && systemctl reload nginx 的 deploy hook。先完成 renew --cert-name wx-ip --dry-run，再验证 timer。不替换其他站点的证书。
云端 conversations.sqlite3 随 STORAGE_DIR 放在 /var/lib/wx-rag，必须与代码 release 分开保存，不上传到网站静态根目录。
