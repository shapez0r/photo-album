#!/usr/bin/env sh
# Installs a locally built photoalbum binary as a systemd service on any Linux
# host or VM.  Usage:  make build && sudo ./scripts/install.sh [path/to/photoalbum]
set -eu

BIN="${1:-./bin/photoalbum}"
[ -x "$BIN" ] || { echo "binary not found: $BIN (run 'make build' first)" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

install -m 0755 "$BIN" /usr/local/bin/photoalbum
install -d -m 0755 /etc/photoalbum
[ -f /etc/photoalbum/photoalbum.env ] || cat > /etc/photoalbum/photoalbum.env <<'ENV'
# photoalbum settings (see README). Restart the service after changes.
PHOTOALBUM_ALLOW_SIGNUP=true
PHOTOALBUM_SIGNUP_CIDRS=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.0/8,fc00::/7,fe80::/10,::1/128
PHOTOALBUM_COOKIE_SECURE=false
ENV
install -m 0644 "$(dirname "$0")/../deploy/systemd/photoalbum.service" /etc/systemd/system/photoalbum.service
systemctl daemon-reload
systemctl enable --now photoalbum
echo "photoalbum is running on port 8092. Data: /var/lib/photoalbum  Config: /etc/photoalbum/photoalbum.env"
