# Document Worker / PM2 Stability Audit (Prompt 5 of 84)

| Field | Value |
|-------|-------|
| **Audit date (UTC)** | 2026-07-17 |
| **Auditor mode** | Read-only — no production mutations |
| **Production host** | `srv1374778.hstgr.cloud` / `app.synqdrive.eu` |
| **VPS audit time** | 2026-07-17T13:57–13:58 UTC |
| **PM2 process** | `synqdrive` (id **1**, fork mode) |
| **PM2 restarts (↺)** | **530** |
| **Current uptime at audit** | ~36–38 minutes (stable) |
| **Node.js** | **22.23.1** |
| **Startup script** | `/opt/synqdrive/current/backend/dist/src/main.js` |
| **Deployed release** | `20260717131719_v4994` → `/opt/synqdrive/current` |
| **Basis** | [document-intake-production-reality.md](./document-intake-production-reality.md) (Audit 1, PM2 P0 note) |

---

## 1. Executive Summary

The **530 PM2 restarts** are **not** caused by the document-extraction worker, Mistral OCR, memory limits, OOM, or health-check loops.

**Belegbare Hauptursache (PROVEN):** Repeated **NestJS bootstrap failures** (`ExceptionHandler` / DI module wiring errors) after **VPS deploys** (`pm2 restart synqdrive --update-env`). Each broken release triggers PM2 **autorestart** with **exit code 1** every ~2–3 seconds until a subsequent deploy ships a bootable build or an operator issues `pm2 stop`.

For the current PM2 process registration (`synqdrive:1`, since **2026-07-16 ~20:13 UTC**):

| Exit class | Count in `pm2.log` | Maps to PM2 ↺ |
|------------|-------------------|---------------|
| Code **1** (bootstrap crash) | **517** | Crash-loop autorestarts |
| Code **0** (SIGINT, planned) | **13** | Deploy / manual `Stopping app` |
| **Total** | **530** | **530** ↺ (exact match) |

**Document intake impact:** Document workers run **in-process** in the same `synqdrive` fork. Restarts **interrupt** BullMQ consumers (`document.extraction`, concurrency 3) and the recovery scheduler (`@Interval 120s`), but **no document-processor crash** was found in logs. Production OCR for n=2 uploads completed successfully before restarts on stable builds.

**Secondary production noise (LIKELY, non-fatal):** Battery V2 BullMQ job IDs containing `:` (`battery-v2:…`) cause **7 540+** enqueue/scheduler errors on the **currently stable** process — logged, not fatal.

**Verdict:** PM2 instability is a **deploy/bootstrap reliability** problem, not a **document-worker** defect. Runtime is **stable** on the current release; the ↺ counter is **historical cumulative** from crash-loop deploy retries.

---

## 2. Audit Method and Safety

| Rule | Compliance |
|------|------------|
| No service restarts | ✅ Read-only SSH |
| No PM2 config changes | ✅ |
| No queue/job mutations | ✅ |
| No log deletion | ✅ |
| No production writes | ✅ |

**Evidence sources:**

- `pm2 list`, `pm2 describe synqdrive`, `pm2 jlist`
- `/root/.pm2/pm2.log` (full daemon log since 2026-06-22)
- `/root/.pm2/logs/synqdrive-error*.log`, `synqdrive-out*.log`
- `/root/.pm2/dump.pm2`
- `dmesg` / `journalctl -k` (OOM)
- `/opt/synqdrive/releases/`, `vps-deploy-release.sh`
- `curl http://127.0.0.1:3001/api/v1/health`

---

## 3. PM2 Configuration (Ist)

| Setting | Value | Source |
|---------|-------|--------|
| **ecosystem.config.js** | **Not present** on VPS | `find /opt/synqdrive` — empty |
| **exec_mode** | `fork_mode` | `pm2 describe` |
| **watch** | **disabled** | `pm2 describe` |
| **autorestart** | **true** | `pm2 jlist` |
| **max_memory_restart** | **null** (unset) | `pm2 jlist` / `dump.pm2` |
| **unstable_restarts** | **0** | `pm2 describe` |
| **interpreter** | `node` (22.23.1) | `pm2 describe` |
| **cwd** | `/opt/synqdrive/current/backend` | `pm2 describe` |
| **env file** | Symlink `/opt/synqdrive/shared/backend.env` | deploy script |
| **NODE_ENV in PM2 env** | Not injected (N/A in describe) | Loaded via `.env` at runtime |
| **pm2-logrotate** | Module online, 0 restarts | `pm2 list` |

**Startup command (effective):** `node /opt/synqdrive/current/backend/dist/src/main.js` — no extra `node_args`, no cluster mode, no watch.

**Deploy restart path:** `backend/scripts/ops/vps-deploy-release.sh` → `pm2 restart synqdrive --update-env` + `pm2 save` (single intentional restart per deploy).

---

## 4. Restart Timeline and Classification

### 4.1 PM2 daemon lifetime

- PM2 daemon started **2026-06-22T09:41:03 UTC** (PM2 7.0.1, Node 22.23.0 at boot).
- `synqdrive` was **id:0** until **2026-07-16 ~20:13**; thereafter **id:1** (current registration).
- PM2 `restart_time` counter (**530**) applies to **id:1** and matches id:1 log events exactly.

### 4.2 Crash-loop bursts (code 1, autorestart)

Eleven bursts with ≥5 consecutive code-1 exits were identified in `pm2.log`:

| Burst start (UTC) | Consecutive code-1 exits | Bootstrap error (first line in error log) |
|-------------------|--------------------------|-------------------------------------------|
| 2026-07-11 08:28:07 | **378** | `Nest cannot create the BusinessInsightsModule` — undefined import index [1] |
| 2026-07-14 18:08:39 | **107** | `BookingWizardPaymentFlowService` — `PaymentEmailEnqueueService` missing in `BookingsModule` |
| 2026-07-14 18:13:10 | **111** | (same deploy retry window) |
| 2026-07-15 07:49:12 | **151** | `Nest cannot create the DocumentsModule` — undefined import index [0] |
| 2026-07-15 07:54:49 | **121** | (same window) |
| 2026-07-15 18:04:04 | **207** | `Nest cannot create the OutboundEmailModule` — undefined import |
| 2026-07-15 18:11:32 | **113** | (same window) |
| 2026-07-17 00:11:37 | **132** | `BatteryV2ReconciliationService` — `BatteryCapabilityRefreshService` missing in `BatteryV2JobsProducerModule` |
| 2026-07-17 00:16:44 | **156** | (same window) |
| 2026-07-17 00:22:46 | **107** | (same window) |
| 2026-07-17 11:18:00 | **122** | `DrivingAnalysisInitService` — unresolved dependency index [2] in `VehicleIntelligenceModule` |

**Pattern:** `Stopping app` (deploy) → `starting` → `exited code [1]` every **~2–3 s** → loop until `Stopping app` again with working build.

**Example (2026-07-17 11:22, excerpt `pm2.log`):**

```
App [synqdrive:1] exited with code [1] via signal [SIGINT]
App [synqdrive:1] starting in -fork mode-
App [synqdrive:1] online
(repeated ~40× in 90 seconds)
Stopping app:synqdrive id:1
App [synqdrive:1] exited with code [0] via signal [SIGINT]
```

### 4.3 Planned restarts (code 0)

| Metric | Value |
|--------|-------|
| `Stopping app:synqdrive` events (all time) | **254** |
| Code-0 exits for **id:1** since 2026-07-16 20:13 | **13** |
| Correlation | Matches deploy timestamps (e.g. 2026-07-17 12:18, 13:12, 13:20) |

**97** release directories under `/opt/synqdrive/releases/` — many deploys within minutes on 2026-07-17 (00:05–00:24, 11:04–11:19) indicate **retry deploys during crash loops**.

---

## 5. Cause Classification Matrix

| # | Hypothesis | Classification | Evidence |
|---|------------|----------------|----------|
| 1 | **NestJS bootstrap / DI failure after deploy** | **PROVEN** | 517× code-1; `ExceptionHandler` errors at burst starts; exit every ~2–3 s; counter = 517+13 |
| 2 | **Deploy `pm2 restart` on broken build → autorestart loop** | **PROVEN** | `vps-deploy-release.sh` line 61; burst follows `Stopping app`; release dirs clustered |
| 3 | **PM2 autorestart amplifies single boot error** | **PROVEN** | `autorestart: true`, `unstable_restarts: 0`; no backoff between code-1 retries |
| 4 | **Release switch vs real crash distinction** | **PROVEN** | Code 0 + `Stopping app` = deploy; code 1 without stop = crash loop |
| 5 | **Watch mode / file watcher** | **EXCLUDED** | `watch: false` |
| 6 | **max_memory_restart** | **EXCLUDED** | `null`; 0 hits in `pm2.log` |
| 7 | **OOM / kernel kill** | **EXCLUDED** | No OOM in `dmesg`/journal; 0 heap/OOM in app logs; 13 GiB MemAvailable |
| 8 | **uncaughtException / unhandledRejection** | **EXCLUDED** | 0 matches in all `synqdrive-error*.log` |
| 9 | **Health-check / cron restart loop** | **EXCLUDED** | No synqdrive cron; no systemd timer; health returns 200 |
| 10 | **EADDRINUSE / port bind** | **EXCLUDED** | 0 matches |
| 11 | **DocumentExtractionProcessor crash** | **EXCLUDED** | No processor fatal in error logs; OCR `completed` in out log |
| 12 | **Mistral timeout → process exit** | **EXCLUDED** | 2 ETIMEDOUT mentions total; no correlation with restarts |
| 13 | **Redis connection loss → exit** | **EXCLUDED** | Jul-12 `MISCONF` historical; no exit correlation |
| 14 | **Postgres connection failure → exit** | **EXCLUDED** | No Prisma init fatal at burst times |
| 15 | **ClickHouse ECONNREFUSED → exit** | **EXCLUDED** | 1246 ping warnings; app stays up; readiness degrades gracefully |
| 16 | **Battery V2 `Custom Id cannot contain :`** | **LIKELY** (noise) | 7540+ errors on **stable** PID 69574; Scheduler catches; **no restart** |
| 17 | **Scheduler exception → process exit** | **EXCLUDED** for restarts | Scheduler logs error but process continues (current 38m+ uptime) |
| 18 | **DOCUMENT_EXTRACTION_QUEUE_ENABLED=false** | **LIKELY** (ops) | Logged at boot on many releases Jul 13–16; **warning only**, not exit |
| 19 | **Separate document-worker PM2 process** | **EXCLUDED** | Single fork architecture (see battery-runtime-topology audit) |
| 20 | **PM2 ecosystem misconfiguration** | **EXCLUDED** | No ecosystem file; defaults only |

---

## 6. Memory and CPU

| Metric (audit time) | Value |
|---------------------|-------|
| PM2 RSS | **434.9 MiB** |
| Heap usage (PM2 code metrics) | **92%** of 168 MiB heap |
| Host RAM | 15 GiB total, **13 GiB available** |
| Swap | **0** |
| Event loop latency p95 | **~1 ms** |
| HTTP P95 latency (PM2 builtin) | **~1338 ms** (low traffic) |

High heap **usage %** is notable for capacity planning but **did not** trigger restarts (`max_memory_restart` unset, no OOM).

---

## 7. Document Intake / Worker Specifics

### 7.1 Architecture reminder

```
PM2 synqdrive (single fork)
  ├── HTTP API
  ├── BullMQ document.extraction (DocumentExtractionProcessor, concurrency 3)
  ├── DocumentExtractionRecoveryScheduler (@Interval 120s)
  └── (shared with all other workers/schedulers)
```

### 7.2 Document extraction log evidence

| Event | Timestamp | Tag |
|-------|-----------|-----|
| OCR completed (upload 1) | 2026-07-16 20:28 UTC | LOG_VERIFIED |
| OCR completed (re-extract) | 2026-07-16 20:36 UTC | LOG_VERIFIED |
| APPLY completed | 2026-07-16 20:42 UTC | LOG_VERIFIED |
| OCR completed (upload 2) | 2026-07-16 21:33 UTC | LOG_VERIFIED |
| Upload 503 queue disabled | 2026-07-16 19:59 UTC | LOG_VERIFIED (config, pre-fix) |
| Processor uncaught fatal | **None found** | EXCLUDED |

**Conclusion:** Document pipeline behaved correctly on **stable** process epochs. Restarts are an **availability gap** for in-flight extractions (queue consumer down during crash loop), not a **root cause** of PM2 ↺.

### 7.3 Recovery after restart

`DocumentExtractionRecoveryScheduler` re-enqueues stale `QUEUED`/`PROCESSING`/`CONFIRMED` rows — effective only when process **boots successfully**. During bootstrap crash loops, recovery **does not run**.

---

## 8. Secondary Finding — Battery V2 Job IDs (non-restart)

**Error:** `Custom Id cannot contain :`  
**Source:** `BatteryV2JobProducerService`, `DimoSnapshotProcessor`, `[Scheduler]`  
**Count:** **7540+** in error logs (current epoch)  
**Code:** `buildBatteryV2JobId()` prefixes `battery-v2:` — BullMQ rejects `:` in custom job IDs (`battery-v2-job-queue.util.ts`)

| Impact | Classification |
|--------|----------------|
| Process crash / PM2 restart | **EXCLUDED** — process stable 36m+ with errors continuing |
| Scheduler noise / failed enqueues | **PROVEN** |
| Document extraction | **EXCLUDED** — unrelated queue |

---

## 9. Recommendations (documentation only — not executed)

| Priority | Action | Rationale |
|----------|--------|-----------|
| P0 | **Pre-deploy boot check** — `node dist/src/main.js` or `npm run build && node -e "require('./dist/src/main')"` smoke test before `pm2 restart` | Prevents 100+ autorestarts per bad deploy |
| P0 | **PM2 `min_uptime` + `max_restarts`** (e.g. 10s / 5) on bootstrap | Stops infinite 2s crash loops |
| P1 | Fix `buildBatteryV2JobId` — replace `:` in job id (use `-` or hash-only) | 7540+ errors / scheduler noise |
| P1 | Separate **deploy restart** counter from **crash** in monitoring | `exit_code` label on restart events |
| P2 | Document ↺ interpretation in ops runbook | Counter is cumulative; not live instability |
| P2 | Optional worker isolation (separate PM2 process) | Document + DIMO workers survive API bootstrap failures — architectural, not urgent |

---

## 10. Answers to Audit Checklist

| Check | Result |
|-------|--------|
| PM2 ecosystem/config | No ecosystem file; CLI + `dump.pm2`; defaults |
| Restart timestamps | 11 crash bursts + 13 planned (id:1); see §4 |
| exit_code / signal | **1** = bootstrap crash; **0** + SIGINT = deploy stop |
| Memory/CPU | Stable; no memory-triggered restart |
| unhandledRejection / uncaughtException | **0** |
| OOM / kernel | **0** |
| Deploy scripts / watch | Deploy script restarts once; watch off |
| Health-check loop | **None** |
| Scheduler exceptions | Battery job id errors — **non-fatal** |
| Document worker exceptions | **None fatal** |
| Redis/Postgres/ClickHouse | Warnings only; not exit cause |
| Mistral timeouts | **Not restart cause** |
| Release vs crash | **Distinguished** — §4 |
| max_memory_restart | **Unset** |
| Node + startup | **22.23.1**, `dist/src/main.js` |

---

## 11. Abnahmekriterien (Prompt 5)

| ID | Kriterium | Status |
|----|-----------|--------|
| PM01 | Root cause evidenced from VPS logs | ✅ |
| PM02 | All hypothesis classes tagged PROVEN/LIKELY/POSSIBLE/EXCLUDED/NOT_VERIFIABLE | ✅ |
| PM03 | Document worker ruled in/out explicitly | ✅ EXCLUDED as root cause |
| PM04 | 530 ↔ 517+13 decomposition documented | ✅ |
| PM05 | Read-only audit — no mutations | ✅ |

---

## Referenzen

- [document-intake-production-reality.md](./document-intake-production-reality.md) — original 530↺ observation
- [document-intake-v2-migration-rollout-plan.md](../architecture/document-intake-v2-migration-rollout-plan.md) — Phase 1 Runtime Stability
- `backend/scripts/ops/vps-deploy-release.sh` — deploy + `pm2 restart`
- `docs/audits/battery-runtime-topology.md` — single-fork worker topology
- `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-queue.util.ts` — job id colon issue

---

*End of PM2 stability audit. No production changes were made.*
