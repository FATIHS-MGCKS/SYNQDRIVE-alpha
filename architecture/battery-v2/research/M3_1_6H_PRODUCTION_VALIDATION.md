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
| `MEASUREMENTS_POST_T0` | 68 (`LIVE_VOLTAGE` only) |
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

**Root cause (read-only diagnosis):** `battery-v2-m3-1-six-hour-validation.sh` resolves `SCRIPT_DIR` from `${BASH_SOURCE[0]}`, which is `/dev/stdin` when piped — helper path resolves to `$HOME` instead of `backend/scripts/ops/`. **Not patched on production** per audit rules.

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

### B. 30m / 6h cadence

| Path | Post-T0 evidence |
|------|------------------|
| `REST_60M` | **0** measurements (last fleet-wide: `2026-09-03 08:22:24`, vehicle `c10351f8`, quality `CONTAMINATED_BY_ACTIVE_TRIP`) |
| `REST_6H` | **0** measurements (last: `2026-09-03 11:05:55`, vehicle `a60c0749`, quality `CONTAMINATED_BY_WAKE` — **2m before T0**) |
| `LIVE_VOLTAGE` | 68 measurements, ~1/min when vehicles active (12:38–16:02 UTC) — **observation classify path**, not canonical REST assessment driver |

BullMQ completed post-T0 (scanned 1000): `BATTERY_OBSERVATION_CLASSIFY` 73, `BATTERY_ASSESSMENT_RECOMPUTE` 2 (reconciliation, idle vehicles), `BATTERY_REST_TARGET_EVALUATE` 1 (pre-T0 6h window completing 12:34:49), `HV_*` 12.

**Anomalous gaps:** No REST target evaluations for active fleet post-T0 despite 7h elapsed and 3 driving vehicles. Pre-T0 REST burst at ~11:05 produced last assessments; no subsequent REST window closure observed. **Not judged as scheduler failure** — vehicles show continuous LIVE_VOLTAGE (active trips); long-running `LV_REST_WINDOW ACTIVE` session on `a60c0749` since 03:59 without post-T0 target completion.

### C. Measurements

```
TOTAL_MEASUREMENTS_POST_T0 = 68
VEHICLES_WITH_MEASUREMENTS = 3
MEASUREMENT_TYPES = LIVE_VOLTAGE (68)
FIRST_MEASUREMENT_POST_T0 = 2026-09-03T12:38:59.972Z
LAST_MEASUREMENT_POST_T0 = 2026-09-03T16:02:29.225Z
```

- Identity uniqueness: no logical duplicate idempotency keys post-T0.
- **30m audit gap unresolved:** zero REST_60M/REST_6H post-T0; LIVE_VOLTAGE does not satisfy canonical REST measurement gate.

### D. Assessments

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

### E. Publications — critical M3.1 gate

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

### F. Failure delta

| Field | Value |
|-------|-------|
| `FAILED_BASELINE` (at T0) | 77 |
| `FAILED_CURRENT` | 77 |
| `FAILED_DELTA` | **0** post-T0 |

Post-T0 monitored log classes: `54000=0`, `LOCK_CONTENTION=0`, `AUTHORITY_UNAVAILABLE=0`, `BATTERY_ASSESSMENT=0`, `BATTERY_PUBLICATION=0`.

**Classification:** All 77 failed jobs are historical/pre-T0. No new post-T0 failure identities.

### G. Duplicates / idempotency

```
NEW_LOGICAL_DUPLICATES = 0
PUBLICATION_IDENTITY_COLLISIONS = 0
IDEMPOTENCY_VIOLATIONS = 0
```

Post-T0 duplicate checks on assessments, publications, and customer publication versions: all zero.

### H. Reservation lifecycle

```
ACTIVE_RESERVATIONS = 0
STALE_RESERVATIONS = 0
RESERVATION_LEAKS = 0
AUTHORITY_UNAVAILABLE_POST_T0 = 0
```

### I. Reconciliation / liveness

| Field | Value |
|-------|-------|
| PKG-01 ENQUEUED / EXECUTED / MISSING | 24 / 24 / 13 |
| PKG-02 EXECUTED (metadata) | 10 |
| `POST_T0_REPAIRS` | 2 reconciliation assess jobs (idle vehicles, no persisted assessment) |
| `RECONCILIATION_LIVENESS` | **PARTIAL** — reconciliation active; pre-T0 ENQUEUED handoffs remain (e.g. `19fedd4b` REST_6H, `a60c0749` REST_60M); not primary-path rescue of publications |

### J. PM2 / scheduler health

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
4. **Full-fleet E2E incomplete** — 0/3 active LV-eligible vehicles with post-T0 E2E; 3/6 legitimately without evidence.

**Not blockers (classified):** EV vehicle, 2 idle vehicles, infrastructure stability, historical failed queue.

## Machine-readable block

```
BATTERY_V2_M3_1_6H_AUDIT=COMPLETE
BATTERY_V2_FULL_FLEET_T0=2026-09-03T11:08:02Z
NATURAL_MEASUREMENT_EVIDENCE=NO
NATURAL_ASSESSMENT_EVIDENCE=NO
NATURAL_PUBLICATION_EVIDENCE=NO
FULL_FLEET_E2E_EVIDENCE=PARTIAL
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

- Deploy M3.1 ops scripts (`battery-v2-m3-1-six-hour-validation.sh`, snapshot helper) to production release for future audits, **or** fix stdin `SCRIPT_DIR` resolution in repo before piping.
- Continue PKG-01 ENQUEUED backlog observation; not a new post-T0 failure class.
- Re-run ≥6h validation after first natural REST window completes post-T0 on active fleet.
