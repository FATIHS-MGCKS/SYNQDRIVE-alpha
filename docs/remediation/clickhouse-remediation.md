# Master Admin Remediation — Phase 2D.7: ClickHouse Remediation

**Date:** 2026-07-26  
**Status:** Controlled remediation implemented (repo + ops tooling)  
**Prerequisites:** [2D.1](./clickhouse-runtime-analysis.md) · [2D.2](./clickhouse-storage-topology.md) · [2D.3](./clickhouse-data-integrity.md) · [2D.4](./clickhouse-tenant-isolation.md) · [2D.5](./clickhouse-performance.md) · [2D.6](./clickhouse-pipeline-analysis.md)  
**Constraint:** No data loss — backup before change, rollback documented, integrity + health after each step

---

## Executive summary

| Step | What changed | Data loss risk | Rollback |
|------|--------------|----------------|----------|
| **G1** | `BACKUP DATABASE` + sha256 manifest | None | Restore from backup |
| **M1** | Shared tree `/opt/synqdrive/shared/clickhouse/` | None (copy/mv -n) | Re-copy from release |
| **M2** | `docker-compose.vps-clickhouse.yml` in repo | None | Omit override |
| **M3** | Container recreate (named volumes preserved) | **None** — `clickhouse_data` reused | Recreate without override |
| **007** | Additive `org_id` columns | None | Columns remain (harmless) |
| **App** | `org_id` on snapshot/state-change writes | None | Revert deploy |
| **Perf** | `async_insert` server profile | None | Remove XML + recreate |
| **Backfill** | `org_id` mutations on legacy rows | None | Rows keep last org_id |

**VPS execution:** Operator runs `vps-clickhouse-remediation.sh` on production. Cloud Agent implements repo artifacts; live VPS run is operator-driven.

---

## 1. Scope (from prior analyses)

Only changes explicitly planned across 2D.1–2D.6:

| Source | Approved remediation |
|--------|---------------------|
| **2D.2** | G1 backup gate; M1–M5 storage topology migration |
| **2D.3** | Integrity audit after each step |
| **2D.4** | Migration 007 + org_id writes + backfill script |
| **2D.5** | `async_insert` (IN1); Docker resource limits (B2) |
| **2D.6** | Pipeline observability via health/pipeline audits |

**Explicitly deferred** (not in 2D.7):

- Migration 008 (ORDER BY rewrite) — destructive
- CH write outbox (R1) — larger application change
- Snapshot client-side dedup (R2) — needs design validation
- `OPTIMIZE TABLE` schedule — run manually in maintenance window

---

## 2. Repository changes

### 2.1 Infrastructure

| File | Purpose |
|------|---------|
| `backend/docker-compose.vps-clickhouse.yml` | Stable shared bind mounts + CPU/RAM limits |
| `backend/docker/clickhouse/config.d/z_async_insert.xml` | Server-side insert batching |
| `backend/docker-compose.yml` | Local dev mounts `z_async_insert.xml` |

### 2.2 Schema

| File | Purpose |
|------|---------|
| `migrations/007_legacy_mirror_org_id_columns.sql` | Additive `org_id` on legacy tables (already present; now deployed) |

### 2.3 Application

| File | Change |
|------|--------|
| `clickhouse-telemetry.service.ts` | `insertSnapshot(orgId, …)` + `detectAndInsertStateChanges(orgId, …)` |
| `dimo-snapshot.processor.ts` | Passes `vehicle.organizationId` to CH mirror |

### 2.4 Ops scripts

| Script | Role |
|--------|------|
| `vps-clickhouse-remediation.sh` | Main orchestrator (dry-run default) |
| `vps-clickhouse-backup.sh` | G1 backup + manifest |
| `vps-clickhouse-health-check.sh` | Post-step validation |
| `vps-clickhouse-backfill-org-id.sh` | Post-007 org_id mutations |
| `vps-clickhouse-compose-env.sh` | `COMPOSE_FILE` resolver |
| `vps-deploy-release.sh` | M4 config sync on each deploy |

---

## 3. Execution procedure (VPS)

### 3.1 Pre-flight

```bash
# 1. Deploy latest release (includes 2D.7 artifacts)
bash /opt/synqdrive/current/backend/scripts/ops/vps-deploy-release.sh

# 2. Dry-run remediation plan
bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-remediation.sh --dry-run
```

**Pass criteria before `--execute`:**

- [ ] `vps-clickhouse-storage-topology-audit.sh` reviewed (know current mount state)
- [ ] Disk < 85% on `/`
- [ ] Maintenance window communicated (if using `--recreate`)

### 3.2 Execute remediation

```bash
cd /opt/synqdrive/current/backend/scripts/ops

# Step A: G1 backup + M1 shared tree + M2 verify (no container recreate)
bash vps-clickhouse-remediation.sh --execute

# Step B: Enable VPS compose override in backend.env (one-time, after M1)
# Add to /opt/synqdrive/shared/backend.env:
# COMPOSE_FILE=/opt/synqdrive/current/backend/docker-compose.yml:/opt/synqdrive/current/backend/docker-compose.vps-clickhouse.yml

# Step C: Recreate container with stable mounts (brief analytics outage)
bash vps-clickhouse-remediation.sh --execute --recreate

# Step D: Deploy app (migration 007 + org_id writes) — if not already on 2D.7 release
bash vps-deploy-release.sh

# Step E: Backfill historical org_id (optional, after 007 applied)
DATABASE_URL='...' bash vps-clickhouse-backfill-org-id.sh --dry-run
DATABASE_URL='...' bash vps-clickhouse-remediation.sh --execute --backfill-org
```

### 3.3 Post-remediation validation

```bash
bash vps-clickhouse-health-check.sh
bash vps-clickhouse-data-integrity-audit.sh
bash vps-clickhouse-storage-topology-audit.sh
bash vps-clickhouse-pipeline-audit.sh
bash vps-clickhouse-tenant-isolation-audit.sh
curl -sf http://127.0.0.1:3001/api/v1/health/readiness | jq '.checks.clickhouse'
```

**Expected:**

- Topology audit: bind sources under `/opt/synqdrive/shared/clickhouse/`
- Integrity audit: exit 0
- Pipeline audit: snapshot lag < 600s for active fleet
- Tenant audit: new writes carry `org_id`; backfill reduces empty `org_id` rows

---

## 4. Step-by-step guarantees

### Gate G1 — Backup

**Script:** `vps-clickhouse-backup.sh`

| Check | After G1 |
|-------|----------|
| `BACKUP DATABASE` success | Required |
| sha256 manifest written | `shared/clickhouse/backup-manifests/` |
| Integrity audit | `vps-clickhouse-data-integrity-audit.sh` exit 0 |
| Health check | `vps-clickhouse-health-check.sh` exit 0 |

**Abort if:** backup file missing or checksum write fails.

### Phase M1 — Shared tree

**Actions:** `mkdir`, `install -m 644` config XMLs, `mv -n` backup ZIPs.

| Guarantee | |
|-----------|---|
| Data loss | **None** — copies only |
| Integrity | Topology audit after M1 |
| Rollback | Old release-relative paths still work until M3 |

### Phase M2 — Compose override

**Artifact:** `docker-compose.vps-clickhouse.yml`

| Guarantee | |
|-----------|---|
| Named volumes | `clickhouse_data`, `clickhouse_logs` unchanged |
| Local dev | Unchanged — override VPS-only |

### Phase M3 — Container recreate

| Guarantee | |
|-----------|---|
| Data persistence | Named volume `/var/lib/clickhouse` preserved |
| Outage | Brief — analytics mirror only; PG/Redis/API unaffected |
| Integrity | Full audit suite after recreate |
| Health | `vps-clickhouse-health-check.sh` |

### Migration 007 + org_id writes

| Guarantee | |
|-----------|---|
| DDL | `ADD COLUMN IF NOT EXISTS` only |
| Existing rows | `org_id = ''` until backfill |
| New rows | `organizationId` from snapshot processor |
| Rollback | Deploy previous release; columns harmless if left |

### async_insert (2D.5 IN1)

| Setting | Value |
|---------|-------|
| `async_insert` | 1 |
| `wait_for_async_insert` | 1 |
| `async_insert_max_data_size` | 1 MiB |

**Effect:** Reduces part explosion from 30s single-row polls. No semantic change to data.

---

## 5. Integrity checks (per step)

| After step | Script | P0 failure action |
|------------|--------|-------------------|
| G1 | `vps-clickhouse-data-integrity-audit.sh` | Stop — do not proceed |
| G1 | `vps-clickhouse-health-check.sh` | Investigate CH before M1 |
| M1 | `vps-clickhouse-storage-topology-audit.sh` | Fix shared paths |
| M3 | All audits + `vps-clickhouse-pipeline-audit.sh` | Rollback recreate |
| Deploy | API readiness `clickhouse=available` | Rollback PM2 release |
| Backfill | `vps-clickhouse-tenant-isolation-audit.sh` | Stop mutations |

---

## 6. Health checks (per step)

`vps-clickhouse-health-check.sh` validates:

1. Container running + health status
2. `SELECT 1` via clickhouse-client
3. API readiness endpoint (when reachable)
4. Snapshot mirror lag (warn if > 600s)
5. Table count in `synqdrive` database

---

## 7. Backup inventory

| Artifact | Location |
|----------|----------|
| G1 ZIP | `/opt/synqdrive/shared/clickhouse/backups/g1_*.zip` |
| sha256 | `shared/clickhouse/backup-manifests/*.sha256` |
| Manifest JSON | `shared/clickhouse/backup-manifests/*.manifest.json` |
| Remediation log | `shared/clickhouse/remediation-state/remediation_*.log` |
| Pre-deploy PG dump | `/opt/synqdrive/shared/backups/db-pre-deploy-*.sql.gz` (deploy script) |

**Retention:** Keep G1 backup until post-remediation validation passes + 7 days.

---

## 8. Rollback plan

| Failure point | Rollback action | Data impact |
|---------------|-----------------|-------------|
| M3 recreate fails | `COMPOSE_FILE` unset; recreate from last good release path | None — volumes intact |
| Wrong mounts after M3 | Fix shared tree (M1); re-run M3 | None |
| Migration 007 issue | Stop backend; CH columns additive — no drop needed | None |
| org_id write errors | Revert to previous backend release | Old writes without org_id |
| async_insert issues | Remove `z_async_insert.xml` from shared config; recreate | None |
| Data doubt | `RESTORE DATABASE` from G1 backup to drill instance; compare counts | Production untouched until validated |

**Never:**

- `docker compose down -v`
- Delete `clickhouse_data` volume
- `DROP TABLE` / `TRUNCATE` without backup

---

## 9. Operator checklist

### Before

- [ ] Read 2D.1–2D.6 analysis docs
- [ ] `vps-clickhouse-remediation.sh --dry-run`
- [ ] Disk space ≥ 15% free on `/`
- [ ] Stakeholders notified (if `--recreate`)

### During

- [ ] `--execute` (G1 + M1 + M2)
- [ ] Set `COMPOSE_FILE` in `backend.env`
- [ ] `--execute --recreate` (M3)
- [ ] Deploy 2D.7 release
- [ ] Optional: `--backfill-org`

### After

- [ ] All audit scripts exit 0
- [ ] Readiness `clickhouse=available`
- [ ] `synqdrive_clickhouse_mirror_writes_total{result="success"}` increasing
- [ ] Attach remediation log to ticket
- [ ] Optional: `vps-enable-clickhouse-mirrors.sh`

---

## 10. Live execution log (placeholder)

> **Status:** VPS execution pending operator run.

```
Date:
Operator:
Release:
G1 backup: TBD (path + sha256)
M1 shared tree: TBD
M3 recreate: TBD
Migration 007 applied: TBD
org_id backfill: TBD
Final audits: TBD
```

---

## 11. Related files

| Path | Role |
|------|------|
| `architecture/MASTER_ADMIN_CLICKHOUSE_REMEDIATION_2026-07-26.md` | Architecture record |
| `backend/docker-compose.vps-clickhouse.yml` | VPS compose override |
| `backend/scripts/ops/vps-clickhouse-remediation.sh` | Orchestrator |

---

*Phase 2D.7 — controlled remediation. PostgreSQL remains canonical; ClickHouse analytics mirror only.*
