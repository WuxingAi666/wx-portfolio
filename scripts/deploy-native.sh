#!/usr/bin/env bash
# Activate an extracted, public-source release on Ubuntu with existing Nginx.
# Provision OS packages, service user and private env first; see DEPLOYMENT.md.
set -euo pipefail
release_dir=$(realpath "${1:?Usage: sudo bash scripts/deploy-native.sh /opt/wx-portfolio/releases/RELEASE}")
case "$release_dir" in /opt/wx-portfolio/releases/*) ;; *) echo 'Release must stay inside /opt/wx-portfolio/releases' >&2; exit 1;; esac
test -f "$release_dir/backend/requirements.txt"
test -f /etc/wx-rag/backend.env
test "$(id -u)" = 0

# Share identical environments while keeping dependency versions available for rollback.
requirements_hash=$(sha256sum "$release_dir/backend/requirements.txt" | cut -d' ' -f1)
env_dir="/opt/wx-portfolio/venvs/$requirements_hash"
if [ ! -f "$env_dir/.installed" ]; then
    python3 -m venv "$env_dir"
    "$env_dir/bin/python" -m pip install --no-cache-dir -r "$release_dir/backend/requirements.txt"
    "$env_dir/bin/python" -m pip check
    touch "$env_dir/.installed"
fi
ln -sfn "$env_dir" "$release_dir/.venv"
(cd "$release_dir/backend" && "$env_dir/bin/python" -m unittest discover -s tests -v)

previous=$(readlink -f /opt/wx-portfolio/current || true)
activate() {
    ln -sfn "$1" /opt/wx-portfolio/current.next
    mv -Tf /opt/wx-portfolio/current.next /opt/wx-portfolio/current
}
activate "$release_dir"
install -d -m 755 /var/www/wx-portfolio
ln -sfn /opt/wx-portfolio/current/frontend /var/www/wx-portfolio/wx
install -m 644 "$release_dir/deploy/native/wx-rag.service" /etc/systemd/system/wx-rag.service
systemctl daemon-reload
systemctl enable wx-rag
systemctl restart wx-rag
ready=0
for attempt in $(seq 1 60); do
    if curl -fsS --max-time 3 http://127.0.0.1:3001/health/ready >/dev/null; then ready=1; break; fi
    sleep 2
done
if [ "$ready" != 1 ]; then
    echo 'Readiness failed; restoring the previous release when available' >&2
    if [ -n "$previous" ] && [ "$previous" != /opt/wx-portfolio/current ] && [ "$previous" != "$release_dir" ]; then
        activate "$previous"
        systemctl restart wx-rag
    fi
    exit 1
fi
if [ -n "$previous" ] && [ "$previous" != "$release_dir" ] && [ "$previous" != /opt/wx-portfolio/current ]; then
    ln -sfn "$previous" /opt/wx-portfolio/previous
fi
printf 'Ready: %s\n' "$release_dir"
# Nginx/certificate changes are separate, checked operations; never replace default sites here.
