# Document Intake Action Recovery & Inventory Reconciliation (V4.9.618)

**Date:** 2026-07-17  
**Prompt:** 43/84 — Action recovery scheduler + read-only inventory reconciliation

## Scope

| Module | Role |
|--------|------|
| `diagnostic/document-intake-downstream.util.ts` | Probe downstream entities by semantic action / documentExtractionId |
| `diagnostic/document-intake-action-recovery.service.ts` | Reconcile + retry stuck APPLYING lifecycles |
| `diagnostic/document-intake-reconciliation.service.ts` | Read-only inventory findings |
| `workers/schedulers/document-intake-action-recovery.scheduler.ts` | Periodic recovery (2 min) |
| `scripts/ops/document-intake-reconcile.ts` | CLI inventory report (dry-run only) |

## Action recovery

1. Find `CONFIRMED` / `PARTIALLY_APPLIED` rows with `actionPlanApplyLifecycle.status === APPLYING` older than threshold.
2. For each tracked action, probe downstream by `documentExtractionId` (+ idempotency key audit).
3. Mark reconciled actions `SUCCEEDED` when downstream entity exists.
4. If all required actions reconciled → finalize extraction to `APPLIED` / `PARTIALLY_APPLIED` without re-execute.
5. Else unwind stale `APPLYING` → `APPLY_FAILED` and retry only missing actions via orchestrator.
6. Track `_actionRecoveryCount`; after `maxActionRecoveryAttempts` set `_actionRecoveryDeadLetterAt`.

## Inventory reconciliation (read-only)

| Finding code | Meaning |
|--------------|---------|
| `APPLIED_WITHOUT_DOWNSTREAM` | Terminal extraction without linked domain entity (incl. historical FINE no-op) |
| `DOWNSTREAM_WITHOUT_APPLIED_EXTRACTION` | Domain entity references non-applied extraction |
| `CONFIRMED_LEGACY_STUCK` | CONFIRMED without action-plan lifecycle metadata |
| `DUPLICATE_DOMAIN_OBJECT` | Multiple domain rows per `documentExtractionId` |
| `INVALID_STATUS_COMBINATION` | e.g. APPLIED without `appliedAt`, CONFIRMED with `appliedAt` |
| `STUCK_APPLYING_LIFECYCLE` | APPLYING lifecycle on non-terminal extraction |
| `RECOVERY_DEAD_LETTER` | Action recovery attempts exhausted |

## CLI

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/document-intake-reconcile.ts --dry-run
```

Default is always dry-run. `--execute` is rejected — no automatic production repair via CLI.

## Config

| Env | Default |
|-----|---------|
| `DOCUMENT_EXTRACTION_ACTION_RECOVERY_ENABLED` | `true` |
| `DOCUMENT_EXTRACTION_STALE_APPLYING_MS` | `600000` |
| `DOCUMENT_EXTRACTION_MAX_ACTION_RECOVERY_ATTEMPTS` | `5` |
| `DOCUMENT_EXTRACTION_ACTION_RECOVERY_BATCH_SIZE` | `10` |

## Tests

- `document-intake-recovery.spec.ts` — FINE no-op inventory + stuck APPLYING downstream reconcile
- `document-intake-action-recovery.scheduler.spec.ts` — scheduler wiring
