# Master Admin — ClickHouse Storage Topology (Phase 2D.2)

**Date:** 2026-07-26  
**Type:** Storage topology analysis + gated migration plan (no cleanup executed)

---

## Summary

Phase 2D.2 analyzes Docker volumes and bind mounts for `synqdrive-clickhouse` and documents a **gated migration** to stable shared paths.

### Key findings

| Issue | Severity |
|-------|----------|
| Config bind mounts release-relative (`./docker/clickhouse/...`) | P0 |
| Backup mount release-relative (`./storage/clickhouse/backups`) | P0 |
| `vps-deploy-release.sh` does not link ClickHouse shared paths | P1 |
| Historical stale mounts (`/tmp/synqdrive-ch-fix/`) | P0 |
| `clickhouse_data` named volume | Keep — contains live analytics data |

### Target stable layout

```
/opt/synqdrive/shared/clickhouse/
  backups/     → container /backups
  config/      → container /etc/clickhouse-server/config.d + users.d
```

Named volumes `clickhouse_data` and `clickhouse_logs` remain unchanged.

### Gates before cleanup

1. **G1 Backup validation** — `BACKUP DATABASE`, checksum, restore drill
2. **M1–M3** — seed shared tree, VPS compose override, recreate container
3. **M5 cleanup** — only after audit passes

## Deliverables

- `docs/remediation/clickhouse-storage-topology.md`
- `backend/scripts/ops/vps-clickhouse-storage-topology-audit.sh` (read-only)

## No changes in 2D.2

- No compose file modifications applied
- No volume deletion
- No container recreate on production

## References

- `docs/remediation/clickhouse-storage-topology.md`
- `docs/remediation/clickhouse-runtime-analysis.md` (2D.1)
