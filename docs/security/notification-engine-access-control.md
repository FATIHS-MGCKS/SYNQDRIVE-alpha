# Notification Engine — Access Control (V4.9.874)

**Date:** 2026-07-26  
**Scope:** Tenant isolation, station scope, role matrix, and negative security tests.

Companion: `docs/notification-engine-permissions-and-preferences.md`

## Defense layers

1. **Route org binding** — `organizationId` only from `:orgId` path param, never request body.
2. **OrgScopingGuard** — JWT `organizationId` must match route; ACTIVE membership required (except MASTER_ADMIN).
3. **User status** — `User.status === ACTIVE` checked in `NotificationApiService.resolveAccessContext`.
4. **Repository scoping** — all queries include `organizationId`.
5. **Role registry filter** — `supportedRoles` per `eventType`.
6. **Station scope** — Stations V2 `allowedStationIds` + vehicle/booking expansion; SQL + row-level checks.
7. **Preferences** — in-app visibility per category; mandatory events bypass suppression.
8. **404 not 403** — out-of-scope rows return `NotFoundException` to prevent enumeration.

## Permission matrix

| Operation | ORG_ADMIN | SUB_ADMIN | WORKER | DRIVER | MASTER_ADMIN | Station scope |
|-----------|-----------|-----------|--------|--------|--------------|---------------|
| list | ✓ | ✓ | ✓ | ✓ | ✓ | Yes |
| counts | ✓ | ✓ | ✓ | ✓ | ✓ | Yes |
| detail | ✓ | ✓ | ✓ | ✓ | ✓ | Yes |
| read/unread | ✓ | ✓ | ✓ | ✓ | ✓ | Yes |
| acknowledge | ✓ | ✓ | ✓ | ✓ | ✓ | Yes |
| snooze/unsnooze | ✓ | ✓ | ✓ | ✓ | ✓ | Yes |
| resolve | ✓ | ✓ | ✓ | ✗ | ✓ | Yes |
| archive | ✓ | ✓ | ✗ | ✗ | ✓ | Yes |
| delivery_retry | ✓ | ✓ | ✗ | ✗ | ✓ | Org-level |
| admin_audit | ✓ | ✓ | ✗ | ✗ | ✓ | Org-level |
| CUSTOMER | ✗ | — | — | — | — | — |

Source: `access/notification-access-permissions.ts`

## Station scope rules

- Based on **current** membership + Stations V2 effective access (`StationAccessService.resolve`).
- Multi-station users: `scopedStationIds[]` drives SQL OR filter and `isNotificationInScope`.
- Zero assigned stations → **zero rows** in list/counts (`id: '__none__'`).
- Org-wide exceptions: integration disconnect, webhook failure, ORGANIZATION entity, SECURITY CRITICAL.
- Entity query params (`vehicleId`, `stationId`, `bookingId`) validated for org **and** caller scope → 404.

## MASTER_ADMIN

- Passes `OrgScopingGuard` without membership.
- If ACTIVE membership exists in target org → normal scope for that role.
- Without membership → ORG_ADMIN-equivalent visibility with `bypassStationScope: true`.

## Deactivated users

- Login/refresh blocked at auth layer.
- Notification API additionally rejects `User.status !== ACTIVE` at request time.

## Security tests

`access/notification-access.security.regression.spec.ts`:

- Org A vs Org B (404)
- Worker station A vs station B
- Manipulated vehicleId / bookingId
- Driver cannot resolve CRITICAL
- Customer role rejected
- Deactivated user (403)
- MASTER_ADMIN without membership (allowed with bypass)
- Multi-station SQL + zero-station deny
