# Battery V2 — Change Ledger

Append-only scientific record. Newest entries first.

**Template fields:** BEFORE | OBSERVATION | HYPOTHESIS | CHANGE | WHY | EXPECTED_EFFECT | VALIDATION | OBSERVED_EFFECT | NON_EFFECTS | REGRESSIONS_OR_TRADEOFFS | REMAINING_GAPS | DECISION_STATUS | AFFECTED_GRAPH | EVIDENCE

---

## CL-2026-09-01 — Phase 3 graph contract integrity correction

| Field | Content |
|-------|---------|
| **BEFORE** | Four invalid `supports` edges used hypothesis/contradiction sources; validator allowed them; Human HV graph placed publication-intent serially before canonical read; HEV Layer D overgeneralized side-effect gating. |
| **OBSERVATION** | AGENT_CONTRACT defines `supports` as evidence→claim only; HYP-POST-1445-SOAK must not support DEC-1445 (awaiting validation, not production success evidence). |
| **HYPOTHESIS** | The remaining invalid graph relations and Human View topology are documentation/ontology integrity defects and can be corrected without changing Battery runtime behavior. |
| **CHANGE** | Converted 3 invalid supports→refines; removed HYP-POST-1445→DEC-1445 edge; hardened validator supports-source check; clarified AGENT_CONTRACT vs schema.yaml authority; fixed Human HV topology; separated HEV D1/D2/D3 gates; renamed shadow-publish invariant title. |
| **WHY** | Close semantic hole that let graph PASS with epistemically invalid edges; prevent publication-intent from appearing to gate canonical read. |
| **EXPECTED_EFFECT** | Machine graph, Human View, and Agent Contract become epistemically consistent; future agents cannot interpret hypotheses as supporting evidence or publication-intent as a canonical-read execution gate. |
| **VALIDATION** | `validate-graph.sh` PASS with supports-source enforcement |
| **OBSERVED_EFFECT** | Invalid supports relations removed/reclassified; validator now rejects non-evidence supports sources; Human HV topology and HEV gate classification aligned. |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes |
| **REGRESSIONS_OR_TRADEOFFS** | Stricter validator rejects graph relationships that were previously syntactically accepted; future agents must choose evidence vs refines semantics explicitly. |
| **REMAINING_GAPS** | All existing Battery runtime/product gaps remain unresolved, including post-#1445 production soak (`BAT-V2-HYP-POST-1445-SOAK-001`), LV publication handoffs, timestamp provenance, HEV product authority, threshold provenance, and related open `BAT-V2-GAP-*` items. |
| **DECISION_STATUS** | VALIDATED (documentation / knowledge-authority correction only; NO runtime behavioral validation and NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 120 nodes / 105 edges / 11 invariants (was 120/106/11); −1 edge (HYP-POST-1445→DEC-1445 removed); 3 supports→refines |
| **EVIDENCE** | `architecture/battery-v2/AGENT_CONTRACT.md`; `architecture/battery-v2/graph/edges.yaml`; `architecture/battery-v2/scripts/validate-graph.mjs`; `architecture/battery-v2/KNOWLEDGE_GRAPH.md`; `architecture/battery-v2/contradictions/OPEN_CONTRADICTIONS.md`; HEV D1 snapshot path: `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-ingestion.service.ts` (`ctx.evSoc != null` → `recordSnapshot`) |

---

## CL-2026-09-01 — Phase 3 final HV SOH enablement + readiness micro-correction

| Field | Content |
|-------|---------|
| **BEFORE** | HV SOH shadow gate documented under `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED`; false claim that publication flag "unblocks `sohGatePassed`"; HV publication row implied working pipeline; `evaluateBatteryReadiness` still described as "STABLE pub + evidence". |
| **OBSERVATION** | Direct runtime audit: `hv-capacity-shadow-recompute.handler.ts`, `hv-capacity-shadow.service.ts`, `hv-soh-gate-assessment.service.ts`, `hv-soh-gate.policy.ts` — execution gated by `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED`; `PUBLICATION_DISABLED` excluded from `sohGatePassed` blocking; `publicationEligible: false` always. |
| **HYPOTHESIS** | Remaining drift is documentation-only and fixable without runtime changes. |
| **CHANGE** | Corrected reachability matrix, publication-readiness, hv-soh authority, decision-surfaces readiness rows; refined graph nodes `BAT-V2-PUB-HV-SOH-001`, `BAT-V2-ASSESS-HV-SOH-GATE-001`, `BAT-V2-GAP-PUB-READINESS-001`; strengthened shadow-no-auto-publish invariant. |
| **WHY** | Final targeted correction pass — prevent agents from treating publication-intent flag as execution gate or working customer publication pipeline. |
| **EXPECTED_EFFECT** | All authority surfaces agree: HV_CAPACITY_SHADOW = execution; HV_SOH_PUBLICATION = reason metadata; publicationEligible=false; no HV customer publication path. |
| **VALIDATION** | `validate-graph.sh` PASS |
| **OBSERVED_EFFECT** | Validator PASS |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes |
| **REGRESSIONS_OR_TRADEOFFS** | None |
| **REMAINING_GAPS** | All open gaps unchanged |
| **DECISION_STATUS** | VALIDATED (documentation reconstruction only; runtime behavior unchanged/unvalidated) |
| **AFFECTED_GRAPH** | 120 nodes / 106 edges / 11 invariants (unchanged counts; node/invariant text refined) |
| **EVIDENCE** | This PR only; runtime code trace of hv-capacity-shadow + hv-soh-gate.policy |

---

## CL-2026-09-01 — Phase 3 final authority consistency pass

| Field | Content |
|-------|---------|
| **BEFORE** | `KNOWLEDGE_GRAPH.md` stale; invalid graph edges (gap gates canonical read); OPEN_QUESTIONS gap set incomplete; matrix overstated REST_SHADOW as publication blocker; HEV gates conflated. |
| **OBSERVATION** | Human↔machine authority audit against final Phase 3 graph. |
| **HYPOTHESIS** | Remaining inconsistencies are documentation-only and fixable without runtime changes. |
| **CHANGE** | Updated Human View, validator semantic checks, graph edge semantics, matrix/readiness/publication wording, OPEN_QUESTIONS coverage, CHANGE_LEDGER compliance. |
| **WHY** | Final consistency before merge — prevent stale Human View from contradicting machine authority. |
| **EXPECTED_EFFECT** | Human and machine authority align; validator catches gap/question drift and invalid relations. |
| **VALIDATION** | `validate-graph.sh` PASS |
| **OBSERVED_EFFECT** | Validator PASS with semantic checks |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes |
| **REGRESSIONS_OR_TRADEOFFS** | Validator stricter — may require OPEN_QUESTIONS updates when gaps added |
| **REMAINING_GAPS** | All open gaps unchanged |
| **DECISION_STATUS** | VALIDATED (documentation reconstruction only; runtime behavior unchanged/unvalidated) |
| **AFFECTED_GRAPH** | 120 nodes / 106 edges / 11 invariants (was 120/107/11); −1 invalid edge (net) |
| **EVIDENCE** | This PR only |

---

## CL-2026-09-01 — Phase 3 correction pass (epistemics, provenance, handoffs)

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 3 initially overgeneralized PHEV completeness ("full chain"), represented RUNNING/SKIPPED as HISTORICAL, under-specified canonical LV publication handoffs, overstated bridge idempotency protection, used weak writer-absence claims. |
| **OBSERVATION** | Adversarial code audit: git log -S/-G, ripgrep, enqueue-path audit inventory, handler path verification. |
| **HYPOTHESIS** | Reachability claims need auditable negative-evidence provenance. |
| **CHANGE** | Corrected reachability matrix (ICE/HEV/PHEV LV REST; PHEV implemented paths only; HEV storage layers); fixed RUNNING/SKIPPED epistemics; full commit SHA; split LV handoff gaps; dedicated bridge evidence; audit provenance on negative claims; renamed HEV gap to SIDE-EFFECT-READ-DIVERGENCE. |
| **WHY** | Prevent incomplete/negative claims from becoming canonical agent truth. |
| **EXPECTED_EFFECT** | Knowledge graph reproducible at execution-path level with auditable absence claims. |
| **VALIDATION** | `validate-graph.sh` PASS |
| **OBSERVED_EFFECT** | Knowledge graph corrected; validator PASS |
| **NON_EFFECTS** | No runtime fix; no Stage 2; no publication wiring; no HEV fix; no timestamp fix; no bridge fix; no production validation |
| **REGRESSIONS_OR_TRADEOFFS** | More precise wording may read as "less complete" than initial Phase 3 draft |
| **REMAINING_GAPS** | All prior gaps remain open unless refined |
| **DECISION_STATUS** | VALIDATED (documentation reconstruction only; runtime behavior unchanged/unvalidated) |
| **AFFECTED_GRAPH** | 120 nodes / 107 edges / 11 invariants (was 114/98/11); +6 nodes, +9 edges; 1 gap renamed |
| **EVIDENCE** | `BAT-V2-EVID-AUDIT-RUNNING-SKIPPED-WRITER-ABSENCE-001`, `BAT-V2-EVID-CODE-BRIDGE-REACHABILITY-001`, `BAT-V2-EVID-AUDIT-PUBLICATION-ENQUEUE-ABSENCE-001`, `BAT-V2-EVID-AUDIT-HV-PIPELINE-ALLOWED-ABSENCE-001` |

---

## CL-2026-09-01 — Phase 3 decision surfaces, reachability & enablement

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 2 answered "what does the architecture contain?" Authority indexes had stale UNKNOWN wording. CURRENT_STATE graph counts drifted. Publication, HEV, readiness reachability not traced end-to-end. |
| **OBSERVATION** | Read-only code trace of flags, job chains, HEV/PHEV paths, publication/readiness, tasks, SOH, timestamps, bridge, RUNNING/SKIPPED history, consumer surfaces. |
| **HYPOTHESIS** | Many contradictions may be theoretical or partially reachable — Phase 3 must distinguish DEFINED vs USER_VISIBLE. |
| **CHANGE** | Added reachability matrix, publication-readiness, SOH truth table, decision-surfaces, bridge-reachability, rest-target-status-history docs. Refined gaps/contras/hypotheses. Added gaps and evidence nodes. Recorded PR #1480 evidence node. |
| **WHY** | Future agents need execution truth — which paths run under current flags, which are hidden, which job chains are broken. |
| **EXPECTED_EFFECT** | Decision matrix becomes primary enablement artifact; HEV/PHEV/publication reachability explicit. |
| **VALIDATION** | `validate-graph.sh` PASS; CURRENT_STATE counts match graph |
| **OBSERVED_EFFECT** | Validator PASS; self-consistency rule in AGENT_CONTRACT |
| **NON_EFFECTS** | No runtime, flag, deploy, backfill, or production data changes. No PRODUCTION_VALIDATED promotions. |
| **REGRESSIONS_OR_TRADEOFFS** | Increased graph complexity; more gaps documented |
| **REMAINING_GAPS** | All prior gaps remain open unless refined; production frequency UNKNOWN for most reachability findings |
| **DECISION_STATUS** | VALIDATED (documentation reconstruction only; runtime behavior unchanged/unvalidated) |
| **AFFECTED_GRAPH** | 114 nodes / 98 edges / 11 invariants (was 107/83/11); +7 nodes, +15 edges |
| **EVIDENCE** | `BAT-V2-EVID-PR-1480-001`, `BAT-V2-EVID-GIT-RUNNING-SKIPPED-ENUM-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-JOB-001`, `BAT-V2-EVID-CODE-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` (supersedes draft `HEV-SNAPSHOT-ORPHAN` precursor), Phase 3 code traces |

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
