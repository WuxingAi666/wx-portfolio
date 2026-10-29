#!/usr/bin/env sh
# Install as /etc/letsencrypt/renewal-hooks/deploy/wx-nginx (executable).
set -eu
nginx -t
systemctl reload nginx
