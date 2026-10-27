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
