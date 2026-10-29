# 当前云端部署

入口：**http://cloud.8-152-192-126.sslip.io/wx/**。Nginx 直接提供 HTTP，前后端同域；不跳转旧域名，不依赖 443 放行。
GitHub 只保存代码，Pages 已停用。新主机名由 sslip.io 公共 DNS 解析到 8.152.192.126。

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

```bash
sudo bash /opt/wx-portfolio/releases/RELEASE/scripts/deploy-native.sh /opt/wx-portfolio/releases/RELEASE
```

脚本检查依赖和边界测试、原子切换 current、重启 systemd 并等待就绪；失败时尝试恢复旧 release。
安装 native/nginx-locations.conf 到 /etc/nginx/snippets/wx-portfolio-locations.conf，
安装 native/nginx-http.conf 到 /etc/nginx/sites-available/wx-portfolio，创建 sites-enabled 软链接。
保留默认站点，先 nginx -t 再 reload；仅发布 frontend/。

## 常用检查

```bash
curl -f http://cloud.8-152-192-126.sslip.io/wx/health/ready
curl -N http://cloud.8-152-192-126.sslip.io/wx/api/v1/chat/stream -H 'Content-Type: application/json' -d '{"question":"介绍仵星的 RAG 项目","history":[]}'
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
