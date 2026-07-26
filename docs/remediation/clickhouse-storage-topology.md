# Master Admin Remediation — Phase 2D.2: ClickHouse Storage Topology

**Date:** 2026-07-26  
**Status:** Analysis + migration plan (no cleanup executed)  
**Prerequisite:** [2D.1 Runtime Analysis](./clickhouse-runtime-analysis.md)  
**Constraint:** Cleanup and mount changes **only after successful backup validation**

---

## Executive summary

| Finding | Severity | Action |
|---------|----------|--------|
| Config bind mounts are **release-relative** (`./docker/clickhouse/...`) | **P0** | Migrate to stable shared paths outside release tree |
| Backup bind mount is **release-relative** (`./storage/clickhouse/backups`) | **P0** | Migrate to `/opt/synqdrive/shared/clickhouse/backups` |
| `vps-deploy-release.sh` does **not** link ClickHouse shared paths | **P1** | Add shared symlinks on deploy (like `uploads` / `documents`) |
| Historical **stale mount** incident (`/tmp/synqdrive-ch-fix/...`) | **P0** | Audit + recreate container from `/opt/synqdrive/current/backend` |
| Named volumes `clickhouse_data` / `clickhouse_logs` | **OK** | **Keep** — do not delete; contain live data |
| Possible **orphan volumes** from old compose project names | P2 | Audit only; remove only after validation |
| `clickhouse_logs` volume | P3 | Optional future consolidation; not required for stability |

**Verdict:** The current compose topology is **unsafe for production** because bind mounts follow the mutable release directory. Named data volumes are correct and must be preserved. Phase 2D.2 delivers an audit script and a gated migration plan — **no destructive steps in this phase**.

---

## 1. Scope

This document inventories:

1. All Docker **named volumes** used by ClickHouse
2. All **bind mounts** (host → container)
3. Cross-environment path contracts (local dev vs VPS prod)
4. Known failure modes (orphaned mounts, missing directories, release drift)
5. A **gated migration plan** to a stable shared topology

**Out of scope for 2D.2 execution:** applying compose changes, deleting volumes, or recreating the production container.

---

## 2. Current topology (as defined in repo)

### 2.1 Compose service `clickhouse`

Source: `backend/docker-compose.yml`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Container: synqdrive-clickhouse                                             │
│ Image:     clickhouse/clickhouse-server:25.8                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ NAMED VOLUMES                                                               │
│   clickhouse_data  →  /var/lib/clickhouse     (analytics data — CRITICAL)   │
│   clickhouse_logs  →  /var/log/clickhouse-server                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ BIND MOUNTS (all relative to compose project dir = backend/)                │
│   ./storage/clickhouse/backups                                               │
│       → /backups                                                             │
│   ./docker/clickhouse/config.d/backup_disk.xml                               │
│       → /etc/clickhouse-server/config.d/backup_disk.xml          (ro)       │
│   ./docker/clickhouse/config.d/01_logger.xml                                 │
│       → /etc/clickhouse-server/config.d/01_logger.xml              (ro)       │
│   ./docker/clickhouse/config.d/z_system_logs.xml                             │
│       → /etc/clickhouse-server/config.d/z_system_logs.xml          (ro)       │
│   ./docker/clickhouse/users.d/z_log_profiles.xml                             │
│       → /etc/clickhouse-server/users.d/z_log_profiles.xml          (ro)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Docker volume naming (compose project)

Compose prefixes volume names with the **project name** (directory name by default):

| Declared name | Typical host path (VPS) |
|---------------|-------------------------|
| `clickhouse_data` | `/var/lib/docker/volumes/backend_clickhouse_data/_data` |
| `clickhouse_logs` | `/var/lib/docker/volumes/backend_clickhouse_logs/_data` |

If the container was ever started from a different working directory or with `-p <name>`, volume names differ → **orphan volume risk**.

Verify:

```bash
docker volume ls | grep -i clickhouse
docker inspect synqdrive-clickhouse --format '{{range .Mounts}}{{.Type}}\t{{.Name}}\t{{.Source}}\t{{.Destination}}{{"\n"}}{{end}}'
```

### 2.3 Intended VPS shared layout (target — not yet wired in compose)

Aligned with existing SynqDrive shared patterns (`uploads`, `documents`, `backups`):

```
/opt/synqdrive/
├── current/                          # symlink → releases/<id>
│   └── backend/
│       └── docker-compose.yml        # still defines service; mounts should point to shared/
├── releases/
│   └── <timestamp>_v4994/
│       └── backend/
│           ├── storage/clickhouse/backups/   # ⚠ release-local — must not be canonical on VPS
│           └── docker/clickhouse/          # ⚠ release-local config — OK as source, not as live mount
└── shared/
    ├── backend.env
    ├── uploads/                      # ✅ already symlinked on deploy
    ├── storage/documents/            # ✅ already symlinked on deploy
    ├── backups/
    │   └── clickhouse/daily/         # encrypted archives (ops contract)
    └── clickhouse/                   # 🎯 TARGET stable tree (2D.3+)
        ├── backups/                  # → container /backups
        └── config/
            ├── config.d/
            │   ├── backup_disk.xml
            │   ├── 01_logger.xml
            │   └── z_system_logs.xml
            └── users.d/
                └── z_log_profiles.xml
```

---

## 3. Environment matrix

| Mount / path | Local dev (`backend/`) | VPS prod (current compose) | VPS prod (target) |
|--------------|------------------------|----------------------------|-------------------|
| Data volume | `clickhouse_data` | same | **unchanged** |
| Log volume | `clickhouse_logs` | same | **unchanged** (optional trim later) |
| `/backups` | `./storage/clickhouse/backups` | `/opt/synqdrive/current/backend/storage/clickhouse/backups` | `/opt/synqdrive/shared/clickhouse/backups` |
| Config XMLs | `./docker/clickhouse/...` | `/opt/synqdrive/current/backend/docker/clickhouse/...` | `/opt/synqdrive/shared/clickhouse/config/...` |
| Encrypted backup archives | N/A (local zip only) | `/opt/synqdrive/shared/backups/clickhouse/daily` | unchanged |

---

## 4. Findings — issues to resolve

### 4.1 P0 — Release-relative bind mounts (config)

**Problem:** Four config files are bind-mounted from `./docker/clickhouse/...` relative to the compose working directory.

**Failure mode (confirmed in production — P78):**

- Container created while cwd or release pointed at `/tmp/synqdrive-ch-fix/backend`
- Later fix removed `/tmp/synqdrive-ch-fix`
- Container retained stale `Source` paths → **Exit 127** on start
- **Named volume `clickhouse_data` was intact** — data not lost

**Symptoms:**

```bash
docker inspect synqdrive-clickhouse --format '{{json .Mounts}}' | jq '.[] | select(.Type=="bind") | {dest: .Destination, source: .Source}'
# Source contains /tmp/ or a non-current release path
test -f "$(docker inspect ... mount source)"  # fails
```

**Root cause:** Bind mounts store **absolute host paths** at container create time. Deploy only updates `/opt/synqdrive/current` symlink; it does **not** recreate ClickHouse.

### 4.2 P0 — Release-relative backup directory

**Problem:** `./storage/clickhouse/backups:/backups` lives under the release tree.

| Risk | Impact |
|------|--------|
| New release, old container | Container still writes backups to **old** release path |
| Release directory pruned | Backup ZIPs on disk may be deleted with old release |
| `BACKUP DATABASE` succeeds but file lands in wrong place | Offsite/encrypted backup scripts miss artifacts |

**Inconsistency:** Ops documentation references `/opt/synqdrive/shared/clickhouse/backups`, but compose does not mount that path. Until a VPS override exists, the live `/backups` path follows whatever release was active at last `docker compose up`.

### 4.3 P1 — Deploy script gap

`vps-deploy-release.sh` symlinks:

- `backend.env`, `frontend.env`
- `uploads`
- `storage/documents`

It does **not**:

- Symlink ClickHouse backup directory to shared
- Symlink or sync ClickHouse config to shared
- Recreate or health-check `synqdrive-clickhouse` after release switch

**Consequence:** Application deploy and ClickHouse storage topology are **decoupled** — silent mount drift across releases.

### 4.4 P2 — Orphaned Docker volumes

**Candidates for orphan status** (require audit — do not delete blindly):

| Pattern | Why orphan |
|---------|------------|
| `backend_clickhouse_data` vs `synqdrive_clickhouse_data` | Different compose project name |
| Volume not attached to any container | Left after `docker rm` without `-v` |
| Duplicate `*_clickhouse_data` with different creation dates | Manual experiments / tmp paths |

**Rule:** A volume is orphan **only if** (a) not referenced by running `synqdrive-clickhouse`, and (b) confirmed empty or superseded by checksum/row-count comparison after backup.

### 4.5 P2 — Orphaned host directories

| Path | Status |
|------|--------|
| `/tmp/synqdrive-ch-fix/` | Should not exist; if present, stale |
| `/opt/synqdrive/releases/*/backend/storage/clickhouse/backups/` | May contain stray ZIPs from release-local era |
| Empty `storage/clickhouse/backups` in old releases | Low risk; audit before delete |

### 4.6 P3 — `clickhouse_logs` named volume

Server logs are also constrained by:

- `01_logger.xml` (100M × 3 inside container)
- Docker `json-file` driver (50M × 3)

The named volume is **not harmful** but duplicates log retention mechanisms. Consolidation is optional post-stabilization.

### 4.7 Non-issues (do not “fix”)

| Item | Reason to keep |
|------|----------------|
| `clickhouse_data` volume | Contains all MergeTree data |
| Local dev relative mounts | Correct for `npm run infra:up` |
| Single backup disk in XML | Intentional Phase 1 design |
| No replication | Accepted architecture |

---

## 5. Audit procedure (read-only)

Run on VPS **before any migration**:

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-storage-topology-audit.sh \
  | tee /opt/synqdrive/shared/reports/clickhouse-topology-audit-$(date -u +%Y%m%dT%H%M%SZ).log
```

The script checks:

1. Container exists and health status
2. Every bind mount `Source` exists on host
3. Stale path patterns (`/tmp/synqdrive`, old `releases/` paths not matching `current`)
4. All `*clickhouse*` Docker volumes and attachment state
5. Disk usage for data, backups, logs
6. Consistency: in-container `/backups` vs expected shared path
7. Exit code `1` if any P0 check fails

See script: `backend/scripts/ops/vps-clickhouse-storage-topology-audit.sh`

---

## 6. Migration plan (gated)

### Gate G0 — Documentation complete

- [x] 2D.1 runtime baseline
- [x] 2D.2 topology analysis (this document)
- [ ] VPS audit log attached to ticket

### Gate G1 — Backup validation (mandatory before any mount change)

**No mount migration proceeds until all pass:**

| Step | Command / check | Pass criteria |
|------|-----------------|---------------|
| G1.1 | `BACKUP DATABASE synqdrive TO Disk('backups', 'pre-topology-migration_<ts>.zip')` | Query OK; file exists on host |
| G1.2 | Record backup path + `sha256sum` | Checksum file stored |
| G1.3 | Copy encrypted archive to safe location (or verify existing daily GPG backup < 24h) | Artifact retrievable |
| G1.4 | Restore drill into isolated DB/port | `vps-restore-test-clickhouse.sh` or manual RESTORE to drill instance |
| G1.5 | Row-count / table-count smoke | Drill DB matches production metadata |
| G1.6 | `GET /api/v1/health/readiness` → `checks.clickhouse` available | Production unaffected |

**Abort criteria:** any backup or restore failure → fix backup path first (likely `/backups` mount issue).

### Phase M1 — Prepare stable shared tree (non-destructive)

Execute on VPS:

```bash
SHARED=/opt/synqdrive/shared/clickhouse
RELEASE=/opt/synqdrive/current/backend
mkdir -p "$SHARED/backups" "$SHARED/config/config.d" "$SHARED/config/users.d"
chmod 700 "$SHARED" "$SHARED/backups"

# Seed config from current release (idempotent copy)
install -m 644 "$RELEASE/docker/clickhouse/config.d/"*.xml "$SHARED/config/config.d/"
install -m 644 "$RELEASE/docker/clickhouse/users.d/"*.xml "$SHARED/config/users.d/"

# Migrate any backup ZIPs from release-local path (if present)
if [[ -d "$RELEASE/storage/clickhouse/backups" ]]; then
  shopt -s nullglob
  for f in "$RELEASE/storage/clickhouse/backups/"*.zip; do
    mv -n "$f" "$SHARED/backups/"
  done
fi
```

**Data loss risk:** None — copies and `mv -n` only.

### Phase M2 — Introduce VPS compose override (repo change — 2D.3)

Add `backend/docker-compose.vps-clickhouse.yml` (or env `COMPOSE_FILE` merge) **only for production**:

```yaml
# Example — NOT applied in 2D.2
services:
  clickhouse:
    volumes:
      - clickhouse_data:/var/lib/clickhouse
      - clickhouse_logs:/var/log/clickhouse-server
      - /opt/synqdrive/shared/clickhouse/backups:/backups
      - /opt/synqdrive/shared/clickhouse/config/config.d/backup_disk.xml:/etc/clickhouse-server/config.d/backup_disk.xml:ro
      - /opt/synqdrive/shared/clickhouse/config/config.d/01_logger.xml:/etc/clickhouse-server/config.d/01_logger.xml:ro
      - /opt/synqdrive/shared/clickhouse/config/config.d/z_system_logs.xml:/etc/clickhouse-server/config.d/z_system_logs.xml:ro
      - /opt/synqdrive/shared/clickhouse/config/users.d/z_log_profiles.xml:/etc/clickhouse-server/users.d/z_log_profiles.xml:ro
```

Local dev keeps existing `docker-compose.yml` unchanged.

### Phase M3 — Recreate container (brief analytics outage)

**Preconditions:** G1 passed, M1 complete, M2 deployed to `/opt/synqdrive/current/backend`.

```bash
cd /opt/synqdrive/current/backend
export COMPOSE_FILE=docker-compose.yml:docker-compose.vps-clickhouse.yml

docker compose config   # verify mount sources
docker compose up -d --force-recreate clickhouse

# Wait healthy
for i in $(seq 1 30); do
  st=$(docker inspect synqdrive-clickhouse --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)
  [[ "$st" == healthy ]] && break
  sleep 2
done

bash scripts/ops/vps-clickhouse-storage-topology-audit.sh
clickhouse-client -q "SELECT 1"
curl -sf http://127.0.0.1:8123/ping
```

**Named volumes are reused** — `/var/lib/clickhouse` data persists across recreate.

### Phase M4 — Wire deploy script (2D.3)

Extend `vps-deploy-release.sh` after shared document linking:

```bash
# Sync ClickHouse config into shared (new release may update XML)
SHARED_CH=/opt/synqdrive/shared/clickhouse
mkdir -p "$SHARED_CH/backups" "$SHARED_CH/config/config.d" "$SHARED_CH/config/users.d"
install -m 644 "$RELEASE_DIR/backend/docker/clickhouse/config.d/"*.xml "$SHARED_CH/config/config.d/"
install -m 644 "$RELEASE_DIR/backend/docker/clickhouse/users.d/"*.xml "$SHARED_CH/config/users.d/"
```

Optional: post-deploy hook to recreate ClickHouse **only when** config XML checksums changed (avoid unnecessary restarts).

### Phase M5 — Safe cleanup (only after M3 audit passes)

| Item | Action | Guard |
|------|--------|-------|
| Stale bind-mount host paths under `/tmp/synqdrive-ch-fix` | `rm -rf` if empty/unused | Audit shows no running mount |
| Release-local `storage/clickhouse/backups/*.zip` | Move to shared or delete if duplicated | `sha256sum -c` |
| Orphan Docker volumes | `docker volume rm` | Not referenced; drill restore proven |
| Old release `storage/clickhouse/` dirs | Delete with release pruning policy | No unique ZIPs |

**Never in cleanup:**

- `clickhouse_data` while in use
- `docker compose down -v`
- Deleting `/var/lib/clickhouse` inside container

---

## 7. Rollback plan

| Step | Rollback |
|------|----------|
| M3 recreate fails | `docker compose` without override from last known good release path; volumes unchanged |
| Wrong `/backups` after migration | Re-run M1; fix override; recreate |
| Data doubt | `RESTORE DATABASE` from G1 backup into drill; compare counts |
| Total failure | Stop container; restore `clickhouse_data` volume from filesystem backup (last resort — requires volume-level backup) |

---

## 8. Validation checklist (post-migration)

- [ ] `vps-clickhouse-storage-topology-audit.sh` exit 0
- [ ] All bind `Source` paths under `/opt/synqdrive/shared/clickhouse/`
- [ ] No mount sources under `/tmp/` or stale `releases/` paths
- [ ] `BACKUP DATABASE` writes to `/opt/synqdrive/shared/clickhouse/backups/`
- [ ] `SELECT count() FROM system.tables WHERE database='synqdrive'` unchanged vs pre-migration
- [ ] `df -h /` acceptable headroom
- [ ] Readiness endpoint `clickhouse=available`

---

## 9. Relationship to other phases

| Phase | Deliverable |
|-------|-------------|
| 2D.1 | Runtime baseline — `clickhouse-runtime-analysis.md` |
| **2D.2** | **This document + audit script** |
| 2D.3 | Implement `docker-compose.vps-clickhouse.yml` + deploy wiring |
| 2D.4 | Execute gated migration on VPS (G1 → M1–M5) |
| 2C.x | Encrypted backup automation depends on stable `/backups` path (G1) |

---

## 10. Phase 2D.2 conclusion

| Question | Answer |
|----------|--------|
| Were volumes/mounts analyzed? | **Yes** — full inventory above |
| Were orphaned/stale paths identified? | **Yes** — P78 pattern + release-relative mounts |
| Is migration plan ready? | **Yes** — gated G0–G1, phases M1–M5 |
| Was cleanup executed? | **No** — blocked until G1 backup validation |
| Was mount structure changed? | **No** — documentation and audit tooling only |

**Operator next step:** Run topology audit on VPS, complete Gate G1, then proceed to 2D.3 implementation.
