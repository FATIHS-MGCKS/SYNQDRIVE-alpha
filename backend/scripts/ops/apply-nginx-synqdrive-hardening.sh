#!/usr/bin/env bash
# Apply SynqDrive nginx HSTS + /metrics hardening on the production VPS.
# Idempotent: skips blocks that are already present.
set -euo pipefail

SITE="/etc/nginx/sites-enabled/synqdrive"
BACKUP="/root/synqdrive.bak.$(date -u +%Y%m%d%H%M%S)"

if [[ ! -f "$SITE" ]]; then
  echo "ERROR: nginx site config not found: $SITE" >&2
  exit 1
fi

cp "$SITE" "$BACKUP"
echo "Backup: $BACKUP"

python3 - <<'PY'
from pathlib import Path

site = Path("/etc/nginx/sites-enabled/synqdrive")
text = site.read_text()

metrics_block = """
    location = /metrics {
        return 404;
    }

"""

hsts_line = '    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n'

changed = False

if "location = /metrics" not in text:
    marker = "    location / {"
    if marker not in text:
        raise SystemExit("Could not find location / block in nginx config")
    text = text.replace(marker, metrics_block + marker, 1)
    changed = True
    print("Added location = /metrics -> 404")

if 'add_header Strict-Transport-Security' not in text:
    marker = "        add_header Content-Security-Policy "
    if marker not in text:
        raise SystemExit("Could not find CSP add_header in location / block")
    hsts_line = '        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;\n'
    text = text.replace(marker, hsts_line + marker, 1)
    changed = True
    print("Added HSTS header in location /")

if changed:
    site.write_text(text)
    print("Config updated.")
else:
    print("No changes needed — hardening already present.")
PY

nginx -t
systemctl reload nginx
echo "nginx reloaded OK"
