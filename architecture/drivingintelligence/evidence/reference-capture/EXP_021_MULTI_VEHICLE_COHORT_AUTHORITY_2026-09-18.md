# EXP-021 multi-vehicle cohort authority (2026-09-18)

## Before (single-token)

- Live-window activation and maturation canary operator assumed **KS MX 2024** only (`tokenId` 187336).
- Hard guards: allowlist length 1, `maxActiveFamilies === 1`, global unfinished-family cap.

## After (explicit cohort)

- **Configuration:** `EXP021_CANARY_LIVE_WINDOW_COHORT_JSON` — JSON array of `{ organizationId, vehicleId, tokenId, label? }`.
- **Maturation operator:** `EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON` or fallback to live-window cohort env.
- **Fail-closed:** missing/invalid/empty cohort → no live-window arms; maturation guards reject enrollment.
- **Authority predicate:** trip `vehicleId` ∈ cohort **and** resolved DIMO `tokenId` matches the same member **and** org matches **and** trip start ≥ `NOT_BEFORE`.
- **Forensic preservation:** `vehicleTripId` `a72fb179-3fca-42a1-bdc1-3461cbcade44` excluded from arm/finalize (no backfill).
- **PDI (PR #1692 unchanged):** `CANARY_VEHICLE_TRIP_CONFIRMED` from canonical COMPLETED `vehicle_trips`; no cross-vehicle adoption.
- **Concurrency:** per-`vehicle_trip_id` ledger/study run/RC session; per-vehicle blocking RC sessions; multi-replica claim convergence unchanged.
- **Fourth vehicle:** append one object to cohort JSON; set maturation allowlist + `maxActiveFamilies` to new size (no semantic code change).

## Production maturation operator (one process)

**Command (dry-run watch):**

```bash
cd backend
EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON='[...]' \
  npx ts-node scripts/ops/reference-capture-exp021-maturation-shadow-canary-enroll.ts \
  --watch-cohort
```

**Command (execute enrollments):**

```bash
EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON='[...]' \
  npx ts-node scripts/ops/reference-capture-exp021-maturation-shadow-canary-enroll.ts \
  --watch-cohort --execute
```

**Token-scoped forensic mode (unchanged, explicit):**

```bash
npx ts-node scripts/ops/reference-capture-exp021-maturation-shadow-canary-enroll.ts \
  --token-id 187336 --wait-next-window [--execute]
```

Modes are **mutually exclusive** (`--watch-cohort` forbids `--token-id`).

### Runtime behavior (`runCohortMaturationWatchLoop`)

- One OS process; **one async watch loop per cohort member** (`Promise.all`).
- Each member: wait for next authoritative PDI window (vehicle-scoped settlement-shadow loader) → enroll → short cooldown → re-arm for next window.
- Member errors: bounded backoff; other members continue.
- **SIGINT / SIGTERM:** `AbortSignal` stops polling; in-flight enrollment relies on existing DB idempotency (family identity unique per `organizationId, vehicleId, tokenId, canonicalWindowTo`).
- Startup JSON logs: `MODE`, `COHORT_SIZE`, `COHORT_MEMBERS`, `EXECUTE`, `RUNTIME_SHA`.
- Periodic diagnostics (~60s): `ACTIVE_MEMBER_WATCHERS`, `MEMBER_FAILURE_COUNT`, `FAMILIES_ENROLLED_THIS_RUN`, `LAST_ENROLLMENT_BY_MEMBER`.

### `maxActiveFamilies`

- Must equal cohort size in maturation config.
- `assertCanaryHardGuards` uses **per-vehicle** `countUnfinishedFamiliesForVehicle` — vehicle A unfinished family does not block B/C enrollment.

## VDC 7-day shadow + EXP-021 DIMO provider budget (repository forensic)

### Shared infrastructure

| Mechanism | Location | Scope |
|-----------|----------|--------|
| **DIMO provider gateway + admission** | `dimo-provider-gateway.service.ts`, `dimo-provider-admission.service.ts` | All GraphQL telemetry calls |
| **Global Redis limiter** | `dimo-provider-limiter.redis-scripts.ts` (`DIMO_PROVIDER_KEY_PREFIX`) | **Global** token bucket + global in-flight ZSET (not per-token buckets) |
| **Default budget** | `dimo-provider-limiter.config.ts` | `rateLimitPerSecond=20`, `rateBurst=5` → capacity **25 req/s** sustained burst window; `documentedCoreRatePerSecond=25` (DIMO Core doc reference) |
| **In-flight cap** | same config | `maxInFlight=40`, `reservedHighPrioritySlots` for P0/P1 |
| **Priority lanes** | `dimo-provider-category.util.ts` | P0 trip tracking; snapshots P3; enrichment P4 |

### EXP-021 provider call sites (maturation + RC)

| Path | Calls | Concurrency |
|------|-------|-------------|
| Maturation shadow worker | `ReferenceCaptureExp021MaturationShadowProviderQueryAdapter.executeHistoricalQuery` → `DimoTelemetryService.queryGraphQLWithIngressTiming` | BullMQ worker `EXP021_MATURATION_SHADOW_WORKER_CONCURRENCY=1` → **at most 1 maturation GraphQL in flight** |
| Per enrolled family | ~`4 strata × 9 planned ages` = **36 jobs** per family, staggered by `plannedAgeMs` after `canonicalWindowTo` | Spread over minutes, not a single burst |
| RC live canary arm/finalize | Session acquisition / HF paths (separate from maturation queue) | RC session-scoped; not multiplied by cohort watch loops |

**Realistic added load (3-member cohort, all driving):** ≤3 concurrent families × 36 scheduled slot jobs, but worker concurrency **1** ⇒ **≤1 GraphQL req/s average peak from maturation worker** unless jobs align; scheduling spreads observations from 30s–120s after each window close.

**Worst-case maturation GraphQL:** 36 attempts × 3 retries × 3 vehicles if all families active ≈ **324 attempts** over each family's observation horizon (not per second).

### VDC shadow provider load

| Path | Typical pattern |
|------|-----------------|
| Physical-state shadow | Snapshot/webhook-driven evidence orchestration (`physical-state-snapshot-evidence-orchestrator.service.ts`); **no continuous historical GraphQL polling loop** equivalent to maturation |
| Shadow observations | Primarily **DB writes** classifying reconcile outcomes (`device_connection_physical_state_shadow_observations`) |

VDC does not enqueue `reference-capture-exp021-maturation-shadow-observe` jobs and does not share maturation BullMQ queues.

### Starvation analysis

- **Shared global limiter** applies to **both** EXP-021 and VDC DIMO calls when limiter mode=`enforce`.
- **P0/P1 reserved in-flight slots** protect live trip tracking from background P3/P4 saturation.
- Maturation worker concurrency **1** caps EXP-021 observation GraphQL parallelism.
- VDC shadow path is predominantly ingest/reconcile, not 36× historical queries per drive.

**Conclusion:**

- `EXP021_CAN_STARVE_VDC=NO` (no code path for EXP-021 to monopolize provider; global limiter + priority lanes + maturation concurrency 1).
- `VDC_CAN_STARVE_EXP021=NO` (VDC shadow does not run competing maturation-scale historical query storms; worst case is shared limiter delay, not dropped authority).
- `KNOWN_PROVIDER_LIMIT=25 req/s (documented DIMO Core ceiling in repo config; production enforce values may differ via env)`.
- `RATE_HEADROOM=UNKNOWN` without production `DIMO_PROVIDER_*` env values.

**EXP021_VDC_SHARED_MUTATING_AUTHORITY=NO**

**SAFE_FOR_EXP021_AND_VDC_PARALLEL_RUN=YES** (shared provider delay possible under enforce mode; no mutating authority collision).

### Production effective vs repository default (read-only VPS, 2026-09-19)

Inspection: `sudo grep` on `/opt/synqdrive/shared/backend.env` via Cloud Agent SSH (`synqdrive-admin` + sudo). **No production deploy or env mutation.**

| Control | REPOSITORY_DEFAULT (code / `.env.example`) | PRODUCTION_EFFECTIVE |
|---------|---------------------------------------------|----------------------|
| `DIMO_PROVIDER_LIMITER_MODE` | `shadow` | **UNKNOWN** — key absent from `backend.env`; live Nest resolved env not exported to this read path |
| `DIMO_PROVIDER_RATE_LIMIT_PER_SECOND` | `20` | **UNKNOWN** — absent from `backend.env` |
| `DIMO_PROVIDER_RATE_BURST` | `5` (capacity ≈ 25 burst) | **UNKNOWN** — absent |
| `DIMO_PROVIDER_MAX_IN_FLIGHT` | `40` | **UNKNOWN** — absent |
| `DIMO_PROVIDER_RESERVED_HIGH_PRIORITY_SLOTS` | `12` | **UNKNOWN** — absent |
| `EXP021_MATURATION_SHADOW_WORKER_CONCURRENCY` | `1` (`reference-capture-exp021-maturation-shadow.constants.ts`, not env-overridable) | **1** (same compile-time constant on deployed artifact) |

**Production maturation flags present in `backend.env` (pre–PR #1694 cohort deploy):** `EXP021_MATURATION_SHADOW_ENABLED=true`, allowlist `187336` only, `EXP021_MATURATION_SHADOW_MAX_ACTIVE_FAMILIES=1` — cohort expansion remains a future config change, not performed in this closure.

**Rate-headroom conclusion:** With DIMO limiter effective values **unverified**, `RATE_HEADROOM` stays **UNKNOWN** for enforce-mode arithmetic; repository analysis above still bounds maturation GraphQL via worker concurrency **1**.

## PostgreSQL multi-vehicle cohort proof (A1/B1/C1/A2)

**Spec:** `reference-capture-exp021-maturation-shadow-canary-cohort.postgres.integration.spec.ts`  
**CI:** `npm run test:exp021:maturation-shadow:cohort-postgres:ci` (included in `test:exp021:fleet:postgres:ci`)

| Step | Vehicle shape | Window (`canonicalWindowTo`) | Proof |
|------|---------------|------------------------------|--------|
| A1 | KS MX (`187336`) | `2026-09-21T10:00:00.000Z` | `executeCanaryEnrollment` + real `enrollWindowFamily`; concurrent duplicate enrollment converges to **one** family (DB unique identity) |
| B1 | KS MS (`187361`) | `2026-09-21T10:05:00.000Z` | Independent family while A unfinished |
| C1 | WOB (`192922`) | `2026-09-21T10:10:00.000Z` | Independent family; no cross-vehicle / cross-token contamination |
| A2 | KS MX | `2026-09-21T11:00:00.000Z` | Second family after A1 observation horizon completed; same process + cohort config |

**Restart convergence:** New `ReferenceCaptureExp021MaturationShadowEnrollmentService` instance; `enrollWindowFamily` replay for A1 returns same `familyId` (`RESTART_DUPLICATES_A1=NO`); `executeCanaryEnrollment` accepts A2 (`RESTART_ACCEPTS_A2=YES`).

**Forensic trip** `a72fb179-3fca-42a1-bdc1-3461cbcade44`: seeded without `physicalDriveInterval`; no maturation family at forensic `endTime`.

**Repository fix (Postgres binding):** `countUnfinishedFamiliesForVehicle` raw query — removed erroneous `::uuid` cast on Prisma text bind (enables per-vehicle guard under real Postgres).

## Activation / deploy sequence (future task)

1. Deploy cohort PR with activation **still false**.
2. Set cohort JSON + maturation allowlist + `maxActiveFamilies` = cohort size on VPS.
3. Set new `EXP021_CANARY_LIVE_WINDOW_ACTIVATION_NOT_BEFORE_ISO`.
4. Enable live-window scheduler (`EXP021_CANARY_LIVE_WINDOW_ACTIVATION_ENABLED=true`).
5. Start **one** cohort operator: `--watch-cohort --execute` (single process).
6. VDC 7-day shadow may run concurrently when provider limiter enforce settings are confirmed on VPS.
