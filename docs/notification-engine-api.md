# Notification Engine V2 — REST API

Version: **V4.9.356**  
Base path: `/api/v1/organizations/:orgId/notifications`  
Feature flag: `NOTIFICATIONS_V2=true` (503 when disabled)

## Overview

The Notification API is the single backend source for in-app notifications. The frontend must **not** assemble notifications from Dashboard Insights, Action Queue, or other domain sources after cutover.

| Concern | Scope |
|---------|--------|
| Lifecycle (`OPEN`, `ACKNOWLEDGED`, `SNOOZED`, `RESOLVED`, `ARCHIVED`) | Organization-wide |
| Read state (`readAt`, `hiddenAt`) | Per user (`notification_receipts`) |
| Severity / domain / entity | Organization-wide on `notifications` row |

Internal fields (`fingerprint`, `conditionCode`, raw occurrence payloads) are **not** exposed.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notifications` | Paginated list with filters |
| `GET` | `/notifications/counts` | Aggregated badge counts |
| `GET` | `/notifications/:id` | Single notification |
| `POST` | `/notifications/:id/read` | Mark read (idempotent) |
| `POST` | `/notifications/:id/unread` | Mark unread (idempotent) |
| `POST` | `/notifications/:id/acknowledge` | Org lifecycle → `ACKNOWLEDGED` |
| `POST` | `/notifications/:id/snooze` | Org lifecycle → `SNOOZED` |
| `POST` | `/notifications/:id/unsnooze` | Org lifecycle → `OPEN` |
| `POST` | `/notifications/:id/resolve` | Manual resolve (when allowed) |
| `POST` | `/notifications/:id/archive` | Administrative archive |

All routes require JWT auth, `OrgScopingGuard`, and staff role (`ORG_ADMIN`, `SUB_ADMIN`, `WORKER`, `DRIVER`, or `MASTER_ADMIN`).

Write endpoints are rate-limited via `@Throttle`.

---

## Query parameters (`GET /notifications`)

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Default `1` |
| `limit` | number | Default `20`, max `100` |
| `status` | enum[] | `OPEN`, `ACKNOWLEDGED`, `SNOOZED`, `RESOLVED`, `ARCHIVED` |
| `severity` | enum[] | `CRITICAL`, `WARNING`, `INFO`, `SUCCESS` |
| `domain` | enum | `OPERATIONS`, `VEHICLE_HEALTH`, … |
| `entityType` | enum | `VEHICLE`, `BOOKING`, `STATION`, … |
| `entityId` | uuid | Primary entity id |
| `vehicleId` | uuid | Matches entity or `actionTarget.vehicleId` |
| `stationId` | uuid | Matches entity or `actionTarget.stationId` |
| `bookingId` | uuid | Matches entity or `actionTarget.bookingId` |
| `unreadOnly` | boolean | No `readAt` receipt for current user |
| `activeOnly` | boolean | Status in `OPEN` / `ACKNOWLEDGED` / `SNOOZED` |
| `resolvedOnly` | boolean | Status `RESOLVED` |
| `from` / `to` | ISO8601 | Filter on `lastSeenAt` |
| `sortBy` | string | `lastSeenAt` (default), `createdAt`, `severity` |
| `sortOrder` | string | `desc` (default), `asc` |
| `search` | string | Min 2 chars — `eventType`, `titleKey`, `primarySourceRef`, `entityId` |

Entity filter ids are validated to belong to the organization (404 on foreign ids).

---

## Response DTO (`NotificationResponse`)

```json
{
  "id": "uuid",
  "eventType": "TECHNICAL_OBSERVATION_ACTIVE",
  "domain": "VEHICLE_HEALTH",
  "severity": "WARNING",
  "status": "OPEN",
  "entity": {
    "type": "VEHICLE",
    "id": "veh-uuid",
    "displayLabel": "WOB L 7503"
  },
  "titleKey": "notification.title.technicalObservation",
  "bodyKey": "notification.body.technicalObservation",
  "templateParams": { "label": "WOB L 7503" },
  "action": {
    "type": "OPEN_VEHICLE_MODULE",
    "target": { "vehicleId": "veh-uuid", "module": "complaints" }
  },
  "source": {
    "type": "OPERATIONAL_ISSUE",
    "ref": "observation-id"
  },
  "firstSeenAt": "2026-07-11T10:00:00.000Z",
  "lastSeenAt": "2026-07-11T10:00:00.000Z",
  "occurrenceCount": 1,
  "resolvedAt": null,
  "expiresAt": null,
  "createdAt": "2026-07-11T10:00:00.000Z",
  "updatedAt": "2026-07-11T10:00:00.000Z",
  "userReceipt": {
    "readAt": null,
    "acknowledgedAt": null,
    "snoozedUntil": null,
    "hiddenAt": null
  },
  "availableActions": ["read", "acknowledge", "snooze", "resolve", "open_entity"]
}
```

No server-side `displayTitle` / `displayBody` — frontend resolves i18n keys.

### Paginated list

```json
{
  "data": [ /* NotificationResponse[] */ ],
  "meta": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}
```

### Counts (`GET /notifications/counts`)

```json
{
  "totalActive": 12,
  "unread": 5,
  "critical": 1,
  "warning": 8,
  "info": 3,
  "resolvedRecent": 4,
  "byDomain": {
    "VEHICLE_HEALTH": 6,
    "OPERATIONS": 4,
    "HANDOVERS": 2
  }
}
```

- `resolvedRecent`: resolved in the last 7 days  
- Severity and domain counts are **independent** (not mutually exclusive buckets)

---

## `availableActions`

Derived from **status**, **membership role**, and **event registry** (`supportedRoles`, `resolutionPolicy`).

| Action | Typical rule |
|--------|----------------|
| `read` / `unread` | Always when event visible to role |
| `acknowledge` | `OPEN` → `ACKNOWLEDGED` |
| `snooze` | `OPEN` or `ACKNOWLEDGED` → `SNOOZED` |
| `unsnooze` | Status `SNOOZED` |
| `resolve` | Manual resolve allowed (see below) + `ORG_ADMIN` / `SUB_ADMIN` / `WORKER` |
| `archive` | `ORG_ADMIN` / `SUB_ADMIN` on `OPEN` or `RESOLVED` |
| `open_entity` | When `action.target` is present |

### Manual resolve policy

| Event pattern | Manual `resolve` |
|---------------|------------------|
| `EVENT` kind | Allowed |
| `TECHNICAL_OBSERVATION_ACTIVE` | Allowed |
| `*_CREATED`, `*_RETURNED` | Allowed |
| Auto-cleared `STATE` (telemetry, station shortage, …) | **Blocked** — producer auto-resolves |

---

## Roles & scope matrix

| Role | List / read | Ack / snooze | Manual resolve | Archive | Station scope |
|------|-------------|--------------|----------------|---------|---------------|
| `ORG_ADMIN` | All event types in registry | ✓ | ✓ | ✓ | All stations |
| `SUB_ADMIN` | Registry ∩ role | ✓ | ✓ | ✓ | Assigned station if set |
| `WORKER` | Registry ∩ role | ✓ | ✓ (technical obs.) | ✗ | Assigned station if set |
| `DRIVER` | Registry ∩ role (subset) | ✓ | ✗ | ✗ | N/A |
| `MASTER_ADMIN` | All (via org guard) | ✓ | ✓ | ✓ | All |

Station scope (`membership.stationScope` ≠ `ALL`): notifications must reference the scoped station, or a vehicle at that station.

Event-type visibility comes from `supportedRoles` in `notification-event-registry.definitions.ts`.

---

## Security

1. `organizationId` is always taken from route + auth — never from request body.  
2. `OrgScopingGuard` enforces JWT org match + active membership.  
3. Foreign org → **404** (no data leak).  
4. Foreign entity filter → **404**.  
5. Write actions validate `availableActions` before mutation.  
6. Audit log (`ActivityLog`) for acknowledge, snooze, resolve, archive.  
7. Rate limits on all `POST` mutation endpoints.

---

## Error codes

| HTTP | When |
|------|------|
| `401` | Missing / invalid JWT |
| `403` | Wrong org, no membership, insufficient role |
| `404` | Unknown notification, foreign entity, out-of-scope station |
| `400` | Invalid lifecycle transition, past snooze date, disallowed action |
| `503` | `NOTIFICATIONS_V2` disabled |
| `429` | Throttle exceeded |

---

## Snooze body

```json
POST /notifications/:id/snooze
{ "until": "2026-07-12T08:00:00.000Z" }
```

`until` must be a valid ISO8601 timestamp in the future.

---

## Frontend migration

### Before cutover (current)

- UI reads **Dashboard Insights** + legacy Action Queue.  
- V2 engine runs in **shadow mode** (`NOTIFICATIONS_V2=true` on backend only for testing).

### After cutover

1. Enable `NOTIFICATIONS_V2=true` in production.  
2. Replace client-side notification aggregation with:
   - `GET /notifications` (inbox)
   - `GET /notifications/counts` (badges)
   - Action POSTs for user interactions
3. Keep i18n in frontend using `titleKey` / `bodyKey` / `templateParams`.  
4. Navigate via `action.type` + `action.target`.  
5. Remove direct `dashboard-insights` consumption for notification UI.

### Compatibility

Legacy `GET /organizations/:orgId/dashboard-insights` remains until frontend cutover is complete.

---

## Examples

```bash
# List unread vehicle-health warnings
GET /api/v1/organizations/{orgId}/notifications?activeOnly=true&domain=VEHICLE_HEALTH&unreadOnly=true&limit=20

# Badge counts
GET /api/v1/organizations/{orgId}/notifications/counts

# Mark read
POST /api/v1/organizations/{orgId}/notifications/{id}/read

# Snooze 24h
POST /api/v1/organizations/{orgId}/notifications/{id}/snooze
Content-Type: application/json
{ "until": "2026-07-12T12:00:00.000Z" }
```

---

## Implementation map

| Layer | Path |
|-------|------|
| Controller | `backend/src/modules/notifications/api/notifications.controller.ts` |
| Service | `backend/src/modules/notifications/api/notification-api.service.ts` |
| Query builder | `backend/src/modules/notifications/api/notification-query.util.ts` |
| Actions policy | `backend/src/modules/notifications/api/notification-available-actions.ts` |
| Manual resolve | `backend/src/modules/notifications/api/notification-manual-resolution.policy.ts` |
| Core lifecycle | `backend/src/modules/notifications/notification-core.service.ts` |
