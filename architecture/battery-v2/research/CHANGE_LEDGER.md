# Battery V2 — Change Ledger

Append-only scientific record. Newest entries first.

**Template fields:** BEFORE | OBSERVATION | HYPOTHESIS | CHANGE | WHY | EXPECTED_EFFECT | VALIDATION | OBSERVED_EFFECT | NON_EFFECTS | REMAINING_GAPS | EVIDENCE | DECISION_STATUS | AFFECTED_GRAPH

---

## CL-2026-09-01 — Phase 3 decision surfaces, reachability & enablement

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 2 answered "what does the architecture contain?" Authority indexes still had stale UNKNOWN wording for HV/consumer authority. CURRENT_STATE graph counts drifted (105/80 vs actual 107/83). Publication, HEV, readiness reachability not traced end-to-end. |
| **OBSERVATION** | Read-only code trace of flags, job chains, HEV/PHEV paths, publication/readiness, tasks, SOH winner-usability, provider timestamp, LV timestamp, bridge, RUNNING/SKIPPED git history, consumer surfaces. Validator enhanced for graph count self-consistency. |
| **HYPOTHESIS** | Many "contradictions" may be theoretical or partially reachable — Phase 3 must distinguish DEFINED vs USER_VISIBLE. |
| **CHANGE** | Added reachability matrix, publication-readiness, SOH truth table, decision-surfaces, bridge-reachability, rest-target-status-history docs. Refined gaps/contras/hypotheses. Added 3 gaps, 3 evidence nodes, 15 edges. Recorded PR #1480 evidence node. |
| **WHY** | Future agents need execution truth — which paths run under current flags, which are hidden, which job chains are broken. |
| **EXPECTED_EFFECT** | Decision matrix becomes primary enablement artifact; HEV/PHEV/publication reachability explicit. |
| **VALIDATION** | `validate-graph.sh` PASS; CURRENT_STATE counts match graph |
| **OBSERVED_EFFECT** | Validator PASS at 114/98/11; self-consistency rule in AGENT_CONTRACT |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes. No PRODUCTION_VALIDATED promotions. No threshold calibration. No HEV/PHEV behavior fixes. LV publication job chain not wired. Stage 2 not enabled. |
| **REMAINING_GAPS** | All prior gaps remain open unless refined; production frequency UNKNOWN for most reachability findings |
| **EVIDENCE** | `BAT-V2-EVID-PR-1480-001`, `BAT-V2-EVID-GIT-RUNNING-SKIPPED-ENUM-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-JOB-001`, `BAT-V2-EVID-CODE-HEV-SNAPSHOT-ORPHAN-001`, Phase 3 code traces |
| **AFFECTED_GRAPH** | 114 nodes / 98 edges / 11 invariants (was 107/83/11); +7 nodes, +15 edges |

---

## CL-2026-09-01 — Phase 2 selected SOH canonical DTO semantic correction

| Field | Content |
|-------|---------|
| **BEFORE** | Selected SOH documentation referenced non-existent `canonical.hv.healthPercent` and treated `providerSoh` field name too literally as provider-only evidence. |
| **OBSERVATION** | `CanonicalBatteryHvSection` exposes `providerSoh`, not `healthPercent`. `CanonicalBatteryHvProviderSoh.source` supports `PROVIDER`, `DOCUMENT`, `MANUAL`, `CAPACITY_ESTIMATE`. `liveState.hv.values.providerSohPercent` is a separate live signal. |
| **CHANGE** | Corrected canonical DTO mapping docs; distinguished live provider signal vs selected SOH vs SOH gate; documented naming debt gap. |
| **WHY** | Prevent future agents from treating selected SOH as provider-only truth or searching for non-existent DTO fields. |
| **VALIDATION** | Code trace + `validate-graph.sh` |
| **NON_EFFECTS** | Runtime DTO unchanged; no field rename; no backend/frontend change; no migration; no production data change |
| **REMAINING_GAPS** | `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` |
| **EVIDENCE** | `BAT-V2-EVID-CODE-HV-SELECTED-SOH-DTO-001` |
| **AFFECTED_GRAPH** | 107 nodes / 83 edges / 11 invariants (was 105/80/11); +2 nodes, +3 edges |

---

## CL-2026-09-01 — Phase 2 authority & epistemic correction

| Field | Content |
|-------|---------|
| **BEFORE** | Initial Phase 2 reconstruction treated provider SOH authority too simply (provider > workshop/document) and HEV as only an `isEv` gap. Signal inventory counted 14 DIMO HV signals. Selected SOH and SOH gate assessment were collapsed via `authoritative_over` edge. |
| **OBSERVATION** | Direct adversarial audit of `battery-evidence-strength.policy.ts`, `canonical-battery-health.service.ts`, policy materialization, capability registry, and DIMO mapper. |
| **CHANGE** | Corrected SOH conflict authority (evidence-strength + freshness), separated selected HV SOH from shadow SOH gate assessment, elevated HEV multi-layer contradiction, corrected signal inventory (13 registry / 12+1 mapper), documented provider timestamp and winner-usability gaps. |
| **WHY** | Prevent false authority from becoming canonical agent knowledge. |
| **EXPECTED_EFFECT** | Future agents can reason correctly about HV evidence tiers, freshness penalties, HEV policy gates, and mapper vs registry inventories. |
| **VALIDATION** | Current code trace + `validate-graph.sh` |
| **OBSERVED_EFFECT** | Documentation/graph corrected; validator PASS |
| **NON_EFFECTS** | No HV authority runtime change; no HEV behavior change; no SOH selection fix; no provider timestamp fix; no production validation |
| **REMAINING_GAPS** | `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001`, `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001`, `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001`, prior Phase 2 gaps |
| **EVIDENCE** | `BAT-V2-EVID-CODE-HV-EVIDENCE-STRENGTH-001`, `BAT-V2-EVID-CODE-HV-SOH-CONFLICT-001`, `BAT-V2-EVID-CODE-HV-SOH-WINNER-FLOW-001`, `BAT-V2-EVID-CODE-HEV-POLICY-MATERIALIZE-001`, `BAT-V2-EVID-CODE-HEV-IS-EV-001`, `BAT-V2-EVID-CODE-CAPABILITY-REGISTRY-001`, `BAT-V2-EVID-CODE-DIMO-MAPPER-HV-001` |
| **AFFECTED_GRAPH** | 105 nodes / 80 edges / 11 invariants (was 92/64/11); +13 nodes, +17 edges, −1 edge |

---

## CL-2026-09-01 — Phase 2 knowledge reconstruction (HV, persistence, consumers)

| Field | Content |
|-------|---------|
| **DECISION** | (infrastructure — no new `BAT-V2-DEC-*`) |
| **DECISION_STATUS** | `VALIDATED` |
| **CHANGE** | Reconstructed HV signals/methods, persistence model, canonical read model, API/FE consumers, lock fail-open behavior, RUNNING/SKIPPED enum debt, threshold catalog |
| **NON_EFFECTS** | No runtime, data, deploy, or backfill changes |
| **REMAINING_GAPS** | HEV isEv, SESSION/GROSS capacity compute paths, timestamp production reachability, threshold rationale, post-#1445 soak |
| **EVIDENCE** | Phase 2 code trace + existing architecture memos |
| **AFFECTED_GRAPH** | 92 nodes / 64 edges / 11 invariants (was 49/40/7 at bootstrap) |

---

## CL-2026-09-01 — Knowledge authority bootstrap epistemic correction

| Field | Content |
|-------|---------|
| **DECISION** | (infrastructure — no `BAT-V2-DEC-*`) |
| **DECISION_STATUS** | `VALIDATED` |
| **CHANGE** | Corrected PRODUCTION_VALIDATED overuse; normalized test_evidence IDs (`BAT-V2-TEST-*`); added hypothesis/gap/contradiction nodes; strengthened graph validator; reverted frontend TSX from PR scope |
| **NON_EFFECTS** | No runtime, data, deploy, or backfill changes |
| **EVIDENCE** | This PR only |
| **AFFECTED_GRAPH** | All bootstrap graph nodes/edges; `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001`; `BAT-V2-REJECT-HISTORICAL-REPAIR-SCAN-001`; `BAT-V2-HYP-*`; additional `BAT-V2-GAP-*` |

---

## CL-2026-09-01 — Knowledge authority bootstrap

| Field | Content |
|-------|---------|
| **DECISION** | (infrastructure — no `BAT-V2-DEC-*`) |
| **DECISION_STATUS** | `VALIDATED` |
| **CHANGE** | Created `architecture/battery-v2/` living knowledge system |
| **NON_EFFECTS** | No runtime, data, deploy, or backfill changes |
| **EVIDENCE** | This PR only |

---

## CL-2026-08-30 — #1445 Stage 1 pipeline defect closure

| Field | Content |
|-------|---------|
| **DECISION** | `BAT-V2-DEC-1445-001` |
| **DECISION_STATUS** | `VALIDATED` (code merged + focused tests/CI; post-change natural-trip production validation **UNKNOWN**) |
| **BEFORE** | Missing sessions after deploy interrupt; cross-trip `trip_id` mis-binding; REST targets stuck `ENQUEUED` (DLQ + orphan); `PENDING_EVALUATION` blocked reconciliation; bulk DLQ pre-clear defeated per-entity rescue; recurring historical trip-binding repair scan |
| **OBSERVATION** | Production read-only audit: trip `ea7696b6` (no session 50+ min post-finalize); sessions `d8b4db92`/`dde74be4` (anchor trip N, `trip_id` N-1); session `4d2bef5f` (ENQUEUED + PROVIDER_UNAVAILABLE DLQ); LOCK_CONTENTION DLQ on session-open jobs |
| **HYPOTHESIS** | Liveness holes are systemic: metadata/Bull/DLQ desync, wrong anchor source, and reconciliation paths that block instead of recover |
| **CHANGE** | Anchor prefers `tripEndAt`; P2002 trip binding repair; direct `ensureLvRestWindowForFinalizedTrip` in reconciliation; handler defers retryable eval to `PENDING_EVALUATION`; per-entity DLQ clear on recovery; `hasLiveJob()` orphan ENQUEUED recovery; removed bulk DLQ pre-clear and historical repair scan |
| **WHY** | Minimal surgical fixes preserving #1383/#1393 policies; deterministic idempotency; no backfill |
| **EXPECTED_EFFECT** | Sessions arm after missed primary path; REST targets converge to COMPLETED/MISSED; no permanent ENQUEUED/PENDING_EVALUATION stall for covered cases |
| **VALIDATION** | 297+ battery-v2/lv-rest-window tests; orphaned-ENQUEUED + PENDING_EVALUATION liveness specs; CI 25/25 on PR head |
| **OBSERVED_EFFECT** | Deploy health OK 2026-08-31; post-fix natural trip outcomes **UNKNOWN** at ledger write time |
| **NON_EFFECTS** | Does **not** recover every `RUNNING`-without-Bull-job crash state; does **not** prove all future trips succeed; does **not** activate Stage 2; does **not** enable publication/readiness; does **not** backfill historical sessions; does **not** fix pre-existing unrelated test failures |
| **REMAINING_GAPS** | `BAT-V2-GAP-RUNNING-ORPHAN-001`; production soak validation (`BAT-V2-HYP-POST-1445-SOAK-001`); SKIPPED semantics |
| **EVIDENCE** | `BAT-V2-EVID-PR-1445-001`, `BAT-V2-EVID-ARCH-PIPELINE-CLOSURE-001`, `BAT-V2-TEST-ORPHAN-ENQ-001`, `BAT-V2-TEST-PEND-EVAL-001` |
| **AFFECTED_GRAPH** | `BAT-V2-DEC-1445-001`, `BAT-V2-LIVE-ORPHAN-ENQ-001`, `BAT-V2-LIVE-PEND-EVAL-001`, `BAT-V2-LIVE-SESSION-RECON-001`, `BAT-V2-INV-TRIP-BIND-001` |

---

## CL-2026-08-28 — #1393 ICE rest-window opening policy hardening

| Field | Content |
|-------|---------|
| **DECISION** | `BAT-V2-DEC-1393-001` |
| **DECISION_STATUS** | `VALIDATED` (merged + policy tests; pre-change production trip motivated OBSERVATION only) |
| **BEFORE** | `engine_load > 5` proxy alone could reject ICE opening at key-off |
| **OBSERVATION** | Trip `61715ecd`: `is_ignition_on=false`, `speed=0`, load ~10% → `engine_not_off` rejection |
| **HYPOTHESIS** | Opening gate needs separate evidence precedence from measurement quality |
| **CHANGE** | Split `isEngineOffForRestWindowOpening` vs `isEngineOffForRest`; ignition-off + measured stationary speed outranks load proxy at opening |
| **WHY** | Production ICE key-off shape; preserve conservative measurement path |
| **EXPECTED_EFFECT** | ICE sessions open at legitimate key-off; measurement quality unchanged |
| **VALIDATION** | `lv-rest-window.policy.spec.ts` matrix A–J; arming spec with production shape |
| **OBSERVED_EFFECT** | Opening policy tests pass; fleet-wide ICE opening rate post-deploy **UNKNOWN** |
| **NON_EFFECTS** | Does **not** change measurement `isEngineOffForRest`; does **not** add RPM signal; does **not** fix missing-session liveness (#1383 territory) |
| **REMAINING_GAPS** | RPM wiring; PHEV-specific opening shapes |
| **EVIDENCE** | `BAT-V2-EVID-PR-1393-001`, `BAT-V2-EVID-ARCH-ICE-OPEN-001`, `BAT-V2-EVID-PROD-61715ECD-001` |
| **AFFECTED_GRAPH** | `BAT-V2-DEC-1393-001`, `BAT-V2-AUTH-LV-OPEN-001`, `BAT-V2-AUTH-LV-MEASURE-001`, `BAT-V2-POL-OPEN-VS-MEASURE-001` |

---

## CL-2026-08-28 — #1383 Observation-independent LV Rest session opening

| Field | Content |
|-------|---------|
| **DECISION** | `BAT-V2-DEC-1383-001` |
| **DECISION_STATUS** | `VALIDATED` (merged + architecture + focused tests) |
| **BEFORE** | LV session opening depended on post-finalize observation cycle; frozen `source_timestamp` could prevent session forever |
| **OBSERVATION** | Trip `61715ecd` anchor: last observation at anchor; RESTING ~58s later; no further observation → no `TRIP_ENDED` emission |
| **HYPOTHESIS** | Trip finalization must trigger durable session-open path independent of next telemetry poll |
| **CHANGE** | Primary enqueue after COMPLETED trip + RESTING persisted; canonical `ensureLvRestWindowForFinalizedTrip`; reconciliation scans authoritative COMPLETED trips |
| **WHY** | Observation timing must not be single point of failure for session existence |
| **EXPECTED_EFFECT** | Sessions exist even when no post-anchor observation arrives |
| **VALIDATION** | `lv-rest-window-session-arming.service.spec.ts`; reconciliation specs |
| **OBSERVED_EFFECT** | Tests pass; production recurrence post-merge partially addressed by later #1445 deploy-interrupt case; post-change behavioral validation **UNKNOWN** |
| **NON_EFFECTS** | Does **not** alone fix ENQUEUED/DLQ REST target liveness; does **not** fix ICE load-proxy opening (#1393); does **not** guarantee measurement quality without observations |
| **REMAINING_GAPS** | Combined interaction with deploy restarts (#1445) |
| **EVIDENCE** | `BAT-V2-EVID-PR-1383-001`, `BAT-V2-EVID-ARCH-LIVENESS-001`, `BAT-V2-EVID-PROD-61715ECD-001` |
| **AFFECTED_GRAPH** | `BAT-V2-DEC-1383-001`, `BAT-V2-JOB-LV-SESSION-OPEN-001`, `BAT-V2-LIVE-SESSION-RECON-001`, `BAT-V2-INV-TRIP-LIFECYCLE-ISO-001` |
