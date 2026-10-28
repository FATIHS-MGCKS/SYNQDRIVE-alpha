# Tires Health — Change Ledger (append-only)

Newest entry last. Never rewrite or delete entries.

### Authority bootstrap + Tire Intelligence P1 architecture audit (2026-10-24)

| Event | Detail |
|-------|--------|
| BEFORE | Tires Health inventoried as `NOT_STARTED`; production-active module without authority; no DS4 → tire relation documented |
| WHY | Owner decision to keep the existing stack, freeze V2, and prepare a DS4-based shadow driving-load input; governance required before any implementation |
| CHANGE | Created `architecture/tires/` per MODULE_AUTHORITY_STANDARD (README, AUDIT_MANIFEST, CURRENT_STATE, AGENT_CONTRACT, KNOWLEDGE_GRAPH, graph/*, decisions, evidence, contradictions, research, scripts) and `integration/DS4_MOTION_INTEGRATION_AUDIT.md`; registry row Tires Health `NOT_STARTED` → `AUDIT_IN_PROGRESS` + detail section; append-only entry in Driving Intelligence `research/CHANGE_LEDGER.md` recording the proposed tire consumer |
| EXPECTED_EFFECT | Agents find exact V2 inputs, DS4 availability/limits, owner decisions and a conservative admission policy before touching code |
| VALIDATION | `bash architecture/tires/scripts/validate-graph.sh` PASS · `bash architecture/scripts/validate-module-registry.sh` PASS · read-only Production baseline 2026-10-24T17:21–17:23Z |
| OBSERVED_EFFECT | UNKNOWN (documentation only) |
| NON_EFFECTS | No runtime code, DB, migration, deploy, flag, DS4 or i18n change; V2 output unchanged; SynqDrive Code → Changes/Architektur views not updated (TIRE-GAP-CODE-VIEWS-NOT-UPDATED-001) |
| TRADEOFFS | Authority is a bootstrap (PARTIAL maturity); several statements INFERRED pending the first implementation PR |
| REMAINING_GAPS | See `contradictions/KNOWLEDGE_GAPS.md` |

### PR #2157 documentation refinement — async consumer + DS4 run identity (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `integration/DS4_MOTION_INTEGRATION_AUDIT.md` §4/§4.1: async retryable BullMQ consumer (no sync with trip finalization); tire shadow row identity binds `diV0MotionCoreShadowRunId`, `combinedInputIdentity`, `pinnedSnapshotHash`, `contentFingerprint`, `shadowBundleVersion`, `adapterVersion`; replay/newer-failed-run selection rules aligned with `readForTrip`. New `TIRE-DEC-DS4-ASYNC-RETRY-CONSUMER-001` + graph pipeline node. `AUDIT_MANIFEST` `AUDIT_BRANCH_SHA` → PR HEAD |
| WHY | Review feedback: DS4 lag must not drop work; shadow rows must reference concrete DS4 runs, not ambiguous latest-per-trip |
| VALIDATION | `bash architecture/tires/scripts/validate-graph.sh` · `bash architecture/scripts/validate-module-registry.sh` |
| NON_EFFECTS | No runtime, DS4, or i18n change |

### Tire Wear V3 P3B — premature NOT_AVAILABLE defer (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Adapter `tire-ds4-shadow-input-v1.1.1`: temporal coverage interprets DS4 FSM DIRECT/INFERRED/INDETERMINATE (not event OK/DEGRADED); v1.1.0 rows immutable |
| CHANGE | Tire processor bounded defer on NOT_AVAILABLE (terminal only TRIP_NOT_FOUND / retry exhausted); shared TripMapRead contract preserved |
| NON_EFFECTS | No catch-up flag change; no production backfill; Master/DS4 read consumers unchanged |

### Tire Wear V3 P3B — stop boundary safety (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Confirmed stationary seconds use FSM certain core (`startLatest`…`endEarliest`); no fill across uncertain earliest/latest envelopes; regression for wide stops |
| NON_EFFECTS | M3 unchanged; adapter v1.1.0 / schema v3; DS4 core, production flags |

### Tire Wear V3 P3B — temporal coverage correctness (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Stricter `VERIFIED` gate: OK movement + directly confirmed stops only; DEGRADED/LIMITED/invalid speed tracked; gap seconds exclude confirmed stationary; regression spec |
| NON_EFFECTS | M3 formula unchanged; adapter v1.1.0 / schema v3; DS4 core, production flags |

### Tire Wear V3 P3B — DS4 M3 dynamics & temporal coverage (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Adapter `tire-ds4-shadow-input-v1.1.0`, payload schema v3: M3 J/kg/km proxy + temporal coverage detail |
| NON_EFFECTS | DS4 core, Trip FSM, V2 wear, V3 prior β=0, production flags |

### Tire Wear V3 P3A — correctness fix (2026-10-25)

| Event | Detail |
|-------|--------|
| CHANGE | Mount-period ledger/measurement scoping; empirical L2–L4; dynamic 3σ span; non-collapsing rate intervals; stable fingerprint; shadow write env-only; unique shadow fingerprint index |
| NON_EFFECTS | V2, DS4 canary, production flags unchanged |

### Tire Wear V3 P3A — distance prior shadow module (2026-10-25)

| Event | Detail |
|-------|--------|
| BEFORE | V2-only wear projection; Fable/Cursor research defined conservative prior + β=0 P3A scope |
| WHY | Implement kalibrierbares Distanz-Prior-Modell ohne V2/DS4/Produktionspfad zu berühren |
| CHANGE | `wear-v3-prior/*` service + math; `tire_wear_v3_prior_shadow_v1` migration; `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` default false; doc `integration/TIRE_WEAR_V3_PRIOR_P3A.md` |
| EXPECTED_EFFECT | Shadow-only P3A projections per setup/wheel with fingerprint + evidence levels; V2 unchanged |
| VALIDATION | Jest `tire-wear-v3-prior*` · productive isolation spec · `bash architecture/scripts/validate-module-registry.sh` |
| NON_EFFECTS | No deploy, no canary env change, β_dyn=0, no UI/alerts/rental, no TireHealthSnapshot writes |

### Tire Intelligence P2 — DS4 shadow adapter implementation (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | `tire_ds4_motion_shadow_input_v1` + `backend/.../tires/ds4-shadow/*` (admission, mapper, repository, producer, processor), BullMQ `dimo.tire.ds4-shadow`, catch-up scheduler, ledger enqueue hook; data contract `integration/TIRE_DS4_SHADOW_DATA_CONTRACT.md` |
| WHY | Owner P2 scope after P1 authority: first read-only DS4 → tire shadow input path with retry/catch-up and run-bound identity |
| VALIDATION | Jest: `tire-ds4-shadow-*.spec.ts`, productive isolation spec; `architecture/tires/scripts/validate-graph.sh` |
| NON_EFFECTS | V2, rental gate, DS4 worker, trip FSM unchanged; feature OFF unless `TIRE_DS4_SHADOW_ENABLED`; migration not applied to Production by agent |
| REMAINING_GAPS | Production enablement + second baseline after deploy; successor wear model still out of scope |

### Tire Intelligence P2 hardening — catch-up, evidence, semantics (2026-10-24)

| Event | Detail |
|-------|--------|
| CHANGE | Adapter `v1.0.1` / payload schema 2: immutable insert (fingerprint conflict → `evidence_immutable_conflict`); terminal sentinel run ids for `NOT_AVAILABLE` and retry exhaustion; catch-up SQL targets latest **succeeded** DS4 run not yet materialized; split `event_quality_coverage` vs `temporal_coverage`; OK-only `okDeltaKmhAbsSum` (no ordinal intensity buckets); ledger FK `ON DELETE RESTRICT`; enqueue double `.catch` on trip finalization |
| WHY | PR #2160 review: avoid endless catch-up, preserve audit evidence, keep trip finalization independent of DS4, conservative coverage claims |
| VALIDATION | Jest: ds4-shadow processor/repository/catchup + tire-trip-usage enqueue specs; `validate-graph.sh` · `validate-module-registry.sh` |
| NON_EFFECTS | No merge to main, no Production migration/deploy/flag enable |

### Tire Wear V3 Prior 0.2.0 — mm estimation shadow (2026-10-27)

| Event | Detail |
|-------|--------|
| CHANGE | `tire-wear-v3-prior-0.2.0`: explicit `estimatedWearMm` / `displayTreadMm` / `treadEvidenceClass`; posterior rate fusion (`fuseRateWithPriorPosterior`) with legacy union preserved for `0.1.0` replays; read-only DS4 severity coverage interface (`dynamicBeta=0`); repository `findLatestDs4ShadowEvidenceByLedgerIds` |
| WHY | Fable scientific model research: conservative anchored mm/km projection, measurement calibration narrowing, evidence classes, no M3→mm conversion |
| VALIDATION | Jest `wear-v3-prior` suites (41 tests); productive V2 isolation spec unchanged |
| NON_EFFECTS | V2 customer path; `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` default OFF; no DS4/S4/FSM change; no migration |

### Tire Wear V3 — verification policy P1 (2026-10-27)

| Event | Detail |
|-------|--------|
| CHANGE | Isolated `tire-wear-v3-verification` policy (4500/5000/6000 km + 6 mo UTC); `resolveV3VerificationStatus` on V3 prior setup result; ground-truth acceptance separate from posterior calibration |
| WHY | Recurring manual tread verification design audit; shadow-only cadence without V2 measurementFreshness changes |
| VALIDATION | Jest `tire-wear-v3-verification.spec.ts` + existing wear-v3-prior suites |
| NON_EFFECTS | No V2 TireHealthSummary; no shadow writer; no migration; no scheduler |

### Tire Wear V3 — verification per-wheel cadence fix (2026-10-27)

| Event | Detail |
|-------|--------|
| CHANGE | Per-wheel latest accepted anchors (`latestAcceptedVerificationAnchorPerWheel`); setup `status` aggregated by precedence; rotation fail-closed (`INSUFFICIENT_EVIDENCE` per wheel); V3-only exclusion of legacy `ai_confirmed` |
| WHY | PR #2185 safety review: setup-wide latest anchor let partial rows reset cadence for unmeasured wheels |
| VALIDATION | Jest `tire-wear-v3-verification.spec.ts` (20 tests) + `tire-wear-v3-prior.service.spec` |
| NON_EFFECTS | V2 provenance maps; posterior calibration gates; no migration; no deploy |

### Commit B — AiTireSpec V2 contract, normalizer parity, provenance safety (2026-10-27)

| Event | Detail |
|-------|--------|
| BEFORE | Tire LLM schema/normalizer key drift; AI URLs could inflate tread evidence; DIMO registration could persist raw AI tire JSON |
| WHY | Owner Commit B: canonical AiTireSpec V2, null-not-clamp, no URL→MANUFACTURER_CONFIRMED, normalize-before-persist, preserve USER_CONFIRMED |
| CHANGE | `ai-tire-spec-canonical.contract.ts`; tire-spec-ai schema V2; normalizer V2; `tire-evidence-provenance` URL demotion; `ai-tire-spec-registration-persist.util` for DIMO path; contract + regression Jest suites |
| EXPECTED_EFFECT | AI tire specs and tread evidence stay conservative; DIMO writes normalized `tire_v2` payloads only |
| VALIDATION | Jest ai-tire-spec*, tire-evidence-provenance, tire-health-regression-matrix; vehicle-spec-ai Commit B offline preflight |
| NON_EFFECTS | Tire Wear V3 math; DS4; migrations; Intelligence modules unchanged; C6 brake hardening preserved on main |

### Tire V3 production cutover P1 — measurement ingestion & operator evidence (2026-10-27)

| Event | Detail |
|-------|--------|
| BEFORE | Measurements often persisted with `odometer_at_measurement` NULL; operator flow did not distinguish explicit vs telemetry odometer for V3 |
| WHY | Production cutover prep: ground-truth ingestion, explicit odometer evidence, V3 recompute hook after lifecycle save without V2/customer/shadow-writer changes |
| CHANGE | `tire-measurement-v3-ingestion.ts`; `TireLifecycleService.recordMeasurement` mount-period validation, explicit vs inferred odometer persistence, post-save `computeForSetup({ persistShadow: false })` + `v3Ingestion` assessment; OperatorTireMeasureFlow odometer confirm + V3 warnings; DTO `manualConfirmOdometer` |
| EXPECTED_EFFECT | New measurements can feed V3 verification policy when odometer explicitly confirmed; insufficient evidence returns operator-visible warnings; V2 kFactor/recalculate unchanged |
| VALIDATION | Jest `tire-measurement-v3-ingestion.spec.ts`, `tire-lifecycle-record-measurement-v3.spec.ts`, `operatorTireMeasure.utils.test.ts` |
| NON_EFFECTS | No migration; shadow writer OFF; no scheduler; no production backfill; Health quick-measure still may auto-confirm odometer when `odometerKm` sent (V2-compat) |
| EVIDENCE | Read-only fleet odometer audit (Tiguan/Tesla/Audi/Arteon): NULL measurement odometers + `mileage_km` vs install anchor retrograde flags documented in agent artifacts |

### Tire V3 cutover P1 — post-commit compute + persistShadow safety (2026-10-27)

| Event | Detail |
|-------|--------|
| CHANGE | `recordMeasurement`: isolate optional V3 `computeForSetup` failures after durable save; return `v3Recompute` diagnostic + structured log `tire_measurement_v3_recompute_failed`. `computeForSetup`: `persistShadow === false` suppresses shadow inserts even when `TIRE_WEAR_V3_PRIOR_SHADOW_WRITE_ENABLED` is on |
| WHY | Safety review #2186: save must not 500 solely on post-commit V3 recompute; measurement ingestion path must not write shadow rows when explicitly dry-run |
| EXPECTED_EFFECT | Operators/API get 200 with saved measurement + `v3Recompute.failed` when V3 assess fails; shadow table untouched on `persistShadow: false` |
| VALIDATION | Jest `tire-lifecycle-record-measurement-v3.spec.ts`, `tire-wear-v3-prior.service.spec.ts` |
| NON_EFFECTS | V2 recalculate error semantics unchanged; customer-facing V3 read still future — fresh V3 state after cutover via on-demand `computeForSetup` / scheduled recompute hooks already used elsewhere, not new queue |

### Tire V3 production cutover P2 — customer read adapter & integration (draft, 2026-10-27)

| Event | Detail |
|-------|--------|
| BEFORE | V2 wear model only on tire summary/detail, fleet wear-analysis, rental health, alerts; V3 prior computed on measurement path but not exposed as versioned customer read |
| WHY | Owner P2: single future authoritative V3 read model with safe cutover flags (default OFF), V2 rollback retained, no dual customer-facing wear, no shadow dual-write on reads |
| CHANGE | `tire-health-v3-read.*` adapter/service; `tire-wear-v3-cutover.config.ts`; enrich `TireHealthService` summary/detail + `TiresService.getWearAnalysis`; rental health V3 verification codes; alert reason codes; rental UI `TireWearV3CustomerPanel`; i18n `tire.wearV3.*` (9 locales); `integration/TIRE_WEAR_V3_CUTOVER_P2.md` |
| EXPECTED_EFFECT | When `TIRE_WEAR_V3_CUSTOMER_READ_ENABLED=true`, APIs attach `wearV3` + optional authoritative presentation; rental distinguishes OVERDUE vs INSUFFICIENT_EVIDENCE; flags default false — no production behavior change until owner enables |
| VALIDATION | Jest adapter/read/rental/wear-analysis specs; `npm run i18n:check` (frontend); registry validator |
| NON_EFFECTS | No migration; no deploy; no DS4/S4/FSM change; shadow writer OFF; V2 snapshot recalculate path unchanged until authoritative flag; no feature activation in this PR |

### Tire V3 P2 cutover safety — flag AND-gate + V2 snapshot guard (2026-10-27)

| Event | Detail |
|-------|--------|
| WHY | Post-merge audit: `AUTHORITATIVE` alone could enable V3 read; authoritative mode did not suppress new V2 snapshot writes |
| CHANGE | `tire-wear-v3-cutover.policy.ts` truth table; authoritative requires enabled+authoritative; `TireHealthService.recalculate` skips `tireHealthSnapshot.create` when authoritative; rollback resumes V2 snapshots when flags cleared |
| VALIDATION | Jest policy truth table, v3-read flag regression, recalculate cutover spec |
| NON_EFFECTS | Defaults OFF; measurement ingestion, alerts, lifecycle unchanged; historical V2 snapshots retained |

### Tire V3 P3 — offline E2E validation (read-only production) (2026-10-28)

| Event | Detail |
|-------|--------|
| WHY | Final pre-cutover proof that V3 can replace V2 on real fleet evidence without production writes or flag activation |
| CHANGE | `validation/P3_OFFLINE_E2E_2026-10-27.md`; evidence bundle + `offline-replay-results.json`; `scripts/ops/tire-v3-p3-offline-e2e-validation.readonly.ts`; `tire-v3-p3-consumer-chain.validation.spec.ts`; `SYNTHETIC_partial-wheel-measurement.fixture.json` |
| VALIDATION | Read-only SSH/psql export (Tesla M3, Tiguan, A4, Arteon); offline replay idempotent 4/4; shadow rows unchanged; Jest cutover + P3 consumer chain 15/15 |
| OBSERVED_EFFECT | All four cohort vehicles: V3 verification `INSUFFICIENT_EVIDENCE` (NULL measurement odometers; Arteon no measurements); rental `MEASUREMENT_REQUIRED`; DS4 β=0 |
| VERDICT | **INCONCLUSIVE** for production GO — mechanics OK, evidence quality blocks authoritative replacement |
| NON_EFFECTS | No model formula change; no deploy; no flags; no production mutation |

### Tire V3 — production cutover operator runbook (2026-10-28)

| Event | Detail |
|-------|--------|
| WHY | Post–#2207 merge: empty `TIRE_WEAR_V3_CUTOVER_PRODUCTION.md`; owner requires executable global V3 cutover steps without shadow phase |
| CHANGE | Filled `integration/TIRE_WEAR_V3_CUTOVER_PRODUCTION.md` (preflight, deploy, dual-flag activation, smoke tests, rollback, stop conditions, evidence limits) |
| VALIDATION | Flag names and API paths cross-checked against `tire-wear-v3-cutover.config.ts`, `vehicle-intelligence.controller.ts`, DSRG deploy runbook |
| NON_EFFECTS | Documentation only — no deploy, no production env mutation |

### Cross-module — DI PR-2 persists DS4 event intensity (gap pointer only) (2026-10-28)

| Event | Detail |
|-------|--------|
| CHANGE | Documentation only. `TIRE-GAP-DS4-PERSISTED-INTENSITY-FIELDS-001` → **PARTIALLY_CLOSED** pointer: Driving Intelligence PR-2 (Draft, not deployed) persists `meanAccelMps2`, `durationS`, `steps`, `coverageRatio`, uncertainty labels on new shadow runs under `DI_V0_MOTION_CORE_EVENT_ROW_V2_INTENSITY_ORDINAL_V1`; peaks excluded by contract |
| WHY | Keep tire integration audit consistent with DI persistence state; data precondition for a future ordinal intensity channel |
| NON_EFFECTS | No tire runtime, adapter, flag or model change; `tire-ds4-shadow-input.mapper.ts` still consumes the trip-map DTO (no intensity); tire consumer binding remains forbidden until Fable review of `DI-DEC-DS4-INTENSITY-PERSIST-001`; historical DS4 rows unchanged |

### Tire V3 — authoritative customer read fail-closed hotfix (2026-10-28)

| Event | Detail |
|-------|--------|
| BEFORE | `TireHealthV3ReadService.enrichSummary` returned unchanged legacy summary when `computeCustomerRead` was null under authoritative flags (silent V2 GOOD / rental false-green; V2 snapshot suppression still active) |
| WHY | Production cutover readiness audit HARD BLOCKER — no silent V2 fallback when both customer authority flags are ON |
| CHANGE | `resolveCustomerReadForApi` + `buildAuthoritativeV3UnavailableRead`; authoritative path applies UNKNOWN/INSUFFICIENT stub; `TiresService.getWearAnalysis` attaches unavailable payload; rental policy blocks legacy GOOD clearance under V3 authority (`V3_READ_UNAVAILABLE`) |
| EXPECTED_EFFECT | Failed or missing V3 compute never presents legacy V2 as authoritative wear; rental stays measurement-required without new HARD_BLOCK |
| VALIDATION | Jest: `tire-health-v3-read*.spec`, `tires.service.v3-fail-closed.spec`, existing `tire-health-recalculate-v3-cutover.spec` |
| NON_EFFECTS | Flags default OFF; no migration; no DS4/RPM changes; `persistShadow: false` unchanged; β=0 unchanged |

### Tire V3 — global production activation (2026-10-28)

| Event | Detail |
|-------|--------|
| BEFORE | Production customer tire read authority **V2**; both `TIRE_WEAR_V3_CUSTOMER_READ_*` unset/false on VPS |
| WHY | Owner explicit GO for global authoritative V3 on binary `6ec3844c3` (#2222 fail-closed) despite missing authenticated HTTP baseline |
| CHANGE | Shared `/opt/synqdrive/shared/backend.env`: `TIRE_WEAR_V3_CUSTOMER_READ_ENABLED=true` + `TIRE_WEAR_V3_CUSTOMER_READ_AUTHORITATIVE=true`; rolling PM2 `--update-env` both replicas; env backup `backend.env.bak-tire-v3-cutover-20261028202439` |
| EXPECTED_EFFECT | All customer tire summary/detail/wear-analysis paths present `wearReadModel=v3` + `wearV3`; V2 snapshot writes suppressed on recalculate; rental fail-closed on insufficient evidence |
| VALIDATION | T-0: CI gate PASS, V2 service baseline PASS (9246 snapshots); post: service-level V3 PASS 4/4 P3 vehicles; 0 new snapshots / 0 prior-shadow rows since activation timestamp; scheduler 1 LEADER |
| OBSERVED_EFFECT | **PRODUCTION_VALIDATED** — see [`evidence/TIRE_V3_GLOBAL_CUTOVER_2026-10-28.md`](../evidence/TIRE_V3_GLOBAL_CUTOVER_2026-10-28.md) |
| NON_EFFECTS | No binary redeploy; no migration; shadow write env off; authenticated HTTP smokes not run; historical V2 snapshots preserved |
| REMAINING_GAPS | Org-scoped Clerk JWT GET smokes; long-window LEADER recalc snapshot suppression monitoring |
