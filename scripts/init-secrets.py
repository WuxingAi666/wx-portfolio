"""Run on your server: generate internal admin/salt settings, keep API keys."""
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / "backend" / ".env"
if not path.exists():
    print("先复制 backend/.env.example 为 backend/.env 并填写模型密钥。")
    sys.exit(1)
lines = path.read_text(encoding="utf-8").splitlines()
existing = dict(line.split("=", 1) for line in lines if "=" in line and not line.lstrip().startswith("#"))
updates = {}
for key in ("ADMIN_TOKEN", "RATE_LIMIT_SALT"):
    value = existing.get(key, "")
    if len(value) < 32 or "development" in value:
        updates[key] = secrets.token_urlsafe(36)
result = [line for line in lines if line.split("=", 1)[0] not in updates]
result.extend(key + "=" + value for key, value in updates.items())
path.write_text("\n".join(result) + "\n", encoding="utf-8")
print("内部管理密钥和限流盐值已准备好（未显示具体内容）。")
