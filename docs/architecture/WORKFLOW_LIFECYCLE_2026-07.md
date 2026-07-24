# Workflow lifecycle & archive (2026-07)

## Goal

Remove hard delete of workflow definitions. Preserve audit history (runs, action runs, approvals, deliveries) while supporting explicit lifecycle states.

## States

| Status | Meaning |
|--------|---------|
| `DRAFT` | Editable, not runnable |
| `PUBLISHED` | Published but not enabled |
| `ACTIVE` | Runnable when `enabled=true` |
| `DISABLED` | Published but paused |
| `ARCHIVED` | Retained for audit; no new runs |
| `INVALID` | Validation failure (legacy/edge) |

## Rules

1. **No hard delete** for published or executed workflows — use `POST /workflows/:id/archive`.
2. **Draft discard** (`DELETE /workflows/:id`) only when:
   - `status === DRAFT`
   - `publishedAt` is null
   - `triggerCount === 0`
   - no `org_workflow_runs` rows exist
3. **Archive audit**: `archivedAt`, `archivedById`, `archivedByName`, optional `archiveReason` (required when published or has runs).
4. **Engine matching**: `status=ACTIVE`, `enabled=true`, `archivedAt=null`.
5. **Default lists** exclude `ARCHIVED`; `?includeArchived=true` or `?status=ARCHIVED` for audit views.
6. **FK protection**: `org_workflow_runs.workflow_id` uses `ON DELETE RESTRICT` — deleting a workflow with runs fails at DB level.
7. **Reactivation**: archived published versions are not mutated in place; future reactivation creates a new draft version (not implemented in this phase).

## API

| Method | Route | Action |
|--------|-------|--------|
| `POST` | `/:id/publish` | DRAFT → PUBLISHED |
| `POST` | `/:id/archive` | Any → ARCHIVED |
| `DELETE` | `/:id` | Discard pure draft only |

## Migration

`20260724210000_workflow_lifecycle_archive`:

- Adds `PUBLISHED`, `ARCHIVED` enum values
- Adds publish/archive audit columns
- Backfills `published_at` for active/executed workflows
- Changes run FK from `ON DELETE CASCADE` to `ON DELETE RESTRICT`

## Frontend

`WorkflowAutomationView` uses **Archivieren** / **Entwurf verwerfen** instead of **Löschen**. Default filter hides archived; **Archiv** filter shows them.
