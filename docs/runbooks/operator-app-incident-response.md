# Operator App — Incident Response Runbook

| Field | Value |
|-------|-------|
| **Scope** | `/operator` field shell, handover, tasks, scan, uploads |
| **Owner** | `[PLACEHOLDER — DevOps / On-call]` |
| **Last updated** | 2026-07-25 |

## Severity matrix

| Severity | Examples | Response |
|----------|----------|----------|
| **SEV-1** | Handover 5xx spike, auth bypass, cross-tenant data leak | Page on-call, consider feature disable |
| **SEV-2** | Upload/OCR queue backlog, task complete failures | Investigate within 1h |
| **SEV-3** | UI degradation, single-station scope errors | Next business day |

## Triage checklist

1. **Health:** `GET https://app.synqdrive.eu/api/v1/health` and `/health/readiness`
2. **Operator shell:** `GET https://app.synqdrive.eu/operator` → 200
3. **Auth gate:** Unauthenticated `GET …/bookings/today/pickups` → 401
4. **Queues:** VPS `document.extraction`, `task.automation` wait/active/failed counts
5. **Logs:** `pm2 logs synqdrive --lines 200` — grep `handover`, `HANDOVER`, `TASK_OPTIMISTIC_LOCK`, `upload`

## Common incidents

### Handover submit fails (4xx/5xx)

- Verify booking status (CONFIRMED for pickup, ACTIVE for return)
- Check station scope (`StationAccessService`) — worker may lack station membership
- Check pickup gate / legal documents in rental detail
- Review `bookings-handover.service` conflict codes: `HANDOVER_ALREADY_EXISTS`, `HANDOVER_PICKUP_VEHICLE_BLOCKED`

### Upload / OCR stuck

- Readiness: `documentExtraction` component on `/health/readiness`
- Queue: `document.extraction` failed jobs
- Rate limit: `DOCUMENT_UPLOAD_RATE_LIMITED` (429)

### Task version conflict (409)

- Expected when concurrent edits; operator should refresh task and retry
- Code: `TASK_OPTIMISTIC_LOCK`

### Operator not loading

- Verify Clerk session / WORKER role
- Check `OperatorAccessGuard` denial reasons
- Desktop: user needs mobile viewport or `VITE_ALLOW_OPERATOR_DESKTOP=true` (dev only)

## Escalation

1. Engineering lead — application logic / regressions
2. DevOps — VPS, PM2, Redis, Postgres
3. DPO — GDPR/retention if data exposure suspected

## Related

- `docs/runbooks/operator-production-smoke.md`
- `docs/runbooks/operator-retention-enablement.md`
- `docs/audits/operator-app-vps-control-audit-2026-07.md`
