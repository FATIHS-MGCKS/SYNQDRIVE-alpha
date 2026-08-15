# CI-R3B1F.1 — Creator Chronology and Exact Repair Contracts

## Baseline

- PRE_R3B1F1_SHA: `c5ac5e43e8beb064f607033784d8a34a13d78b68`
- Branch: `fix/ci-r3b1f1-creator-state-contract-hardening-2026-08`
- Base R3B1F SHA: `75ecaa637f7588a10d3b8d885ffb1830b0bfba9a`

## Root cause

Independent review identified creator-state extraction defects in the R3B1F analyzer revision:

1. **Multi-column ALTER TABLE** — only the first `ADD COLUMN` clause was registered as a column creator.
2. **Unquoted CREATE TABLE** — table registration occurred without registering physical columns.
3. **Same-migration chronology** — later indexes/constraints could not see columns created earlier in the same migration or ALTER statement.
4. **Invalid contracts** — some R3B1F contracts stored clause fragments (`IS NOT NULL`) as physical types.
5. **Hardcoded repair SQL** — tire lifecycle proof used `TEMP_STATUS_REPAIR_SQL` instead of contract-compiled SQL.

Fixes are confined to `docs/audits/ci-recovery/tooling/` analyzer modules; historical migration SQL is unchanged.

## Previous candidate reconciliation

- Previous R3B1F candidates: **13**
- Accounted: **13**
- False positives corrected: **12**
- Confirmed missing history: **1**

| Relation | Property | Old | New | Creator migration |
|----------|----------|-----|-----|-------------------|
| `vehicle_tire_setups` | `status` | MISSING_HISTORY | MISSING_HISTORY | — |
| `tire_health_snapshots` | `input_fingerprint` | MISSING_HISTORY | VALID | 20260716180000_tire_evidence_ground_truth_provenance |
| `rental_driving_analyses` | `superseded_at` | MISSING_HISTORY | VALID | 20260716340000_rental_driving_analysis_versioning |
| `vehicle_service_events` | `document_extraction_id` | MISSING_HISTORY | VALID | 20260717210000_service_event_document_extraction_idempotency |
| `vehicle_damages` | `document_extraction_id` | MISSING_HISTORY | VALID | 20260717220000_damage_document_extraction_idempotency |
| `brake_health_snapshots` | `vehicle_id` | MISSING_HISTORY | VALID | 20260717230000_brake_health_snapshots |
| `brake_health_snapshots` | `model_version` | MISSING_HISTORY | VALID | 20260717230000_brake_health_snapshots |
| `brake_health_snapshots` | `input_fingerprint` | MISSING_HISTORY | VALID | 20260717230000_brake_health_snapshots |
| `brake_evidence` | `dedupe_key` | MISSING_HISTORY | VALID | 20260717240000_brake_dtc_evidence |
| `voice_phone_numbers` | `elevenlabs_ref_digest` | MISSING_HISTORY | VALID | 20260717240000_voice_phone_elevenlabs_import_assigned |
| `brake_evidence` | `active` | MISSING_HISTORY | VALID | 20260717250000_brake_evidence_lifecycle |
| `brake_evidence` | `superseded_by_evidence_id` | MISSING_HISTORY | VALID | 20260717250000_brake_evidence_lifecycle |
| `brake_health_alerts` | `status` | MISSING_HISTORY | VALID | 20260717260000_brake_health_alerts |

## Corrected real gaps

- `vehicle_tire_setups.status` — MISSING_HISTORY — first consumer `20260716183000_tire_lifecycle_invariants`

## Pre-157 catalog

- `vehicle_tire_setups.vehicle_id`: exists=True
- `vehicle_tire_setups.status`: exists=False
- `vehicle_tire_setups.removed_at`: exists=True
- `tires.tire_set_id`: exists=True
- `tires.current_position`: exists=True
- `tires.active`: exists=True

## Tire status authority

- relation: `vehicle_tire_setups`
- column: `status`
- type: `TireSetupStatus`
- nullable: `False`
- default: `ACTIVE`
- repair boundary: after `20260716182500_ci_r3b_post_vendor_predecessor_slot13`, before `20260716183000_tire_lifecycle_invariants`

## Exact contracts

- Genuine contracts: **1**

- `R3B1F1-vehicle_tire_setups-status` — `vehicle_tire_setups.status` — `TireSetupStatus`

## Contract validation

- invalid types: **0**
- missing types: **0**
- unresolved dependencies: **0**

## Targeted proof

- `R3B1F1-vehicle_tire_setups-status` — repair=PASS consumer=PASS pass=True
  - compiled SQL SHA256: `9a5c80da61ce346bb84f70f8520a121104919b42a11f6a2c234fcfc9bfea50d8`

## Analyzer regressions

- Multi-column ALTER parsing: **PASS**
- Quoted CREATE TABLE columns: **PASS**
- Unquoted CREATE TABLE columns: **PASS**
- Same-migration chronology: **PASS**
- Earlier-migration creator lookup: **PASS**
- Later-creator ordering detection: **PASS**
- Invalid contract type rejection: **PASS**

## Final counters

- VALID: 2530
- MISSING_HISTORY: 7
- ORDERING_DEFECT: 13
- UNRESOLVED: 0
- corrected_genuine_gaps: 1
- false_positives_corrected: 12
- expression_coverage_gaps: 0
- targeted_consumer_pass: 1

## Immutability

- migration SQL changes: **0**
- new migrations: **0**
- schema.prisma changed: **NO**
- runtime changed: **NO**

## Safety

- production mutation: **NO**
- deployment: **NO**
- merge: **NO**
- full replay: **NO**

## Final status

**CI_R3B1F1_CREATOR_CHRONOLOGY_CONTRACT_HARDENING_COMPLETED**
