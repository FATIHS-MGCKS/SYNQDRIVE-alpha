# Master Admin Remediation — Phase 2C.4: Redis & BullMQ Backup

**Date:** 2026-07-26  
**Status:** Implemented (persistence + RDB snapshot + recovery drill)  
**Related:** `docs/remediation/disaster-recovery-architecture.md` (2C.1), `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`

---

## Executive answer

| Question | Answer |
|----------|--------|
| **Ist Redis System of Record?** | **Nein** — PostgreSQL ist kanonische Wahrheit |
| **Brauchen wir Redis-Backup für Business-DR?** | **Nein** — Recovery über Postgres Outbox + Schedulers |
| **Brauchen wir Redis-Persistenz/Backup?** | **Ja** — für BullMQ-Puffer über Restarts hinweg und schnellere Queue-Wiederherstellung |

Redis speichert **async work buffer + coordination**. Ein Redis-Totalverlust **stoppt** die Plattform kurzzeitig, **verliert** aber keine kanonischen Business-Daten, sofern Postgres intakt ist.

---

## 1. Datenklassifikation (verbindlich)

### 1.1 Darf verloren gehen (ephemeral)

Diese Daten sind **ersetzbar** oder **bewusst kurzlebig**:

| Kategorie | Beispiele | Verlust-Folge |
|-----------|-----------|---------------|
| **Response caches** | `fleet-map:*`, `rental-health-summary:*`, `synqdrive:ai-chat:tool:*` | Cache miss; DB/API rebuild |
| **Rate limits** | `synqdrive:ai-chat:rate:*`, `synqdrive:doc-upload:*`, `voice:mcp:rate:*` | Limits resetzen (akzeptabel) |
| **DIMO JWT cache** | `dimo:developer:jwt`, `dimo:vehicle:jwt:*` | Zusätzliche DIMO API calls |
| **Distributed locks** | `battery:v2:lock:*`, `notification:eval:lock:*` | Locks expiren; Retry |
| **Notification debounce buffers** | `notification:eval:pending:*`, `followup:*` | Nächster Scheduler/Trigger |
| **Voice MCP nonces** | `voice:mcp:issued:*`, `confirm:*` | Idempotency window reset |
| **BullMQ completed history** | `bull:*:completed` | Explizit getrimmt (`removeOnComplete`) |
| **NestJS Throttler** | In-memory (nicht Redis) | N/A |

**Regel:** Kein Recovery-Aufwand für diese Keys.

---

### 1.2 Soll persistiert werden (operational buffer)

Diese Daten **müssen nicht** für Compliance, aber **sollen** für Betriebskontinuität überleben:

| Kategorie | Beispiele | Warum persistieren |
|-----------|-----------|-------------------|
| **BullMQ waiting/active/delayed jobs** | `bull:dimo.snapshot.poll:wait`, `bull:document.extraction:*` | Vermeidet Re-Enqueue-Stürme nach Redis-Restart |
| **BullMQ failed job buffer** | `bull:*:failed` (7d retention) | Ops-Debugging; manche Queues blockieren bei stale failed `jobId` |
| **AOF + RDB** | `/var/lib/redis/dump.rdb`, `appendonly.aof` | Crash recovery zwischen Snapshots |

**Regel:** RDB daily backup + AOF on host — **nicht** Tier-0 DR wie Postgres.

---

### 1.3 Muss persistiert werden (authoritative — nicht in Redis)

**Keine Business-Wahrheit darf nur in Redis leben.** Diese Zustände **müssen** in PostgreSQL (oder Object Storage) existieren:

| Domain | Postgres / Storage SoT | BullMQ-Rolle |
|--------|------------------------|--------------|
| Tenants, Users, IAM | `organizations`, `users`, … | — |
| Vehicles, Trips, Health | `vehicles`, `vehicle_trips`, health tables | Async enrichment |
| Bookings, Invoices | `bookings`, `invoices`, … | Document generation jobs |
| Notifications | `notification_delivery_outbox`, insights | `notification.delivery` pointer jobs |
| Task automation | `task_automation_outbox` | `task.automation` pointer jobs |
| Document intake | `document_extractions` | `document.extraction` + recovery scheduler |
| Payments email | payment email outbox | `payment.email` |
| Voice / connectivity webhooks | inbox tables + DLQ | `voice.webhook.process`, `connectivity.webhook.process` |
| Battery / Driving intelligence | persistent job rows | typed queue payloads |
| Sessions / refresh tokens | `refresh_tokens` (Postgres) | **Nicht** in Redis |

**Regel:** Redis-Ausfall → App degradiert Queues; **Postgres recovery schedulers** fangen Lücken auf.

---

## 2. BullMQ queue inventory

Canonical names: `backend/src/workers/queues/queue-names.ts`

| Queue | Kritikalität | Postgres recovery path |
|-------|--------------|------------------------|
| `dimo.snapshot.poll` | **P0** | Snapshot scheduler + `clear-stuck-snapshot-jobs.ts` |
| `dimo.trip-tracking` | **P0** | `trip-tracking-recovery.scheduler` |
| `document.extraction` | **P1** | `document-extraction-recovery.scheduler` |
| `notification.delivery` | **P1** | Outbox status + replay |
| `notification.evaluation` | **P1** | Re-trigger / scheduled eval |
| `task.automation` | **P1** | Outbox DLQ replay |
| `payment.email` | **P1** | Email outbox |
| `battery.v2` | **P1** | `battery_v2_job_dead_letter` + reconciliation |
| `voice.webhook.process` | **P1** | `VoiceProviderWebhookEvent` replay |
| `connectivity.webhook.process` | **P1** | Inbox replay service |
| `driving.intelligence.jobs` | **P1** | `DrivingIntelligenceJob` rows |
| `booking.document.generation` | **P1** | Persistent job rows |
| Remaining DIMO/trip/DTC queues | **P1–P2** | Schedulers / re-enqueue |

**Failed jobs:** BullMQ `failed` set ist **Inspektionspuffer** — authoritative DLQ ist Postgres (`DEAD_LETTER` / dead_letter tables).

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ PostgreSQL — System of Record (MUST recover)                     │
│   outboxes, extractions, webhooks, persistent job rows             │
└────────────────────────────┬────────────────────────────────────┘
                             │ schedulers re-enqueue
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Redis 7 (native) — BullMQ buffer + coordination (SHOULD persist) │
│   AOF + RDB on host │ daily RDB snapshot → shared archive        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PM2 synqdrive — API + embedded BullMQ workers                    │
└─────────────────────────────────────────────────────────────────┘
```

### Recovery priority after incident

1. **Postgres** restore (if needed) — Tier 0  
2. **Redis** RDB restore OR cold start + Postgres schedulers — Tier 2  
3. **BullMQ inspect** — clear stuck failed jobs if queues blocked  
4. Verify health + queue lag metrics  

---

## 4. Implemented components

| Script | Purpose |
|--------|---------|
| `vps-configure-redis-persistence.sh` | Enable RDB saves + AOF (`synqdrive-persistence.conf`) |
| `vps-backup-redis.sh` | Online `redis-cli --rdb` snapshot → shared archive |
| `vps-restore-test-redis.sh` | `redis-check-rdb` integrity drill (non-destructive) |
| `vps-restore-redis.sh` | Maintenance-window RDB restore (destructive) |
| `vps-inspect-bullmq-redis.sh` | Queue wait/active/delayed/failed summary |
| `vps-install-redis-backup-cron.sh` | Daily cron 04:00 UTC |
| `lib/redis-backup-lib.sh` | Shared library |
| `redis-backup.env.example` | VPS config |

---

## 5. VPS setup

### 5.1 Enable persistence (one-time)

```bash
# Optional: cap memory (MB) — BullMQ keys are mostly non-volatile → keep noeviction
REDIS_PERSISTENCE_MAXMEMORY_MB=512 \
  bash /opt/synqdrive/current/backend/scripts/ops/vps-configure-redis-persistence.sh
```

Writes `/opt/synqdrive/shared/redis/synqdrive-persistence.conf` and includes it from `/etc/redis/redis.conf`.

**Policy:** `noeviction` — verhindert stilles Löschen von BullMQ-Keys (VPS-Audit: `maxmemory=0` + `noeviction` = OOM-Risiko → optional `maxmemory` cap empfohlen).

### 5.2 Backup configuration

```bash
cp /opt/synqdrive/current/backend/scripts/ops/redis-backup.env.example \
   /opt/synqdrive/shared/redis-backup.env
chmod 600 /opt/synqdrive/shared/redis-backup.env
# GPG + offsite
bash /opt/synqdrive/current/backend/scripts/ops/vps-install-redis-backup-cron.sh
```

### 5.3 First backup + integrity test

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-backup-redis.sh
bash /opt/synqdrive/current/backend/scripts/ops/vps-restore-test-redis.sh
bash /opt/synqdrive/current/backend/scripts/ops/vps-inspect-bullmq-redis.sh
```

---

## 6. Snapshot strategy

| Layer | Method | Interval | Retention |
|-------|--------|----------|-----------|
| **Live** | AOF (`appendfsync everysec`) | continuous | On host until rewrite |
| **Live** | RDB `save` rules | 15min–24h triggers | `dump.rdb` on host |
| **Archive** | `redis-cli --rdb` | Daily 04:00 UTC cron | 7d local, min 2 generations |
| **Offsite** | rclone / S3 | After each archive | Per bucket lifecycle |

### Integrity checks

| Step | Tool |
|------|------|
| Post-snapshot | `redis-check-rdb` |
| Archive | SHA-256 sidecar |
| Drill | `vps-restore-test-redis.sh` (no live restore) |

### Never overwrite

- Timestamped archives: `redis-daily-20260726T040001Z.rdb.gpg`
- `promote` refuses existing paths
- Rotation keeps ≥ `REDIS_BACKUP_MIN_GENERATIONS` (default 2)

---

## 7. Recovery procedures

### 7.1 Integrity drill (safe, any time)

```bash
bash vps-restore-test-redis.sh
# or specific archive:
bash vps-restore-test-redis.sh --artifact /opt/synqdrive/shared/backups/redis/daily/redis-daily-....rdb.gpg
```

### 7.2 Live Redis restore (maintenance window)

```bash
pm2 stop synqdrive
REDIS_RESTORE_CONFIRM=I_UNDERSTAND_DATA_LOSS \
  bash vps-restore-redis.sh --artifact /path/to/archive.rdb.gpg
pm2 start synqdrive
bash vps-inspect-bullmq-redis.sh
```

### 7.3 Redis total loss — Postgres-first recovery (preferred)

Wenn Postgres intakt:

1. Start fresh Redis (`systemctl start redis-server`)
2. `pm2 restart synqdrive`
3. Wait for schedulers (document extraction, trip tracking, dimo snapshot, …)
4. `vps-inspect-bullmq-redis.sh` — investigate elevated `failed` counts
5. Ops scripts: `clear-stuck-snapshot-jobs.ts`, outbox replay APIs

**Kein RDB-Restore nötig** für Business-Kontinuität — nur für Queue-State-Erhalt.

---

## 8. Configuration reference

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_BACKUP_MIN_GENERATIONS` | `2` | Minimum archives after rotation |
| `REDIS_BACKUP_LOCAL_RETENTION_DAYS` | `7` | Shared archive retention |
| `REDIS_PERSISTENCE_MAXMEMORY_MB` | `0` (unset) | Optional RAM cap |
| `REDIS_BACKUP_CRON_SCHEDULE` | `0 4 * * *` | Daily backup UTC |
| `REDIS_RESTORE_CONFIRM` | — | Required for live restore |

---

## 9. Monitoring

| Signal | Source |
|--------|--------|
| Queue failed counts | `vps-inspect-bullmq-redis.sh`, Prometheus `synqdrive_queue_failed_jobs` |
| Queue lag | `synqdrive_queue_lag_seconds` |
| Last backup | `/opt/synqdrive/shared/backups/redis/state/last-success.json` |
| AOF status | `redis-cli INFO persistence` |

**Alert:** Failed jobs elevated on `dimo.snapshot.poll` (blocks vehicle polling via shared `jobId`).

---

## 10. Gap closure vs 2C.1

| 2C.1 gap | 2C.4 status |
|----------|-------------|
| Redis not backed up | ✅ RDB snapshot + cron |
| No persistence policy | ✅ AOF + RDB via persistence script |
| BullMQ recovery unclear | ✅ Documented Postgres-first recovery |
| `maxmemory=0` OOM risk | ⚠️ Optional cap via `REDIS_PERSISTENCE_MAXMEMORY_MB` |

---

## 11. References

- `backend/src/workers/queues/queue-names.ts`
- `backend/src/app.module.ts` (BullMQ defaults)
- `backend/scripts/clear-stuck-snapshot-jobs.ts`
- `backend/scripts/inspect-dimo-snapshot-queue.ts`
- `docs/remediation/disaster-recovery-architecture.md`

**Changes:** Updated (`ChangesView.tsx`, V4.9.893).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_REDIS_BACKUP_2026-07-26.md`).
