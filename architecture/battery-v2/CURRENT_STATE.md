# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-03 (M3.1 direct full-fleet production activation — **LIVE**)  
**Graph:** 148 nodes / 148 edges / 11 invariants (validated 2026-09-03)  
**Knowledge maturity:** Phase 4 planning complete — 20 open gaps; 1 PROPOSED decision (`BAT-V2-DEC-PH4-LV-PUB-CHAIN-001`); 5 VALIDATED PKG spec decisions (D1, D2, D3, D4, D5)

## M3.1 full-fleet activation (LIVE since `2026-09-03T11:08:02Z`)

| Field | Value |
|-------|-------|
| `BATTERY_V2_FULL_FLEET_ACTIVE` | **YES** |
| `BATTERY_V2_PUBLICATION_ENABLED` | **true** (production) |
| `BATTERY_V2_REST_SHADOW_ENABLED` | **false** (production) |
| `BATTERY_V2_RECONCILIATION_ENABLED` | true |
| Deployed SHA | `0e0f09259` (PR #1519) |
| 30m status | `PASS_WITH_PENDING_NATURAL_EVIDENCE` |
| 6h status (`2026-09-03T18:09Z`) | `BLOCKED_BY_CUTOVER_CONTRACT` — infra PASS; canonical REST pipeline OFF |
| `M3_1_STATUS` | **BLOCKED_BY_CUTOVER_CONTRACT** — activation flag mismatch vs Stage-2 code contract |
| `PRODUCTION_VALIDATED` | **PENDING_CORRECTED_ACTIVATION_EVIDENCE** — ≥6h soak validated infra only, not canonical REST→pub |
| `INFRASTRUCTURE_HEALTH` | **PASS** |
| `M3_1_ACTIVATION_CONTRACT` | **MISMATCH** (`REST_SHADOW=false` disables canonical REST while `PUBLICATION=true`) |
| `CORRECTED_STAGE2_ACTIVATION_READY` | **YES** (deploy pre-cutover guard first) — see `M3_1_PRE_CUTOVER_SAFETY_GATE.md` |
| Connected fleet | 6 DIMO vehicles (full fleet, no subset) |

See `research/M3_1_DIRECT_FULL_FLEET_ACTIVATION.md`, `research/M3_1_6H_PRODUCTION_VALIDATION.md`, and `research/M3_1_CUTOVER_CONTRACT_AUDIT.md`. ≥6h audit: 68 LIVE_VOLTAGE post-T0; 0 REST_60M/REST_6H; 0 assessments/publications — **config-blocked**, not merely awaiting qualifying rest.

## M3.0E production convergence (deployed `0e0f09259`, release `20260903101734_v4994`)

| Finding | Evidence |
|---------|----------|
| **Deploy** | PR #1519 merged; SHA invariant verified on both PM2 replicas; migrations clean (329/0 pending) |
| **Backlog convergence** | PKG-01 handoffs: ENQUEUED 46→35, EXECUTED 0→12 over 3 reconciliation ticks (~19 min) |
| **No new failure classes** | Post-deploy BullMQ failed jobs = 0; no new 54000, LOCK_CONTENTION, AUTHORITY_UNAVAILABLE, or uuid-cast errors |
| **Serialization** | 3 backlog vehicles repair ~1 handoff/tick each — no 17/17/11 burst recurrence |
| **Reservations** | `battery:v2:assess-dispatch:*` = 0 throughout — no leaks |
| **Digest idempotency** | New assessment keys length 146 (bounded); duplicate `assess:` keys = 0 |
| **Publication gate** | `BATTERY_V2_PUBLICATION_ENABLED=false`; `publications_post_deploy=0` |

**FULL_FLEET_ACTIVATION_READY = YES** — see `research/M3_0E_POST_MERGE_CONVERGENCE_CLOSURE.md`. **Activated M3.1** `2026-09-03T11:08:02Z` — see `research/M3_1_DIRECT_FULL_FLEET_ACTIVATION.md`.

## M3.0D root cause (production forensics, pre-#1519 `7d53da51`)

| Finding | Evidence |
|---------|----------|
| **Causality proved** | 45 PKG-01 reconciliation candidates → 45 new `BATTERY_ASSESSMENT_RECOMPUTE` jobs (`lv-rest-reconcile:` correlation), 1:1 |
| **Same-vehicle fan-out** | 3 vehicles: 17 + 11 + 17 jobs; reconciliation enqueued up to `batch` repairs without per-vehicle cap |
| **Lock contention** | 15/45 unique jobs terminal with `Battery V2 vehicle lock contended scope=assess` after 3 attempts |
| **Persistence failures** | 30/45 unique jobs terminal with Prisma `batteryAssessment.create` Postgres `54000` — **root cause:** oversized `idempotency_key` in unique btree `(vehicle_id, idempotency_key)`; evidence UUID fan-out in key string |
| **Fix (PR #1519, deployed)** | Fail-closed Redis assess dispatch authority; ownership-safe release; atomic refresh; final-attempt reservation cleanup; narrow FAILED legacy-54000 SQL + metadata rearm (Option B); bounded digest idempotency keys; legacy compat lookup |

## Executive summary

Battery V2 authority is substantially reconstructed (Phase 2–3) and Phase 4 defines **how to resolve** remaining gaps without implementing runtime fixes. Highest-priority work: **LV publication chain handoffs** (P0_ACTIVATION_BLOCKER — Stage-2 cutover blockers, **not** proven active production incidents while flags default OFF).

- **PKG-01:** **`IMPLEMENTED`** (runtime, 2026-09-02; reconciliation fairness finalization) — canonical LV REST → assessment handoff per D1/D2/D3. Reconciliation uses targeted incomplete-candidate SQL ordered by durable `assessmentHandoff.lastAttemptAt` fairness queue (no wall-clock slot rotation, no process-local cursor). **Coverage invariant:** for the finite candidate set that remains eligible inside the authorized 7-day reconciliation lookback, `lastAttemptAt` ordering has no positional page ceiling and eventually rotates eligible candidates through bounded inspection. **Operational limits:** repair enqueue throughput is bounded by reconciliation `batch`; extreme sustained backlogs may require multiple cycles and candidates can age beyond the 7-day lookback before repair — M3/pre-deploy capacity validation concern, not a modulo/OFFSET fairness defect. Session metadata mutations use optimistic `updatedAt` CAS via `mutateLvRestSessionMetadata`. **`POSTGRES_SMOKE`:** PASS on isolated PostgreSQL 16 (M3.0, gated `lv-rest-assessment-handoff-reconciliation.integration.spec.ts`). `IMPLEMENTED` ≠ `PRODUCTION_VALIDATED`.
- **PKG-02:** **`IMPLEMENTED`** (runtime, 2026-09-02; merged #1513) — D4 track arbitration (`WORKSHOP_OVERRIDE > TELEMETRY` within current recompute epoch), D5 `LV_PUBLICATION_CONTRACT_VERSION = 1`, direct assessment→`BATTERY_PUBLICATION_UPDATE` handoff, bounded reconciliation via durable `publicationHandoff` metadata on selected assessment rows (row-locked monotonic JSONB mutation via `mutateBatteryAssessmentPublicationHandoff`), strict numeric `publicationVersion` validation, publication-policy authority in `BatteryPublicationService` only. `BATTERY_V2_PUBLICATION_ENABLED` unchanged (customer effects remain OFF by default). **`POSTGRES_SMOKE`:** PASS on isolated PostgreSQL 16 (M3.0B: PKG-02 7/7 gated + PKG-01 2/2); text `id` row-lock fix retained (#1515). Production migration status: **up to date** (329 applied, 0 pending). `IMPLEMENTED` ≠ `PRODUCTION_VALIDATED`.

**Target architecture (D3):** canonical V2 REST + assessment handoff + assessment = mandatory core; `BATTERY_V2_PUBLICATION_ENABLED` = **target** customer effect gate (current runtime still couples PUBLICATION OFF → `isLvRestShadowModeActive` shadow semantics — M4 retirement surface); `REST_SHADOW` + legacy REST = **temporary migration scaffolds** until M4. `BATTERY_V2_LV_HANDOFF_ENABLED` = **NOT INTRODUCED**. M1–M3 may have temporary legacy + canonical dual assessment triggers.

**Current runtime:** canonical REST pipeline **OFF** (`REST_SHADOW=false` per `isBatteryV2CanonicalRestPipelineEnabled`); legacy REST capture **ON**; publication customer effects **ON** (`PUBLICATION_ENABLED=true`) but no post-T0 canonical inputs. Stage-2 cutover requires `REST_SHADOW=true` + `PUBLICATION=true`.

Post-#1445 soak is **PRODUCTION_VALIDATION_ONLY** (initial smoke, not strong validation; profile-stratified — ICE/HEV/PHEV as exposed). HEV product authority remains **DECISION_NOT_READY**. Provider LatestState SOH gap is **DECISION_REQUIRED** (current runtime already non-decision-fresh for VLS-only) — **not** IMPLEMENTATION_READY / not PKG-04 scope.

## Planning item accounting

| Set | P0 | P1 | P2 | P3 | Total |
|-----|----|----|----|-----|-------|
| **Open gaps only** (`BAT-V2-GAP-*`) | 3 | 3 | 5 | 9 | **20** |
| **All Phase-4 planning items** (+ 2 contra + 1 hyp) | 3 | 6 | 5 | 9 | **23** |

P0 tier = **P0_ACTIVATION_BLOCKER** for LV handoff gaps (flags default OFF).

## Production validation maturity

| Item | Status |
|------|--------|
| #1383, #1393, #1445 | **VALIDATED** (code + tests) — **not PRODUCTION_VALIDATED** unless post-change evidence exists |
| `BAT-V2-HYP-POST-1445-SOAK-001` | **AWAITING** — natural soak protocol defined; smoke tranche only |
| PR #1488 (merged `b8501bfd`) | Phase 3 authority — documentation only |
| Phase 4 (this branch) | Resolution planning — **not** runtime validation |
| D1/D2/D3/D4/D5 | **VALIDATED** architecture authority — **not** `PRODUCTION_VALIDATED`; **no M4 cutover authorized** |

## Phase 4 planning outputs

See `resolution/` — priority matrix, implementation packages, dependency graph, per-gap dossiers.

## Strong-confidence areas (CONFIRMED)

- LV REST canonical pipeline for ICE/HEV/PHEV (BEV forbidden) when `REST_SHADOW` on (**current runtime gate**)
- Primary REST session opening: trip-finalization anchor — observation-independent (#1383)
- HV M2/M3/cross-session **implemented** paths; SESSION_CHARGE/GROSS_CAPACITY unimplemented
- PHEV parallel implemented LV+HV; `isEv=true`
- HEV: separate write gates vs `isEv` read gate; side-effect / read-model divergence
- LV publication eligibility: evaluated in `BatteryPublicationService` / `evaluateLvPublicationPolicy()`
- HV SOH gate execution under `HV_CAPACITY_SHADOW`; publication-intent separate
- Assessment job identity: `assess:{vehicleId}:{assessmentType}:{inputVersion}` — canonical REST handoff `inputVersion` = `BatteryMeasurement.id` (D1); `sourceEntityId` correlation (D2)
- Publication job identity: `pub:{assessmentId}:v{publicationVersion}` — D5: `LV_PUBLICATION_CONTRACT_VERSION = 1`; contract identity ≠ lifecycle state; previous lifecycle isolated from current candidate; same-assessment retry must not re-apply EWMA as new evidence
- Primary API + rental health → canonical read model
- **D3 target:** V2 core mandatory; PUBLICATION = effect gate; HANDOFF flag rejected

## Unresolved gaps

See `contradictions/KNOWLEDGE_GAPS.md` (**20 gaps**) and `research/OPEN_QUESTIONS.md`. **Planning ≠ resolution** — gaps remain open.

## Contradictions

| ID | Status |
|----|--------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | REACHABLE_AND_CONFLICTING; production frequency UNKNOWN; provenance not directly observable in current schema |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | PARTIALLY REACHABLE — DECISION_REQUIRED |

## Explicit non-claims

Battery V2 runtime gaps are **not fixed** by Phase 4 or D3. No Stage 2 enabled. No publication enabled. No backfill. No legacy/REST_SHADOW removal. No M4 cutover authorized. No current-customer Stage-2 publication outage claimed. Historical provenance distribution not directly measurable in SQL today.
