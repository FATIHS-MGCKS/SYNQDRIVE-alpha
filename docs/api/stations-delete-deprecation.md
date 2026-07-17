# Stations API — Delete Deprecation

**Status:** Active since V4.9.602 (Stations V2 Prompt 22/78)

## Decision

Stations are **never hard-deleted** in tenant-facing product flows. The operational lifecycle standard is **Archive** (`POST /organizations/:orgId/stations/:id/archive`).

Physical removal of `Station` rows is limited to internal platform-admin prune tooling and explicit test/cleanup scripts — not exposed as a regular API capability.

## Deprecated endpoint

| Method | Path | Status |
|--------|------|--------|
| `DELETE` | `/api/v1/organizations/:orgId/stations/:id` | **410 Gone** |

### Permission & scope

The route remains wired for backward compatibility at the guard layer:

- Permission: `stations.archive`
- Scope: `station` (in-scope station id)

Authorization still runs before the deprecation response is returned.

### Response body

```json
{
  "statusCode": 410,
  "code": "STATION_DELETE_DEPRECATED",
  "message": "DELETE /stations/:id is deprecated. Stations are archived, not hard-deleted. Use POST /stations/:id/archive instead.",
  "replacement": {
    "method": "POST",
    "path": "/organizations/:orgId/stations/:id/archive",
    "command": "ArchiveStation"
  }
}
```

### Migration for API clients

1. Replace `DELETE .../stations/:id` with `POST .../stations/:id/archive`.
2. Use `GET .../stations/:id/archive-preview` for preflight when the UI needs blockers/warnings.
3. Do not expect vehicle links or bookings to be removed — archive preserves historical relations.

## Supported lifecycle commands

| Action | Endpoint |
|--------|----------|
| Archive | `POST /organizations/:orgId/stations/:id/archive` |
| Restore | `POST /organizations/:orgId/stations/:id/restore` |
| Archive preview | `GET /organizations/:orgId/stations/:id/archive-preview` |
| Restore preview | `GET /organizations/:orgId/stations/:id/restore-preview` |

## Internal hard delete (not tenant API)

The following paths may still call `prisma.station.delete` / `deleteMany` for non-product cleanup only:

- `backend/prisma/prune-master-data.ts`
- `backend/src/modules/platform-admin/platform-admin.service.ts`

No Prisma migration in Prompt 22 removes station data.
