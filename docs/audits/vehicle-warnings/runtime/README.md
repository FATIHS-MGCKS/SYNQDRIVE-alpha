# Runtime

VPS-, PM2-, Queue- und Metrics-Befunde (read-only).

## Erlaubte Erfassung

- `pm2 status`, `pm2 describe` (ohne env dump)
- BullMQ queue counts (wait/active/failed/delayed)
- Prometheus/Grafana-Snapshots (aggregiert)
- Deploy-Commit vs. Repo-Commit Vergleich
- Health-Check-Ergebnisse (`GET /api/v1/health`)

## Verboten

- `pm2 restart`, Queue-Purge, Container-Restart
- Vollständige `.env` oder Secret-Dumps

## Zeit

Alle technischen Zeitvergleiche in **UTC**; lokale Anzeige separat notieren.
