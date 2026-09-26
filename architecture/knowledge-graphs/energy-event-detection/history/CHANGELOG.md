# KG-EED Changelog

## 2026-09-26 — ERD E6.3 charging location enrichment runtime

- Dedicated `VehicleEnergyEventChargingStationEnrichment` + BullMQ queue `energy.recharge.station.enrich`.
- Post-projection enqueue hook; cutover on VEE `endTime`; flags default OFF; no backfill/UI.
- Evidence: `ERD-E6-3-CHARGING-LOCATION-ENRICHMENT-RUNTIME-2026-09-26.md` (EED-EV-0089).

## 2026-09-25 — ERD E6.2 charging station reference resolver

- Independent OSM charging-station dataset (`osm.charging_stations`, separate metadata lifecycle from fuel).
- Deterministic geometry-first resolver `charging-station-resolver-v1`; no VEE enrichment wiring.
- Evidence: `ERD-E6-2-CHARGING-STATION-REFERENCE-RESOLVER-2026-09-25.md` (EED-EV-0088). No Production import.

## 2026-09-25 — ERD E6.1 canonical recharge location provenance

- Native DIMO coordinates preserved on `HvChargeSession.metadata` and projected to canonical VEE (mutable fields + handoff/reconcile).
- Fallback sessions remain location-null; no fuel-station resolver reuse.
- Evidence: `ERD-E6-1-CANONICAL-RECHARGE-LOCATION-PROVENANCE-2026-09-25.md` (EED-EV-0087). No backfill.

## 2026-09-25 — ERD E5.6 write-authority cutover gate

- Single `evaluateErdRechargeWriteAuthority` resolver (LEGACY | CANONICAL only).
- Legacy RECHARGE upsert gate + canonical-row protection; canonical projection runtime wired post-HV reconcile.
- Strict cutover authorization (`true` only); prerequisite conjunction includes E5.5 read dedupe.
- Evidence: `ERD-E5-6-WRITE-AUTHORITY-CUTOVER-GATE-2026-09-25.md` (EED-EV-0086). No Production activation.

## 2026-09-25 — ERD E5.5 product-read RECHARGE dedupe

- Evidence: `evidence/ERD-E5-5-PRODUCT-READ-DEDUPE-2026-09-25.md`
- Strict product-read identity v1 (exact DIMO + coalesced lineage only); fail-open; REFUEL unchanged
- Flag `ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENABLED` default OFF; independent of E5.4 shadow
- PostgreSQL gate + boundary-repair step 12/12; no schema migration; not E5.6 cutover

## 2026-09-25 — ERD E5.4 canonical vs legacy recharge shadow parity

- Evidence: `evidence/ERD-E5-4-SHADOW-PARITY-2026-09-25.md`
- Non-mutating bidirectional parity: legacy DIMO `VehicleEnergyEvent.RECHARGE` vs pure E5.1 projection drafts from eligible `HvChargeSession`
- Diagnostic table `erd_recharge_projection_shadow_observations`; deterministic fingerprint idempotency; bounded metrics
- Flag-gated fail-open hook after `detectEnergyEvents` (`ERD_RECHARGE_SHADOW_PARITY_ENABLED`, default OFF); never calls `projectCanonicalRecharge()`
- PostgreSQL gate S1–S28 (boundary-repair step 11/11); no cutover, no product read change

## 2026-09-25 — ERD E5.3 late-native canonical VEE handoff

- Evidence: `evidence/ERD-E5-3-LATE-NATIVE-HANDOFF-2026-09-25.md`
- Consumes persisted E3 supersession evidence; reassigns `canonicalChargeSessionId` on same VEE; preserves immutable F-anchored `sourceEventKey`
- Post-handoff identity validation via anchor rebuild (not native mint key); real E3 convergence + projector PostgreSQL proof (boundary step 10/10)
- No automatic runtime triggers; physical E3 authority independent of product handoff TX

## 2026-09-25 — ERD E5.2 canonical VEE RECHARGE projector idempotency

- Evidence: `evidence/ERD-E5-2-CANONICAL-VEE-RECHARGE-PROJECTOR-IDEMPOTENCY-2026-09-25.md`
- `projectCanonicalRecharge()` under E3 vehicle advisory lock; CREATE/RECONCILE/NO_OP + bounded failures
- HANDOFF_REQUIRED boundary (E5.3); LEGACY_DIMO_COLLISION fail-closed; T1–T20 + multi-client Postgres gate (boundary step 9/9)
- No Nest wiring, no automatic triggers, no cutover

## 2026-09-24 — ERD E5.1 canonical VEE RECHARGE projection foundation

- Evidence: `evidence/ERD-E5-1-CANONICAL-VEE-RECHARGE-PROJECTION-FOUNDATION-2026-09-24.md`
- Schema: `canonicalChargeSessionId` FK (SetNull), nullable `dimoSegmentId`, `SYNQDRIVE_ERD_RECHARGE_PROJECTION` + SQL CHECK extension
- Pure eligibility + mapper policies; E3 shared-lock contract documented; PG-A…PG-K gate (boundary-repair step 8/8)
- No runtime projector, no cutover, legacy DIMO→VEE writer unchanged

## 2026-09-24 — ERD E4.2 real BullMQ + Redis liveness proof

- `erd-e4-reconciliation-liveness.bullmq.redis.integration.spec.ts`; CI job ERD E4 postgres+redis liveness
- Boundary-repair step 6 explicitly Postgres-only; Redis gate separate

## 2026-09-24 — ERD E4.1 signal authority + bounded partition fairness

- Evidence append: `evidence/ERD-E4-RECONCILIATION-LIVENESS-2026-09-24.md` (E4.1 section)
- Canonical `hv-erd-capability-signal-keys.ts`; E4 mirrors E3 fallback corroboration (`hv.charging_power`, not `hv.current_power`)
- SQL-bounded periodic selection; partition rotation; 109+ vehicle postgres fairness proof

## 2026-09-24 — ERD E4 durable reconciliation / recovery liveness

- Evidence: `evidence/ERD-E4-RECONCILIATION-LIVENESS-2026-09-24.md`
- Canonical ERD reconcile eligibility shared with E3; expanded periodic fallback selector; explicit period buckets; rotating fair batch selection; E4 liveness metrics; CI gate step 6

## 2026-09-24 — ERD E3.1 shared authority lock + fallback identity races

- Single `pg_advisory_xact_lock(hashtext(vehicleId))` for all native + fallback physical writes
- Fallback identity: persisted fingerprint/start anchor immutable; replay uses matcher-based reuse
- Postgres race matrix with independent PrismaClient A/B

## 2026-09-24 — ERD E3 telemetry fallback + native/fallback convergence

- Evidence: `evidence/ERD-E3-FALLBACK-CONVERGENCE-2026-09-24.md`
- Native-first fallback activation; physical matcher SAME/AMBIGUOUS/DIFFERENT; atomic late-native convergence TX
- E3 postgres gate step 5 in boundary-repair CI; observability `synqdrive_erd_e3_convergence_total`

## 2026-09-24 — ERD E2.1 deterministic native dedupe closure

- Total-order dedupe in `dimo-recharge-segments.dedupe.ts` (no last-writer-wins)
- Forward/reverse unit tests + postgres dedupe order proof

## 2026-09-24 — ERD E2 native recharge normalization hardening

- Evidence: `evidence/ERD-E2-NATIVE-NORMALIZATION-2026-09-24.md`
- Hardened DIMO recharge normalizer (live contract, fingerprint dedupe, extrema/boolean semantics, duration provenance)
- HV quality uses truthful extrema proxy (PARTIAL cap); legacy VEE mapper unchanged in role
- Postgres gate A–F: CI step in `test:boundary-repair:postgres`; local opt-in `ERD_E2_POSTGRES_INTEGRATION=1`

## 2026-09-24 — ERD E1 canonical physical charge authority (Model A)

- ADR: `decisions/ERD-E1-CANONICAL-PHYSICAL-CHARGE-AUTHORITY-2026-09-24.md`
- EED/ERD owns physical charge session semantics; Battery V2 role = CONSUMER; VEE RECHARGE = product projection post-cutover
- Physical identity v1, native>fallback, lifecycle, legacy VEE policy, writer inventory (no runtime change)
- Graph: `EED-DEC-ERD-001`, `EED-EV-0076`/`0077`, invariants `EED-INV-014`–`017`; `EED-OQ-004` superseded by ERD policy
- Reconciles prior Battery V2 OUT_OF_SCOPE boundary for HV sessions

## 2026-09-21 — RFRF F10.6.8-C recovered READY → promotion liveness (C1+C2)

- Recovery-owned canonical promotion after convergence when no SAME native; advisory → fresh clock → row lock → promotion
- C1: fallback VEE + `PROMOTED` + `recoveryLastOutcome=SUCCESS_PROMOTED` + lease clear in one transaction; no second `finishRecovery` after promote
- C2: EXPIRED lease vs SUPERSEDED generation stale proofs; independent `PrismaClient` stacks; additive migration `SUCCESS_PROMOTED`
- Stage 5 production posture unchanged; Stage 6 / recovery-direct G2 handoff not started

## 2026-09-19 — RFRF F10.6.6-B.2 micro-closure (canonical query + pending INSUFFICIENT)

- Canonical list query includes persisted `refuelReconciliation`; raw list remains lean
- Pending Stage-4 authority: `INSUFFICIENT_EVIDENCE` and `SAME_PHYSICAL_REFUEL` → pending; `DISTINCT` does not
- Product projection: hide conflicting dual-final / canonicalEventId mismatch groups
- Tests: service-path WOB canonical read, loader pagination/raw cap, promotion/convergence fail-closed

## 2026-09-19 — RFRF F10.6.6-B.1 micro-closure (race, bounded raw load, product reads)

- Authoritative native loader: V2-owned `refuelReconciliation=null` → `PENDING_RECONCILIATION` via `isV2OwnedRefuelEvent` + effective cutover; legacy pre-V2 null-recon preserved
- Raw native load pages with `MAX_RAW_NATIVE_REFUEL_ROWS_IN_OVERLAP_WINDOW=512`; `RAW_LOAD_INCOMPLETE` fail-closed (no silent take=33 truncation)
- Product canonical projection: `listCanonicalEnergyEvents`, trips timeline + GET `energy-events`; forensic `listEnergyEventsRaw` unchanged row retention
- Tests: authoritative resolver B.1, canonical projection WOB 3→1, detectEnergyEvents reconciliation-before-RFRF ordering

## 2026-09-19 — RFRF F10.6.0.1 micro-closure (EED-EV-0071 correction)

- Production rebaseline **accepted**: `0384adf…` → `16000fce6…` with **empty** RFRF business runtime and VDC runtime diffs; EXP-021 + RFRF tooling-only paths on `main`
- `PRODUCTION_REBASELINE_REQUIRED=NO`; resolves prior contradiction with `READY_FOR_STAGE4_AUTHORIZATION_GATE=YES`
- VDC metrics: `VDC_PILOT_SCOPE_COUNT=4` (configured JSON); `VDC_CANONICAL_ACTIVE_VEHICLE_COUNT=3`; `VDC_CONFIGURED_SCOPE_DRIFT=NO`
- CI: `rfrf-stage4-convergence-readiness` PASS, `rfrf-stage3-persistence-readiness` PASS; `i18n-authority-protection` FAIL until trusted label
- Read-only Production: 3 `raw_refuel_candidates` (SETTLING×2, INSUFFICIENT×1); blast radius **BOUNDED**; observational gates unchanged (NO)

## 2026-09-19 — RFRF F10.6.0 Stage-4 convergence readiness (tooling; no Production Stage 4)

- EED-EV-0071: Stage-4 enable/recovery/rollback fixture closure (recovery target Stage 3); Production read-only rebaseline on release `20260918232713_v4994` / SHA `16000fce6…` (drift vs EED-EV-0070); RFRF still Stage 3 with cutover unchanged; Stage-4 dry-run 3→4 zero mutation on VPS; wrong-source rollback from stage 4 blocked; EXP-021 nonterminal ledger 0; VDC canonical epoch 107/107; candidates 0; observational readiness NO (epistemic P2); CI workflow for F5-PR1 + F9 + P20 promotion boundary
- `STAGE_4_EXECUTED=NO`; `STAGE_4_START_AUTHORIZED=NO`; `READY_FOR_STAGE4_AUTHORIZATION_GATE=YES` (structural)

## 2026-09-19 — RFRF F10.5.2 Stage-3 Production execution (evidence landing)

- EED-EV-0070: authorized Production Stage 2→3; `RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED=true`; convergence/promotion/G2 false; cutover `2026-09-18T10:25:41.000Z` unchanged; runtime SHA `0384adf12bbb1407eb8e291726d3dac60323b8b6` / release `20260918174845_v4994`; tooling `5860b125f7f6bf3cd0077cfa8a1253c13be341ba` from isolated `/tmp/rfrf-f1051-tooling` (no application deploy); rolling restart A then B; TX committed; recovery to Stage 2 armed but not invoked; EXP-021 canary terminal before execution + immediate survival PASS; fleet coordinator natural-tick log proof OBSERVABILITY_LIMITED at evidence landing; VDC LEGACY / 4 scopes / T0 unchanged; canonical epoch obs/blockers 107/107 (monotonic vs F10.5.1); candidates 0, fallback VEE 0
- `STAGE_3_EXECUTION_ACCEPTED=YES`; `STAGE3_AUTHORITY_TRANSITION_PROVEN=YES`; `REAL_RAW_RISE_POSITIVE_PATH_PROVEN_UNDER_STAGE3=NO`; `STAGE_4_START_AUTHORIZED=NO`
- F10.5.3 evidence PR: governance/docs only on `main` @ `16000fce6…` (#1692 EXP-021 code only; Production runtime unchanged)

## 2026-09-18 — RFRF F10.5.0.1 Stage-3 readiness micro-closure

- EED-EV-0069 extended: Production rebaseline **accepted** (post-#1689 deploy); exact canonical VDC **85/85** (4 pilot scopes, T0 unchanged); EXP-021 canary env armed; observational readiness NO retained as epistemic note only; CI workflow for isolated F3/F4/F9 PG+Redis gates; PR #1691 CI 28/28 green at F10.5.0 land

## 2026-09-18 — RFRF F10.5.0 Stage-3 persistence readiness (tooling)

- EED-EV-0069: Stage-3 enable/recovery/rollback fixture closure (failure recovery → Stage 2, not Stage 1); authority matrix proves persist without VEE/convergence/promotion/G2; Production read-only audit found deploy drift to release `20260918174845_v4994` / SHA `0384adf12bbb1407eb8e291726d3dac60323b8b6`; RFRF still Stage 2 with unchanged cutover; candidates 0; REAL_RAW_RISE under Stage 2 not proven; Stage 3 not executed; `PRODUCTION_REBASELINE_REQUIRED=YES`

## 2026-09-18 — RFRF F10.4.2 Stage-2 Production execution (evidence landing)

- EED-EV-0068: authorized Production Stage 1→2 completed; `RAW_FUEL_REFUEL_FALLBACK_ENABLED=true`; persist/convergence/promotion/G2 remained OFF; cutover `2026-09-18T10:25:41.000Z` unchanged; runtime SHA `ca7bad8826871376a58efaa874f12992b88c4a04` / release `20260918085306_v4994`; tooling `b73d5cb2a81c7920691b8ab544909ab3a3666d70` executed from isolated `/tmp/rfrf-f1042-tooling` ops bundle (no application deploy); rolling restart A then B; EXP-021 immediate + final natural-tick survival (initial orchestrator poll OBSERVE_INCOMPLETE, leader log ≥4 dry-run observations); VDC LEGACY / 4 scopes / pilot T0 unchanged; shadow obs 73; canonical epoch obs/blockers 67/67 pre-existing; candidates 0, fallback VEE 0
- `STAGE_2_EXECUTION_ACCEPTED=YES`; `REAL_RAW_RISE_OBSERVED_UNDER_STAGE2=NOT_PROVEN`; `STAGE_3_START_AUTHORIZED=NO`
- F10.4.3 documents Production release worktree untracked ops/upload paths (not cleaned); Stage 2 did not change release symlink
- RUNTIME_SEMANTICS_CHANGED=NO in this evidence PR (governance/docs only)

## 2026-09-18 — RFRF F10.4.0 Stage-2 transaction / recovery safety (tooling)

- EED-EV-0067: generic `rfrf_stage_transaction_run` for stages 1–6; Stage-2 failure recovery restores Stage 1; cutover immutability on Stage-2 enable; production-grade `--from-stage 2` rollback; fixture tests + master-only runtime authority matrix; Stage 2 not executed; Production remains Stage 1 / `ca7bad…`
- EED-EV-0067 (F10.4.0.1 micro-closure): dry-run byte-identical proof; rollback dry-run source-stage verify; rollback fail-closed convergence; exact PRE-stage gate before mutation
- EED-EV-0067 (F10.4.0.2): rollback recovery-of-recovery fail-closed; rollback signal traps; stage-verify injection test; production dry-run exact SHA authority
- EED-EV-0067 (F10.4.0.3): mutation may-have-started boundary; verified PM2/port stop; single authority evidence block; strict Linux CI signal tests

## 2026-09-18 — RFRF F10.3.2 Stage-1 Production execution (evidence landing)

- EED-EV-0066: authorized Production Stage 0→1 completed; `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT=2026-09-18T10:25:41.000Z`; all RFRF boolean authorities remained OFF; runtime SHA `ca7bad8826871376a58efaa874f12992b88c4a04` / release `20260918085306_v4994` preserved; rolling restart A then B; EXP-021 immediate + post-restart 4-tick survival (7 natural ticks, follower 0); VDC LEGACY / 4 scopes / pilot T0 unchanged; shadow obs 6→6, new-epoch blockers 0; candidates 0, fallback VEE 0
- `STAGE1_EXECUTION_ACCEPTED=YES`; `STAGE_2_START_AUTHORIZED=NO`; `STAGE2_BOUNDARY_AUDIT_REQUIRED=YES` (48s cutover-to-mutation interval — non-blocking Stage-2 prerequisite)
- Does **not** prove VDC seven-day window completion or Stage 2 readiness
- RUNTIME_SEMANTICS_CHANGED=NO in this evidence PR (governance/docs only)

## 2026-09-18 — RFRF F10.3.0 Stage-1 restart safety micro-closure

- EED-EV-0065: F10.2 complete → Stage 1 planning; failure window (env mutated before restart, no auto-recovery, partial replica env possible); automatic backup restore + dual-replica restart recovery; live-required preflight before enable; SHA256 backup integrity; failure-injection tests; EXP-021/VDC post-restart survival contracts documented
- Stage 1 **not executed**; `STAGE_1_START_AUTHORIZED=NO`; production remains `3a2707b`
- RUNTIME_SEMANTICS_CHANGED=NO

## 2026-09-18 — RFRF F10.2 final closure (tooling-only live preflight)

- EED-EV-0064 extended: #1680 merged @ ca0aa0f; isolated tooling checkout executed live preflight against unchanged production 3a2707b; `RFRF_PRODUCTION_PREFLIGHT=PASS` exit 0; METRICS_*_RFRF=YES both replicas; 10/10 real probe stability; cross-workstream preservation PASS; no deploy/mutation
- `RFRF_F10_2_FINAL_CLOSURE=PASS`; `STAGE_1_START_AUTHORIZED=NO`
- Operator note: use `sudo` with explicit env vars, not `sudo -E` (PM2_HOME false-negative)

## 2026-09-17 — RFRF F10.2.2 metrics probe SIGPIPE/pipefail micro-closure

- EED-EV-0064 extended: F10.2 cross-workstream preservation gate PASS on production `3a2707b`; F10.2 blocked only by `rfrf_metrics_probe()` false-negative (`echo|grep -q` + pipefail SIGPIPE 141 on large payloads)
- Fix: `rfrf_metrics_body_has_metric()` — HELP/TYPE here-string grep + line-prefix series scan; large-payload regression + mocked probe fixture tests; F10 pipefail risk 2→0
- Post-merge retry: run fixed tooling checkout against unchanged `/opt/synqdrive/current` with `RFRF_REQUIRED_GIT_SHA=3a2707b`; no application redeploy
- RUNTIME_SEMANTICS_CHANGED=NO; production not mutated

## 2026-09-16 — RFRF F10.2.1.1 worker readiness + deploy SHA micro-closure

- EED-EV-0064 extended: fix worker readiness gate (Node argv + exit status, not pipeline PORT / stdout capture); deploy/preflight required SHA is `<FINAL_F10_2_1_HOTFIX_HEAD>` not hotfix base; worker readiness contract tests + deploy SHA contract tests
- RUNTIME_SEMANTICS_CHANGED=NO; production not mutated

## 2026-09-16 — RFRF F10.2.1 preflight dotenv safety micro-closure

- EED-EV-0064: safe key-scoped dotenv reads for RFRF F10 ops scripts; remove `source backend.env`; preflight `--live-required`; readiness PORT diagnostic fix; fixture tests for literal `$share` / command substitution; hotfix base `295635fc`
- RUNTIME_SEMANTICS_CHANGED=NO; production not mutated in F10.2.1

## 2026-09-15 — RFRF F10.1.1 mergeability + operational safety micro-closure

- EED-EV-0063 extended: PR ancestry reconciliation; Stage 1 proposed-cutover gate; explicit deploy SHA authority; monitoring apply fail-closed contract; live Prometheus gates; blast-radius fail-closed; expanded Stage 6 prerequisites; script-level fixture contract tests
- RUNTIME_SEMANTICS_CHANGED=NO; production not mutated

## 2026-09-15 — RFRF F10.1 operational production rollout closure

- EED-EV-0063: operator runbook, read-only preflight, staged enablement + rollback tooling, blast-radius assessment, F8 alert verify/sync, dual-replica Prometheus scrape config
- RUNTIME_SEMANTICS_CHANGED=NO; production not mutated; Stage 5/6 blocked until observability topology complete + alerts loaded

## 2026-09-15 — RFRF F9 independent-replica integration closure

- EED-EV-0062: independent PrismaClient A/B + promotion/G2 runtime stacks prove DB lock authority across process boundaries
- Net-new F9-P1..P6 + P10 real PG (+ Redis for P6); F9 gate orchestrates F7 multi-replica 3/3, F5-PR2, F5-PR3.1, F6, F7, F8, G2 Jest, metrics — no runtime/schema change

## 2026-09-15 — RFRF F8.2 bounded lost_enqueue metric query + final regression closure

- EED-EV-0061 extended: lost_enqueue actionable count uses PostgreSQL COUNT with isfinite/source/enrichment/authority predicates (no unbounded findMany)
- G2.1b/c/d Jest recovery semantic suite executed on final head; main synced with EXP-021 evidence-only delta (#1659)

## 2026-09-15 — RFRF F8.1 scheduler zero-success + actionable backlog closure

- EED-EV-0061 extended: F8.1 closes scheduler stale blind spot before first success and actionable backlog parity for all six exported reasons
- `onModuleInit()` publishes `recovery_enabled` + initializes `last_success_unixtime=0`; stale alert accepts zero-success after `for: 5m`
- `countActionablePhysicalRefuelRecoveryReasons()` shared with canonical recovery where builders; inventory counts preserved

## 2026-09-15 — RFRF F8 operational telemetry + Prometheus alerting closure

- EED-EV-0061: `PhysicalRefuelReconciliationMetricsService` on canonical TripMetricsService registry
- Recovery backlog gauges from `countPhysicalRefuelRecoveryBacklog()` with explicit zero reset; scheduler-owned run metrics
- Physical-refuel alert group in `backend/monitoring/prometheus/alerts.yml`; F8-P1..P10 real PG gate (16/16)
- No second metrics stack; RFRF G2 handoff counters unchanged; no recovery science changes

## 2026-09-15 — RFRF F7.1 pre-merge micro-closure

- EED-EV-0060 extended: F4-PR3/PR2 + F3→F2 regressions executed on final head; real multi-replica PG+Redis 3/3 (0 skips)
- F7-P8 strengthened to RECOVERY → COMPLETED enrichment → LATE NATIVE SAME (F5-P21 A2 semantics)
- F7-P3/F7-P7 strong persistent idempotency assertions; prior F7_COMPLETE=YES implication corrected

## 2026-09-15 — RFRF F7 recovery completeness + post-commit crash-window closure

- EED-EV-0060: canonical production owner is existing `PhysicalRefuelReconciliationRecoveryScheduler` (G2.1a) — no second recovery stack
- Post-commit crash window (TRANSACTION A committed, G2 handoff omitted/thrown) recoverable via `orphan_refuel` + `runRecoveryBatch()`
- Minimal scheduler hardening: tick errors logged, do not kill future intervals
- Real PG gate F7-P1..P12 + scheduler lifecycle P10 (18/18); F5-PR3 P17 regression-certified for BullMQ deferred enqueue
- G2.1b/G2.1c/G2.1d test mocks aligned for F5-PR3 recovery authority `findUnique` filter
- Candidate-level pre-PROMOTED retry explicitly out of F7 scope

## 2026-09-15 — RFRF F6.1 pre-merge main sync + R16 stale mock closure

- Merged `origin/main` @ `fda8a218` (VDC #1652); ChangesView preserves both F6 + VDC entries
- R16 pre-existing on F6 base `4f21c0c` and F6 head `ee6cd3642` — identical `findUnique` harness gap
- Test-only fix: outer Prisma mock exposes `vehicleEnergyEvent.findUnique` via existing `findEnergyEvent`
- G2 unit regression 58/58; F6 recertification unchanged; EED-EV-0059 extended (no new evidence ID)

## 2026-09-15 — RFRF F6 canonical G2 rawDetectionMeta payload compatibility

- EED-EV-0059: `buildFallbackRawDetectionMeta` single owner; canonical fuelStart/fuelEnd liters+percent on promoted fallback VEE
- RFRF provenance fields preserved; pre/post aliases aligned and non-divergent
- Real PG gate F6-P1..P10 (11/11); no schema migration; no G2 mapper special-case
- F1 stationary-dwell metadata requirement superseded by G2 coordinate runtime; not fabricated
- `detectionMechanism=raw_fuel_fallback` retained (historical F1 `synqdrive_raw_fuel_fallback` differs; no runtime consumer dependency)
- Production untouched; all RFRF execution authorities default OFF

## 2026-09-14 — RFRF F5-PR3 post-commit G2 handoff

- EED-EV-0058: F5-PR3.1 micro-closure — real runtime late-native A1/A2/A3; required Redis P17/P19; prior-bridge fix for L8/L9; 30/30 PG+Redis gate
- Post-commit `RawRefuelG2HandoffService` bridge into existing G2 reconciliation; TRANSACTION A unchanged
- G2 participation policy + recovery orphan filter close fallback authority bypasses
- Real PG gate 30/30 (P1–P29); late-native policy proofs via G2 design + PG rows (EED-DEC-RFRF-010)
- Production untouched; all RFRF execution authorities default OFF

## 2026-09-14 — RFRF F5-PR2.1 pre-merge micro-closure

- EED-EV-0057: authority conjunction; real candidate FOR UPDATE; metric single ownership; thrown promotion isolation
- Real PG gate extended P24–P29 (29/29); F5-PR3 not started; production untouched

## 2026-09-14 — RFRF F5-PR2 atomic promotion transaction

- EED-EV-0056: TRANSACTION A atomic fallback VehicleEnergyEvent + PROMOTED lifecycle
- `RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED` separate from convergence/persist/master flags
- `RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT` enforced on physical evidence end
- Real PG gate 23/23 (P1–P21 + KS MS 661 synthetic lifecycle); detectEnergyEvents runtime E2E
- Zero G2/BullMQ/enrichment reachability; F5-PR3 not started; production untouched

**Verdict:** RFRF_F5_PR2=PASS (pending CI on final HEAD)

---

## 2026-09-14 — RFRF F5-PR1.2 final main sync / #1642 DI survival

- Merged `origin/main` @ `d7a9f7a21` (#1642 Nest DI boot fix + #1640 VDC) into PR #1643
- Conflict resolution: preserve #1642 `configLoader` off Nest ctor surface + F5 `convergenceService` wiring
- Post-sync HEAD gate re-run: DI bootstrap, F5 PG 19/19, F4/F3/F2 regressions; zero production mutation
- Evidence EED-EV-0055 (#1642 DI fix renumbered); F5-PR1.2 sync proof in audit §9

**Verdict:** RFRF_F5_PR1_2_FINAL_MAIN_SYNC=PASS (pending CI on post-sync HEAD)

---

## 2026-09-14 — RFRF runtime Nest DI boot blocker (deploy gate)

- Production deploy of `main` @ `c81629ee4` (contains Trip FSM #1635) **aborted at boot-check**: `RawFuelRefuelFallbackRuntimeService` argument at index `[4]` (`Function` config loader) unresolved in `VehicleIntelligenceModule`
- **Root cause:** TypeScript default parameter on a function-typed constructor arg is still a Nest DI dependency; no `@Optional()` / inject token
- **Fix:** Move `loadRawFuelRefuelFallbackConfig` off the injectable constructor surface; retain `withConfigLoader()` for tests
- **Regression:** `raw-fuel-refuel-fallback-runtime.di.spec.ts` + `SYNQDRIVE_BOOT_CHECK=1` module graph proof
- **RFRF semantics unchanged:** flags default off; F5 gate stub unchanged; no VEE upsert path opened
- Migrations applied during failed deploy (`device_connection_physical_state_p21_durability`, `rfrf_f4_pr1_vehicle_energy_event_source_identity`) audited additive/backward-compatible vs running prod SHA `9a32685d…`
- Evidence EED-EV-0055 (boot DI fix on main #1642; distinct from EED-EV-0052 F5.0 policy and EED-EV-0053 F5-PR1); production **not** promoted

**Verdict:** RFRF_BOOT_DI_FIX=PASS — redeploy blocked until merge; Trip FSM #1635 unchanged

---

## 2026-09-14 — RFRF F5-PR1.1 micro-closure

- EED-EV-0054: bounded native sibling overflow fail-closed; strict F5 authority reader; metrics single ownership; true automatic runtime PG E2E
- Real PG gate 19/19; no schema change; F5-PR2 not started

**Verdict:** RFRF_F5_PR1_1_MICRO_CLOSURE=PASS

---

## 2026-09-14 — RFRF F5-PR1 authoritative convergence

- EED-EV-0053: CONVERGED_NATIVE lifecycle; G2 authoritative pre-promotion wrapper; fail-closed config reader
- Real PG gate `rfrf-f5-pr1-authoritative-convergence-gate.sh`; zero fallback VEE; PROMOTED unreachable
- Implements EED-DEC-RFRF-009 matrix subset (T4/T6/T8–T10 + extras); F5-PR2 not started

**Verdict:** RFRF_F5_PR1=PASS (integration proven; not production)

---

## 2026-09-14 — RFRF F5.0b authority consistency

- EED-DEC-RFRF-010 Consequences: late-native PG test scope corrected L1–L8 → L1–L11
- Audit: explicit `LATE_NATIVE_POLICY_SCOPE = L1–L11`; stale current-authority L1–L8 references = 0

**Verdict:** RFRF_F5_0B_AUTHORITY_CONSISTENCY=PASS

---

## 2026-09-14 — RFRF F5.0a policy micro-closure

- F5.0a on PR #1641: exact-head SHA terminology (`F5_0_BASE_MAIN_SHA` / `STARTING_HEAD` / `FINAL_HEAD`)
- Late-native post-enrichment: COMPLETED_ENRICHMENT_OWNERSHIP_IS_STICKY=YES; L4/L8/L9/L10/L11 deterministic
- Transaction boundary: TRANSACTION A (VEE+PROMOTED) vs post-commit G2/BullMQ; removed impossible C2 split
- SOURCE_EVENT_KEY_SCOPE=VEHICLE_GLOBAL; SYNTHETIC_ID_COLLISION_BEHAVIOR=FAIL_CLOSED
- EED-EV-0052 summary updated; EED-DEC-RFRF-010 expanded; POLICY_DEFINED only

**Verdict:** RFRF_F5_0A_POLICY_MICRO_CLOSURE=PASS

---

## 2026-09-14 — RFRF F5.0 convergence architecture + policy closure

- Policy closure on main@c81629ee (PR #1639 merge); no post-merge delta
- Closes three F5 entry blockers: synthetic dimoSegmentId, authoritative convergence matrix, late-native policy
- Decisions EED-DEC-RFRF-008 (NAMESPACED_SYNTHETIC), 009 (convergence matrix), 010 (late-native)
- Evidence EED-EV-0052; F5_STARTED=YES; F5_PR1_START_AUTHORIZED=YES; zero fallback VEE in F5.0

**Verdict:** RFRF_F5_0_CONVERGENCE_POLICY_CLOSURE=PASS — F5-PR1 authorized; promotion still unreachable

---

## 2026-09-14 — RFRF F4-PR4 final F4 implementation closure

- Independent exact-main integration audit on `22e0dd251` (PR #1637 merge)
- F4-PR1 through F4-PR3.1 verified; call-graph stops before VEE/PROMOTED/G2/BullMQ
- Real PG: 50 PR3 + 41 PR2 + 6 F3-F2 + F4-PR1 migration SQL — all PASS
- 212 targeted unit regressions PASS; zero F4 P0/P1 blockers
- Evidence EED-EV-0051; F4_IMPLEMENTATION_COMPLETE=YES; F5_START_AUTHORIZED=YES; F5 not started

**Verdict:** RFRF_F4_PR4_FINAL_CLOSURE=PASS — F5 entry authorized; production untouched

---

## 2026-09-14 — RFRF F4-PR3.1 SAME+INSUFFICIENT advisory fail-closed micro-closure

- `classifyRawRefuelNativeOverlapAdvisory`: one SAME + any INSUFFICIENT → `INSUFFICIENT_EVIDENCE` (not clean SAME)
- Foreign-vehicle-only rows → `NO_NATIVE_SIBLINGS` after vehicle filter
- Unit matrix A–I; real PG scenarios S/T; promotion eligibility remains fail-closed
- Blocker taxonomy: `KNOWN_P1_F4_PR3_BLOCKERS=0`; `KNOWN_P1_F5_ENTRY_BLOCKERS=3`
- Evidence EED-EV-0050; F5 not started

**Verdict:** RFRF_F4_PR3_1=PASS — F4_PR4 after PR #1637 merge; F5 not started

---

## 2026-09-13 — RFRF F4-PR3 ready evaluator + promotion eligibility + F5 gate stub

- `RawRefuelPromotionPreparationService` after F2 persist: readiness, eligibility, advisory overlap, draft
- F5 gate stub: `isRfrfNativeFallbackConvergenceAuthorized()` and `canCreateFallbackVehicleEnergyEvent()` always false
- Extended `synqdrive_rfrf_*` metrics for readiness/eligibility/overlap/F5-blocked
- Real PG gate 48/48 PASS; F3/F2 tolerance integration PASS; zero fallback VEE
- Evidence EED-EV-0049; F5 not started

**Verdict:** RFRF_F4_PR3=PASS — F4_PR4_CLOSURE_START_AUTHORIZED_AFTER_MERGE=YES; F5 not started

---

## 2026-09-13 — RFRF F4-PR2.1 micro-closure (typed fetch + observability + PG gate)

- `fetchFuelLevelSamplesWithOutcome()` distinguishes SUCCESS empty vs ERROR (AUTH_UNAVAILABLE / PROVIDER_QUERY_FAILED)
- Legacy `fetchFuelLevelSamples()` delegates; compatibility preserved
- Full minimum dark metrics contract (`synqdrive_rfrf_*` dedicated counters)
- PG gate: removed silent `|| true` on db push; explicit TEST_SCHEMA_BOOTSTRAP_MODE + localhost isolation checks

**Verdict:** RFRF_F4_PR2_1_MICRO_CLOSURE=PASS

---

## 2026-09-13 — RFRF F4-PR2 dark raw-fuel runtime wiring

- Parallel dark branch wired into `detectEnergyEvents()` after native path completes
- `RawFuelRefuelFallbackRuntimeService`: capability → fetch → F4.1 trust → F3 → F2 persist
- Fail-isolated from native DIMO path; flags default OFF; persist never authorizes VEE
- Dark metrics: `synqdrive_rfrf_*` counters
- Real PG gate 41/41 PASS (F4-PR2 + F2 + F3→F2 handoff); KS MS 661 runtime one candidate zero VEE
- Evidence EED-EV-0048; F4_FALLBACK_VEE_UPSERT_REACHABLE=NO; F5 not started

**Verdict:** RFRF_F4_PR2=PASS — F4_PR3_START_AUTHORIZED=YES (after merge review)

---

## 2026-09-13 — RFRF F4.1 signal trust × F3 detection boundary closure

- Cross-contract P1 closed: F3 channel selector used promotion `absoluteSignalTrust=TRUSTED`; runtime resolver returns UNKNOWN
- Option B: `absoluteDetectionAdmissibility` separate from promotion trust; F3 uses ADMISSIBLE for absolute primary channel
- KS MS 661 observed absolute-only +24 L stages candidate under runtime trust; promotion remains fail-closed
- Test epistemics: runtime-faithful vs physics contexts; F4.1 negative safety matrix
- Evidence EED-EV-0047; decision EED-DEC-RFRF-007 PROPOSED
- No detectEnergyEvents wiring; F4-PR2 not started

**Verdict:** RFRF_F4_1_SIGNAL_TRUST_CLOSURE=PASS — F4_PR2_START_AUTHORIZED=YES

---

## 2026-09-13 — RFRF F4-PR1.1 source-identity CHECK hardening

- `vehicle_energy_events_source_identity_check` with IS NOT NULL guards (PostgreSQL CHECK NULL-pass semantics)
- Extended PG proof A–H; empty-chain epistemics corrected to FAIL_PRE_EXISTING
- Signal trust tautology removed; VEE DTO test fixtures aligned

**Verdict:** RFRF_F4_PR1_1=PASS — on PR #1630 head

---

- Evidence EED-EV-0046: VehicleEnergyEvent detectionSource/sourceEventKey schema+migration; fail-closed flag reader; RawFuelCapabilityResolver + RawFuelSignalTrustResolver; isolated PG migration proof; F2/F3 regression PASS
- EED-DEC-RFRF-006 promoted PROPOSED → VALIDATED (PR #1628 merge approval)
- No detectEnergyEvents raw wiring; F4_VEE_UPSERT_REACHABLE=NO; F4-PR2 not started

**Verdict:** RFRF_F4_PR1=PASS — F4-PR2_START_AUTHORIZED=YES (after merge review)

---

## 2026-09-13 — RFRF F4.0 final scope hardening (PR #1628)

- Expanded EED-DEC-RFRF-006: flag truth table; fuelCapability vs absoluteSignalTrust split; RawRefuelPromotionEligibility orthogonal to F2 lifecycle; advisory-only native overlap in F4; detectionSource NULL legacy semantics; sourceEventKey canonical identity; F2/F3 tolerance hard gate; blocker reclassification
- F4.0 micro-closure: §20 F5-PR1 persist-flag contradiction resolved; §7 raw-branch isolation clarified
- Evidence EED-EV-0045 updated; no runtime code

**Verdict:** RFRF_F4_0_SCOPE_HARDENING=PASS — PR_1628_READY_FOR_FINAL_REVIEW=YES; F4_IMPLEMENTATION_START_READY=YES; PR remains draft

---

## 2026-09-13 — RFRF F4 scope + runtime boundary (pre-implementation)

- Scope audit resolves F1/F2/F3 phase-boundary contradiction: F4 Option B (dark runtime through candidate staging; promotion execution blocked until F5)
- `detectEnergyEvents` parallel path design; WINDOW_LEVEL_NATIVE_SUPPRESSION forbidden; no new scheduler
- Capability gate case 22 scope; minimum F4 diagnostics; duplicate safety matrix (10 scenarios)
- Decision `EED-DEC-RFRF-006`; evidence `EED-EV-0045`
- F4_SCOPE_DEFINED=YES; F4_IMPLEMENTATION_NOT_STARTED=YES; no runtime code

**Verdict:** RFRF_F4_SCOPE_DEFINED=PASS — F4_IMPLEMENTATION_START_READY=YES (pending human review)

---

## 2026-09-12 — RFRF F3.2 final semantic closure

- provisionalPostContinuationGraceMs separate from riseMaxDurationMs; finalized post = event boundary
- TRUSTED absolute sparse → relative fallback; non-finite sample policy documented
- 21 negative behavioral cases; case 22 deferred to F4
- Real isolated PG F3→F2 handoff 4/4 PASS
- F4_START_AUTHORIZED=NO until main sync + merge review

**Verdict:** RFRF_F3_2_FINAL_SEMANTIC_CLOSURE=PASS

---

## 2026-09-12 — RFRF F3.1 detector hardening

- Strict plateau final-median invariant; single-step provider rises; stepped-refuel coalescence
- Local post plateau; wobble fail-closed; `rawRiseWithoutNativeSegmentTotal=null`
- 50 unit tests; 4 F2 handoff PG proofs (opt-in)
- Evidence `EED-EV-0044` updated; F4_START_AUTHORIZED=YES

**Verdict:** RFRF_F3_1_HARDENING=PASS

---

## 2026-09-12 — RFRF F3 raw fuel rise detector

- Pure STABLE_PRE→RISING→STABLE_POST detector; unit isolation; primary channel authority
- KS MS 661 observed material rise detected; synthetic READY_FOR_PERSIST
- Evidence `EED-EV-0044`; 27 unit tests + F2 test-only handoff PG proof
- No production wiring; F4_START_AUTHORIZED=YES

**Verdict:** RFRF_F3=PASS — detector algorithm complete

---

## 2026-09-12 — RFRF F2.2a final merge closure (PR #1620)

- Rediscovery window: evidence timestamps only anchor min/max; `serviceNow` fallback when no evidence exists
- Delayed telemetry unit cases (24h, 6d) prove evidence-local ±6h bounds
- Migration proof: hard post-schema assertions (indexes by name, FKs, pre-F2 sentinels, zero seed rows)
- Evidence `EED-EV-0043` updated; 25 unit + 19 isolated PostgreSQL integration tests PASS

**Verdict:** RFRF_F2_2A_FINAL_MERGE_CLOSURE=PASS — PR_1620_READY_TO_MERGE=YES; F3_START_AUTHORIZED=YES

---

## 2026-09-12 — RFRF F2.2 final closure (PR #1620)

- Corrected PostgreSQL epistemic labels: separated F2 migration SQL proof, schema proof, integration tests, and full historical chain (`FAIL_PRE_EXISTING`)
- F2 migration SQL proof via `prove-rfrf-f2-migration-sql.sh` on pre-F2 baseline (`503416c82`)
- Historical chain defect recorded: `20260413230000_add_composite_indexes_batch_c` (`CREATE INDEX CONCURRENTLY` in Prisma transaction)
- Nest DI: `@Injectable()` `RawRefuelCandidateService` with `PrismaService` only; static test clock helpers
- Bounded rediscovery: 6-hour lookback window; SAME+INSUFFICIENT fail-closed ambiguity policy
- Evidence `EED-EV-0043` updated; 21 unit + 19 isolated PostgreSQL integration tests PASS

**Verdict:** RFRF_F2_2_FINAL_CLOSURE=PASS — PR_1620_READY_TO_MERGE=YES; F3_START_AUTHORIZED=YES

---

## 2026-09-12 — RFRF F2.1 candidate persistence hardening

- F2.1 hardening on PR #1620: service-owned clocks, org/vehicle integrity, nullable identity key,
  terminal rediscovery, lifecycle fail-closed, merged fingerprint, promotion time mapping fix
- VehicleEnergyEvent `detection_source` / `source_event_key` deferred from F2 migration to F4
- Evidence `EED-EV-0043` updated; 18 unit + 17 isolated PostgreSQL integration tests PASS
- Full historical `prisma migrate deploy` blocked by pre-F2 `CREATE INDEX CONCURRENTLY` migration;
  F2 schema verified via `prisma db push` on isolated localhost:5433 test database

**Verdict:** RFRF_F2_1_HARDENING=PASS — IMPLEMENTATION_IDEMPOTENCY_PROOF=PASS; F3_START_AUTHORIZED=YES

---

## 2026-09-12 — RFRF F2 candidate persistence

- Added `docs/audits/eed-rfrf-f2-candidate-persistence-2026-09-12.md`
- Evidence `EED-EV-0043`; updated `EED-DEC-RFRF-005` with F2 implementation proof (idempotency PARTIAL)
- `raw_refuel_candidates` schema+migration; `RawRefuelCandidateService` semantic rediscovery under `pg_advisory_xact_lock64`
- Promotion contract design only; no detector wiring; flags remain OFF; KS MS 661 not detected by F2

**Verdict:** RFRF_F2_CANDIDATE_PERSISTENCE=PASS — F2_IMPLEMENTATION_COMPLETE=YES; F3_START_AUTHORIZED=YES; FALLBACK_RUNTIME_READY=NO

---

## 2026-09-12 — RFRF F1.2 final architecture closure

- F1.1 addendum §14: semantic candidate rediscovery; four-way identity separation
- F2 readiness decoupled: `F2_START_AUTHORIZED=YES`; `F2_IMPLEMENTATION_COMPLETE=NO`
- EED-OQ-013 remains RESOLVED (design); `IMPLEMENTATION_PROOF_PENDING` F2/F5
- `dimoSegmentId` compatibility ownership: F2 schema/promotion; F5 G2 proof

**Verdict:** RFRF_F1_FINAL_CLOSURE=PASS — PR #1619 merge authorized (architecture/fixtures only)

---

## 2026-09-12 — RFRF F1.1 architecture hardening

- Added `docs/audits/eed-rfrf-f1-1-hardening-2026-09-12.md` (pre-F2 closure addendum)
- Evidence `EED-EV-0042`; decision `EED-DEC-RFRF-005` (Option D; supersedes Option C / EED-DEC-RFRF-002)
- Closed `EED-OQ-013` at design level (identity = candidateIdentityKey + G2 matcher)
- KS MS 661 fixture split: observed vs synthetic; production IDs removed from executable fixtures
- FST cross-ref `FST-EVID-RFRF-F1-1-2026-09-12-001`

**Verdict:** F1.1 PASS — F2_IMPLEMENTATION_READY=NO (Option D schema + dimoSegmentId compatibility proof)

---

## 2026-09-12 — RFRF F1 architecture discovery

- Added `docs/audits/eed-rfrf-f1-architecture-2026-09-12.md` (design-only raw-fuel fallback contract)
- Evidence `EED-EV-0041`; decisions `EED-DEC-RFRF-001` … `EED-DEC-RFRF-004`; open question `EED-OQ-014`
- Motivated by production incident `EED-EV-0040` (KS MS 661)
- KS MS 661 offline positive fixture for F3 detector tests
- FST cross-ref `FST-EVID-RFRF-F1-2026-09-12-001`

**Verdict:** F1 complete — F2 blocked pending F1.1 hardening (see F1.1 addendum)

---

## 2026-09-01 — Phase 2B.2 final authority closure

- Merged `origin/main` @ `814a7e009` (P1.8.3.1 scaling #1487) — no EED runtime delta
- `status` / `authority_state` → `APPROVED_FOR_CANONICAL_MERGE` (pre-merge)
- Severity register corrected (P0=0, P1=4, P2=5, P3=1, total 10)
- Added `architecture/KG_EED_FINAL_AUTHORITY_CLOSURE_2026-09-01.md`
- Validator: lifecycle + closure artifact gates

**Verdict:** READY_TO_MERGE (human merge pending)

---

## 2026-09-01 — Phase 2B.1 independent authority review

**Reviewer:** adversarial gate (not implementation agent)  
**Pre-review SHA:** `cc2ff60f01d0499aaa9078ad77f601ef98696bd3`  
**Artifact:** `architecture/KG_EED_INDEPENDENT_AUTHORITY_REVIEW_2026-09-01.md`

### Corrections

- Added `authority_review` gate to `GRAPH.yaml`
- Split KS MX provenance: `EED-EV-0018` (fixture/TEST) + `EED-EV-0025` (production/P1.3-S6)
- Downgraded epistemic inflation on EED-EV-0016/0019/0021/0022 and `EED-EXT-003`
- Added `EED-ST-001` (current scheduler coupling fact), `EED-FB-001` (optional inject skip), `EED-COMP-008` (fuel station enqueue)
- Strengthened `validate-graph.mjs` with epistemic and authority-gate checks
- Corrected open-question accounting in `OPEN_QUESTIONS.md`

### Verdict

`APPROVE_WITH_DOCUMENTED_OPEN_QUESTIONS` — ready for human merge review

---

## 2026-09-01 — Phase 2B canonicalization (initial)

**Base SHA:** `da959784f835a31482852d506daa137c90389b87` (main after KG-ATE PR #1484 merge)

### Created

- `architecture/knowledge-graphs/energy-event-detection/` full canonical structure
- `GRAPH.yaml`, `graph/schema.yaml`, `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`
- Governance: `AGENT_PROTOCOL.md`, `AUTHORITY_BOUNDARIES.md`
- `decisions/DECISIONS.md` (12 decisions)
- `evidence/EVIDENCE_REGISTRY.md` (24 evidence nodes)
- `open-questions/OPEN_QUESTIONS.md` (12 classified)
- `scripts/validate-graph.mjs`
- `architecture/KG_EED_CANONICALIZATION_2026-09-01.md`

### Discovery audit

| Action | Count |
|--------|------:|
| Discovery components referenced | 52 |
| Canonicalized as operational nodes | 58 |
| Evidence nodes created | 24 |
| Decision nodes | 12 |
| Invariants | 13 |
| Edges | 97 |
| Open questions | 12 |

### Verified / corrected from discovery

- **CONFIRMED:** minIncreasePercent 5, coalesce 300s/1800s, persist gate liters>1.0, mechanism isolation
- **CONFIRMED:** KS MX 4818s from DIMO envelope; coalesce single-segment pass-through; 685s sibling reconcile
- **CONFIRMED:** ATE step 5 MAY_TRIGGER only; EED owns semantics (ATE-EXT-006 reciprocal)
- **POLICY RESOLVED:** No historical backfill (EED-DEC-009 / EED-OQ-002)
- **DEFERRED:** FM-007 and ATE multi-replica — referenced only, not expanded

### Not changed

- Application runtime code
- Production data
- KG-ATE canonical graph (no cross-authority corrections required)

### Validation

- `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs` — see canonicalization report
