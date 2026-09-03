# M3.1 — ≥6-hour full-fleet production validation

**Audit date:** 2026-09-03  
**Canonical T0 (`BATTERY_V2_FULL_FLEET_T0`):** `2026-09-03T11:08:02Z`  
**Audit window end:** `2026-09-03T18:09:26Z` (~7.02 hours elapsed)  
**Deployed runtime SHA:** `0e0f09259f206aef44bd66eb4c142f7aee3fe29c` (PR #1519, release `20260903101734_v4994`)  
**Repository HEAD (docs/scripts):** `dba5693b9` (includes PR #1524 M3.1 activation record)

## Executive verdict

```
PRODUCTION_VALIDATED = PENDING_EVIDENCE
```

Infrastructure and activation configuration are healthy across the ≥6h window. **No natural post-T0 canonical REST → assessment → publication chain was observed.** The 30-minute audit’s missing natural evidence has **not** been resolved for the publication gate.

| Field | Value |
|-------|-------|
| `AUDIT_WINDOW` | `2026-09-03T11:08:02Z` → `2026-09-03T18:09:26Z` (~7.02h) |
| `FLEET_SIZE` | 6 connected DIMO vehicles |
| `ELIGIBLE_FLEET_SIZE` | 3 LV-active gasoline (telemetry + LIVE_VOLTAGE post-T0); 1 EV (no LV REST path); 2 idle/offline gasoline |
| `TOTAL_MEASUREMENTS_POST_T0` | 68 |
| `LIVE_VOLTAGE_MEASUREMENTS_POST_T0` | 68 |
| `CANONICAL_REST_MEASUREMENTS_POST_T0` | 0 (`REST_60M` + `REST_6H`) |
| `ASSESSMENTS_POST_T0` | 0 |
| `PUBLICATIONS_POST_T0` | 0 (all-time `battery_publications` = 0) |
| `NATURAL_POST_T0_PUBLICATION_PROVEN` | **NO** |
| `NATURAL_END_TO_END_PIPELINE_PROVEN` | **NO** |

## Step 0 — Authority reconstruction

| Field | Value |
|-------|-------|
| `REPO_HEAD` | `dba5693b9` |
| `M3_1_AUTHORITY_RECONSTRUCTED` | YES |
| `T0` | `2026-09-03T11:08:02Z` |
| `CURRENT_UTC` | `2026-09-03T18:09:26Z` |
| `ELAPSED_SINCE_T0` | ~25,284s (~7.02h) — **eligible** (≥6h) |

Acceptance criteria reconstructed from `M3_1_DIRECT_FULL_FLEET_ACTIVATION.md`, `battery-v2-m3-1-six-hour-validation.sh` checklist, and `CURRENT_STATE.md`:

1. M3.1 flags effective on production (`PUBLICATION=true`, `REST_SHADOW=false`, reconciliation on).
2. PM2 dual-replica stable; exactly one scheduler leader.
3. Post-T0 failure delta = 0 for monitored classes.
4. No logical duplicates, reservation leaks, or idempotency violations post-T0.
5. **Natural evidence:** post-T0 REST_60M / REST_6H measurements where vehicles are active; linked assessments; **first `battery_publications` rows** since T0 with measurement → assessment → publication provenance.
6. Full-fleet matrix distinguishes legitimately ineligible/offline from pipeline failure.

## Step 1 — Production identity

| Field | Value |
|-------|-------|
| `DEPLOYED_SHA` | `0e0f09259` |
| `EXPECTED_SHA_RELATION` | M3.1 **config** active; M3.1 **ops scripts** on `main` (`dba5693b9`) not yet on deployed release |
| `BATTERY_V2_PUBLICATION_ENABLED` | `true` |
| `BATTERY_V2_REST_SHADOW_ENABLED` | `false` |
| `BATTERY_V2_RECONCILIATION_ENABLED` | `true` (code default) |
| `PM2_REPLICAS` | 2 (`synqdrive`, `synqdrive-b`) — both online |
| `SCHEDULER_LEADERS` | 1 (`synqdrive` LEADER :3001; `synqdrive-b` FOLLOWER :3002) |

PM2 restarts stable since cutover (~7h uptime); +1 restart per replica from activation rolling restart only.

## Step 2 — Canonical 6h validator

**Result:** Script **not present** on deployed release (`SCRIPT_ON_DEPLOYED_RELEASE=NO`).

Attempted pipe via SSH stdin per M3.1 activation doc:

```
bash: /home/synqdrive-admin/battery-v2-m3-1-production-snapshot.sh: No such file or directory
```

**Root cause (read-only diagnosis):** Piped stdin cannot resolve `SCRIPT_DIR`; helper path fails without explicit `BATTERY_V2_OPS_SCRIPT_DIR`. Validator updated in this PR to fail closed with a clear diagnostic. **Not patched on production** per audit rules.

Independent forensic audit (`/tmp/m31-6h-forensic-audit.sh` + deep queries) used as substitute evidence.

## Step 3 — Independent forensic cross-check

### A. Full-fleet coverage

| Vehicle (short) | Plate | Eligibility | Meas post-T0 | Assess post-T0 | Pub post-T0 | Latest meas | Latest assess | Verdict |
|-----------------|-------|-------------|--------------|----------------|-------------|-------------|---------------|---------|
| `a60c0749` | KS MX 2024 | **LV-active** (LIVE_VOLTAGE + DIMO connected) | 27 | 0 | 0 | 13:08:59 LIVE_VOLTAGE | 11:05:55 (pre-T0) | **NO REST post-T0** — driving telemetry only |
| `19fedd4b` | WOB L 750 | **LV-active** | 29 | 0 | 0 | 15:25:59 LIVE_VOLTAGE | 11:00:55 (pre-T0) | **NO REST post-T0** |
| `c10351f8` | KS MS 661 | **LV-active** | 12 | 0 | 0 | 16:02:29 LIVE_VOLTAGE | 10:30:55 (pre-T0) | **NO REST post-T0** |
| `8c850ff1` | HMÜ C 215 | Idle (no meas since 2026-09-02) | 0 | 0 | 0 | 2026-09-02 | — | **Legitimately ineligible** |
| `c43c3b45` | WOB L 9755 | Idle (no meas since 2026-08-27) | 0 | 0 | 0 | 2026-08-27 | — | **Legitimately ineligible** |
| `68868291` | KS FH 660E (EV) | Connected; **no LV REST path** | 0 | 0 | 0 | — | — | **Legitimately ineligible** |

**Eligibility changes:** None disconnected. Three gasoline vehicles gained LIVE_VOLTAGE telemetry post-T0 but produced **zero** REST_60M/REST_6H measurements — consistent with continuous driving / no qualifying shutdown-rest window completing after T0.

### B. Scheduling contract (code authority) vs production evidence

**Code contract** (deployed `0e0f09259`, `battery-health-v2.config.ts`, `battery-v2-cutover.policy.spec.ts`):

| Layer | Contract | Default / production |
|-------|----------|----------------------|
| **REST_60M target delay** | `anchor + BATTERY_REST_60M_MS` | 60 min after rest-window anchor |
| **REST_6H target delay** | `anchor + BATTERY_REST_6H_MS` | 6 h after rest-window anchor |
| **REST quality windows** | `battery-rest-target-evaluation.ts` | REST_60M ±15 min; REST_6H ±30 min around target instant |
| **REST measurement creation** | `BATTERY_REST_TARGET_EVALUATE` handler | Creates `REST_60M`/`REST_6H` row when eligible observation selected |
| **Reconciliation scheduler** | `BatteryV2ReconciliationScheduler` | Every `BATTERY_V2_RECONCILIATION_INTERVAL_MS` = **300000** (5 min), leader only |
| **Observation classify** | `reconcileMissingObservations` | Re-enqueues when gap > `BATTERY_V2_OBSERVATION_STALE_MS` = **120000** (2 min) — produces `LIVE_VOLTAGE`, not REST |
| **Canonical pipeline gate** | `isBatteryV2RestShadowEnabled()` (`BATTERY_V2_REST_SHADOW_ENABLED`) | When **false**, gates: REST target scheduling/evaluation, session arming, PKG-01 handoff repair, REST-target reconciliation |
| **Stage-2 cutover (tests)** | `REST_SHADOW=true` + `PUBLICATION=true` | Canonical pipeline ON, shadow semantics OFF, legacy capture OFF |
| **Production M3.1 config** | `REST_SHADOW=false` + `PUBLICATION=true` | Canonical pipeline **OFF** per code; `isBatteryV2LegacyRestCaptureEnabled()` = **true** |

**Distinction:** Scheduler **evaluation cadence** (reconciliation ticks, observation classify) is independent of **REST measurement creation** (requires canonical pipeline enabled).

**Post-T0 scheduler/reconciliation evidence** (`T0` → audit end):

| Signal | Expected under M3.1 flags | Observed |
|--------|---------------------------|----------|
| Reconciliation ticks | ~every 5 min on leader | **90** `reconcile_completed` log lines |
| `restSessions` / `restTargets` per tick | 0 (REST_SHADOW=false) | **0** on every sampled tick |
| PKG-01 handoff repairs per tick | 0 (REST_SHADOW=false) | **0** (canonical repair gated) |
| `observationClassify` per tick | >0 when telemetry stale | **1–4** per tick when vehicles active |
| `BATTERY_REST_TARGET_EVALUATE` completed | Only pre-cutover delayed jobs | **1** (12:34:49 UTC, pre-T0 6h window) |
| `BATTERY_OBSERVATION_CLASSIFY` completed | When observations stale | **73** post-T0 |
| `REST_60M`/`REST_6H` measurements created | 0 when canonical pipeline off | **0** post-T0 |

Sample reconciliation tick (post-T0, typical):

```json
{"observationClassify":2,"restSessions":0,"restTargets":0,"assessments":2,"publicationHandoffs":0,"total":4}
```

The `assessments:2` are **legacy** `reconcilePendingAssessments` (`battery_features` stale path), not canonical REST handoffs.

### C. Cadence (measurement types split)

| Path | Post-T0 |
|------|---------|
| `30M_CADENCE` (REST_60M measurements) | **0** (last fleet-wide: `08:22:24` pre-T0) |
| `6H_CADENCE` (REST_6H measurements) | **0** (last: `11:05:55`, 2 min before T0) |
| `LIVE_VOLTAGE` (telemetry snapshots) | ~1/min when vehicles active (12:38–16:02 UTC) |
| Reconciliation scheduler | ~5 min (90 ticks observed) |
| Observation classify | ~2 min stale threshold (73 jobs post-T0) |

`ANOMALOUS_GAPS`: No new REST target evaluations or REST measurements post-T0 — **consistent with `REST_SHADOW=false` gating canonical pipeline**, not absent scheduler ticks. One pre-scheduled `BATTERY_REST_TARGET_EVALUATE` completed at 12:34 for a pre-T0 6h window.

### D. Measurements (terminology split)

```
TOTAL_MEASUREMENTS_POST_T0 = 68
LIVE_VOLTAGE_MEASUREMENTS_POST_T0 = 68
CANONICAL_REST_MEASUREMENTS_POST_T0 = 0  (REST_60M=0, REST_6H=0)
VEHICLES_WITH_MEASUREMENTS = 3 (LIVE_VOLTAGE only)
MEASUREMENT_TYPES_POST_T0 = LIVE_VOLTAGE (68)
FIRST_MEASUREMENT_POST_T0 = 2026-09-03T12:38:59.972Z
LAST_MEASUREMENT_POST_T0 = 2026-09-03T16:02:29.225Z
```

- Identity uniqueness: no logical duplicate idempotency keys post-T0.
- **30m audit gap unresolved:** zero REST_60M/REST_6H post-T0; LIVE_VOLTAGE does not satisfy canonical REST measurement gate.

### E. Assessments

```
TOTAL_ASSESSMENTS_POST_T0 = 0
VEHICLES_WITH_ASSESSMENTS = 0
FIRST_ASSESSMENT_POST_T0 = (none)
LAST_ASSESSMENT_POST_T0 = (none)
```

Pre-T0 latest assessments (all `CANONICAL`, `publicationHandoff=EXECUTED`, zero persisted publications — shadow-era):

| Vehicle | `computed_at` |
|---------|---------------|
| `a60c0749` | 11:05:55 |
| `19fedd4b` | 11:00:55 |
| `c10351f8` | 10:30:55 |

Two reconciliation `BATTERY_ASSESSMENT_RECOMPUTE` jobs completed 18:07:29 for idle vehicles (`c43c3b45`, `8c850ff1`) with `correlationId=reconcile:assess:...` — **no new assessment rows** (no eligible measurement).

### F. Publications — critical M3.1 gate

```
TOTAL_PUBLICATIONS_POST_T0 = 0
VEHICLES_WITH_PUBLICATIONS = 0
FIRST_PUBLICATION_POST_T0 = (none)
LAST_PUBLICATION_POST_T0 = (none)
ALL_TIME battery_publications = 0
```

```
NATURAL_POST_T0_PUBLICATION_PROVEN = NO
NATURAL_END_TO_END_PIPELINE_PROVEN = NO
```

PKG-02 handoff metadata: 10× `EXECUTED` on pre-T0 assessments — **shadow-era handoffs without persisted publication rows** (expected when `PUBLICATION_ENABLED=false`). M3.1 doc: new assessments drive first customer-facing publications; pre-T0 EXECUTED handoffs do not re-enter PKG-02 queue.

### G. Failure delta

| Field | Value |
|-------|-------|
| `FAILED_BASELINE` (at T0) | 77 |
| `FAILED_CURRENT` | 77 |
| `FAILED_DELTA` | **0** post-T0 |

Post-T0 monitored log classes: `54000=0`, `LOCK_CONTENTION=0`, `AUTHORITY_UNAVAILABLE=0`, `BATTERY_ASSESSMENT=0`, `BATTERY_PUBLICATION=0`.

**Classification:** All 77 failed jobs are historical/pre-T0. No new post-T0 failure identities.

### H. Duplicates / idempotency

```
NEW_LOGICAL_DUPLICATES = 0
PUBLICATION_IDENTITY_COLLISIONS = 0
IDEMPOTENCY_VIOLATIONS = 0
```

Post-T0 duplicate checks on assessments, publications, and customer publication versions: all zero.

### I. Reservation lifecycle

```
ACTIVE_RESERVATIONS = 0
STALE_RESERVATIONS = 0
RESERVATION_LEAKS = 0
AUTHORITY_UNAVAILABLE_POST_T0 = 0
```

### J. Reconciliation / liveness / PKG-01 ENQUEUED backlog

| Field | Value |
|-------|-------|
| PKG-01 ENQUEUED / EXECUTED / MISSING | 24 / 24 / 13 |
| PKG-02 EXECUTED (metadata) | 10 |
| `OLDEST_PENDING_AGE` | **12h 33m** (enqueued `2026-09-03T06:07:19.375Z`) |
| `POST_T0_REPAIRS` | 0 canonical PKG-01 repairs (`reconcileCanonicalRestAssessmentHandoffs` gated); 2 legacy `reconcilePendingAssessments` jobs (idle vehicles, no persisted rows) |
| `RECONCILIATION_LIVENESS` | **PARTIAL** — scheduler ticks healthy; canonical repair frozen by `REST_SHADOW=false` |

#### PKG-01 ENQUEUED handoff classification (all 24)

Every ENQUEUED identity is **pre-T0** (`enqueuedAt` 06:07–06:30 UTC; `lastAttemptAt` ~10:22 UTC, before `T0=11:08:02Z`). All have `assess_row_exists=0` despite linked measurement rows (quality `CONTAMINATED_*` or `MISSED`).

| Vehicle | Target | Session | Meas quality | Enqueued | Last attempt | Reconciliation should progress? | Liveness defect? |
|---------|--------|---------|--------------|----------|--------------|--------------------------------|--------------------|
| `c10351f8` | REST_6H | PLANNED | CONTAMINATED_BY_CHARGING | 06:07:19 | 10:22:19 | **No** under `REST_SHADOW=false` (PKG-01 repair gated); would be candidate if canonical ON | **No new post-T0 regression** — frozen pre-T0 backlog |
| `c10351f8` | REST_60M | INVALID | CONTAMINATED_BY_CHARGING | 06:07:19 | 10:22:19 | same | same |
| `a60c0749` | REST_6H | INVALID | CONTAMINATED_BY_WAKE | 06:07:19 | 11:05:55 | same | same |
| `a60c0749` | REST_60M | COMPLETED | CONTAMINATED_BY_ACTIVE_TRIP | 06:07:19 | 10:22:19 | same | same |
| `a60c0749` | REST_6H | INVALID | CONTAMINATED_BY_WAKE | 06:07:19 | 10:22:19 | same | same |
| `c10351f8` | REST_6H | INVALID | CONTAMINATED_BY_WAKE | 06:07:19 | 10:22:19 | same | same |
| `c10351f8` | REST_6H | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:19 | same | same |
| `a60c0749` | REST_6H | COMPLETED | CONTAMINATED_BY_WAKE | 06:12:19 | 10:22:19 | same | same |
| `a60c0749` | REST_6H | PLANNED | CONTAMINATED_BY_WAKE | 06:12:19 | 10:22:19 | same | same |
| `c10351f8` | REST_60M | PLANNED | CONTAMINATED_BY_CHARGING | 06:12:19 | 10:22:19 | same | same |
| `19fedd4b` | REST_6H | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:19 | same | same |
| `c10351f8` | REST_6H | PLANNED | CONTAMINATED_BY_WAKE | 06:12:19 | 10:22:19 | same | same |
| `c10351f8` | REST_6H | INVALID | CONTAMINATED_BY_WAKE | 06:12:19 | 10:22:19 | same | same |
| `19fedd4b` | REST_60M | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:20 | same | same |
| `c10351f8` | REST_60M | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:20 | same | same |
| `c10351f8` | REST_60M | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:20 | same | same |
| `c10351f8` | REST_60M | PLANNED | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:20 | same | same |
| `a60c0749` | REST_60M | PLANNED | MISSED | 06:12:19 | 10:22:20 | same | same |
| `a60c0749` | REST_60M | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:20 | same | same |
| `a60c0749` | REST_60M | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:20 | same | same |
| `19fedd4b` | REST_6H | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:20 | same | same |
| `a60c0749` | REST_60M | INVALID | CONTAMINATED_BY_ACTIVE_TRIP | 06:12:19 | 10:22:20 | same | same |
| `a60c0749` | REST_60M | PLANNED | CONTAMINATED_BY_WAKE | 06:12:19 | 10:22:20 | same | same |
| `a60c0749` | REST_60M | ACTIVE | CONTAMINATED_BY_ACTIVE_TRIP | 06:30:24 | 10:22:20 | same | same |

**Why ENQUEUED:** BullMQ assess jobs were enqueued during pre-T0 shadow-era reconciliation burst; handoff metadata never reached `EXECUTED` (no `battery_assessments` row for these idempotency keys — measurements are contaminated/missed).

**Post-T0 behavior:** Reconciliation continued (90 ticks) but `reconcileCanonicalRestAssessmentHandoffs` returned 0 each tick because `isBatteryV2RestShadowEnabled()` is false. **Not a new post-T0 liveness defect** — expected under deployed flag semantics; blocks validation because canonical repair path is inactive.

### K. PM2 / scheduler health

| Field | Value |
|-------|-------|
| `PM2_HEALTH` | **PASS** |
| `UNEXPECTED_RESTARTS` | 0 post-cutover (stable +1 from rolling restart) |
| `SCHEDULER_HEALTH` | **PASS** |
| `SCHEDULER_LEADERS` | 1 throughout audit window |
| `MULTI_LEADER_OBSERVED` | NO |
| `ZERO_LEADER_GAPS` | NO |

## Step 4 — E2E trace samples

**No post-T0 natural measurement → assessment → publication chains exist.**

Pre-T0 reference chain (last successful assessment, **not** counting toward M3.1 gate):

| Vehicle | Measurement | Assessment | Publication |
|---------|-------------|------------|-------------|
| `a60c0749` | REST_6H `86299db3…` @ 11:05:55 (`CONTAMINATED_BY_WAKE`) | `lv-estimated-health:…:CAN` @ 11:05:55 | handoff EXECUTED; **0 `battery_publications` rows** |
| `19fedd4b` | REST_60M `7feb009a…` @ 11:05:55 | @ 11:00:55 | same |
| `c10351f8` | REST_60M `503fb339…` @ 11:05:55 | @ 10:30:55 | same |

Post-T0 LIVE_VOLTAGE samples have **no linked assessments** (expected — not canonical REST assessment input).

## Step 5 — Adversarial findings

| Challenge | Resolution |
|-----------|------------|
| Healthy counts while fleet stuck? | **Partially yes for publication path** — 3 active vehicles have telemetry but zero REST/assess/pub post-T0. Infrastructure healthy; canonical pipeline idle pending REST windows. |
| Publications from reconciliation only? | **N/A** — zero publications. Reconciliation ran but did not produce assessments or publications for active fleet. |
| Duplicates hidden behind PKs? | **Disproven** — logical idempotency checks clean post-T0. |
| Scheduler leadership hidden? | **Disproven** — 1 leader entire window; scheduler logs active (880 lines post-T0). |
| Failed queue decreased while new failures? | **Disproven** — failed=77 unchanged; post-T0 failed=0. |
| Stale pre-T0 assessments driving post-T0 pubs? | **Disproven** — zero publications; PKG-02 does not re-process pre-T0 EXECUTED handoffs. |
| Publication without new post-T0 measurement? | **N/A** — no publications. |
| Same evidence applied multiple times? | **Disproven** — no post-T0 assessments or publications. |

## Step 6 — Blockers preventing `PRODUCTION_VALIDATED=YES`

1. **Zero post-T0 `battery_publications` rows** — M3.1 activation gate not closed.
2. **Zero post-T0 canonical REST measurements** (`REST_60M`/`REST_6H`) — assessment chain never triggered naturally after T0.
3. **Zero post-T0 assessments** — cannot prove publication path with `PUBLICATION_ENABLED=true`.
4. **Full-fleet E2E absent** — 0/3 active LV-eligible vehicles with post-T0 measurement→assessment→publication chain (`FULL_FLEET_E2E_EVIDENCE=NO`).
5. **Config/code contract:** Production `REST_SHADOW=false` disables canonical REST pipeline per `battery-v2-cutover.policy.spec.ts` Stage 2 (`REST_SHADOW=true` required). Explains zero post-T0 REST measurements and frozen PKG-01 repair.

**Not blockers (classified):** EV vehicle, 2 idle vehicles, infrastructure stability, historical failed queue, pre-T0 PKG-01 backlog freeze (not new post-T0 regression).

## Machine-readable block

```
BATTERY_V2_M3_1_6H_AUDIT=COMPLETE
BATTERY_V2_FULL_FLEET_T0=2026-09-03T11:08:02Z
NATURAL_MEASUREMENT_EVIDENCE=NO
NATURAL_ASSESSMENT_EVIDENCE=NO
NATURAL_PUBLICATION_EVIDENCE=NO
FULL_FLEET_E2E_EVIDENCE=NO
NEW_FAILURE_CLASS=NO
LOGICAL_DUPLICATE_FOUND=NO
IDEMPOTENCY_VIOLATION_FOUND=NO
RESERVATION_LEAK_FOUND=NO
RECONCILIATION_LIVENESS=PARTIAL
PM2_HEALTH=PASS
SCHEDULER_HEALTH=PASS
PRODUCTION_VALIDATED=PENDING_EVIDENCE
```

## Ops notes

- For stdin Cloud Agent audits, set `BATTERY_V2_OPS_SCRIPT_DIR` explicitly (validator fails closed without it).
- Deploy M3.1 ops scripts to production release for on-VPS execution, or pipe with explicit `BATTERY_V2_OPS_SCRIPT_DIR`.
- PKG-01 ENQUEUED backlog is pre-T0 and frozen while `REST_SHADOW=false`; not a new post-T0 failure class.
- Re-run validation after canonical REST pipeline is active and first natural REST window completes post-T0.
