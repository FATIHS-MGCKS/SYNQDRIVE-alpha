# M3.1 — Cutover contract audit

**Audit date:** 2026-09-03  
**Deployed SHA:** `0e0f09259f206aef44bd66eb4c142f7aee3fe29c` (PR #1519)  
**Repository HEAD (docs):** branch `cursor/battery-v2-m3-1-6h-validation-90ec`  
**Prior evidence:** `M3_1_6H_PRODUCTION_VALIDATION.md`, `M3_1_DIRECT_FULL_FLEET_ACTIVATION.md`

## Executive summary

M3.1 was activated with a **flag combination that disables the canonical REST pipeline** while enabling publication. This is **not** Stage-2 cutover per code/tests/architecture authority. The ≥6h soak validated **infrastructure stability only** — not canonical REST→assessment→publication.

```
M3_1_STATUS = BLOCKED_BY_CUTOVER_CONTRACT
PRODUCTION_VALIDATED = PENDING_CORRECTED_ACTIVATION_EVIDENCE
```

| Field | Value |
|-------|-------|
| `INFRASTRUCTURE_HEALTH` | **PASS** |
| `M3_1_ACTIVATION_CONTRACT` | **MISMATCH** |
| `CANONICAL_REST_PIPELINE_ACTIVE` | **NO** |
| `SCHEDULER_HEALTH` | **PASS** |
| `CANONICAL_PIPELINE_HEALTH` | **BLOCKED_BY_CONFIG** |

---

## Step 1 — Cutover contract (code truth table)

**Authority:** `battery-health-v2.config.ts`, `lv-rest-shadow.policy.ts`, `battery-v2-cutover.policy.spec.ts`, `lv-publication-chain-resolution.md` §LV FEATURE-FLAG STATE MACHINE.

| REST_SHADOW | PUBLICATION | `isBatteryV2CanonicalRestPipelineEnabled()` | `isBatteryV2LegacyRestCaptureEnabled()` | `isLvRestShadowModeActive()` | Customer publication gate |
|-------------|-------------|---------------------------------------------|----------------------------------------|------------------------------|---------------------------|
| false | false | **OFF** | ON | false | OFF |
| **false** | **true** | **OFF** | **ON** | false | **ON** |
| true | false | ON | ON | **true** (shadow-only semantics) | OFF |
| **true** | **true** | **ON** | **OFF** | false | **ON** (Stage 2) |

### What `REST_SHADOW` actually gates (deployed `0e0f09259`)

`BATTERY_V2_REST_SHADOW_ENABLED` is **not** a visibility-only flag. Code alias:

```typescript
export const isBatteryV2CanonicalRestPipelineEnabled = isBatteryV2RestShadowEnabled;
```

When `REST_SHADOW=false`, the following return early / no-op:

| Path | File | Behavior |
|------|------|----------|
| REST session arming | `lv-rest-window-session-arming.service.ts` | `skipped: rest_shadow_disabled` |
| REST session open jobs | `battery-lv-rest-session-open.handler.ts` | skip |
| REST target scheduling | `battery-v2-rest-target.producer.ts` | `skipReason: rest_shadow_disabled` |
| REST target evaluation | `battery-rest-target-evaluate.handler.ts` | debug skip |
| FSM target scheduling | `lv-rest-window.service.ts` | skip |
| Ingestion bridge | `lv-rest-window-ingestion-bridge.service.ts` | skip |
| Reconcile missing LV REST sessions | `battery-v2-reconciliation.service.ts:330` | returns 0 |
| Reconcile REST targets (LV + legacy bridge) | `battery-v2-reconciliation.service.ts:415,566` | returns 0 |
| PKG-01 canonical handoff repair | `battery-v2-reconciliation.service.ts:841` | returns 0 |

**Not gated by REST_SHADOW:**

| Path | Notes |
|------|-------|
| Reconciliation scheduler tick | Runs every 5 min on leader |
| `reconcileMissingObservations` | `BATTERY_OBSERVATION_CLASSIFY` → `LIVE_VOLTAGE` |
| `reconcilePendingAssessments` | Legacy `battery_features` stale path |
| PKG-02 publication handoff repair | `reconcilePublicationHandoffs` — no REST_SHADOW gate |
| `BatteryPublicationService` | Respects `PUBLICATION_ENABLED` only |

### Answers

1. **What does REST_SHADOW gate?** Canonical LV REST FSM, session arming, REST target schedule/evaluate, REST-target reconciliation, PKG-01 repair — plus shadow measurement context when combined with `PUBLICATION=false`.
2. **Shadow-output only?** **No.** It is the master enablement flag for canonical REST ingestion (historical misnomer; D3 targets M4 removal).
3. **Does REST_SHADOW=false disable listed paths?** **Yes** — all five categories confirmed in deployed code.
4. **Does PUBLICATION=true alone activate canonical REST?** **No.** `REST_SHADOW=false` keeps canonical pipeline OFF; legacy capture stays ON.
5. **Stage-2 cutover combination (tests):** `REST_SHADOW=true`, `PUBLICATION=true`, `RECONCILIATION=true` (default).
6. **Is current M3.1 config valid?** **No** for intended Stage-2 canonical publication activation.

```
CUTOVER_CONTRACT_RECONSTRUCTED=YES
CURRENT_M3_1_CONFIG_VALID=NO
CANONICAL_REST_PIPELINE_ACTIVE_UNDER_CURRENT_CONFIG=NO
```

---

## Step 2 — Root cause classification

### Why M3.1 selected `REST_SHADOW=false`

| Source | Statement |
|--------|-----------|
| `vps-enable-battery-v2-full-fleet-production.sh` | Explicitly sets `PUBLICATION=true`, `REST_SHADOW=false` |
| `M3_1_DIRECT_FULL_FLEET_ACTIVATION.md` | Records same post-cutover values as intentional |
| `M3_0E` pre-cutover | `REST_SHADOW=true`, `PUBLICATION=false` — canonical pipeline was ON |
| D3 / `lv-single-authority-cutover-decision.md` | **REJECTED** permanent REST_SHADOW gate; REST_SHADOW is migration scaffold; target removes it at M4 |
| `publication-readiness.md` | **Cutover trap** documented: `OFF \| ON` → canonical OFF, legacy ON |

**Intended semantics (inferred):** Operators likely meant “disable shadow-only publication semantics” (`isLvRestShadowModeActive=false`), which Stage 2 achieves via **`REST_SHADOW=true` + `PUBLICATION=true`**, not `REST_SHADOW=false`.

**Actual code semantics:** `REST_SHADOW=false` disables the entire canonical REST ingestion pipeline.

```
ROOT_CAUSE_CLASS=MULTIPLE_DEFECTS
INTENDED_M3_1_SEMANTICS=Stage-2 production: canonical REST ON, shadow-only semantics OFF, publication ON
ACTUAL_CODE_SEMANTICS=REST_SHADOW=false disables canonical REST; PUBLICATION=true enables publication service only
MISMATCH_PROVEN=YES
```

| Defect class | Evidence |
|--------------|----------|
| **CONFIGURATION_DEFECT** | Ops activation script + production `backend.env` set wrong combination |
| **DOCUMENTATION_DEFECT** | M3.1 activation doc claimed healthy path; 30m/6h docs attributed absence of REST to timing/fleet idle, not cutover trap |
| **CODE_SEMANTICS_DEFECT** | Known overload of `REST_SHADOW` name (documented D3; not resolved at M3.1) — contributes to operator error but tests/architecture docs are explicit |

---

## Step 3 — Production consequence (existing evidence)

From `M3_1_6H_PRODUCTION_VALIDATION.md` — all explained by `REST_SHADOW=false`:

| Observation | Explained by config gate? |
|-------------|---------------------------|
| 0 REST_60M post-T0 | **Yes** — no new target evaluation/scheduling |
| 0 REST_6H post-T0 | **Yes** |
| 0 canonical assessments post-T0 | **Yes** — no new canonical measurements; PKG-01 repair gated |
| 0 publications post-T0 | **Yes** — no new assessments to drive PKG-02 |
| `restSessions=0` / `restTargets=0` per reconciliation tick | **Yes** — reconciliation paths gated |
| PKG-01 repair frozen (24 ENQUEUED) | **Yes** — `reconcileCanonicalRestAssessmentHandoffs` returns 0 |
| 73 observation classify / 68 LIVE_VOLTAGE | **Yes** — ungated telemetry path |
| 90 reconciliation ticks, PM2/scheduler PASS | **Yes** — scheduler healthy, canonical path blocked separately |

```
SCHEDULER_HEALTH=PASS
CANONICAL_PIPELINE_HEALTH=BLOCKED_BY_CONFIG
WAITING_LONGER_WOULD_NOT_PRODUCE_CANONICAL_REST_EVIDENCE=YES
WAITING_LONGER_WOULD_HELP=NO
```

Absent qualifying vehicle rest is **not** the primary explanation — config prevents canonical REST scheduling regardless of fleet activity.

---

## Step 4 — Target flag combination audit

### Recommended Stage-2 configuration (not applied)

```
BATTERY_V2_REST_SHADOW_ENABLED=true
BATTERY_V2_PUBLICATION_ENABLED=true
BATTERY_V2_RECONCILIATION_ENABLED=true
```

| Check | Stage-2 (`REST_SHADOW=true`, `PUBLICATION=true`) |
|-------|--------------------------------------------------|
| Canonical REST pipeline | ON |
| Legacy REST capture | **OFF** (`isBatteryV2LegacyRestCaptureEnabled`) |
| Shadow-only semantics | **OFF** (`isLvRestShadowModeActive` = false) |
| Double legacy+canonical REST capture | **Prevented** |
| `battery-v2-cutover.policy.spec.ts` | Explicitly tested |

**Residual risks (PARTIAL safety):**

| Risk | Assessment |
|------|------------|
| Duplicate legacy + canonical processing | **LOW** — legacy OFF at Stage 2 |
| Shadow writes active | **LOW** — `isLvRestShadowModeActive=false` |
| Double session/target scheduling | **LOW** — idempotency keys on sessions/targets |
| PKG-01 backlog replay storm | **MEDIUM** — 24 pre-T0 ENQUEUED; repair batch=25/tick; per-vehicle serialization |
| Publication of contaminated pre-T0 inputs | **MEDIUM** — see Step 5; publication policy has contamination guards |
| Duplicate publications / EWMA re-application | **LOW** — idempotency keys + PKG-02 epoch arbitration; no pre-T0 `battery_publications` rows |

```
RECOMMENDED_TARGET_FLAGS=REST_SHADOW=true,PUBLICATION=true,RECONCILIATION=true
TARGET_FLAG_COMBINATION_SAFE=PARTIAL
DOUBLE_PATH_RISK=LOW
LEGACY_CAPTURE_STATE=OFF (under target)
SHADOW_SEMANTICS_STATE=OFF (under target; isLvRestShadowModeActive=false)
```

**Guard before flag change:** snapshot PKG-01 backlog + queue/reservation baseline; plan new T0 after corrected activation; exclude pre-T0 evidence from validation gate.

---

## Step 5 — PKG-01 frozen backlog (24 ENQUEUED)

| Metric | Value |
|--------|-------|
| Count | 24 |
| `OLDEST_PENDING_AGE` | ~12h 33m (enqueued `2026-09-03T06:07:19Z`) |
| All pre-T0 | Yes (`lastAttemptAt` ≤ `10:22:20Z`, before T0 `11:08:02Z`) |
| `assess_row_exists` | 0 for all |
| Measurement quality | 23 `CONTAMINATED_*`, 1 `MISSED` |

### Group classification

| Group | Count | On reactivation | Assessment risk | Publication risk |
|-------|-------|-----------------|-----------------|----------------|
| CONTAMINATED + ENQUEUED | 23 | Reconciliation candidate if `sourceObservationId` present | Repair may enqueue assess; outcome uncertain | Policy may block contaminated evidence (`battery-publication.service.ts` checks CONTAMINATED reason codes) |
| MISSED + ENQUEUED | 1 | May be skipped (`isSyntheticRestMissedMeasurement`) | Low persist probability | Low |
| Pre-T0 EXECUTED pub handoffs (separate) | 10 assessments | **Not** re-queued by PKG-02 | N/A | **No** automatic replay |

```
PKG01_REACTIVATION_RISK=MEDIUM
PKG01_BACKLOG_WOULD_REPLAY=PARTIAL
PRE_T0_PUBLICATION_RISK=YES
PRE_T0_EVIDENCE_MUST_BE_EXCLUDED_FROM_NEW_VALIDATION=YES
```

**Pre-change guard:** Record all 24 identities; after corrected activation, verify repair attempts do not produce customer `battery_publications` from pre-T0 contaminated measurements without explicit policy pass.

---

## Step 6 — Safe repair plan (DO NOT EXECUTE)

### Preconditions

- [ ] This audit merged/reviewed
- [ ] Stakeholder sign-off on Stage-2 flag correction
- [ ] Maintenance window for rolling restart

### Sequence

1. **Pre-change snapshot** — `battery-v2-m3-1-production-snapshot.sh` + PKG-01 ENQUEUED inventory + BullMQ failed/wait/active + reservations
2. **Verify topology** — 2 PM2 replicas online; exactly 1 scheduler leader
3. **Record baseline** — queue counts, 24 ENQUEUED identities, `battery_publications` count (=0)
4. **Record previous flags** — `PUBLICATION=true`, `REST_SHADOW=false` (backup already at `backend.env.bak-battery-v2-m31-20260903110709`)
5. **Apply flag change only** — set `BATTERY_V2_REST_SHADOW_ENABLED=true`; keep `PUBLICATION=true`; keep reconciliation default true
6. **Rolling restart** — use `vps_replica_rolling_deploy` pattern; verify SHA invariant
7. **Post-restart** — exactly 1 scheduler leader; both replicas healthy
8. **Watch 15 min** — no duplicate REST target idempotency keys; no reservation leaks; failed delta 0
9. **PKG-01 behavior** — reconciliation may attempt repair; monitor assess enqueue rate (≤25/tick); no 54000/LOCK_CONTENTION recurrence
10. **Establish NEW_T0** — timestamp when corrected config effective on both replicas
11. **T+30m validation** — infrastructure + first canonical REST target activity signals
12. **T+6h validation** — natural REST→assess→pub if fleet produces qualifying rest
13. **First publication** — must show post-NEW_T0 measurement→assessment→publication provenance
14. **Fleet eligibility** — classify idle/EV/ineligible vs pipeline failure

### STOP / rollback criteria

- >1 scheduler leader sustained
- Duplicate REST target or session idempotency keys
- `dup_assess` / `dup_pub` / `dup_customer_pub` > 0 post-change
- Reservation leak (`battery:v2:assess-dispatch:*` > 0 sustained)
- New 54000 / LOCK_CONTENTION / AUTHORITY_UNAVAILABLE class
- `battery_publications` row without post-NEW_T0 canonical provenance
- Reconciliation assess burst >3 jobs/vehicle/tick sustained
- Unexpected publication from pre-T0 contaminated measurement
- PM2 crash loop

### Rollback

Restore `backend.env` from backup; set `REST_SHADOW=false`, `PUBLICATION=true`; rolling restart; document rollback T0.

---

## Machine-readable block

```
BATTERY_V2_M3_1_CUTOVER_AUDIT=COMPLETE
CUTOVER_CONTRACT_RECONSTRUCTED=YES
CURRENT_M3_1_CONFIG_VALID=NO
CANONICAL_REST_PIPELINE_ACTIVE=NO
ROOT_CAUSE_CLASS=PRIMARY_CONFIGURATION_DEFECT
PRIMARY_ROOT_CAUSE=CONFIGURATION_DEFECT
CONTRIBUTING_CAUSE=DOCUMENTATION_DEFECT
DESIGN_DEBT=REST_SHADOW_SEMANTIC_OVERLOAD
MISMATCH_PROVEN=YES
WAITING_LONGER_WOULD_HELP=NO
RECOMMENDED_REST_SHADOW_VALUE=true
RECOMMENDED_PUBLICATION_VALUE=true
RECOMMENDED_RECONCILIATION_VALUE=true
TARGET_FLAG_COMBINATION_SAFE=PARTIAL
DOUBLE_PATH_RISK=LOW
PKG01_REACTIVATION_RISK=MEDIUM
PRE_T0_PUBLICATION_RISK=YES
M3_1_STATUS=BLOCKED_BY_CUTOVER_CONTRACT
PRODUCTION_VALIDATED=PENDING_CORRECTED_ACTIVATION_EVIDENCE
SAFE_TO_PLAN_PRODUCTION_REPAIR=YES
```

## NEXT_ACTION

Plan a **corrected Stage-2 activation** on production: set `BATTERY_V2_REST_SHADOW_ENABLED=true` while keeping `BATTERY_V2_PUBLICATION_ENABLED=true`, rolling dual-replica restart, establish a **new canonical T0**, then run 30m + ≥6h validation against natural REST evidence. **Do not execute without explicit operator authorization.** Pre-snapshot PKG-01 backlog and monitor repair burst on first reconciliation ticks after gate change.
