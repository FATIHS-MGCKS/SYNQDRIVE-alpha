# Battery V2 — Change Ledger

Append-only scientific record. Newest entries first.

**Template fields:** BEFORE | OBSERVATION | HYPOTHESIS | CHANGE | WHY | EXPECTED_EFFECT | VALIDATION | OBSERVED_EFFECT | NON_EFFECTS | REGRESSIONS_OR_TRADEOFFS | REMAINING_GAPS | DECISION_STATUS | AFFECTED_GRAPH | EVIDENCE

---

---

---

---

---

---

## CL-2026-09-03 — M3.1 cutover contract audit

| Field | Content |
|-------|---------|
| **BEFORE** | M3.1 ≥6h audit `PRODUCTION_VALIDATED=PENDING_EVIDENCE`; production `REST_SHADOW=false`, `PUBLICATION=true`, `RECONCILIATION=true`. |
| **OBSERVATION** | Code truth table: `isBatteryV2CanonicalRestPipelineEnabled = isBatteryV2RestShadowEnabled`; Stage-2 requires `REST_SHADOW=true` + `PUBLICATION=true`. M3.1 activation script set opposite. ≥6h evidence (0 REST, 0 assess, 0 pub, restSessions=0, restTargets=0, PKG-01 repair frozen) fully explained by config. |
| **HYPOTHESIS** | Operators intended “disable shadow-only semantics” but selected `REST_SHADOW=false`, which disables entire canonical REST pipeline. |
| **CHANGE** | Documentation correction only: `M3_1_CUTOVER_CONTRACT_AUDIT.md`; reclassify `M3_1_STATUS=BLOCKED_BY_CUTOVER_CONTRACT`; `PRODUCTION_VALIDATED=PENDING_CORRECTED_ACTIVATION_EVIDENCE`. |
| **WHY** | Separate infrastructure health from activation contract; prevent “wait longer” false validation strategy. |
| **VALIDATION** | `battery-v2-cutover.policy.spec.ts`, `battery-health-v2.config.ts`, `lv-publication-chain-resolution.md`, production forensic evidence from ≥6h audit. |
| **NON_EFFECTS** | No production config/PM2/DB changes; no flag correction executed. |
| **REMAINING_GAPS** | Corrected Stage-2 activation + new T0 + re-validation required. |
| **DECISION_STATUS** | `ROOT_CAUSE_CLASS=MULTIPLE_DEFECTS` (CONFIG + DOCUMENTATION + known CODE_SEMANTICS overload); `SAFE_TO_PLAN_PRODUCTION_REPAIR=YES`. |

## CL-2026-09-03 — M3.1 ≥6h production validation audit

| Field | Content |
|-------|---------|
| **BEFORE** | M3.1 activated `2026-09-03T11:08:02Z`; 30m `PASS_WITH_PENDING_NATURAL_EVIDENCE`; 0 post-T0 measurements/assessments/publications at T+30m. |
| **OBSERVATION** | ~7.02h post-T0 forensic audit (`0e0f09259`): infra healthy; 68 LIVE_VOLTAGE / 0 canonical REST measurements post-T0; 0 assessments/publications; `FULL_FLEET_E2E_EVIDENCE=NO`; PKG-01 24×ENQUEUED frozen (pre-T0, repair gated by `REST_SHADOW=false`). |
| **VALIDATION** | Independent read-only SQL + BullMQ + PM2 + logs; scheduling contract reconstructed from code; canonical validator requires `BATTERY_V2_OPS_SCRIPT_DIR` when piped. |
| **DECISION_STATUS** | `PRODUCTION_VALIDATED=PENDING_CORRECTED_ACTIVATION_EVIDENCE` (amended by cutover audit); `SIX_HOUR_VALIDATION_PENDING=NO` (audit complete). |

## CL-2026-09-03 — M3.1 direct full-fleet production activation

| Field | Content |
|-------|---------|
| **BEFORE** | M3.0E `FULL_FLEET_ACTIVATION_READY=YES`; `PUBLICATION=false`, `REST_SHADOW=true`; 6 connected DIMO vehicles; 0 `battery_publications` rows. |
| **CHANGE** | Production cutover: `BATTERY_V2_PUBLICATION_ENABLED=true`, `BATTERY_V2_REST_SHADOW_ENABLED=false`; rolling dual-replica restart; ops scripts for snapshot/activation/6h validation. |
| **OBSERVED_EFFECT** | `BATTERY_V2_FULL_FLEET_T0=2026-09-03T11:08:02Z`; 30m infra PASS; post-activation failed=0; 0 publications (no new measurements since T0). |
| **DECISION_STATUS** | `BATTERY_V2_FULL_FLEET_ACTIVE=YES`; `PASS_WITH_PENDING_NATURAL_EVIDENCE`; `SIX_HOUR_VALIDATION_PENDING=YES`. |

## CL-2026-09-03 — M3.0E post-merge production deploy + convergence closure

| Field | Content |
|-------|---------|
| **BEFORE** | PR #1519 merged to `main` (`0e0f09259`) but not deployed; 46 ENQUEUED PKG-01 handoffs; 100 historical BullMQ failed jobs; `FULL_FLEET_ACTIVATION_READY` blocked. |
| **CHANGE** | Deployed `0e0f09259` to production (`20260903101734_v4994`); 19-min read-only convergence observation (3 reconciliation ticks); no publication activation; added `battery-v2-m3-0e-convergence-snapshot.sh`. |
| **OBSERVED_EFFECT** | ENQUEUED 46→35, EXECUTED 0→12; failed queue 100→88 (shrinking); post-deploy failed jobs = 0; no new 54000/LOCK_CONTENTION/reservation errors; digest keys length 146; publications_post_deploy = 0. |
| **VALIDATION** | Deploy SHA invariant; PM2 dual-replica health; scheduler leader=1; external health OK; tick-by-tick PKG-01 deltas; reservation count=0 throughout. |
| **NON_EFFECTS** | `BATTERY_V2_PUBLICATION_ENABLED` remains false; REST_SHADOW unchanged; no canary/staged rollout; historical terminal failed jobs not cleared. |
| **REMAINING_GAPS** | 35 ENQUEUED + 14 MISSING handoffs still draining (forward convergence, not blocked); 88 historical terminal BullMQ records remain. |
| **DECISION_STATUS** | `FULL_FLEET_ACTIVATION_READY = YES` — next task: direct full-fleet publication activation. |

## CL-2026-09-03 — M3.0D.3 reservation authority + FAILED rearm runtime closure

| Field | Content |
|-------|---------|
| **OBSERVATION** | M3.0D.2 reservation service conflated Redis errors with absent reservation; producer could release reservations it did not acquire; processor left ghost reservations after final retryable exhaustion; FAILED rearm unreachable via scheduler SQL. |
| **CHANGE** | Typed `acquireForDispatch` fail-closed semantics; ownership-gated producer release; Lua atomic refresh; processor releases on all final assess attempts; Option B FAILED candidate SQL + `isLegacyPersistence54000HandoffFailure` narrow rearm. |
| **VALIDATION** | Authority + producer + processor + M3.0D.2/3 closure + PKG regressions; PostgreSQL 16.15 persistence (gated); graph + tsc PASS. **Not deployed.** |
| **NON_EFFECTS** | No publication/REST_SHADOW change; no event-driven drain; production failed jobs untouched. |
| **DECISION_STATUS** | M3.0D.3 CODE COMPLETE — human merge review |

## CL-2026-09-03 — M3.0D.2 PR #1519 final pre-merge closure

| Field | Content |
|-------|---------|
| **OBSERVATION** | M3.0D.1 fixed 54000 root cause but ~30 legacy HANDLER_FAILED/54000 DLQs were not replayable; bounded BullMQ scan (250/state) not fleet-safe; digest keys could duplicate legacy raw-key rows; FAILED handoffs had no explicit rearm path. |
| **CHANGE** | `clearLegacyAssessPersistence54000DeadLetterIfPresent` + `isLegacyAssessPersistence54000DeadLetter`; Redis assess dispatch reservation (O(1)); `findExistingLvEstimatedHealthByCanonicalIdentity` (digest + legacy + fingerprint); FAILED→ENQUEUED rearm with `rearmReason`; metadata explicit-rearm merge bypass; real PostgreSQL persistence integration test. |
| **VALIDATION** | M3.0D.2 closure + reservation + legacy compat + PKG-01/02/stage-1 regressions; PostgreSQL 16.15 isolated persistence PASS (gated); graph + tsc PASS. **Not deployed.** |
| **NON_EFFECTS** | `BATTERY_V2_PUBLICATION_ENABLED=false`; `BATTERY_V2_REST_SHADOW_ENABLED=true`; production failed jobs untouched. |
| **REMAINING_GAPS** | Production forensics blocked (SSH); event-driven same-vehicle drain not implemented; deploy + soak before activation reevaluation. |
| **DECISION_STATUS** | M3.0D.2 CODE COMPLETE — human merge review |

## CL-2026-09-03 — M3.0D.1 PR #1519 persistence + cross-tick liveness closure

| Field | Content |
|-------|---------|
| **OBSERVATION** | M3.0D closed lock contention but not Postgres 54000; 30/45 assess creates failed on `battery_assessments_idempotency_key` btree tuple size; handoffs stuck ENQUEUED+DLQ; same-pass `repairedVehiclesThisPass` only tracked `enqueued=true`. |
| **ROOT_CAUSE** | Unbounded LV assessment `idempotency_key` embedding sorted measurement UUIDs in unique index `(vehicle_id, idempotency_key)`; concurrency disproved as 54000 mechanism. |
| **CHANGE** | SHA-256 digest segment `fp{hex}` in `buildLvEstimatedHealthAssessmentIdempotencyKey`; `evidenceFingerprint` preserved in `inputSummary`; `hasLiveAssessJobForVehicle` cross-tick guard; vehicle touched-this-pass on any repair attempt; handoff `FAILED`/`PERSISTENCE_FAILED` terminal; unique-constraint races remain retryable at classifier. |
| **VALIDATION** | PKG-01/02 + persistence + liveness + graph + tsc (M3.0D.1 run). **Not deployed.** |
| **NON_EFFECTS** | `BATTERY_V2_PUBLICATION_ENABLED=false`; `BATTERY_V2_REST_SHADOW_ENABLED=true`; production failed jobs untouched. |
| **REMAINING_GAPS** | Deploy + soak before `FULL_FLEET_ACTIVATION_READY` reevaluation; historical long-key rows remain (new writes bounded). |
| **DECISION_STATUS** | M3.0D.1 CODE COMPLETE — merge pending human review |

## CL-2026-09-03 — M3.0D PKG-01 reconciliation failure-spike forensics + liveness closure

| Field | Content |
|-------|---------|
| **OBSERVATION** | Post-#1515 deploy: 45 PKG-01 candidates → 45 `lv-rest-reconcile:` terminal failures (3 vehicles, 17+11+17). 15 lock contention + 30 Prisma Postgres 54000 persistence. Failed queue 60→100; handoffs now 46×ENQUEUED. |
| **ROOT_CAUSE** | Reconciliation fan-out enqueued many same-vehicle assess jobs concurrently → vehicle assess lock contention + concurrent assessment creates → terminal BullMQ failures; empty `failedReason` from raw re-throw without `BatteryV2JobProcessingError`. |
| **CHANGE** | Per-vehicle repair serialization in `reconcileCanonicalRestAssessmentHandoffs`; `clearReplayableDeadLetterIfPresent` before repair; processor throws classified `BatteryV2JobProcessingError`; idempotent-skip ack handoff; assess retry 5×10s exponential; Prisma 54000 classified non-retryable. |
| **VALIDATION** | PKG-01 reconciliation/fairness/liveness 98 passed; graph PASS. **Not deployed.** |
| **NON_EFFECTS** | `BATTERY_V2_PUBLICATION_ENABLED` unchanged; REST_SHADOW unchanged; failed queue not mutated. |
| **REMAINING_GAPS** | Postgres 54000 on assessment create may need separate persistence investigation; fix deploy + soak before activation readiness reevaluation. |
| **DECISION_STATUS** | M3.0D CODE COMPLETE — deploy pending |

## CL-2026-09-03 — M3.0B canary-readiness closure (PR #1515)

| Field | Content |
|-------|---------|
| **CHANGE** | Failed-job forensic triage (60 historical PKG-01 failures, 0 PKG-02, 0 in 24h); observability helper `--since` UTC window + production config authority + crash-proof lastAttemptAt SQL; isolated bounded-LIMIT starvation test; production `prisma migrate status` up to date |
| **VALIDATION** | POSTGRES_SMOKE PASS PKG-02 7/7 + PKG-01 2/2; regression + graph PASS |
| **REMAINING_GAPS** | PR #1515 merge + deploy before M3.1; failed-depth baseline 60 is historical delta anchor |
| **DECISION_STATUS** | M3.0B COMPLETE — M3.1 pending merge/deploy |

## CL-2026-09-03 — M3.0 pre-deploy preflight (PKG-01 + PKG-02)

| Field | Content |
|-------|---------|
| **BEFORE** | `POSTGRES_SMOKE = NOT_EXECUTED`; production baseline undocumented for M3.1 canary. |
| **CHANGE** | Isolated PostgreSQL 16 smoke on VPS (`synqdrive_bv2_m3_smoke_*`, `prisma db push` bootstrap); PKG-02/PKG-01 gated suites PASS; fixed `lv-publication-handoff.mutation.ts` text id cast (`::uuid` removed); stress-test fixture isolation; read-only `battery-v2-m3-canary-observability.sh`. |
| **OBSERVATION** | Production `battery_assessments.id` is `text`; row-lock SQL `::uuid` cast fails at runtime on `touchReconciliationFairness`. |
| **VALIDATION** | POSTGRES_SMOKE PASS (PKG-02 6/6, PKG-01 2/2); PKG-01/02 unit regression; graph validator PASS |
| **NON_EFFECTS** | No deploy; `BATTERY_V2_PUBLICATION_ENABLED` remains OFF; no M4; PKG-01/02 not `PRODUCTION_VALIDATED` |
| **REMAINING_GAPS** | Runtime uuid-cast fix + stress-test patch must merge before M3.1 deploy; production canary/soak not started |
| **DECISION_STATUS** | M3.0 COMPLETE — M3.1 blocked on patch merge |

## CL-2026-09-02 — PKG-02 PostgreSQL contract alignment (PR #1513)

| Field | Content |
|-------|---------|
| **BEFORE** | Reconciliation SQL accepted fractional/string publicationVersion before LIMIT while reader requires integer canonical version; `jsonb_array_length` on legacy epochAssessmentIds; malformed lastAttemptAt test contradicted query semantics (excluded repairable carriers). |
| **CHANGE** | SQL publicationVersion parity via `to_jsonb(LV_PUBLICATION_CONTRACT_VERSION)`; removed `jsonb_array_length`; lastAttemptAt treated as fairness metadata (NULLS FIRST, repairable); gated postgres fixtures for version/epoch/lastAttemptAt + starvation stress. |
| **WHY** | Pre-LIMIT SQL contract must be at least as strict as `readPublicationHandoffFromAssessmentSummary`; query must not abort on non-array epochAssessmentIds. |
| **VALIDATION** | PKG-02 focused 20 passed (6 postgres skipped); PKG-01/stage-1 99 passed; lifecycle 6 passed; graph validator PASS; tsc PASS |
| **NON_EFFECTS** | No deploy; no migration; D4/D5 semantics unchanged |
| **REMAINING_GAPS** | PRODUCTION_VALIDATED; POSTGRES_SMOKE = NOT_EXECUTED |
| **DECISION_STATUS** | PKG-02 IMPLEMENTED — not PRODUCTION_VALIDATED |

## CL-2026-09-02 — PKG-02 liveness/graph correction pass (PR #1513)

| Field | Content |
|-------|---------|
| **BEFORE** | Stale `bullJobId` permanently blocked reconciliation via `skip_enqueued`; malformed reconciliation rows could starve valid backlog; unsafe `lastAttemptAt` timestamptz cast; stale graph edge wording. |
| **CHANGE** | Claim-age-based reservation recovery (clears stale `bullJobId`); hardened reconciliation SQL invariants + safe ISO ordering; stale-bullJobId recovery tests A–F; malformed postgres fixtures; graph temporal semantics; persistence doc structure fix; integration uses captured producer payload. |
| **WHY** | Reconciliation liveness must not be permanently blocked by historical Bull metadata or malformed legacy rows. |
| **VALIDATION** | PKG-02 suites + stale recovery + PKG-01/stage-1 regression; graph validator PASS |
| **NON_EFFECTS** | No deploy; no migration; D4/D5 semantics unchanged |
| **REMAINING_GAPS** | PRODUCTION_VALIDATED; POSTGRES_SMOKE when DATABASE_URL unavailable |
| **DECISION_STATUS** | PKG-02 IMPLEMENTED — not PRODUCTION_VALIDATED |

## CL-2026-09-02 — PKG-02 merge-readiness pass (PR #1513)

| Field | Content |
|-------|---------|
| **BEFORE** | Concurrency tests were sequential retry proofs; integration spec mocked `BatteryPublicationService`; TEST 5 modeled first-creation not crash/retry; graph edges had present-tense PRE-PKG-02 gap language; reconciliation SQL lacked CANONICAL filter; append-only tension undocumented. |
| **CHANGE** | `reserveLvPublicationHandoffEnqueue` row-locked claim; overlapping `Promise.all` replica tests; real service-chain integration harness; TEST 6 crash-after-pub:B retry + `repairPendingSupersessionOnRetry`; `findPublicationById` + active-read-path proof; reconciliation CANONICAL filter + SHADOW exclusion assertion; graph edge temporal semantics; `persistence/models.md` operational envelope authority. |
| **WHY** | Merge-readiness evidence for true concurrency, real integration chain, D5 supersession crash window, and authority documentation without semantic drift. |
| **VALIDATION** | PKG-02 suites 24 passed (2 postgres skipped); PKG-01/stage-1 56 passed; `validate-graph.sh` PASS |
| **NON_EFFECTS** | No deploy; no migration; `BATTERY_V2_PUBLICATION_ENABLED` default OFF unchanged |
| **REMAINING_GAPS** | PRODUCTION_VALIDATED; POSTGRES_SMOKE when DATABASE_URL unavailable |
| **DECISION_STATUS** | PKG-02 IMPLEMENTED — not PRODUCTION_VALIDATED |
| **EVIDENCE** | `lv-publication-handoff.integration.spec.ts`, `lv-publication-handoff.mutation.ts`, `battery-publication.lifecycle-idempotency.spec.ts` |

## CL-2026-09-02 — PKG-02 runtime correction pass (PR #1513)

| Field | Content |
|-------|---------|
| **BEFORE** | Publication handoff used stale `inputSummary` snapshot updates without monotonic guard; reconciliation SQL used Prisma model names; same-assessment STABLE→STALE lifecycle blocked; `ok:false` acknowledged as EXECUTED; `publicationVersion` accepted numeric strings. |
| **OBSERVATION** | Producer/worker race could regress EXECUTED→ENQUEUED; `BatteryAssessment` is append-only evidence but PKG-02 authority stores operational `publicationHandoff` on selected rows (`CURRENT_STATE.md`). |
| **CHANGE** | Row-locked `mutateBatteryAssessmentPublicationHandoff` + monotonic `mergePublicationHandoffState`; corrected `battery_assessments` reconciliation SQL; same-assessment lifecycle repair in `BatteryPublicationService`; handler throws on `ok:false`; strict `typeof number` publicationVersion validation; race/lifecycle/integration/postgres-gated tests. |
| **WHY** | Runtime correctness, concurrency safety, and evidence-backed idempotency without schema migration. |
| **VALIDATION** | PKG-02 D4/D5 + handoff concurrency + lifecycle + reconciliation + integration tests; graph validator |
| **NON_EFFECTS** | No deploy; no `BATTERY_V2_PUBLICATION_ENABLED` default change; no DB migration |
| **REMAINING_GAPS** | PRODUCTION_VALIDATED; M3 soak |
| **EVIDENCE** | `lv-publication-handoff.mutation.ts`, `lv-publication-handoff-reconciliation.query.ts` |

## CL-2026-09-02 — PKG-02 LV publication handoff runtime

| Field | Content |
|-------|---------|
| **BEFORE** | Assessment recompute persisted canonical LV assessments but stopped before publication enqueue; no D4 selector; `BATTERY_PUBLICATION_UPDATE` payload validation gap; no publication reconciliation. |
| **OBSERVATION** | PKG-01 merged (PR #1510); D4/D5 validated; runtime needed direct handoff + reconcile without enabling customer publication effects. |
| **HYPOTHESIS** | Current-epoch D4 arbitration + D5 `pub:{assessmentId}:v1` + durable `publicationHandoff` metadata enables idempotent direct/retry/reconcile paths without schema migration. |
| **CHANGE** | Implement `LvPublicationHandoffService`, D4 track arbitration policy, strict `BATTERY_PUBLICATION_UPDATE` validation, assessment handler wiring, publication reconciliation query, `BatteryPublicationService` lifecycle/idempotency hardening (authority epoch reset, same-assessment retry, previous/current identity isolation, self-supersession guard). |
| **WHY** | Complete canonical LV pipeline mechanically while `BATTERY_V2_PUBLICATION_ENABLED` remains OFF. |
| **EXPECTED_EFFECT** | REST→assess→D4→`BATTERY_PUBLICATION_UPDATE`→`BatteryPublicationService` chain converges deterministically; reconciliation repairs missed handoffs from epoch evidence. |
| **VALIDATION** | PKG-02 unit/integration tests; `bash architecture/battery-v2/scripts/validate-graph.sh`; graph validator PASS |
| **OBSERVED_EFFECT** | 14 PKG-02-focused backend suites PASS (124 tests); graph validator PASS |
| **NON_EFFECTS** | No `BATTERY_V2_PUBLICATION_ENABLED` activation; no deploy; no DB migration; no M4; no PKG-03; not `PRODUCTION_VALIDATED` |
| **REGRESSIONS_OR_TRADEOFFS** | Publication policy stale lifecycle path now requires `materializeStaleLifecycle` for previous-only updates |
| **REMAINING_GAPS** | M3 production validation; PKG-03 timestamp provenance; M4 cutover |
| **DECISION_STATUS** | PKG-02 `IMPLEMENTED` (runtime); D4/D5 remain VALIDATED architecture authority |
| **AFFECTED_GRAPH** | CURRENT_STATE PKG-02 status; implementation-packages PKG-02 |
| **EVIDENCE** | `backend/src/modules/vehicle-intelligence/battery-health/lv-assessment/lv-publication-handoff.service.ts` |

## CL-2026-09-02 — D5 execution idempotency precision

| Field | Content |
|-------|---------|
| **BEFORE** | D5 separated contract identity from lifecycle state but did not fully separate previous lifecycle maintenance from current candidate publication, nor same-assessment execution retry from new evidence. |
| **OBSERVATION** | Stale-previous early return persisted under current `assessmentId`; STALE remains eligible as latest active previous; `LvPublicationPreviousState` lacks `assessmentId`; same-assessment retry reuses previous stabilized state for EWMA/hysteresis; P2002 + supersession path can conditionally self-supersede. |
| **HYPOTHESIS** | Three-layer idempotency (job/contract, execution, lifecycle) with explicit previous-vs-current identity observability prevents provenance rebinding, stale lock, EWMA drift, and self-supersession. |
| **CHANGE** | Amend D5: previous lifecycle identity isolation; current candidate after expiry; execution idempotency; self-supersession prohibition; tests 21–29; +1 evidence node; refine publication gaps. |
| **WHY** | Prevent misuse of `publicationVersion`, stale-authority lock, repeated-EWMA drift, and self-supersession. |
| **EXPECTED_EFFECT** | PKG-02 implements identity-isolated lifecycle maintenance, execution-idempotent same-assessment retry, and supersession safety. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change output. |
| **NON_EFFECTS** | No runtime implementation; no publication enqueue; no repository fix; no payload validator runtime fix; no DB migration; no flags; no prod mutation; no backfill; no deploy; no M4; no publication enablement; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 must supply previous/current assessment identity to policy without heuristic inference |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | D5 summary expanded; GAP-HANDOFF + GAP-JOB-CHAIN refined; +1 evidence, +3 edges |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PUBLICATION-PREV-STATE-EXECUTION-IDEMPOTENCY-001` |

## CL-2026-09-02 — D5 lifecycle identity precision

| Field | Content |
|-------|---------|
| **BEFORE** | D5 defined `publicationVersion` as contract generation, but same-assessment lifecycle persistence interaction with create-only idempotency was not explicit. |
| **OBSERVATION** | `evaluateLvPublicationPolicy` can return STALE with `shouldPersistPublication=true` for existing publication; `persistLvPublication` CREATE + P2002 returns existing row; `markPublicationSuperseded` updates existing row without `publicationVersion` increment. |
| **HYPOTHESIS** | Publication contract identity (`pub:{assessmentId}:v{n}`) must remain stable across lifecycle transitions; create idempotency ≠ lifecycle-state idempotency. |
| **CHANGE** | Amend D5 dossier: separate publication contract identity from lifecycle-state revision; document STALE/SUPERSEDED precedents; tests 15–20; refine publication gaps; +1 evidence node. |
| **WHY** | Prevent misuse of `publicationVersion` as maturity counter; prevent false success when requested lifecycle state was not materialized. |
| **EXPECTED_EFFECT** | PKG-02 distinguishes create-idempotency from lifecycle-state persistence; STALE durably materialized on same identity. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change output. |
| **NON_EFFECTS** | No runtime implementation; no repository runtime fix; no publication enqueue; no payload validation runtime fix; no database migration; no feature flag change; no production mutation; no backfill; no deploy; no M4; no publication enablement; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 must not treat P2002 return as lifecycle transition success when state differs |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | D5 summary expanded; GAP-HANDOFF + GAP-JOB-CHAIN refined; +1 evidence, +3 edges |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PUBLICATION-LIFECYCLE-CREATE-P2002-001` |

## CL-2026-09-02 — D5 LV publication version authority

| Field | Content |
|-------|---------|
| **BEFORE** | Publication job key accepted `publicationVersion` but canonical source undefined; repository defaulted to `1`; policy semver `1.0.0` coexisted with Int `BatteryPublication.version` without explicit separation; central producer validation stripped publication-specific fields. |
| **OBSERVATION** | `buildPublicationJobIdempotencyKey` → `pub:{assessmentId}:v{publicationVersion}`; DB `version Int @default(1)`; `LV_PUBLICATION_POLICY_VERSION = '1.0.0'` separate from contract; no central `LV_PUBLICATION_CONTRACT_VERSION`; `validateBatteryV2JobPayload` default branch drops `assessmentId`/`publicationVersion` for `BATTERY_PUBLICATION_UPDATE`. |
| **HYPOTHESIS** | Numeric publication contract generation (initial `1`) provides deterministic direct/retry/reconciliation identity without mutable counters or policy/assessment semver coupling. |
| **CHANGE** | Select `publicationVersion = LV_PUBLICATION_CONTRACT_VERSION = 1`; document version taxonomy; reject policy semver mapping; PKG-02 promoted to `IMPLEMENTATION_READY`; payload validation field-loss documented for PKG-02 runtime. |
| **WHY** | Job idempotency identity must be known before enqueue; same assessment + same contract generation must converge on same `pub:` identity. |
| **EXPECTED_EFFECT** | PKG-02 implements explicit contract version + strict publication payload validation; no further PKG-02 architecture blockers unless new decision discovered. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; graph 146 nodes / 142 edges (was 142/133). |
| **NON_EFFECTS** | No runtime implementation; no publication enqueue; no validation runtime fix; no database migration; no feature flag change; no production mutation; no backfill; no deploy; no M4 cutover; no publication enablement; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | Future contract bump `1→2` requires explicit migration/replay governance — not automatic |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open including handoff and job-chain gaps |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 decision (D5), +3 evidence nodes, +9 edges; refined GAP-JOB-CHAIN |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PUBLICATION-VERSION-DEFAULT-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-POLICY-VERSION-SEPARATE-001`, `BAT-V2-EVID-CODE-PUBLICATION-PAYLOAD-VALIDATION-DROP-001` |

## CL-2026-09-02 — D4 final closure (publication authority epoch + UNKNOWN→known)

| Field | Content |
|-------|---------|
| **BEFORE** | Equal-value known→known transitions covered; UNKNOWN→known equal value ambiguous because `authoritativeTrackChanged` cannot be proven against unknown previous authority. |
| **OBSERVATION** | Previous track may be UNKNOWN (`LvPublicationPreviousState` lacks `assessmentTrack`); `shouldPersistPublication` uses firstPublication\|\|valueChanged only. |
| **HYPOTHESIS** | `publicationAuthorityEpochChanged` replaces insufficient track-change boolean; UNKNOWN→known = authority epoch transition when policy permits; D4 recompute epoch ≠ publication authority epoch. |
| **CHANGE** | Amended D4 with PUBLICATION_AUTHORITY_EPOCH, UNKNOWN_TO_KNOWN_TRANSITION, ASSESSMENT_EPOCH_VS_PUBLICATION_EPOCH, CURRENT_TRACK_MUST_BE_KNOWN; TEST 18–22; cosmetic ledger/executive fixes. |
| **WHY** | Deterministic canonical provenance must replace ambiguous previous authority when policy permits, even if score unchanged; cannot prove track-changed against UNKNOWN. |
| **EXPECTED_EFFECT** | PKG-02 implements `publicationAuthorityEpochChanged` context; D5 remains sole blocker. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts unchanged (docs-only precision). |
| **NON_EFFECTS** | No runtime implementation; no publication/assessment behavior change; no DB migration; no feature flag change; no production mutation; no backfill; no deploy; no M4 cutover; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 must not treat every recompute as publication authority epoch change |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D5 only |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | D4 summary expanded — no new nodes |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PREV-STATE-NO-TRACK-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-PERSIST-VALUE-ONLY-001` |

## CL-2026-09-02 — D4 equal-value cross-track publication precision

| Field | Content |
|-------|---------|
| **BEFORE** | D4 defined cross-track epoch and retention≠fallback but did not explicitly require equal-value track transitions to persist when policy permits; current `shouldPersistPublication` uses firstPublication\|\|valueChanged only. |
| **OBSERVATION** | `lv-publication.policy.ts`: equal TELEMETRY 72 → WORKSHOP 72 yields `valueChanged=false` → no new publication; old TELEMETRY row remains active despite D4 authority change. Reason payload stores assessmentTrack; `LvPublicationPreviousState` omits it. |
| **HYPOTHESIS** | Track authority change is publication-significant independently of numeric equality when new track passes policy; UNKNOWN previousTrack = discontinuity without stabilization inheritance. |
| **CHANGE** | Amended D4 dossier with EQUAL_VALUE_TRACK_TRANSITION, PUBLICATION_SIGNIFICANCE, HISTORY_VS_STABILIZATION_CONTEXT, UNKNOWN_PREVIOUS_TRACK; TEST 14–17; +1 evidence node. |
| **WHY** | Publication carries provenance/authority beyond displayed score; 72 TELEMETRY ≠ 72 WORKSHOP epistemically; single-authority requires active publication to reflect successful authoritative track. |
| **EXPECTED_EFFECT** | PKG-02 must implement track-change publication significance and equal-value cross-track tests; D5 remains sole blocker. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; `lv-publication.policy.ts` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change output. |
| **NON_EFFECTS** | No runtime implementation; no publication behavior change; no assessment behavior change; no DB migration; no feature flag change; no production mutation; no backfill; no deploy; no M4 cutover; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 publication policy must accept track-change significance signal from D4 context |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D5 only; M4 not authorized |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 evidence, +1 edge; expanded D4 summary |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PUBLICATION-PERSIST-VALUE-ONLY-001` |

---

## CL-2026-09-02 — D4 precision pass (authority epoch + cross-track publication semantics)

| Field | Content |
|-------|---------|
| **BEFORE** | D4 VALIDATED track precedence but retry/reconciliation wording implied preserving first-epoch winner across fresh recomputes; cross-track EWMA/hysteresis and retention-vs-fallback not explicit; LvPublicationPreviousState track gap undocumented. |
| **OBSERVATION** | D1 inputVersion is trigger identity not frozen snapshot; recomputeLvEstimatedHealth reads current measurements; reason payload persists assessmentTrack but toPreviousState omits it; evaluateLvPublicationPolicy EWMA seeds from previous.stabilizedEstimatedHealth without track awareness. |
| **HYPOTHESIS** | Authority epoch per recompute + cross-track stabilization boundary + retention≠fallback closes D4 precision without reopening WORKSHOP_OVERRIDE > TELEMETRY selection. |
| **CHANGE** | Amended `BAT-V2-DEC-LV-PUBLICATION-TRACK-AUTHORITY-001` with D4_AUTHORITY_EPOCH, RETRY_RECONCILIATION_CONTRACT, CROSS_TRACK_PUBLICATION_AUTHORITY_EPOCH, RETENTION_VS_FALLBACK, PREVIOUS_TRACK_OBSERVABILITY; updated TEST_CONTRACT (9A/9B, 10–13); +3 evidence nodes; graph/authority doc sync. |
| **WHY** | Fresh recompute after crash may legitimately change winner; track transitions are semantic boundaries; same-handoff retry must not be conflated with new epoch; existing TELEMETRY publication retention after higher-track SKIP is not fallback. |
| **EXPECTED_EFFECT** | PKG-02 must implement/test cross-track epoch semantics; D5 remains sole architecture blocker; IMPLEMENTATION_SPEC_REQUIRED does not mean runtime supports D4 yet. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; `battery-assessment.service.ts`, `lv-publication.policy.ts`, `battery-publication.repository.ts` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change validator output. |
| **NON_EFFECTS** | No runtime implementation; no publication behavior change; no assessment behavior change; no DB migration; no feature flag change; no production mutation; no backfill; no deploy; no M4 cutover; no production validation; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 must add previous-track observability and cross-track stabilization tests |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D5 only; M4 not authorized |
| **DECISION_STATUS** | VALIDATED (NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +3 evidence, +3 edges; expanded D4 summary — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-PREV-STATE-NO-TRACK-001`, `BAT-V2-EVID-CODE-LV-RECOMPUTE-CURRENT-EVIDENCE-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-EWMA-PREVIOUS-001` |

---

## CL-2026-09-02 — D4 LV publication assessment-track authority

| Field | Content |
|-------|---------|
| **BEFORE** | PKG-02 remained `IMPLEMENTATION_SPEC_REQUIRED` with D4 assessment-track selection and D5 `publicationVersion` blockers. AUTO could persist WORKSHOP_OVERRIDE + TELEMETRY but no deterministic publication handoff selector existed. `findLatestLvEstimatedHealth()` orders by `computedAt` only; backfill used `persistedAssessmentIds[length-1]`. |
| **OBSERVATION** | `lv-estimated-health-assessment.policy.ts` AUTO emits dual tracks when workshop in selectedEvidence; `lv-evidence-selection.policy.ts` rejects stale workshop via STALE_MEASUREMENT; `battery-assessment.repository.ts` findLatest has no track filter; `BatteryPublicationService` evaluates one assessmentId with no track precedence. |
| **HYPOTHESIS** | Freshness-conditional WORKSHOP_OVERRIDE > TELEMETRY within current recompute closes D4 without runtime change; stale workshop must relinquish authority; telemetry volume must not override; no same-recompute telemetry fallback after publication-policy SKIP. |
| **CHANGE** | Created `BAT-V2-DEC-LV-PUBLICATION-TRACK-AUTHORITY-001` dossier; added graph decision node + 3 evidence nodes; updated PH4 summary, CURRENT_STATE, KNOWLEDGE_GRAPH, implementation-packages, lv-publication-chain-resolution, phase4-executive-summary, dependency-graph, RESOLUTION_PRIORITY_MATRIX, decisions/README. |
| **WHY** | Multi-track persistence is intentional for diagnostics; publication requires exactly one evidence-backed candidate; workshop authority must align with existing freshness eligibility — not permanent override or latest-wins. |
| **EXPECTED_EFFECT** | PKG-02 implementers have deterministic track selector spec; D5 is sole remaining PKG-02 architecture blocker; runtime gaps remain open until PKG-02 implementation. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; code cites `lv-estimated-health-assessment.policy.ts`, `lv-evidence-selection.policy.ts`, `battery-assessment.repository.ts`, `battery-assessment.service.ts`, `battery-publication.service.ts` |
| **OBSERVED_EFFECT** | Validator PASS; graph counts per post-change validator output. |
| **NON_EFFECTS** | No runtime implementation; no publication enqueue; no feature flag change; no DB migration; no production mutation; no backfill; no deploy; no M4 cutover; no production validation; runtime publication gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 test contract adds 9 future multi-track scenarios; implementers must not use findLatest or array order as selector |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D5 only; M4 not authorized |
| **DECISION_STATUS** | VALIDATED (architecture / selection authority — NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 decision, +3 evidence, +6 edges — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-AUTO-DUAL-TRACK-001`, `BAT-V2-EVID-CODE-LV-WORKSHOP-FRESHNESS-REJECT-001`, `BAT-V2-EVID-CODE-LV-FIND-LATEST-NO-TRACK-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-JOB-001` |

---

## CL-2026-09-02 — PKG-01 evidence closure (TEST C repair proof + Postgres smoke honesty)

| Field | Content |
|-------|---------|
| **BEFORE** | TEST C proved deep-candidate traversal only (all candidates ENQUEUED/live); Postgres integration spec could false-green on empty results or missing DATABASE_URL; lookback/capacity claims overstated unconditional eventual recovery. |
| **CHANGE** | TEST C now uses genuinely repairable MISSING-handoff target beyond 32×maxScanned with D1 enqueue assertions; Postgres integration creates controlled fixtures (eligible 60m/6h, EXECUTED exclusion, sourceObservationId exclusion, lastAttemptAt ordering) and fails hard when `BATTERY_V2_HANDOFF_RECONCILE_INTEGRATION=1` without reachable DB; CURRENT_STATE documents precise 7-day lookback invariant and operational backlog risks. |
| **WHY** | PR #1510 final evidence pass — architecture approved; evidence must not over-claim. |
| **VALIDATION** | PKG-01-focused Jest suite PASS; fairness TEST C repair proof; integration gated (`BATTERY_V2_HANDOFF_RECONCILE_INTEGRATION=1` + DATABASE_URL) |
| **NON_EFFECTS** | No runtime architecture redesign; 7-day lookback unchanged |
| **DECISION_STATUS** | PKG-01 IMPLEMENTED — not PRODUCTION_VALIDATED |

---

## CL-2026-09-02 — PKG-01 reconciliation fairness finalization (lastAttemptAt queue)

| Field | Content |
|-------|---------|
| **BEFORE** | Wall-clock modulo-32 OFFSET rotation was not coupled to scheduler cadence (gcd aliasing at non-coprime intervals) and capped coverage at 32×maxScanned — false eventual-coverage claims. |
| **CHANGE** | Replaced rotation with durable fairness queue: SQL orders incomplete candidates by `assessmentHandoff.lastAttemptAt NULLS FIRST, lastAttemptAt ASC, id`; reconciliation inspects up to bounded budget and advances `lastAttemptAt` via existing CAS for stable skip outcomes (`already_enqueued_live`, `dead_letter`, etc.) and `touchReconciliationFairness` after repair budget exhaustion. Added fairness regression tests A–D + gated Postgres SQL smoke spec. |
| **WHY** | PR #1510 review — D2 independent eventual recovery requires scheduler-interval-independent, unbounded-finite-backlog fairness without process-local cursor authority. |
| **VALIDATION** | PKG-01-focused Jest 87+ tests PASS; fairness tests A–D PASS; `validate-graph.sh` PASS |
| **NON_EFFECTS** | D1 identity unchanged; CAS/replay/monotonic/direct-path tests unchanged; no PKG-02/M4/flags/migration/deploy |
| **DECISION_STATUS** | PKG-01 IMPLEMENTED — not PRODUCTION_VALIDATED |

---

## CL-2026-09-02 — PKG-01 final correction pass (reconciliation eventual progress + direct-path test)

| Field | Content |
|-------|---------|
| **BEFORE** | Reconciliation scanned sequential measurement pages with process-local `cursorId` resetting each invocation — EXECUTED rows could starve repairable candidates beyond `batch*20`; direct-path integration test preloaded `findFirst` measurement causing replay not direct path. |
| **CHANGE** | Replaced sequential scan with targeted SQL join on incomplete handoff candidates (`fetchRestAssessmentHandoffReconcileCandidates`) plus wall-clock rotating `OFFSET` (`resolveRestAssessmentHandoffScanOffset`); cross-run starvation regression test; corrected direct-path handler test with ordered mocks + `evaluateAndPersist` exactly-once assertion. CAS/replay/monotonic architecture unchanged. |
| **WHY** | PR #1510 second review — D2 independent eventual recovery requires cross-invocation progress without process-local cursor authority. |
| **VALIDATION** | PKG-01-focused Jest 82 tests PASS (handoff + reconciliation + handler + stage-1/liveness); `validate-graph.sh` PASS |
| **NON_EFFECTS** | D1 identity unchanged; no PKG-02/M4/flags/migration/deploy; optimistic CAS architecture retained |
| **DECISION_STATUS** | PKG-01 IMPLEMENTED — not PRODUCTION_VALIDATED |

---

## CL-2026-09-02 — PKG-01 D2 review correction pass (metadata CAS + replay + reconciliation pagination)

| Field | Content |
|-------|---------|
| **BEFORE** | Handler COMPLETED write used stale session snapshot (could erase assessmentHandoff); handoff persistence was read-modify-write without DB concurrency guard; replay marked all measurements COMPLETED; reconciliation first-page starvation. |
| **CHANGE** | Added `mutateLvRestSessionMetadata` optimistic CAS on `updatedAt`; handoff + handler target writes use fresh re-read/retry; terminal replay discriminators (`isSyntheticRestMissedMeasurement`, `isSyntheticRestStatusMeasurement`); reconciliation id-cursor pagination + per-run repaired-id dedupe; race/regression tests A–E. |
| **WHY** | PR #1510 review found D2 contract violations — not merge-ready without these fixes. |
| **VALIDATION** | 83 PKG-01-focused Jest tests PASS; `npx tsc --noEmit` PASS; `validate-graph.sh` PASS |
| **NON_EFFECTS** | D1 identity unchanged; no PKG-02/M4/flags/migration/deploy |
| **DECISION_STATUS** | PKG-01 IMPLEMENTED — not PRODUCTION_VALIDATED |

---

| Field | Content |
|-------|---------|
| **BEFORE** | battery-rest-target-evaluate.handler persisted measurements but did not enqueue assessment; replay used hasMeasurement bool only; reconcilePendingAssessments scanned batteryFeatures not canonical REST measurements; no assessmentHandoff durable metadata. |
| **CHANGE** | Implemented LvRestAssessmentHandoffService (direct handoff + idempotency + monotonic metadata), handler integration (direct + replay repair), assessment handler EXECUTED ack via sourceEntityId, reconcileCanonicalRestAssessmentHandoffs in BatteryV2ReconciliationService. Tests: metadata/policy/service/handler/reconciliation. PKG-01 → IMPLEMENTED (not PRODUCTION_VALIDATED). |
| **WHY** | Authorized BAT-V2-RUNTIME-PKG-01 per validated D1/D2/D3 architecture. |
| **EXPECTED_EFFECT** | Eligible canonical REST measurements enqueue assess:{vehicleId}:LV_HEALTH:{measurementId}; crash-boundary repair via replay + reconciliation; no HANDOFF flag; REST_SHADOW and publication unchanged. |
| **VALIDATION** | `npm test --testPathPattern="lv-rest-assessment-handoff|battery-rest-target-evaluate.handler|battery-v2-reconciliation.spec|battery-v2-rest-target|battery-v2-stage1-pipeline"`; `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **NON_EFFECTS** | No PKG-02 publication handoff; no M4 cutover; no REST_SHADOW removal; no DB migration; no feature flag changes; no deploy. |
| **REMAINING_GAPS** | BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001 open until PRODUCTION_VALIDATED; publication handoff (PKG-02) open. |
| **DECISION_STATUS** | D1/D2/D3 runtime implemented — NOT PRODUCTION_VALIDATED |
| **AFFECTED_GRAPH** | PKG-01 IMPLEMENTED; gap node summary updated |

---

| Field | Content |
|-------|---------|
| **BEFORE** | D3 selected single-authority target but left publication effect-only coupling implicit; M1-M3 dual-producer overlap undocumented; lv-publication-chain dossier had duplicate state-machine tables and stale HANDOFF-flag Phase-4 wording. |
| **OBSERVATION** | isLvRestShadowModeActive = REST_SHADOW && !PUBLICATION; publication OFF forces evidenceEligible false and shadowMode context. Legacy snapshot path enqueues assessment with capturedAt.getTime(); canonical PKG-01 will use measurement.id — different job identities. |
| **HYPOTHESIS** | Precision pass closes publication effect-only target invariant, M4 shadow retirement precondition, and temporary dual-compute migration semantics without reopening D3 architecture selection. |
| **CHANGE** | Amended `BAT-V2-DEC-LV-SINGLE-AUTHORITY-CUTOVER-001` with PUBLICATION_EFFECT_ONLY_TARGET_INVARIANT, M4_SHADOW_SEMANTICS_RETIREMENT, MIGRATION_DUAL_COMPUTE, MIGRATION_ACTIVATION_SEMANTICS; added `BAT-V2-EVID-CODE-LV-REST-PUBLICATION-SHADOW-COUPLING-001`; deduplicated lv-publication-chain state machine; fixed TEST PLAN, HANDOFF_EXECUTION wording (at-least-once not exactly-once), removed stale HANDOFF rollback/merge questions. |
| **WHY** | Current PUBLICATION is not effect-only; target requires M4 decoupling; migration overlap is real but temporary; stale HANDOFF references contradict D3. |
| **EXPECTED_EFFECT** | PKG-01 remains IMPLEMENTATION_READY; implementers understand M4 shadow retirement surface and M3 dual-compute observation requirements. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; `lv-rest-shadow.policy.ts`, `battery-v2-snapshot-ingestion.service.ts` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 134 nodes / 119 edges / 11 invariants (was 133/119/11 before precision pass). |
| **NON_EFFECTS** | No runtime implementation; no legacy removed; no REST_SHADOW removed; no HANDOFF env introduced; no publication runtime change; no DB migration; no production mutation; no backfill; no deploy; no cutover authorized; runtime gaps remain open. |
| **REGRESSIONS_OR_TRADEOFFS** | M3 validation burden increased; M4 cutover has additional shadow-decoupling precondition |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-02 D4 + D5; M4 not authorized |
| **DECISION_STATUS** | VALIDATED (architecture / configuration authority — NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 evidence; expanded D3 summary — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-LV-REST-PUBLICATION-SHADOW-COUPLING-001`, `BAT-V2-EVID-CODE-BATTERY-V2-FLAG-CUTOVER-SEMANTICS-001`, `BAT-V2-EVID-CODE-LV-PUBLICATION-JOB-001` |

---

## CL-2026-09-01 — D2 canonical LV assessment crash-boundary decision

| Field | Content |
|-------|---------|
| **BEFORE** | PKG-01 crash-boundary remained SPEC REQUIRED (A/B/C alternatives). Initial D2 Hybrid C+ selected architecture but retry contract treated any persisted measurement as handoff-eligible; terminal synthetic measurements risked COMPLETED overwrite; no sourceEntityId ack contract; no monotonic/concurrency metadata invariant; enqueue/EXECUTED ack semantics underspecified. |
| **OBSERVATION** | `hasTargetMeasurement` bool ignores quality/provenance; `persistMissedMeasurement`/`persistStatusMeasurement` return `measurementId` without `sourceObservationId`; selected-observation path includes `sourceObservationId` (ok=true may still be quality MISSED); metadata update is RMW over loaded snapshot; `BatteryV2JobPayloadBase` already has `sourceEntityId`; producer returns `null` vs `jobId`; `recomputeLvEstimatedHealth` maps to persisted/unsupported/skipped. |
| **HYPOTHESIS** | Precision pass on Hybrid C+ closes implementation-contract holes without runtime change: eligibility gate, terminal outcome preservation, sourceEntityId correlation, monotonic state, concurrency-safe merge, enqueue/EXECUTED ack rules. |
| **CHANGE** | Amended `BAT-V2-DEC-LV-ASSESSMENT-CRASH-BOUNDARY-001` dossier with HANDOFF_ELIGIBILITY (`CANONICAL_ASSESSMENT_HANDOFF_ELIGIBLE_MEASUREMENT` via `provenance.sourceObservationId`), terminal retry semantics (MISSED/FAILED preservation), `sourceEntityId=measurement.id` correlation, monotonic `MISSING<ENQUEUED<EXECUTED` + late ENQUEUED no-op, concurrency-safe target metadata invariant + PKG-01 test scope, ENQUEUED/EXECUTED ack semantics. Updated graph decision summary; expanded `BAT-V2-EVID-CODE-REST-HAS-MEASUREMENT-EARLY-RETURN-001`; added `BAT-V2-EVID-CODE-REST-SYNTHETIC-MEASUREMENT-PERSISTENCE-001`, `BAT-V2-EVID-CODE-REST-TARGET-METADATA-RMW-001`. Updated CURRENT_STATE, KNOWLEDGE_GRAPH, implementation-packages, lv-publication-chain dossier. |
| **WHY** | Any-measurement handoff rule is incorrect for synthetic terminal rows; bool replay risks MISSED/FAILED→COMPLETED; assessment ack needs measurement correlation not correlationId parsing; worker/producer race requires monotonic EXECUTED; multi-replica safety needs qualified concurrency contract. |
| **EXPECTED_EFFECT** | Runtime agents implement eligibility-gated Hybrid C+ with sourceEntityId ack and monotonic concurrency-safe metadata; PKG-01 remains IMPLEMENTATION_SPEC_REQUIRED (D3 only); assessment-handoff gap stays open. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; code cites `battery-rest-target-evaluate.handler.ts`, `battery-rest-target-evaluation.service.ts`, `battery-v2-job-producer.service.ts`, `battery-assessment.service.ts`, `battery-v2-job.types.ts` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 131 nodes / 113 edges / 11 invariants (was 129/113/11 before precision pass; was 124/110/11 before initial D2). |
| **NON_EFFECTS** | No runtime implementation; no assessment enqueue added; no reconciliation code changed; no DB migration; no feature flags; no production mutation; no backfill; no deploy; assessment-handoff gap remains open; PKG-01 not yet IMPLEMENTATION_READY. |
| **REGRESSIONS_OR_TRADEOFFS** | At-least-once not exactly-once; implementation must add concurrency-safe merge (not yet in code); eligibility adds replay branch complexity |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-01 configuration invariant (D3); PKG-02 blockers unchanged |
| **DECISION_STATUS** | VALIDATED (architecture / code-authority — NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +2 evidence nodes; expanded 1 evidence + decision summary — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-REST-HAS-MEASUREMENT-EARLY-RETURN-001`, `BAT-V2-EVID-CODE-REST-SYNTHETIC-MEASUREMENT-PERSISTENCE-001`, `BAT-V2-EVID-CODE-REST-TARGET-METADATA-RMW-001`, `BAT-V2-EVID-CODE-RECONCILE-NO-CANONICAL-REST-001`, `BAT-V2-EVID-CODE-ASSESSMENT-POLICY-SKIP-001`, `BAT-V2-EVID-CODE-JOB-PRODUCER-INFLIGHT-DEDUPE-001` |

---

## CL-2026-09-01 — D1 canonical LV assessment inputVersion decision

| Field | Content |
|-------|---------|
| **BEFORE** | PKG-01 `inputVersion` remained SPEC REQUIRED with three candidates (measurement.id, observedAt, composite). Matrix and Phase-4 docs treated inputVersion as unresolved implementation blocker. |
| **OBSERVATION** | `buildAssessmentJobIdempotencyKey` already accepts caller-supplied `inputVersion`; `BatteryRestTargetEvaluateHandler` exposes `result.measurementId` after successful REST persist; legacy path uses `capture.capturedAt.getTime()` separately. |
| **HYPOTHESIS** | Selecting `BatteryMeasurement.id` as canonical REST handoff `inputVersion` closes one PKG-01 spec blocker without runtime change or migration. |
| **CHANGE** | Created `BAT-V2-DEC-LV-ASSESSMENT-INPUT-VERSION-001` (VALIDATED — not PRODUCTION_VALIDATED); dossier `decisions/lv-assessment-input-version-decision.md`; graph node + evidence + refines edges to assessment-handoff gap and PH4 decision; updated PKG-01 authority across CURRENT_STATE, KNOWLEDGE_GRAPH, implementation-packages, lv-publication-chain dossier, executive summary, dependency graph, priority matrix, decisions README. **Precision pass:** narrowed retry claims to retry-identity-safe / in-flight-dedupe-safe (not exactly-once); documented `BatteryV2JobProducerService` completed/failed re-add behavior; handler reads current measurement set not frozen snapshot; D2/D3 remain separate; decisions README provenance PR #1501. |
| **WHY** | measurement.id is unique, retry-identity-safe, cross-replica identity-safe, timestamp-independent, supports REST_60M/REST_6H distinct measurements; observedAt/trip/session/composite rejected. |
| **EXPECTED_EFFECT** | Runtime agents implement canonical handoff with `assess:{vehicleId}:LV_HEALTH:{measurementId}`; PKG-01 remains IMPLEMENTATION_SPEC_REQUIRED (crash-boundary + configuration invariant); assessment-handoff gap stays open. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh`; code cites `battery-v2-job-idempotency.policy.ts`, `battery-rest-target-evaluate.handler.ts` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 124 nodes / 110 edges / 11 invariants (was 121/108/11); main at `94d9b1e8a` (no Battery V2 drift on main). |
| **NON_EFFECTS** | No runtime implementation; no assessment enqueue added; no flags changed; no migration; no production mutation; no backfill; no deploy; PKG-01 not yet IMPLEMENTATION_READY; gap not closed. |
| **REGRESSIONS_OR_TRADEOFFS** | Reconciliation repair path must use same inputVersion rule when implemented |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; PKG-01 crash-boundary; configuration invariant; PKG-02 blockers unchanged |
| **DECISION_STATUS** | VALIDATED (architecture / code-authority — NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | +1 decision, +2 evidence, +2 refines edges — see validator counts |
| **EVIDENCE** | `BAT-V2-EVID-CODE-ASSESSMENT-JOB-IDEMPOTENCY-001`, `BAT-V2-EVID-CODE-REST-MEASUREMENT-ID-HANDOFF-001` |

---

## CL-2026-09-01 — Phase 4 activation-semantics correction (final merge gate)

| Field | Content |
|-------|---------|
| **BEFORE** | Phase-4 dossiers implied 1–2-org canary for process.env flags; HANDOFF OFF alone as rollback; 24h row SLA; assessment/publication row as handoff success; provider VLS SOH gap IMPLEMENTATION_READY as future work; PKG-01/02 blockers understated vs implementation-packages; unsafe REST_SHADOW=ON + PUBLICATION=ON + HANDOFF=OFF not documented. |
| **OBSERVATION** | `isBatteryV2LegacyRestCaptureEnabled()` disables legacy only when REST_SHADOW + PUBLICATION both ON; proposed HANDOFF flag creates cutover trap; flags are deployment-scoped; `recomputeLvEstimatedHealth()` and `updateLvPublication()` may legitimately skip persistence; VLS-only provider SOH already non-decision-fresh in `canonical-battery-health.service.ts`. |
| **HYPOTHESIS** | Documentation-only activation/rollback/validation semantics correction closes remaining Phase-4 merge-gate gaps without runtime changes. |
| **CHANGE** | LV feature-flag state matrix + unsafe HANDOFF=OFF trap; configuration invariant options A–D (`CONFIGURATION_INVARIANT_SPEC_REQUIRED`); safe rollback order (PUBLICATION first); canary = deployment/environment (org allowlist SPEC REQUIRED); PKG-01/02 handoff liveness vs policy-outcome validation dimensions; 24h demoted to observation window; provider VLS SOH gap → DECISION_REQUIRED (RECOMMENDED/PROPOSED non-decision-fresh semantics — pending sign-off); PKG-04 scoped to winner-usability only; post-#1445 profile-stratified smoke; HEV measurement-policy wording; CURRENT_STATE blocker alignment; executive summary + dependency graph updates. **Authority alignment:** `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` machine summary aligned with crash-boundary + configuration-invariant blockers; `KNOWLEDGE_GRAPH.md` umbrella aligned; LV dossier readiness header; executive sequencing requires full spec sign-off + separate runtime authorization; dependency-graph dev-lane precondition; provider VLS PRIMARY category D (product policy); provider decision wording PROPOSED not settled. **Matrix semantics closure:** Provider VLS `Runtime?`/`Migration?`/`Flag?`/`Rollback` columns made conditional (MAYBE/MAYBE/MAYBE/N/A in master table; Option A vs B table) because target policy remains DECISION_REQUIRED — no Option A/B selected. |
| **WHY** | Prevent unsafe Stage-2 activation, false rollback confidence, incorrect handoff validation, and human/machine authority drift before PKG-01/02 implementation. |
| **EXPECTED_EFFECT** | Runtime agents cannot treat HANDOFF OFF as rollback while PUBLICATION ON; cannot claim per-org canary; cannot require publication rows when policy skips; PKG-01/02 remain IMPLEMENTATION_SPEC_REQUIRED until invariant settled. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 121 nodes / 108 edges / 11 invariants; main at `b3e557fdd` (advanced from `2a2fe5ac` — no Battery V2 drift on main). |
| **NON_EFFECTS** | No runtime; no flags; no deploy; no production data; gaps remain open; DEC-PH4 PROPOSED. |
| **REGRESSIONS_OR_TRADEOFFS** | Planning surface more verbose; additional spec gates before IMPLEMENTATION_READY |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` open; configuration invariant; inputVersion; assessment-track selection; publicationVersion; provider VLS product/frequency decision |
| **DECISION_STATUS** | VALIDATED (documentation only; NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 121 / 108 / 11 — `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001` summary aligned (crash-boundary + configuration-invariant blockers; unsafe HANDOFF=OFF steady state); human `KNOWLEDGE_GRAPH.md` umbrella aligned |
| **EVIDENCE** | `battery-health-v2.config.ts` (`isBatteryV2LegacyRestCaptureEnabled`), `canonical-battery-health.service.ts`, `battery-assessment.service.ts`, `battery-publication.service.ts` |

---

## CL-2026-09-01 — Phase 4 final merge-gate micro-correction

| Field | Content |
|-------|---------|
| **BEFORE** | PKG-02 implied "enqueue every persistedAssessmentId"; soak protocol conflated `lv-rest-open:*` job identity with `lv-rest:*` session identity; RUNNING shown as normal lifecycle; PUB-READINESS had unsupported PARTIAL_POST_CHANGE production evidence; publication rollback claimed append-only. |
| **OBSERVATION** | AUTO track may persist WORKSHOP_OVERRIDE + TELEMETRY; publication policy has no track ordering; REST handler `hasMeasurement` early return creates assessment handoff crash boundary; session-open job id ≠ persisted session idempotency key. |
| **HYPOTHESIS** | Final authority cleanup closes remaining factual inconsistencies before Phase-4 documentation merge. |
| **CHANGE** | PKG-02 assessment-track selection authority (DECISION_NOT_READY); REST crash boundary; Prisma model names + dual session identities in soak protocol; RUNNING as investigation-only; Production/Code evidence columns; PUB-READINESS production evidence → NONE; 13.2V vs 13.25V threshold split; periodic reconcile cadence SPEC REQUIRED; publication supersession semantics; DEC-PH4 summary; integrated latest main (`2a2fe5ac`, scaling #1490 only). |
| **WHY** | Final documentation merge gate — prevent runtime agents from implementing order-dependent multi-track publication or conflating identities. |
| **EXPECTED_EFFECT** | PKG-02 blocked on assessment-selection + publicationVersion specs; soak protocol uses verified schema terminology and correct identity separation. |
| **VALIDATION** | `bash architecture/battery-v2/scripts/validate-graph.sh` |
| **OBSERVED_EFFECT** | Validator PASS; 20 open gaps; 23 planning items; 121 nodes / 108 edges / 11 invariants; authority-cleanup consistency checks PASS; main at `2a2fe5ac` (no Battery V2 drift). |
| **NON_EFFECTS** | No runtime; no flags; no deploy; gaps remain open; DEC-PH4 PROPOSED. |
| **REGRESSIONS_OR_TRADEOFFS** | PKG-02 readiness remains IMPLEMENTATION_SPEC_REQUIRED |
| **REMAINING_GAPS** | assessment-track selection authority; publicationVersion; inputVersion; all 20 gaps open |
| **DECISION_STATUS** | VALIDATED (documentation only; NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 121 / 108 / 11 (DEC-PH4 summary text) |
| **EVIDENCE** | `battery-v2-job-idempotency.policy.ts`, `battery-v2-domain.ts`, `lv-rest-window-session-arming.service.ts`, `lv-estimated-health-assessment.policy.ts`, `battery-publication.repository.ts` |

---

## CL-2026-09-01 — Phase 4 resolution plan integrity correction

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 4 initial planning (PR #1499) had matrix accounting drift (23 rows vs "20 gaps"), combined primary categories, IMPLEMENTATION_READY overstatement for PKG-01/02, invalid `lv-assess:` identity, nonexistent producer path, publicationEligible handoff error, timestamp opening regression risk, false provenance SQL claims, invented threshold/Redis/statistical claims. |
| **OBSERVATION** | Future runtime agents could implement invalid identity contracts, regress observation-independent REST opening, or misinterpret planning priority as active production severity without correction. |
| **HYPOTHESIS** | Documentation-only correction pass can close planning defects without runtime changes while keeping 20 gaps open. |
| **CHANGE** | Corrected `resolution/` dossiers + `RESOLUTION_PRIORITY_MATRIX` (dual accounting, PRIMARY/SECONDARY categories, P0_ACTIVATION_BLOCKER, priority rationale scorecard); PKG-01/02 → IMPLEMENTATION_SPEC_REQUIRED; canonical `assess:`/`pub:` identities; publication policy authority; timestamp opening separation; provenance observability limits; HEV layering; soak statistics; liveness vs measurement dimensions; threshold PROVENANCE=UNKNOWN default; Redis RESEARCH_REQUIRED; HV SOH tie mechanism; dev vs enablement dependency graph. |
| **WHY** | Implementation-readiness must not overstate authority; Phase 4 is knowledge authority only. |
| **EXPECTED_EFFECT** | Runtime agents have explicit spec gaps instead of inventing semantics; executive docs agree on counts and readiness. |
| **VALIDATION** | `validate-graph.sh` PASS; consistency checks (20 gaps, 23 planning items, single PRIMARY per gap, P0/P1 rationale, no false SQL/provenance claims). |
| **OBSERVED_EFFECT** | Superseded by micro-correction entry above — validator PASS at integrity-correction commit `77b45df`. |
| **NON_EFFECTS** | No runtime fixes; no feature flags; no deploy; no production data; no backfill; gaps remain open; DEC-PH4 remains PROPOSED. |
| **REGRESSIONS_OR_TRADEOFFS** | Planning surface more verbose; PKG-01/02 blocked on spec sign-off |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` remain open; inputVersion and publicationVersion specs unresolved |
| **DECISION_STATUS** | VALIDATED (documentation correction only; NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 121 nodes / 108 edges / 11 invariants (DEC-PH4 summary text only) |
| **EVIDENCE** | Runtime traces: `battery-v2-job-idempotency.policy.ts`, handlers, `BatteryV2JobProducerService`, `enqueueLvAssessmentRecompute` |

---

## CL-2026-09-01 — Phase 4 open-gap resolution planning

| Field | Content |
|-------|---------|
| **BEFORE** | Phase 3 established reachability and graph-contract integrity; 20 indexed gaps remained without prioritized resolution plans, implementation packages, or experiment protocols. |
| **OBSERVATION** | Architecture sufficiently reconstructed to shift from discovery ("what exists / can execute") to planning ("what to do about gaps"). PR #1488 merged at `b8501bfd`. |
| **HYPOTHESIS** | Each open gap can be classified, prioritized, and mapped to a safe implementation or validation package without runtime changes in Phase 4. |
| **CHANGE** | Added `resolution/` dossiers (priority matrix, LV pub chain, timestamp, HEV/PHEV, HV SOH, soak protocol, lock/bridge/method/threshold); implementation packages; dependency graph; PROPOSED `BAT-V2-DEC-PH4-LV-PUB-CHAIN-001`. |
| **WHY** | Make next runtime phases mechanical and safe; prevent ad-hoc fixes without target state, rollback, and evidence plans. |
| **EXPECTED_EFFECT** | Agents and engineers can execute PKG-01/02/09 in priority order with clear dependencies; gaps remain indexed until runtime merges. |
| **VALIDATION** | `validate-graph.sh` PASS; existing battery-v2 unit tests (read-only) |
| **OBSERVED_EFFECT** | 20 gaps classified; P0/P1/P2/P3 assigned; 9 implementation/validation packages defined; validator PASS |
| **NON_EFFECTS** | No runtime fixes; no feature flags changed; no Stage 2 enabled; no publication enabled; no DB migration; no production mutation; no backfill; no deployment; no production validation observed in this pass |
| **REGRESSIONS_OR_TRADEOFFS** | Additional planning surface area; PROPOSED decisions must not be mistaken for VALIDATED runtime decisions |
| **REMAINING_GAPS** | All 20 `BAT-V2-GAP-*` remain open; 2 contradictions unresolved; 3 hypotheses open |
| **DECISION_STATUS** | VALIDATED (documentation / knowledge-authority planning only; NO runtime behavioral validation and NOT PRODUCTION_VALIDATED) |
| **AFFECTED_GRAPH** | 121 nodes / 108 edges / 11 invariants (was 120/105/11); +1 PROPOSED decision, +3 refines edges |
| **EVIDENCE** | `architecture/battery-v2/resolution/`; Phase 3 authority docs; `architecture/battery-v2/contradictions/KNOWLEDGE_GAPS.md`; runtime code traces referenced in dossiers |

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
