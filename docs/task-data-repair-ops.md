# Task data repair (ops)

Controlled repair script for OrgTask integrity issues detected by the diagnostic tool.
**Default is dry-run.** Writes require explicit `--apply`.

## Safety

- Never run against production without deliberate override.
- Uses `assertSafeRepairDatabaseTarget()` — blocks production URL patterns and `NODE_ENV=production`.
- Override env vars (strongly discouraged):
  - `TASK_DATA_REPAIR_ALLOW_PROD=1`
  - `TASK_DATA_REPAIR_ALLOW_REMOTE=1` or `--allow-remote-db`

## Usage

```bash
cd backend

# Dry-run (default) — all orgs
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts

# Dry-run — single org
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --organization-id=<uuid>

# Apply repairs (mutating)
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --organization-id=<uuid> --apply

# Save full JSON report
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --organization-id=<uuid> --output=./tmp/task-repair.json

# Smaller write batches (default 20)
npx ts-node -r tsconfig-paths/register scripts/ops/repair-task-data.ts --organization-id=<uuid> --apply --batch-size=10
```

## Repair rules

| Rule | Behavior |
|------|----------|
| DONE `completionMode` | Backfill only when provenance is reliable: human actor → `MANUAL`, system source without actor → `AUTO_RESOLVED`, supersede chain → `SUPERSEDED`. Unclear → `unresolved` in report. |
| Missing completion events | Backfill only with known mode; event metadata includes `provenance: BACKFILL` and script version. |
| Booking / invoice / generic duplicates | Keep canonical task; supersede others via `TasksService.supersedeTask`. |
| Document duplicates | Canonical aggregated task wins; comments/attachments moved before supersede. |
| Cleaning duplicates | Oldest canonical cleaning task kept; others superseded. |
| Timing | Only `activatesAt > dueDate` (clamp) and `completedAt < createdAt` (set to `createdAt`). No historical due-date recalculation. |
| Checklists on DONE | Never mark items done; document `legacyChecklistInconsistency` in metadata + `LEGACY_CHECKLIST_INCONSISTENCY` event. |

## Report shape

The JSON report includes:

- `actions[]` — planned/applied changes with `before` / `after`
- `unresolved[]` — cases not guessed
- `skipped[]` — intentionally not repaired
- `auditLog[]` — chronological execution log
- `diagnosticBefore` / `diagnosticAfter` — embedded diagnostic snapshots

## Idempotency

Repeated dry-runs or applies are safe:

- Field backfills skip when already correct
- `supersedeTask` is idempotent for already-superseded rows
- Legacy checklist documentation skips when metadata flag exists

## Related

- Diagnostic (read-only): `scripts/ops/audit-task-data.ts`, `docs/task-data-diagnostic-ops.md`
- Service: `TaskDataRepairService` in `backend/src/modules/tasks/diagnostic/`
