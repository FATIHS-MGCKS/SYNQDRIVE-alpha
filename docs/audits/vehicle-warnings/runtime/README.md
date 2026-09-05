# Runtime — Vehicle Warnings Audit (Prompt 23/26)

VPS-, PM2-, Queue-, Redis- und Log-Befunde (**read-only**, anonymisiert).

| Datei | Inhalt |
|-------|--------|
| [`vps-runtime-inventory.md`](./vps-runtime-inventory.md) | Host, PM2, Docker, Versionen, Logpfade, Queue-Namen |
| [`ingestion-observations.md`](./ingestion-observations.md) | DIMO Poll, DB-Aggregate, Warning-Materialisierung |
| [`queue-observations.md`](./queue-observations.md) | BullMQ wait/active/failed |
| [`redis-observations.md`](./redis-observations.md) | Speicher, Keyspace, Cache-Patterns |
| [`application-log-observations.md`](./application-log-observations.md) | PM2/Nginx/API-Fehler |
| [`time-and-version-observations.md`](./time-and-version-observations.md) | NTP, Deploy-Timeline, Commits |

**Audit-Zeitpunkt (UTC):** 2026-07-25T17:53Z · **Hostname anonymisiert:** `VPS-PROD-01`

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
