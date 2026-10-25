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
