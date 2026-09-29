# M3.3G G2 — Confirmed capture + document apply ground-truth emission

**Date:** 2026-09-29  
**Baseline:** G1 merged PR **#1837** @ main **`3253b0575ca30972f61514e4ef9b07828664e1b4`**  
**Admission:** **`M3_3G_GROUND_TRUTH_ADMISSION_V1`** (replacement without mandatory numeric evidence)

## Result block

```text
M3_3G_G1_COMPLETE=YES
M3_3G_G2_CONFIRMED_CAPTURE_DOCUMENT_GT_EMISSION=IMPLEMENTED

REPLACEMENT_REQUIRES_NUMERIC_EVIDENCE=NO
AI_PRE_CONFIRM_GT_EMISSION=NO
CONFIRMED_DOCUMENT_GT_EMISSION=YES

DOCUMENT_GT_SOURCE_FINGERPRINT_AUTHORITY=M3_3G_GROUND_TRUTH_FINGERPRINT_V1 (computeGroundTruthSourceContentFingerprintV1 + resolver sourceIdentity incl. document contentSha256 / confirmed apply snapshot)

DOCUMENT_REPLACEMENT_GT_CARDINALITY=ONE_PER_CONFIRMED_INTERVENTION_SCOPE_SOURCE
DOCUMENT_MEASUREMENT_GT_CARDINALITY=ONE_PER_ADMISSIBLE_NUMERIC_EVIDENCE_ROW_MATCHING_SCOPE

DOCUMENT_APPLY_GT_RETRY_CONVERGENCE=YES
PARTIAL_OPERATIONAL_APPLY_GT_FAILURE_RECOVERABLE=YES

MANUAL_GT_CONFIRMATION_IMPLEMENTED=YES
MANUAL_GT_CONFIRMATION_AUTH_GUARD=RolesGuard + VehicleOwnershipGuard + VehicleIntelligencePermissionGuard (fleet.write); actorUserId from authenticated session only

PLAIN_MANUAL_BATTERY_REPLACEMENT_AUTO_GT=NO
CLIENT_CAN_SET_MANUAL_CONFIRMATION_TRUSTED=NO
CLIENT_CAN_SET_CONFIRMED_BY_USER_ID=NO

MANUAL_CONFIRMATION_IDEMPOTENT=YES
CONFLICTING_SCOPE_CONFIRMATION_FAILS_CLOSED=YES

GT_BACKED_SOURCE_UPDATE_SILENT_REWRITE=NO
GT_BACKED_SOURCE_DELETE_SILENT_GT_DELETE=NO
DOCUMENT_INVALIDATION_GT_POLICY=GT append-only preserved; source FKs may SET NULL on document/service delete; formal invalidation requires explicit revoke/supersede workflow (no silent GT delete)

DOCUMENT_CONFIRMED_GT_EMISSION_CALL_SITES=BatteryHealthService.applyFromDocumentExtraction → BatteryGroundTruthEmissionService.convergeDocumentApplyGroundTruth
MANUAL_CONFIRMED_GT_CALL_SITES=POST vehicles/:vehicleId/battery/ground-truth/confirm-replacement
SCHEDULER_GT_EMISSION_CALL_SITES=0
WORKER_AUTONOMOUS_GT_EMISSION_CALL_SITES=0
TELEMETRY_GT_EMISSION_CALL_SITES=0
AI_UNCONFIRMED_GT_EMISSION_CALL_SITES=0

PRODUCTION_GT_TABLE_AVAILABLE=UNCHANGED (migration exists; not production-deployed in G2)
PRODUCTION_GT_WRITES_EXECUTED=NO
PRODUCTION_DEPLOY_EXECUTED=NO
D3_PRODUCTION_STATE_CHANGED=NO
E3_RUNTIME_ACTIVATED=NO
CUSTOMER_EFFECT=NO

NEXT_STAGE=M3.3G_G3_F5_GROUND_TRUTH_CORRELATION_AND_SEGMENTATION
```

## Trusted paths

### A — Confirmed document apply

Reuse existing chain (no duplicate pipeline):

`ApplyBatteryMeasurementDocumentActionExecutor` → `BatteryHealthService.applyFromDocumentExtraction()` → `ServiceEventsService.createFromDocumentExtraction()` → `BatteryEvidenceService` → **`BatteryGroundTruthEmissionService.convergeDocumentApplyGroundTruth`**.

Requirements:

- Document status **`APPLIED`** / **`PARTIALLY_APPLIED`** for retry convergence, or **`CONFIRMED`** only while executing the human-confirmed action plan with **`DocumentApplyConfirmationAuthorityV1`** (not raw AI extraction).
- Explicit LV/HV scope from confirmed payload (never inferred from fuel type).
- Replacement: **`BATTERY_REPLACEMENT`** service event + **`CONFIRMED_DOCUMENT`** authority.
- Measurements: admissible numeric **`BatteryEvidence`** rows only; **`WORKSHOP_MEASUREMENT`** GT references evidence.

Executor output adds **`groundTruthEventIds`** (non-sensitive IDs only).

GT emission failure after operational apply → **`BadRequestException`** with typed **`GroundTruthEmissionFailedError`** code; retry converges idempotently.

### B — Manual confirmed replacement

`POST …/battery/ground-truth/confirm-replacement` with body `{ serviceEventId, batteryScope }`.

- Requires existing **`BATTERY_REPLACEMENT`** service event for org/vehicle.
- Sets **`MANUAL_CONFIRMED`**, **`manualConfirmationTrusted=true`** only inside server command.
- Plain **`ServiceEventOrigin.MANUAL`** create **does not** emit GT.

## Source mutation boundary

`BatteryGroundTruthBackedSourceGuard` blocks material update/delete on GT-backed service events → **`GroundTruthSourceCorrectionRequiredError`** (explicit supersede/revoke required).

## Tests

| Suite | Coverage |
|-------|----------|
| `ground-truth-emission.service.spec.ts` | DOC-A/D/I/J; MAN-B/E/H/I |
| `ground-truth-backed-source.guard.spec.ts` | MAN-J |
| `battery-document-apply.spec.ts` | DOC-G, DOC-L |
| `ground-truth-admission.projector.spec.ts` | Replacement without numeric evidence; manual trusted path |
| `ground-truth-g2.postgres.integration.spec.ts` | PG-G2-A–G |
| `ground-truth-g2_1-orchestration.postgres.integration.spec.ts` | G2H-A/B/C (real orchestration path) |
| `ground-truth-g2_1-concurrency.postgres.integration.spec.ts` | G2H-F–I + unique index |

CI: **`backend/scripts/test/battery-ground-truth-postgres-ci.sh`** (G1/G2 unit + PG-G2 + G2.1).

## G2.1 — Document apply ordering + concurrency (PR #1840)

```text
CURRENT_G2_APPLIED_ONLY_GATE_SKIPS_FIRST_GT_EMISSION=YES (pre-G2.1; fixed)

DOCUMENT_STATUS_DURING_BATTERY_EXECUTOR=CONFIRMED
DOCUMENT_STATUS_AFTER_SUCCESSFUL_PLAN=APPLIED or PARTIALLY_APPLIED

CONFIRMED_ACTION_EXECUTION_GT_EMISSION=YES (requires action-plan authority)
APPLIED_RETRY_GT_CONVERGENCE=YES
CONFIRMATION_TIMESTAMP_SEMANTICS=HUMAN_ACTION_TIME (plan confirmedAt)
EFFECTIVE_AT_SEMANTICS=MEASUREMENT_OR_INTERVENTION_TIME (observedAt / eventDate)

ONE_ACTIVE_REPLACEMENT_GT_PER_SOURCE_EVENT_SCOPE=YES
  → partial unique index battery_ground_truth_one_active_replacement_per_source_scope
GT_ROWS_CREATED_BY_G2_1_MIGRATION=0
```

Authority chain: `ApplyBatteryMeasurementDocumentActionExecutor` passes `confirmationAuthority` from `context.plan` → `BatteryHealthService.applyFromDocumentExtraction` → `convergeDocumentApplyGroundTruth`. Orchestrator `toApplyResult` exposes `groundTruthEventIds` in apply detail.

## Explicit non-effects

- No F5 **`linkageAvailable`** / **`replacementLabelsAvailable`** changes (G3).
- No production deploy or production GT writes in G2.
- No customer Battery Health UI.
