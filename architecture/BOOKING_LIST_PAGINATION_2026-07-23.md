# Booking List Pagination (V4.9.791)

## API

`GET /api/v1/organizations/:orgId/bookings`

### Pagination

| Param | Description |
|-------|-------------|
| `page` | Offset page (default 1) |
| `limit` | Page size (default 50, max 200) |
| `cursor` | Optional cursor for stable continuation |
| `sortBy` | `startDate` \| `endDate` \| `createdAt` (default `startDate`) |
| `sortOrder` | `asc` \| `desc` (default `desc`) |

Response meta: `{ total, page, limit, totalPages, hasNextPage, nextCursor }`.

Stable ordering: primary sort field + `id ASC` tie-breaker.

### Filters

- `status` — comma-separated `BookingStatus` values
- `vehicleId`, `vehicleIds` (comma-separated), `customerId`, `stationId`
- `from`, `to` — half-open view window `[from, to)` overlap: `startDate < to AND endDate >= from`
- `search`, `bookingNumber` — id suffix / customer / vehicle text
- `excludeTerminal` — omit `CANCELLED` and `NO_SHOW`

## Indexes

- `(organization_id, start_date, id)` — org list + cursor scans
- `(organization_id, vehicle_id, start_date)` — per-vehicle timeline windows

## Performance notes

- Default limit 50 (was implicit 100–500 bulk fetch in planner UI).
- Timeline/calendar loads only the visible `[from, to)` window server-side.
- Table view uses offset pagination with `total` + `hasNextPage`; no silent 500-cap truncation.
- Protocol/station enrichment remains batched per page (not N+1 per row).

## Frontend

- `useBookingsPlannerData` — view-aware fetching (table vs timeline/calendar).
- `fetchAllBookingsInRange` — multi-page range fetch with truncation banner when `hasNextPage`.
