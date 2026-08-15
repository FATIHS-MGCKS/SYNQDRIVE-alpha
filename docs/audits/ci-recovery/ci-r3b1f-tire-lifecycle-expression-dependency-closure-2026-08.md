# CI-R3B1F — Tire Lifecycle Expression Dependency Closure

## Baseline

- Branch: `fix/ci-r3b1f-tire-predicate-dependency-closure-2026-08`
- PRE_R3B1F_SHA: `5acf67cc4013aec7ae42b7028f07aae083351a17`
- Base R3B1E SHA: `5acf67cc4013aec7ae42b7028f07aae083351a17`
- HEAD: `5acf67cc4013aec7ae42b7028f07aae083351a17`

## R3B1E failure correction

- Slot 13 repair: **PASS**
- Slot 13 consumer (`20260716183000_tire_lifecycle_invariants`): **FAIL**
- Slots 14–16: **NOT_REACHED**
- Classification: **AUTHORITY_GAP_AT_PROTECTED_CONSUMER**

Original R3B1E evidence incorrectly marked Slot 13 consumer as NOT_REACHED because full replay halted at the same migration; successor correction records consumer reached and failed.

## Pre-157 snapshot

- `vehicle_tire_setups.vehicle_id`: **VALID** (exists=True)
- `vehicle_tire_setups.status`: **MISSING_HISTORY** (exists=False)
- `vehicle_tire_setups.removed_at`: **VALID** (exists=True)
- `tires.tire_set_id`: **VALID** (exists=True)
- `tires.current_position`: **VALID** (exists=True)
- `tires.active`: **VALID** (exists=True)

## Tire authority

Primary missing property: `vehicle_tire_setups.status` (TireSetupStatus, NOT NULL, default ACTIVE).

Slot 13 created `TireSetupStatus` enum but did not ADD COLUMN `status`. Migration 157 partial unique index predicate references `status` and `removed_at`; only `status` is missing pre-157.

Should Slot 13 authority have included status? **YES** — Slot 13 created TireSetupStatus enum consumed by migration 157 partial index predicate on vehicle_tire_setups.status, but did not ADD COLUMN status. Expression-aware analysis shows status is a predicate dependency, not just enum type dependency.

## Analyzer root cause

`sql_migration_analyzer.py` CREATE INDEX handler extracted only parenthesized key columns via regex; **WHERE partial-index predicates were not parsed**. TireSetupStatus enum was captured via ALTER TYPE / CREATE TYPE paths, but predicate column `status` was invisible to the matrix.

## Analyzer hardening

Added `expression_dependency_extractor.py` and integrated into `check_statement_dependencies`:

- partial-index predicates (`PARTIAL_INDEX_PREDICATE`)
- index expressions (`INDEX_EXPRESSION`)
- CHECK expressions (`CHECK_EXPRESSION`)
- generated expressions (`GENERATED_EXPRESSION`)
- ALTER USING (`ALTER_USING_EXPRESSION`)
- UPDATE SET expressions (`UPDATE_EXPRESSION`)
- casts, qualified identifiers, IS NULL / boolean predicates
- false-positive control for keywords, functions, type names, literals

## Remaining-range sweep

- First migration: `20260716183000_tire_lifecycle_invariants`
- Last migration: `20260814130000_ci_r3b_post_replay_parity_reconciliation`
- Migrations scanned: 147
- Dependency records: 2330
- Expression/predicate records: 925

## Classification counters

- VALID: 2174
- INTENTIONAL: 28
- MISSING_HISTORY: 114
- ORDERING_DEFECT: 13
- CONDITIONAL_SAFE: 1
- FALSE_POSITIVE: 0
- UNRESOLVED: 0

## New authority gaps

- Previous primary defects: 18
- New expression-derived primary defects: 13
- Total revised defects: 31

- `vehicle_tire_setups.status` — MISSING_HISTORY — first consumer `20260716183000_tire_lifecycle_invariants`
- `tire_health_snapshots.input_fingerprint` — MISSING_HISTORY — first consumer `20260716240000_tire_recalculation_fingerprint_dedupe`
- `rental_driving_analyses.superseded_at` — MISSING_HISTORY — first consumer `20260716350000_rental_driving_analysis_stability`
- `vehicle_service_events.document_extraction_id` — MISSING_HISTORY — first consumer `20260717210000_service_event_document_extraction_idempotency`
- `vehicle_damages.document_extraction_id` — MISSING_HISTORY — first consumer `20260717220000_damage_document_extraction_idempotency`
- `brake_health_snapshots.vehicle_id` — MISSING_HISTORY — first consumer `20260717230000_brake_health_snapshots`
- `brake_health_snapshots.model_version` — MISSING_HISTORY — first consumer `20260717230000_brake_health_snapshots`
- `brake_health_snapshots.input_fingerprint` — MISSING_HISTORY — first consumer `20260717230000_brake_health_snapshots`
- `brake_evidence.dedupe_key` — MISSING_HISTORY — first consumer `20260717240000_brake_dtc_evidence`
- `voice_phone_numbers.elevenlabs_ref_digest` — MISSING_HISTORY — first consumer `20260717240000_voice_phone_elevenlabs_import_assigned`
- `brake_evidence.active` — MISSING_HISTORY — first consumer `20260717250000_brake_evidence_lifecycle`
- `brake_evidence.superseded_by_evidence_id` — MISSING_HISTORY — first consumer `20260717250000_brake_evidence_lifecycle`
- `brake_health_alerts.status` — MISSING_HISTORY — first consumer `20260717260000_brake_health_alerts`

## Proposed repair topology

- `R3B1F-SLOT13-EXT-STATUS` after `20260716182500_ci_r3b_post_vendor_predecessor_slot13` before `20260716183000_tire_lifecycle_invariants` — repairs vehicle_tire_setups.status
- `R3B1F-EXPR-tire_health_snapshots-input_fingerprint` after `20260716240000_driving_event_native_identity` before `20260716240000_tire_recalculation_fingerprint_dedupe` — repairs tire_health_snapshots.input_fingerprint
- `R3B1F-EXPR-rental_driving_analyses-superseded_at` after `20260716340000_rental_driving_analysis_versioning` before `20260716350000_rental_driving_analysis_stability` — repairs rental_driving_analyses.superseded_at
- `R3B1F-EXPR-vehicle_service_events-document_extraction_id` after `20260717210000_brake_coverage_gap_policy` before `20260717210000_service_event_document_extraction_idempotency` — repairs vehicle_service_events.document_extraction_id
- `R3B1F-EXPR-vehicle_damages-document_extraction_id` after `20260717220000_brake_recalculation_orchestrator` before `20260717220000_damage_document_extraction_idempotency` — repairs vehicle_damages.document_extraction_id
- `R3B1F-EXPR-brake_health_snapshots-vehicle_id` after `20260717220000_voice_usage_event_audit_models` before `20260717230000_brake_health_snapshots` — repairs brake_health_snapshots.vehicle_id
- `R3B1F-EXPR-brake_health_snapshots-model_version` after `20260717220000_voice_usage_event_audit_models` before `20260717230000_brake_health_snapshots` — repairs brake_health_snapshots.model_version
- `R3B1F-EXPR-brake_health_snapshots-input_fingerprint` after `20260717220000_voice_usage_event_audit_models` before `20260717230000_brake_health_snapshots` — repairs brake_health_snapshots.input_fingerprint
- `R3B1F-EXPR-brake_evidence-dedupe_key` after `20260717230000_voice_webhook_ingestion_correlation` before `20260717240000_brake_dtc_evidence` — repairs brake_evidence.dedupe_key
- `R3B1F-EXPR-voice_phone_numbers-elevenlabs_ref_digest` after `20260717240000_document_org_upload_nullable_vehicle` before `20260717240000_voice_phone_elevenlabs_import_assigned` — repairs voice_phone_numbers.elevenlabs_ref_digest
- `R3B1F-EXPR-brake_evidence-active` after `20260717240000_voice_phone_elevenlabs_import_assigned` before `20260717250000_brake_evidence_lifecycle` — repairs brake_evidence.active
- `R3B1F-EXPR-brake_evidence-superseded_by_evidence_id` after `20260717240000_voice_phone_elevenlabs_import_assigned` before `20260717250000_brake_evidence_lifecycle` — repairs brake_evidence.superseded_by_evidence_id
- `R3B1F-EXPR-brake_health_alerts-status` after `20260717250000_voice_agent_deployment_snapshot` before `20260717260000_brake_health_alerts` — repairs brake_health_alerts.status

## Targeted simulations

- Temporary predecessor repair: **PASS**
- Unchanged migration 157: **PASS**
- `vehicle_tire_setups` partial unique index: **PASS**
- `tires` partial unique index: **PASS**

## Immutability

- migration SQL changed: 0
- schema.prisma changed: NO
- runtime changed: NO

## Safety

- new Prisma migration created: **NO**
- full replay beyond 157: **NO**
- production mutation: **NO**
- deployment: **NO**
- merge: **NO**

## Final status

**CI_R3B1F_EXPRESSION_DEPENDENCY_CLOSURE_COMPLETED**

