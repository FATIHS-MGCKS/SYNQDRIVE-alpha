# Trip Detection & Lifecycle — Audit Manifest

| Field | Value |
|-------|-------|
| **AUDIT_MODE** | `READ_ONLY` |
| **Standard** | [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) v1.0 |
| **Registry coverage (start)** | `NOT_STARTED` |
| **Registry coverage (this PR)** | `AUDIT_IN_PROGRESS` |
| **Promotion** | **Not requested** — partial Phases 0–2 only |

## Baselines

| Baseline | SHA / identifier | Notes |
|----------|------------------|-------|
| **Repository audited** | `06095af91ce6f58366734a182ac5962830e858db` | `origin/main` at audit start (2026-09-07) |
| **Audit branch** | *(see git commit on PR branch `docs/trip-detection-lifecycle-authority-bootstrap-64c8`)* | Documentation-only |
| **Production release** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` | Release dir `20260906213654_v4994`; PR #1550 merge |
| **Production symlink** | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260906213654_v4994` | Observed 2026-09-07 UTC |

## Audit timestamps

| Event | UTC |
|-------|-----|
| Pre-audit connectivity gate | 2026-09-06 ~22:44 |
| Phase 0–2 reconstruction | 2026-09-07 |
| Production SSH + SQL baseline | 2026-09-07 ~22:12–23:05 (host local) |

## Production access

| Check | Result |
|-------|--------|
| SSH host | `srv1374778.hstgr.cloud` (from `CLOUD_AGENT_VPS_HOST`) |
| SSH user | `synqdrive-admin` (from `CLOUD_AGENT_SSH_USER`) |
| SSH authentication | **Success** (`cloud-agent-verify-vps.sh` + manual session) |
| External PostgreSQL `:5432` | **Not reachable** from agent network |
| Production DB via SSH + local `psql` | **Success** (sudo + `DATABASE_URL` with query string stripped) |
| Tailscale / alternate DB path | **Not configured** (intentionally not attempted) |

**Classification:** `VERIFIED_READ_ONLY` for SSH + bounded SQL aggregates.

## Repository vs Production drift

Production release `01541c2ab…` is an **ancestor** of `origin/main` `06095af91…`.

**On `main` but not deployed to observed Production release:**

| Commit | Summary |
|--------|---------|
| `06095af91` | docs(di): DI-DEF-019 GATE 2 evidence (#1552) |
| `6ea951243` | Trip FSM R8 observability & forensics (#1549) |
| `dcad81c75` | docs(architecture): module inventory (#1548) |

**Implication:** Repository trip-FSM code on `main` includes **R8** (and inventory docs) not present on Production `01541c2ab…`. Behavioral drift for trip detection must assume Production **lags** `main` until next deploy.

## Inspected surfaces

### Repository (`origin/main`)

- `backend/src/modules/vehicle-intelligence/trips/` (orchestration, decision engine, detectors, reconciliation, route artifacts)
- `backend/src/workers/processors/dimo-snapshot.processor.ts`, `trip-tracking.processor.ts`
- `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts`, `trip-tracking-recovery.scheduler.ts`, `trip-reconciliation.scheduler.ts`
- `backend/prisma/schema.prisma` (trip models)
- `backend/src/config/worker.config.ts`, `.env.example`
- `backend/src/modules/observability/trip-metrics.service.ts`
- `frontend/src/rental/components/trips/`, vehicle-intelligence trip API routes
- Historical audits `docs/audits/trip-fsm/*`

### Production (read-only)

- Release path and detached HEAD SHA
- `https://app.synqdrive.eu/api/v1/health` → HTTP 200
- Running `node …/backend/dist/src/main.js` process count (multi-replica)
- Bounded Redis BullMQ key counts (`bull:dimo.snapshot.poll:*`, `bull:dimo.trip-tracking:*`)
- Non-secret trip-related env keys in `/opt/synqdrive/shared/backend.env` (values redacted in evidence)
- Bounded SQL aggregates (see [PRODUCTION_BASELINE.md](evidence/PRODUCTION_BASELINE.md))

## Uninspected / limited surfaces

| Surface | Limitation |
|---------|------------|
| Full Production log forensics | No sustained log mining; bounded grep only |
| Per-vehicle trip traces | Excluded (PII / operational sensitivity) |
| ClickHouse trip mirror contents | Not queried this phase |
| DIMO provider live trigger subscription state | No provider admin API calls |
| Complete env flag inventory | Only trip-adjacent keys sampled |
| `vehicle_trip_detection_states` full fleet coverage | Only 6 rows observed — cohort size implication recorded in PRODUCTION_BASELINE |

## Mutations performed

**None.** No deploy, PM2 change, DB write, Redis write, queue mutation, or Production file edit.
