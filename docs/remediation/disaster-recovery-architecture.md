# Master Admin Remediation — Phase 2C.1: Disaster Recovery & Backup Architecture

**Date:** 2026-07-26  
**Status:** Architecture documentation (analysis only — **no implementation in this phase**)  
**Scope:** Full SynqDrive production platform on Hostinger VPS (`srv1374778.hstgr.cloud` → `app.synqdrive.eu`)

---

## Executive summary

SynqDrive today has **partial, deploy-triggered backup coverage** for PostgreSQL and **no systematic off-site disaster recovery**. Application code, ops scripts, and audits converge on a clear picture:

| Layer | Criticality | Backup today | DR readiness |
|-------|-------------|--------------|--------------|
| **PostgreSQL** | Tier 0 — System of Record | Pre-deploy `pg_dump` only | ⚠️ Partial |
| **Private documents** | Tier 0 — Legal / compliance | **None** (metadata flag only) | ❌ Gap |
| **Public uploads** | Tier 1 — Operational | Survives release switch (symlink) | ⚠️ Single-disk risk |
| **Environment files** | Tier 0 — Secrets & config | Ad-hoc `.bak` on some sync scripts | ⚠️ Partial |
| **Redis / BullMQ** | Tier 2 — Ephemeral runtime | None (by design) | ✅ Acceptable with caveats |
| **ClickHouse** | Tier 2 — Analytics mirror | Local script (dev); **no prod schedule** | ⚠️ Rebuildable |
| **Nginx + TLS** | Tier 1 — Edge | Manual snippet backups | ⚠️ Partial |
| **PM2** | Tier 1 — Process orchestration | `pm2 save` state only | ⚠️ Not version-controlled |
| **Prometheus / Grafana** | Tier 3 — Observability | Reprovision from repo | ✅ Disposable |
| **Docker volumes** | Mixed | CH data volume only on host | ⚠️ No snapshot policy |

**Verdict:** The platform is **not disaster-recovery ready** for full VPS loss. It is **operationally recoverable** for bad deploys (DB dump + prior release symlink) if disk and backups survive.

This document defines **IST** (as implemented in repo + VPS audits) and **SOLL** (target production backup strategy).

---

## 1. Production topology reference

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Hostinger VPS (single region, single host)                               │
├─────────────────────────────────────────────────────────────────────────┤
│ Native: PostgreSQL 16 (DB: synqdrive)  │  Redis 7 (127.0.0.1:6379)     │
│ PM2: synqdrive → dist/src/main.js:3001 │  Nginx → TLS → 127.0.0.1:3001 │
├─────────────────────────────────────────────────────────────────────────┤
│ Docker: synqdrive-clickhouse │ synqdrive-prometheus │ synqdrive-grafana │
├─────────────────────────────────────────────────────────────────────────┤
│ Persistent paths (survive release switch):                             │
│   /opt/synqdrive/shared/backend.env                                      │
│   /opt/synqdrive/shared/frontend.env                                     │
│   /opt/synqdrive/shared/uploads/                                         │
│   /opt/synqdrive/shared/storage/documents/                               │
│   /opt/synqdrive/shared/backups/          ← pg_dump gzip artifacts       │
│   /opt/synqdrive/shared/prometheus/                                      │
│   /opt/synqdrive/shared/grafana/                                         │
│   Docker volume: clickhouse_data (analytics)                             │
│   /etc/nginx/sites-enabled/synqdrive    ← not in git                     │
│   /etc/letsencrypt/live/app.synqdrive.eu/ ← TLS certs                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Release model:** Immutable clones under `/opt/synqdrive/releases/<timestamp>_v4994/`; `/opt/synqdrive/current` symlink. Rollback = repoint symlink + `pm2 restart` (documented in deployment runbooks).

**Evidence sources:** `backend/scripts/ops/vps-deploy-release.sh`, `docs/audits/operator-app-vps-control-audit-2026-07.md`, `docs/audits/workflow-automation-vps-control-audit-2026-07.md`, `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`.

---

## 2. Criticality tiers & RTO/RPO targets

| Tier | Definition | Acceptable data loss (RPO target) | Recovery time (RTO target) |
|------|------------|-----------------------------------|----------------------------|
| **T0** | Cannot operate without it | ≤ 1 h (DB) / ≤ 24 h (files) | ≤ 4 h |
| **T1** | Degraded operations | ≤ 24 h | ≤ 8 h |
| **T2** | Rebuildable / best-effort | ≤ 7 d | ≤ 24 h |
| **T3** | Disposable | N/A (reprovision) | ≤ 1 h |

---

## 3. Backup matrix (master table)

Legend:

- **IST** = current state in production (Jul 2026 audits)
- **SOLL** = recommended target before declaring DR-ready
- **Owner** = primary accountability (RACI: **R**esponsible)

| Component | Tier | Backup method | Interval | Retention | Encryption | Offsite | RTO (target) | RPO (target) | Owner | IST status |
|-----------|------|---------------|----------|-----------|------------|---------|--------------|--------------|-------|------------|
| **PostgreSQL** | T0 | `pg_dump` plain SQL → gzip | **IST:** each deploy · **SOLL:** daily + pre-deploy | **IST:** unbounded on disk · **SOLL:** 30 d local, 90 d offsite | **IST:** none at rest · **SOLL:** AES-256 (GPG or object-store SSE) | **IST:** none · **SOLL:** S3-compatible (Hetzner/R2/AWS) | 2–4 h | ≤ 1 h (SOLL daily) / deploy-only today ≈ days–weeks | Ops + Eng | ⚠️ Partial |
| **Redis** | T2 | None (ephemeral queues) | N/A | N/A | N/A | N/A | 15 min (restart) | Queue depth only (~minutes) | Eng | ✅ By design |
| **ClickHouse** | T2 | `BACKUP DATABASE … TO Disk('backups')` | **IST:** manual/dev · **SOLL:** daily cron on VPS | **IST:** 7 d (local script) · **SOLL:** 14 d local + 30 d offsite | **SOLL:** SSE on upload | **IST:** none · **SOLL:** weekly offsite copy | 4–24 h | 24 h | Ops + Eng | ❌ Prod gap |
| **Public uploads** | T1 | `rsync` / `restic` / S3 sync of `shared/uploads` | **SOLL:** daily | 30 d versions | TLS in transit; SSE at rest offsite | **SOLL:** required | 4–8 h | 24 h | Ops | ❌ No backup |
| **Private documents** | T0 | Same as uploads for `shared/storage/documents` + optional S3 replication | **SOLL:** daily (min) | 90 d (compliance) | **SOLL:** SSE-KMS / provider encryption | **SOLL:** required | 4 h | 24 h | Ops + Legal | ❌ Critical gap |
| **Document quarantine** | T1 | Include in documents backup path | Daily when enabled | 30 d | Same as documents | Offsite | 8 h | 24 h | Ops | ❌ Not backed up |
| **Configuration (`backend.env`, `frontend.env`)** | T0 | Encrypted copy on every change + daily snapshot | **IST:** ad-hoc `.bak` on some sync scripts · **SOLL:** daily + on change | 90 d | **SOLL:** GPG or secret vault export | **SOLL:** required (separate from DB) | 1 h | 24 h | Ops | ⚠️ Partial |
| **Docker: ClickHouse data volume** | T2 | Volume snapshot OR CH native backup | Daily | 14 d | Offsite encryption | Offsite weekly | 24 h | 24 h | Ops | ⚠️ Data only on host |
| **Docker: Prometheus** | T3 | None — reprovision from repo | On deploy | N/A | N/A | N/A | 30 min | N/A (metrics ephemeral) | Eng | ✅ OK |
| **Docker: Grafana** | T3 | Dashboards in git; provisioning copied on setup | On deploy (`vps-refresh-monitoring.sh`) | N/A | Admin password in `backend.env` | N/A | 30 min | N/A | Eng | ✅ OK |
| **PM2 process definition** | T1 | Export `pm2 save` + version-controlled ecosystem file (**SOLL**) | On change | Last 10 dumps | N/A | Copy with config backup | 30 min | N/A | Ops + Eng | ⚠️ Not in git |
| **PM2 logs** | T3 | `pm2-logrotate` (50M × 14, gzip) | Daily rotation | ~14 files | None | Optional ship to Loki | N/A | N/A | Ops | ✅ Capped |
| **Nginx vhost** | T1 | Copy `/etc/nginx/sites-enabled/synqdrive` before edits | On change | 30 d | N/A | With config backup | 1 h | N/A | Ops | ⚠️ Snippet backups only |
| **Let's Encrypt TLS** | T1 | `certbot` auto-renew; copy `/etc/letsencrypt` (**SOLL**) | Certbot 2×/day attempt | Until expiry | Private keys on host | Optional archive | 1 h | N/A | Ops | ✅ Auto-renew |
| **Application releases** | T1 | Retain N prior releases (rollback) | Each deploy | **IST:** many retained (~12+, ~33 GB observed) · **SOLL:** last 3 + tag | N/A | N/A | 15 min rollback | N/A | Eng | ✅ Rollback path |
| **Git repository** | T0 | GitHub `main` (SCM) | Continuous | Indefinite | GitHub | GitHub (offsite) | 1 h | 0 | Eng | ✅ OK |
| **Stripe / Clerk / DIMO secrets** | T0 | Provider dashboards + env backup | On rotation | Per policy | Provider + env encryption | Secret manager | 1 h | N/A | Ops | ⚠️ VPS-only copy |

---

## 4. Component deep dives

### 4.1 PostgreSQL

**Role:** Canonical System of Record — tenants, vehicles, trips, billing, documents metadata, tasks, health, IAM, etc.

**IST — implemented:**

```bash
# backend/scripts/ops/vps-deploy-release.sh (runs on every production deploy)
sudo -u postgres pg_dump synqdrive | gzip > /opt/synqdrive/shared/backups/db-pre-deploy-${TS}.sql.gz
```

- Abort deploy if root disk ≥ 90% full.
- Restore recipe: `gunzip -c …/db-pre-deploy-XXXX.sql.gz | sudo -u postgres psql synqdrive` (`docs/deployment/ai-agent-domain-grounding-deployment-runbook-2026-07.md`).
- Runbooks recommend `pg_dump -Fc` before mutating ops (`backend/scripts/ops/README.md`).

**IST — gaps:**

- No scheduled backup cron (`docs/audits/workflow-automation-vps-control-audit-2026-07.md`: no root crontab).
- No retention pruning → backup dir grows (~1.9 GB+ observed; individual dumps ~50 MB).
- `vps-backup-database.sh` referenced in `docs/runbooks/iam-production-rollout.md` but **missing from repo**.
- No quarterly restore drill enforced (`docs/audits/vehicle-detail-page-vps-baseline-2026-07.md` VPS-DATA-005).
- Hostinger PITR mentioned in battery runbook — **not wired or verified**.

**SOLL — target:**

| Item | Specification |
|------|----------------|
| Method | `pg_dump -Fc` (custom format) for faster parallel restore; keep gzip SQL as secondary |
| Schedule | Daily 02:00 UTC cron + mandatory pre-deploy dump (retain both) |
| Retention | 30 days on VPS; 90 days offsite object storage |
| Encryption | GPG encrypt before offsite upload OR SSE on S3-compatible bucket |
| Offsite | Hetzner Object Storage / Cloudflare R2 / AWS S3 (EU region) |
| Verification | Monthly restore to `synqdrive_restore_test` DB + row-count smoke |
| RTO / RPO | RTO 2–4 h full restore; RPO ≤ 24 h (daily), ≤ 1 h if WAL/PITR added later |

**Owner:** Ops (execution), Eng (scripts, restore automation), Product (RPO sign-off).

---

### 4.2 Redis

**Role:** BullMQ job queues, caches, rate-limit counters, ephemeral locks. **Not** a System of Record.

**IST:**

- Production: native Redis 7 on `127.0.0.1:6379`, `noeviction` (audit).
- Dev: Docker volume `redis_data` at `/data` (`backend/docker-compose.yml`).
- No RDB/AOF backup scripts in repo.

**Recovery model:**

- Restart Redis → in-flight jobs may fail; failed jobs land in `bull:*:failed` (inspect/retry operationally).
- Canonical state must always be reconstructible from PostgreSQL + re-enqueue workers.

**SOLL:**

- Document "no backup" as accepted policy.
- Optional: RDB snapshot every 6 h for faster queue recovery (RPO ~6 h) — **low priority**.
- Alert on Redis down (`synqdrive` health / Prometheus).

**RTO:** 15 min · **RPO:** minutes (acceptable job loss with retry) · **Owner:** Eng.

---

### 4.3 ClickHouse

**Role:** Append-only analytics / telemetry mirror. PostgreSQL remains canonical; CH loss degrades analytics, not core rentals/health writes.

**IST — implemented (local/dev):**

- `backend/scripts/clickhouse-backup-local.sh` — `BACKUP DATABASE … TO Disk('backups', …)`, **7-day retention**.
- `backend/scripts/clickhouse-restore-local.sh` — non-destructive restore.
- `backend/docker/clickhouse/config.d/backup_disk.xml` — local disk only, no S3.
- Data TTL 180–365 days (`002_retention_ttl_and_storage_policy.sql`).

**IST — production:**

- Container `synqdrive-clickhouse` on VPS (Docker), data in `clickhouse_data` volume.
- **No production backup cron** committed.
- `vps-clickhouse-log-hardening.sh` recreates container preserving data volume.

**SOLL:**

| Item | Specification |
|------|----------------|
| Schedule | Daily 03:00 UTC via adapted `clickhouse-backup-vps.sh` |
| Retention | 14 d local, 30 d offsite |
| Offsite | Weekly `rclone`/`restic` of `/backups` + volume snapshot |
| Alternative DR | Disable CH → app runs degraded; backfill mirrors from PG telemetry where possible |

**RTO:** 4–24 h · **RPO:** 24 h · **Owner:** Ops + Eng.

---

### 4.4 Uploads (public)

**Role:** Org logos, KYC images, fines attachments, support uploads, customer-facing files served at `/uploads/`.

**IST:**

- `STORAGE_DRIVER=local` (default); path `UPLOADS_DIR` → `/opt/synqdrive/shared/uploads` (symlinked in deploy).
- S3 driver exists in code (`backend/src/config/storage.config.ts`) but **VPS audits show local storage in production**.
- Static serving from `backend/uploads` via `main.ts`.

**IST — gaps:**

- **No file-level backup.** Single VPS disk = single point of failure.
- `STORAGE_ORPHAN_SWEEP_ENABLED=false` by default.

**SOLL:**

- Short term: daily `restic` backup of `shared/uploads` to offsite.
- Medium term: migrate to S3-compatible object storage with versioning + lifecycle.
- Include in restore drill alongside DB.

**RTO:** 4–8 h · **RPO:** 24 h · **Owner:** Ops.

---

### 4.5 Documents (private)

**Role:** Legal documents, AI document intake (quarantine + clean zones), booking document generation artifacts. **Compliance-critical.**

**IST:**

- Local path: `/opt/synqdrive/shared/storage/documents` (symlinked `backend/storage/documents`).
- Optional S3 via `DOCUMENT_STORAGE_PROVIDER` (`architecture/LEGAL_DOCUMENT_PRIVATE_STORAGE_2026-07-22.md`).
- Audit metadata flags in env (`document-retention.config.ts`):

```env
DOCUMENT_STORAGE_BACKUP_STRATEGY=vps-pre-deploy-db
DOCUMENT_STORAGE_BACKUP_INCLUDES_OBJECTS=false
```

**Meaning:** Only **database metadata** is indirectly covered by PostgreSQL dumps; **binary objects are explicitly excluded**.

**SOLL:**

| Item | Specification |
|------|----------------|
| Backup | Daily object backup independent of DB |
| Encryption | Declared at-rest encryption + KMS key ID in env |
| Retention | Align with `DOCUMENT_RETENTION_*` and legal hold policies |
| Verification | Quarterly restore sample files + hash check |
| Offsite | Mandatory EU region |

**RTO:** 4 h · **RPO:** 24 h · **Owner:** Ops + Legal/Compliance.

---

### 4.6 Configuration

**Components:**

| Asset | Path | Backup IST |
|-------|------|------------|
| Backend secrets | `/opt/synqdrive/shared/backend.env` | `.bak` on Grafana setup, some `sync-*-env-to-vps.sh`, flag scripts |
| Frontend build env | `/opt/synqdrive/shared/frontend.env` | Same deploy linkage |
| Env template (no secrets) | `backend/.env.example` | Git |
| Merge helper | `backend/scripts/ops/merge-env-from-example.mjs` | Git |

**Sync scripts** (push local → VPS, backup remote first where implemented):

- `sync-resend-env-to-vps.sh`, `sync-stripe-env-to-vps.sh`, `sync-mistral-env-to-vps.sh`, `sync-didit-env-to-vps.sh`, `sync-twilio-env-to-vps.sh`

**SOLL:**

- Encrypted daily snapshot of both env files to offsite (separate bucket from DB).
- Secrets inventory in Cursor dashboard / 1Password / Bitwarden (not only VPS).
- Never commit real `.env` to git.

**RTO:** 1 h · **RPO:** 24 h · **Owner:** Ops.

---

### 4.7 Docker volumes

| Volume / mount | Service | Backup IST | Notes |
|----------------|---------|------------|-------|
| `clickhouse_data` | ClickHouse | None scheduled | Primary analytics data |
| `./storage/clickhouse/backups` | CH backup disk | 7 d (dev script only) | Bind mount |
| `postgres_data` | Postgres (dev compose) | N/A on prod | Prod PG is native, not Docker |
| `redis_data` | Redis (dev compose) | N/A on prod | |
| Prometheus/Grafana | Host paths under `shared/` | Reprovision from repo | No TSDB backup needed |

**SOLL:** Host-level volume snapshot (LVM/ZFS) or `restic` of Docker volume paths before major CH upgrades.

**Owner:** Ops.

---

### 4.8 PM2

**IST:**

- Single process: `synqdrive` → `/opt/synqdrive/current/backend/dist/src/main.js`, port 3001.
- **No `ecosystem.config.js` in repository** — process definition lives only on VPS.
- `pm2 save` after deploy; `pm2-logrotate` via `setup-log-limits.sh` (50M × 14, gzip, daily).
- Auxiliary module: `pm2-logrotate`.

**SOLL:**

- Commit `ecosystem.config.cjs` to repo with production paths.
- Backup `~/.pm2/dump.pm2` daily alongside env files.
- Document worker-in-process model (no separate worker PM2 entry).

**RTO:** 30 min · **Owner:** Ops + Eng.

---

### 4.9 Environment files

Covered in §4.6. Additional note: **third-party secrets** (Clerk, Stripe, DIMO, Resend, Twilio, Mistral) exist only in `backend.env` on VPS and Cursor Cloud Agent secrets. DR requires **provider-level key rotation capability** and off-VPS secret vault.

---

### 4.10 Nginx

**IST:**

- Production vhost: `/etc/nginx/sites-enabled/synqdrive` (**not in git**).
- Repo snippets: `nginx-synqdrive-hardening.snippet`, `nginx-csp-didit-frame-src.snippet`.
- `apply-nginx-synqdrive-hardening.sh` backs up to `/root/synqdrive.bak.<timestamp>` before edits.
- TLS: Let's Encrypt (`certbot` auto-renew).
- Proxy to `127.0.0.1:3001`, `client_max_body_size 20m`, CSP, HSTS, `/metrics` blocked at edge.

**SOLL:**

- Export full vhost to `backend/scripts/ops/nginx-synqdrive.vps.conf.example` (sanitized).
- Backup vhost + `/etc/letsencrypt` before cert migrations.
- RTO 1 h for edge-only failure.

**Owner:** Ops.

---

### 4.11 Grafana

**IST:**

- Docker `synqdrive-grafana`, localhost `:3000`, SSH tunnel access.
- Provisioning from repo: `backend/monitoring/grafana/provisioning/*`.
- Dashboards copied on setup: ops, battery-v2, driving-intelligence-v2, document-intake-v2, fleet-health-service (5 of 6 — `notification-engine-ops.json` not in setup script).
- Admin password in `GRAFANA_ADMIN_PASSWORD` (`backend.env`).
- **No persistent Grafana DB backup** — dashboards reproducible from git.

**SOLL:**

- Fix dashboard sync drift in `vps-refresh-monitoring.sh`.
- Optional: export Grafana DB before major upgrades.

**RTO:** 30 min · **RPO:** N/A · **Owner:** Eng.

---

### 4.12 Prometheus

**IST:**

- Docker `synqdrive-prometheus`, localhost `:9090`.
- Config: `/opt/synqdrive/shared/prometheus/` (copied from `backend/monitoring/prometheus/`).
- Bearer token file from `METRICS_BEARER_TOKEN`.
- Alert rules: `alerts.yml` (extensive) — **no Alertmanager** wired in-repo.

**SOLL:**

- TSDB data disposable (15 d retention default).
- Add Alertmanager + paging for T0 alerts (DB disk, backup failure, health down).

**RTO:** 30 min · **RPO:** N/A · **Owner:** Eng.

---

## 5. Disaster scenarios & playbooks (summary)

| Scenario | Primary recovery path | Dependencies |
|----------|----------------------|--------------|
| **Bad deploy** | Repoint `/opt/synqdrive/current` to prior release + `pm2 restart` | Prior release dir exists |
| **Bad migration** | Restore latest `db-pre-deploy-*.sql.gz` + rollback release | Pre-deploy dump < deploy time |
| **DB corruption** | Restore daily offsite dump (SOLL) or latest pre-deploy | Offsite copy (not yet implemented) |
| **Disk full** | Prune old releases + backup retention + log limits | `setup-log-limits.sh`, manual `du` |
| **VPS total loss** | Provision new VPS + restore DB + files + env from offsite | **Blocked today** — no offsite |
| **ClickHouse loss** | Restore CH backup or run without CH (degraded analytics) | CH backup script on prod |
| **Redis loss** | `systemctl restart redis` + drain failed BullMQ jobs | PG canonical |
| **TLS expiry** | `certbot renew` | Port 80/443, DNS |
| **Secret compromise** | Rotate keys in providers + update `backend.env` | Provider dashboards |

**Best documented restore today:** `docs/deployment/ai-agent-domain-grounding-deployment-runbook-2026-07.md` § Restore.

---

## 6. Gap register (prioritized)

| ID | Priority | Gap | Risk | Remediation (2C.x follow-up) |
|----|----------|-----|------|------------------------------|
| DR-001 | **P0** | No offsite backup for PostgreSQL | Total VPS loss = total data loss | Daily encrypted offsite `pg_dump` + retention |
| DR-002 | **P0** | Document/upload objects not backed up | Legal/compliance + customer data loss | `restic`/S3 sync for `shared/storage` + `shared/uploads` |
| DR-003 | **P0** | No scheduled DB backup (deploy-only) | RPO = time since last deploy | Cron + `vps-backup-database.sh` |
| DR-004 | **P1** | No backup retention policy on VPS | Disk exhaustion (~90% aborts deploy) | Prune script: keep 30 local dumps |
| DR-005 | **P1** | No restore drill / test DB | Untested recovery | Quarterly `synqdrive_restore_test` procedure |
| DR-006 | **P1** | Missing `vps-backup-database.sh` | Runbook references broken path | Implement script per IAM runbook |
| DR-007 | **P1** | ClickHouse prod backup not scheduled | Analytics history loss | VPS-adapted CH backup cron |
| DR-008 | **P1** | Env files only on VPS | Slow rebuild after incident | Encrypted offsite env snapshot |
| DR-009 | **P2** | PM2 config not in git | Manual rebuild of process | `ecosystem.config.cjs` |
| DR-010 | **P2** | Nginx vhost not in repo | Edge misconfiguration on rebuild | Sanitized vhost example + backup |
| DR-011 | **P2** | No `shared/backups/README` on host | Slower incident response (F-042-008) | On-host `RESTORE.md` pointer |
| DR-012 | **P2** | No backup failure alerting | Silent backup gaps | Prometheus alert + cron email |
| DR-013 | **P3** | Release dir bloat (~33 GB) | Disk pressure | Prune to last 3 releases |
| DR-014 | **P3** | Grafana dashboard sync drift | Ops blind spot | Fix `vps-refresh-monitoring.sh` |

---

## 7. Responsibility matrix (RACI)

| Activity | Ops | Engineering | Product/Legal | Hostinger |
|----------|-----|-------------|---------------|-----------|
| Daily backup execution | **R** | C | I | I |
| Backup script development | C | **R** | I | — |
| Offsite storage account | **R** | C | I | — |
| Restore drill (quarterly) | **R** | C | I | — |
| RTO/RPO sign-off | C | C | **A** | — |
| Document retention / legal hold | C | C | **R** | — |
| VPS hardware / hypervisor | I | I | I | **R** |
| TLS certificate renewal | **R** | C | — | — |
| Incident declaration | **R** | C | **A** | C |
| Secret rotation | **R** | C | I | — |

R = Responsible · A = Accountable · C = Consulted · I = Informed

---

## 8. Recommended implementation roadmap (2C.2+)

**Phase 2C.2 — Backup automation (no data mutation):**

1. Add `backend/scripts/ops/vps-backup-database.sh` (daily + manual).
2. Add `backend/scripts/ops/vps-backup-retention.sh` (prune dumps + releases).
3. Add `backend/scripts/ops/vps-backup-offsite.sh` (`rclone`/`restic` template).
4. Add `/opt/synqdrive/shared/backups/RESTORE.md` (deploy via docs sync).

**Phase 2C.3 — Verification:**

1. Quarterly restore drill runbook + checklist.
2. Prometheus alert: `backup_last_success_timestamp` metric.

**Phase 2C.4 — Object storage migration (optional):**

1. `STORAGE_DRIVER=s3` + `DOCUMENT_STORAGE_PROVIDER=s3` with versioning.

---

## 9. Is the platform disaster-recovery ready?

## **Nein.**

| Criterion | Met? |
|-----------|------|
| Offsite backups for T0 data | ❌ |
| Scheduled PostgreSQL backup | ❌ |
| File/object backup | ❌ |
| Documented + tested restore | ⚠️ Partial (deploy rollback only) |
| Defined RTO/RPO with ownership | ✅ (this document) |
| Monitoring alerts on backup failure | ❌ |

**Pilot operations** (single VPS, deploy rollback) are supported. **Full disaster recovery** (VPS loss, region loss) is **not** supported until DR-001–DR-003 are closed.

---

## 10. References

| Resource | Path |
|----------|------|
| Deploy + pre-deploy dump | `backend/scripts/ops/vps-deploy-release.sh` |
| ClickHouse backup (local) | `backend/scripts/clickhouse-backup-local.sh` |
| Storage config | `backend/src/config/storage.config.ts` |
| Document backup metadata | `backend/src/config/document-retention.config.ts` |
| Log limits | `backend/scripts/ops/setup-log-limits.sh` |
| Prometheus VPS setup | `backend/scripts/ops/vps-setup-prometheus.sh` |
| Grafana VPS setup | `backend/scripts/ops/vps-setup-grafana.sh` |
| CH architecture | `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md` |
| Document lifecycle | `architecture/DOCUMENT_STORAGE_LIFECYCLE_2026-07-17.md` |
| VPS operator audit | `docs/audits/operator-app-vps-control-audit-2026-07.md` |
| Restore runbook | `docs/deployment/ai-agent-domain-grounding-deployment-runbook-2026-07.md` |
| Open architecture item | `architecture/ARCHITECTURE_REVIEW_2026-04-10.md` (BC/DR) |

**Changes:** Updated (`ChangesView.tsx`, V4.9.890).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_DISASTER_RECOVERY_2026-07-26.md`).
