# Task Data Diagnostic — Operations

Read-only audit for `org_tasks` and related child rows. **Never mutates data.**

## Safety

The script refuses to run when:

- `DATABASE_URL` matches production host patterns (`synqdrive.eu`, RDS, `/opt/synqdrive/`, …)
- `NODE_ENV=production` (unless `TASK_DATA_DIAGNOSTIC_ALLOW_PROD=1`)
- `DATABASE_URL` is not clearly local/test (unless `--allow-remote-db` or `TASK_DATA_DIAGNOSTIC_ALLOW_REMOTE=1`)

Use only against an explicitly configured **local or test** database.

## Command

```bash
cd backend

# JSON to stdout (default)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts

# Single tenant
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --organization-id=<uuid>

# Markdown report
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --format=markdown

# Write JSON or Markdown to file (.md extension selects markdown)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --output=./tmp/task-audit.json
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --output=./tmp/task-audit.md --format=markdown

# Limit sample IDs per check; include masked finding list in JSON
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --limit=10 --include-findings

# Explicit dry-run flag (default behaviour — tool is always read-only)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-task-data.ts --dry-run
```

## Checks

| Category | Examples |
|----------|----------|
| `done_integrity` | DONE without `completedAt`, `completionMode`, or completion event; contradictory `resolutionNote` |
| `done_checklist` | Open required checklist items; fully open legacy checklist |
| `active_duplicates` | Shared `dedupKey`, multiple preparation/document/cleaning/invoice payment tasks |
| `missing_links` | Orphan `bookingId` / `vehicleId` / `invoiceId` / `documentId`; cross-org links |
| `timing` | `activatesAt` after `dueDate`, `completedAt` before `createdAt`, future activates with active status, DONE + `cancelledAt` |
| `audit` | Status vs last event, AUTO_RESOLVED without event, assignment without ASSIGNED event |
| `legacy_automation` | Non-canonical `source` / `dedupKey` formats (`booking:clean:`, bare `vehicle:cleaning:`, per-type document keys) |

## Output

- **JSON** (default): machine-readable `TaskDiagnosticReport` with per-check counters and masked sample task IDs (`abcd…wxyz`).
- **Markdown / console**: human-readable summary tables.
- **Exit code**: `0` when the run completes (findings do not change exit code); `1` on configuration/runtime errors only.

## Nest integration

`TaskDataDiagnosticService` is exported from `TasksModule` for programmatic use in admin tooling or tests.

## Related

- **Runbook (verbindlich):** [`docs/runbooks/task-data-repair.md`](../runbooks/task-data-repair.md)
- Repair script: `scripts/ops/repair-task-data.ts`, `docs/task-data-repair-ops.md`
