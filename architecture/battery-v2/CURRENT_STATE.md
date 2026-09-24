# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-24 (M3.3C C1–C5B + M3.3D D0/D0.1/D1 on main; D1 merge PR #1737 @ `9577e0f14`; C5B seal @ `7878aee90` PR #1734; production runtime baseline unchanged `2b0ef15f`)
**Graph:** 148 nodes / 148 edges / 11 invariants (validated 2026-09-03)  
**Knowledge maturity:** Phase 4 planning complete — 20 open gaps; 1 PROPOSED decision (`BAT-V2-DEC-PH4-LV-PUB-CHAIN-001`); 5 VALIDATED PKG spec decisions (D1, D2, D3, D4, D5)

## M3.1 corrected Stage-2 activation (LIVE since `2026-09-05T23:36:12Z`)

| Field | Value |
|-------|-------|
| `BATTERY_V2_STAGE2_T0` | **`2026-09-05T23:36:12Z`** (canonical; supersedes failed `2026-09-03T11:08:02Z`) |
| `BATTERY_V2_REST_SHADOW_ENABLED` | **true** (production) |
| `BATTERY_V2_PUBLICATION_ENABLED` | **true** (production) |
| `BATTERY_V2_RECONCILIATION_ENABLED` | true |
| Deployed SHA | `a4377f3a200c` (release `20260905231643_v4994`; PR #1527 guard) |
| Immediate smoke | **PASS** — see `research/M3_1_STAGE2_CORRECTED_ACTIVATION_EVIDENCE_2026-09-05.md` |
| 30m status | **PASS_WITH_PENDING_NATURAL_E2E_EVIDENCE** — see `research/M3_1_STAGE2_T30_PRODUCTION_VALIDATION_2026-09-06.md` |
| 6h status | **PENDING_NATURAL_E2E_EVIDENCE** — see `research/M3_1_STAGE2_6H_PRODUCTION_VALIDATION_2026-09-06.md` |
| Lifecycle audit | **PASS** (`LIFECYCLE_AUDIT=PASS`) — see `research/M3_1_STAGE2_REST_LIFECYCLE_FORENSIC_AUDIT_2026-09-06.md` |
| Event probe (`21:39Z`) | WOB **QUALITY_REJECTED_EXPECTED**; KS MX **TARGET_DUE + RETRY_PENDING** at probe (terminology corrected); see `research/M3_1_STAGE2_EVENT_CONDITIONED_E2E_PROBE_2026-09-06.md` |
| KS MX REST_60M maturity (`21:53Z`) | **NATURAL_CONTAMINATED** — telemetry gap in quality window; target COMPLETED; no assess/pub; **QUALITY_REJECTED_EXPECTED**; see `research/M3_1_STAGE2_KS_MX_2024_REST60M_MATURITY_PROBE_2026-09-06.md` |
| KS MX REST_6H final (`03:47Z`) | **NATURAL_CONTAMINATED** — 0 LV in REST_6H window; COMPLETED @ `03:17:34Z`; `M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY`; `NEXT_ACTION=BATTERY_V2_SIGNAL_OBSERVABILITY_ARCHITECTURE_REVIEW`; see `research/M3_1_STAGE2_KS_MX_2024_REST6H_FINAL_MATURITY_2026-09-07.md` |
| `M3_1_STATUS` | **STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE** |
| `M3_1_VALIDATION_BLOCKER` | **SIGNAL_OBSERVABILITY** (DIMO wake-only LV during sleep; 0 post-T0 VALID REST fleet-wide) |
| M3.2 signal audit (`03:55Z`) | **REST_EVIDENCE_OBSERVABILITY_DEADLOCK=YES**; hybrid evidence model recommended; see `research/M3_2_REST_SIGNAL_OBSERVABILITY_ARCHITECTURE_AUDIT_2026-09-07.md` |
| M3.2A shutdown anchor feasibility (`04:30Z`) | **IMPLEMENTATION_READY=NO**; `POST_ENGINE_OFF_PRE_SLEEP_PATTERN_SUPPORT=PARTIAL`; **0/13 confirmed**; see `research/M3_2A_SHUTDOWN_ANCHOR_HYBRID_EVIDENCE_FEASIBILITY_2026-09-07.md` |
| Canonical seal (`05:30Z`, PR #1551) | **RUNTIME_DIFF=NONE**; `PASSIVE_WAITING_FOR_MORE_TRIPS_SUFFICIENT=NO`; see `research/M3_1_M3_2A_CANONICAL_EVIDENCE_SEAL_2026-09-07.md` |
| M3.2B shadow shutdown evidence (`2026-09-07`, PR #1560) | **DEPLOYED** @ `0ba96e03`; Phase C shadow ON @ **`M3_2B_PHASE_C_T0=2026-09-07T22:47:14Z`**; see Phase B/C + first-natural / post-probe forensics in `research/M3_2B_*_2026-09-08.md` |
| M3.3 R1 8h REST evidence architecture (`2026-09-21`) | **AUDIT COMPLETE** (read-only); see `research/M3_3_R1_8H_REST_EVIDENCE_ARCHITECTURE_AUDIT_2026-09-21.md` |
| M3.3A generalized evidence + rest sessions (`2026-09-21`) | **B1 ACTIVE (shadow writes ON)** @ runtime `105f2c5ff` / `20260921172342_v4994`; `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true`; **`M3_3_B1_T0=2026-09-21T18:08:19Z`** |
| M3.3B R1 natural cadence forensics (`2026-09-21`) | **Deployed (code)** — auto REST_WAKE **off**; ladder metadata + metrics; cadence promotion **not** enabled in B1 |
| `M3_3_B0_STATUS` | **`B0_PASS`** — `research/M3_3_B0_FLAG_OFF_PRODUCTION_DEPLOY_2026-09-21.md` |
| `M3_3_B1_STATUS` | **`B1_ACTIVATION_RUNTIME_PASS`** — **`B1_GENERALIZED_CAPTURE_VALIDATION=OBSERVED`**; **`B1_REST_EVIDENCE_VALIDATION=PENDING`** — `research/M3_3_B1_GENERALIZED_EVIDENCE_SHADOW_ACTIVATION_2026-09-21.md` |
| `M3_3_B1_1_STATUS` | **`B1_1_CAPTURE_AND_SAFETY_PASS_REST_CHAIN_PENDING`** @ forensics `2026-09-21T18:40:24Z` — 29 post-T0 shadow rows; LV capture **29/29**; rest/engine-off/parked/R1 **PENDING** natural events — `research/M3_3_B1_1_NATURAL_SHADOW_EVIDENCE_VALIDATION_2026-09-21.md` |
| `M3_3_B1_2_STATUS` | **`B1_2_PENDING_NATURAL_TRUSTWORTHY_SHUTDOWN`** @ forensics `2026-09-21T18:47:32Z` — **0** `ENGINE_OFF_TRANSITION`; **15** weak raw engine-off LV rows explicitly classified (not trustworthy shutdown); **0** rest sessions — `research/M3_3_B1_2_FIRST_NATURAL_SHUTDOWN_REST_SESSION_2026-09-21.md` |
| `M3_3_B1_2W_STATUS` | **`B1_2W_GAP_STATE_MODEL_SUFFICIENT_FOR_STATE_MACHINE_LIVENESS`** — architecture semantic closure **COMPLETE** (B1.2X doc PR #1720) — `research/M3_3_B1_2W_PROVIDER_GAP_STATE_MACHINE_2026-09-21.md` |
| **B1.2Y1 implementation (PR #1721)** | **`PROVIDER_OBSERVABILITY_GAP` runtime foundation** — schema + service + poll hook + tests; **`BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED` default OFF** — production behavior unchanged until authorized activation |
| **B1.2Y1.1 hardening (PR #1721 amend)** | Pre-gap OFF guard, STALE_REPLAY-only new gap, observable gap failures, duplicate-retry resolution, no synthetic provider time, gap∧generalized flag coupling, Postgres multi-replica integration CI script |
| **B1.2Y3D.1 (read-only audit)** | **B1.2W §13 FULLY SATISFIED** — deterministic Postgres A–I (PR #1724) + natural shadow PASS; **`M3_3C_REOPENING_GATE=YES`** — `research/M3_3_B1_2Y3D_1_SECTION_13_CLOSURE_M3_3C_REOPENING_2026-09-22.md` |
| **B1.2Y provider-gap production** | **ACTIVE** @ `2b0ef15f` — `BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED=true`; **`M3_3_B1_2Y3_T0`** / **`Y3_STALE_REPLAY_FIX_DEPLOY_T0`** unchanged |
| **M3.3C C1 (engineering)** | **`battery_rest_session_features` schema + shadow flag default OFF + pure retention policy (A–H unit tests)** — **no runtime writers/hooks** — `research/M3_3_C1_REST_SESSION_FEATURE_FOUNDATION_2026-09-22.md` |
| **M3.3C C1.1 (PR #1726 amend)** | Anchor session/zero-age binding; Postgres semantic-revision + pg_catalog verifier; second deploy noop |
| **M3.3C C2.1 (engineering)** | Read-only charge-context reader + pure raw-feature policy (`M3_3C_C2_V1`); **no** feature persistence, **no** live hooks; `chargeOpportunityClass=UNKNOWN`; classifier unchanged — `research/M3_3_C2_CHARGE_OPPORTUNITY_SOURCE_CONTRACT_2026-09-23.md` |
| **M3.3C C3 (engineering)** | `RestSessionFeatureComputationService` + canonical digest + append-only rows **behind shadow flag default OFF** — `research/M3_3_C3_FEATURE_COMPUTATION_PERSISTENCE_2026-09-23.md` |
| **M3.3C C4 (engineering)** | `RestSessionFeatureShadowTriggerService` + post-mutation hooks (valid rest / terminal / late trip) + Nest registration; **fail-open**; flag OFF → zero C3 calls — `research/M3_3_C4_SHADOW_LIFECYCLE_WIRING_2026-09-23.md` |
| **M3.3C C4.1 (engineering)** | Valid-rest `actualRestAgeMs > 0`; strengthened PG_K shadow-only authoritative isolation — C4 formal post-merge closure **PASS** @ main `8f7d95e4` |
| **M3.3C C5A (engineering)** | Shadow Prometheus metrics + read-only inspection (`M3_3C_C5A_V1`) + ops CLI — **merged** PR #1732 @ main `87599311c`; **no production flag change** — `research/M3_3_C5A_SHADOW_OBSERVABILITY_INSPECTION_2026-09-23.md` |
| **M3.3C C5A.1 (engineering)** | Bounded inspection DB reads, digest coverage metadata, `INTEGRITY_PARTIAL` — merged PR #1732 |
| **M3.3C C5A.2 (engineering)** | Repeatable-read snapshot + canonical digest union — merged PR #1732 |
| **M3.3C C5B (engineering)** | Master Admin read-only shadow inspection UI over `M3_3C_C5A_V1` (not M3.3H customer UI) — **COMPLETE ON MAIN** merged PR #1733 @ `969cc3f19` — internal MASTER_ADMIN surface; atomic C5A GET; `inputSummary.retentionPoints` table; org-scoped operational vehicle pagination; no flags/migration/customer UI |
| **M3.3D D0 (architecture)** | Longitudinal profile scientific contract + `M3_3D_LONGITUDINAL_PROFILE_V1` — **COMPLETE ON MAIN** merged PR #1735 @ `bc69e1d9c` — `research/M3_3D_D0_LONGITUDINAL_PROFILE_ARCHITECTURE_2026-09-24.md` |
| **M3.3D D0.1 (architecture)** | Bounded canonical read (C5A-equivalent), persisted version authority, D1 integrity scope, profileStatus+flags, fingerprint determinism, D3/M3.3F sequencing — **COMPLETE ON MAIN** PR #1735 @ `bc69e1d9c` |
| **M3.3D D1 (engineering)** | Bounded canonical longitudinal input reader + inclusion policy (`M3_3D_D1_LONGITUDINAL_INPUT_V1`) — **COMPLETE ON MAIN** squash-merged PR #1737 @ `9577e0f146ddec2b81fc2ede35389a5fa2e6db94` — `research/M3_3D_D1_CANONICAL_LONGITUDINAL_INPUT_READER_2026-09-24.md` |
| **M3.3D D2 (engineering)** | Deterministic longitudinal profile assembly (`M3_3D_LONGITUDINAL_PROFILE_V1` from D1 inventory) — **NEXT**; **not implemented** |
| **M3.3C roadmap (planning)** | **M3.3D D2** next · **M3.3D D3+** pending · **M3.3E–H** pending |
| **M3.3C** | **`OPEN`** — C1–C5B + **D0/D0.1/D1 on main**; **D2 next**; **M3.3E–H pending**; **`BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=false`** |
| **`AUTHORITATIVE_REST_LIVENESS_GUARANTEED`** | **NO** (unchanged post §13) |
| **`STATE_MACHINE_LIVENESS_GUARANTEED`** | **YES** (provider observability-gap validation gate) |
| Provider-gap metrics follow-up | **`synqdrive_battery_provider_observability_gap_opened_total`** PM2 aggregation semantics — non-blocking observability debt |
| `NEXT_PHASE` | **M3.3D D2** — deterministic longitudinal profile assembly (`M3_3D_LONGITUDINAL_PROFILE_V1` from `M3_3D_D1_LONGITUDINAL_INPUT_V1`); **D2 not implemented**; production C3/longitudinal flag remains OFF until **M3.3F** |
| `PIPELINE_HEALTH` | **PASS** (control plane / lifecycle / scheduler — distinct from evidence observability) |
| `EVIDENCE_OBSERVABILITY_BLOCKED` | **YES** |
| `IMPLEMENTATION_DECISION` | **HYBRID_MODEL_NEEDS_MORE_NATURAL_DATA** |
| `IMPLEMENTATION_READY` | **NO** |
| `PRODUCTION_VALIDATED` | **PENDING_NATURAL_E2E_EVIDENCE** |
| `CANONICAL_REST_PIPELINE` | **ON** (Stage-2 contract) |
| `LEGACY_REST_CAPTURE` | **OFF** |
| ≥6h audit (10.51h elapsed) | Control plane continuous (122 ticks); 0 natural VALID REST; 0 assess/pub; infrastructure PASS; lifecycle audit PASS (0 pipeline-missing) |
| PKG-01 | original cohort 19+5=24; 5 stale inert; 0 pre-T0 unsafe work since T0 |
| Connected fleet | 6 DIMO vehicles (full fleet, no subset) |

See `research/M3_1_M3_2A_CANONICAL_EVIDENCE_SEAL_2026-09-07.md`, `research/M3_2A_SHUTDOWN_ANCHOR_HYBRID_EVIDENCE_FEASIBILITY_2026-09-07.md`, `research/M3_2_REST_SIGNAL_OBSERVABILITY_ARCHITECTURE_AUDIT_2026-09-07.md`, `research/M3_1_STAGE2_KS_MX_2024_REST6H_FINAL_MATURITY_2026-09-07.md`, `research/M3_1_STAGE2_KS_MX_2024_REST6H_MATURITY_PROBE_2026-09-06.md`, `research/M3_1_STAGE2_KS_MX_2024_REST60M_MATURITY_PROBE_2026-09-06.md`, `research/M3_1_STAGE2_EVENT_CONDITIONED_E2E_PROBE_2026-09-06.md`, `research/M3_1_STAGE2_6H_PRODUCTION_VALIDATION_2026-09-06.md`, `research/M3_1_STAGE2_REST_LIFECYCLE_FORENSIC_AUDIT_2026-09-06.md`, `research/M3_1_STAGE2_T30_PRODUCTION_VALIDATION_2026-09-06.md`, `research/M3_1_STAGE2_CORRECTED_ACTIVATION_EVIDENCE_2026-09-05.md`.

## Historical M3.1 invalid activation (superseded — do not use for validation T0)

| Field | Value |
|-------|-------|
| Failed T0 | `2026-09-03T11:08:02Z` |
| Contract | `REST_SHADOW=false` + `PUBLICATION=true` — **invalid M3.1 mismatch** |
| Status | Superseded by corrected Stage-2 activation `2026-09-05T23:36:12Z` |

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

**Current runtime:** canonical REST pipeline **ON** (`REST_SHADOW=true` per `isBatteryV2CanonicalRestPipelineEnabled`); legacy REST capture **OFF**; publication customer effects **ON** (`PUBLICATION_ENABLED=true`); reconciliation **ON**. Stage-2 contract active since `2026-09-05T23:36:12Z`. Natural REST→assess→publication E2E evidence **not yet observed** (pending T+30m / ≥6h validation).

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

## Cross-module: ERD physical HV charge sessions (2026-09-24)

**Semantic authority:** KG-EED / **ERD** owns physical EV/PHEV charging episode meaning (`EED-DEC-ERD-001`; ADR `architecture/knowledge-graphs/energy-event-detection/decisions/ERD-E1-CANONICAL-PHYSICAL-CHARGE-AUTHORITY-2026-09-24.md`).

**This module:** Implementation host for `hv-charge-session/*` persist/ingest/fallback services; **consumes** canonical session evidence for HV battery analysis — does **not** own physical charging authority after ERD E1.

**Runtime:** `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` and `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED` remain default **false**; no E1 behavior change.

## Unresolved gaps

See `contradictions/KNOWLEDGE_GAPS.md` (**20 gaps**) and `research/OPEN_QUESTIONS.md`. **Planning ≠ resolution** — gaps remain open.

## Contradictions

| ID | Status |
|----|--------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | REACHABLE_AND_CONFLICTING; production frequency UNKNOWN; provenance not directly observable in current schema |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | PARTIALLY REACHABLE — DECISION_REQUIRED |

## Explicit non-claims

Battery V2 runtime gaps are **not fixed** by Phase 4 or D3. No Stage 2 enabled. No publication enabled. No backfill. No legacy/REST_SHADOW removal. No M4 cutover authorized. No current-customer Stage-2 publication outage claimed. Historical provenance distribution not directly measurable in SQL today.
