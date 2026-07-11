# Notification Engine — Frontend Dashboard Cutover

Controlled cutover of the Dashboard **ActionQueue** (notification box) from V1 multi-source assembly to the canonical Notification Engine V2 REST API.

## Feature flags

| Layer | Flag | Values | Effect |
|-------|------|--------|--------|
| Frontend | `VITE_NOTIFICATIONS_V2` | unset / `off` / `false` | V1 only |
| Frontend | `VITE_NOTIFICATIONS_V2` | `shadow` | V1 UI + background V2 fetch + internal compare |
| Frontend | `VITE_NOTIFICATIONS_V2` | `on` / `true` | V2 API is the **sole** notification box source |
| Backend | `NOTIFICATIONS_V2` | `true` | REST API enabled (`503` when off) |

Frontend and backend flags are independent during rollout: shadow mode can fetch V2 while the UI still shows V1.

## V1 path (flag off)

```
DashboardInsightsContext ─┐
VehicleHealthAlerts      ─┤
Bookings (pickup/return) ─┼─► buildUnifiedActionQueue() ─► ActionQueue.tsx
Derived insights         ─┤      (notificationEngineDedupe)
Predictive insights      ─┤
Runtime state            ─┘

Tab counts: computeActionQueueTabCounts(loaded items)
```

V1 logic remains in place — **not deleted**. Gated by `getNotificationsV2Mode() === 'off'`.

## Shadow mode

```
V1 buildUnifiedActionQueue() ──► displayed in ActionQueue
V2 GET /notifications        ──► background fetch
V2 GET /notifications/counts ──► not shown in UI
compareNotificationQueuesShadow() ──► console.debug diagnostics only (no titles)
```

Compared fields: active count, semantic fingerprints, severity, entity, status, CTA, duplicates, missing/extra keys.

## V2 path (flag on)

```
GET /organizations/:orgId/notifications
GET /organizations/:orgId/notifications/counts
        │
        ▼
notificationClient → useNotifications()
        │
        ▼
mapNotificationApiToActionQueueItem()  (canonical ViewModel from DTO)
        │
        ▼
ActionQueue.tsx (single source — no insight/health/booking merge)
```

Mutations (optimistic + rollback): `read`, `unread`, `acknowledge`, `snooze`, `unsnooze`, `resolve`, `archive`.

CTA routing: `action.type` + `action.target` via `navigateNotificationV2Action()` — no local CTA guessing in V2 path.

Tab badges: `mapApiCountsToTabCounts()` from `/counts` — **not** estimated from page 1.

## Key frontend files

| File | Role |
|------|------|
| `frontend/src/rental/lib/notifications/notifications-v2-flag.ts` | Mode detection |
| `frontend/src/rental/lib/notifications/notification-client.ts` | API client |
| `frontend/src/rental/hooks/useNotifications.ts` | Query + mutations hook |
| `frontend/src/rental/lib/notifications/map-notification-api-to-view-model.ts` | DTO → ActionQueueItem |
| `frontend/src/rental/lib/notifications/map-api-counts-to-tab-counts.ts` | Counts → tab badges |
| `frontend/src/rental/lib/notifications/notification-shadow-compare.ts` | V1 vs V2 diagnostics |
| `frontend/src/rental/lib/notifications/notification-v2-action-router.ts` | Backend action → navigation |
| `frontend/src/rental/components/dashboard/useDashboardViewModel.ts` | Cutover wiring |
| `frontend/src/rental/components/dashboard/ActionQueue.tsx` | UI (counts, errors, CTA) |

## Removed from V2 path (not deleted globally)

- Synthetic notification IDs in titles
- Fachliche frontend deduplication (`notificationEngineDedupe` not applied to V2 list)
- Severity derivation from legacy `type` fields
- Local CTA resolution (`notificationCtaResolver` bypassed for `source: notifications-v2`)
- `Date.now()` sort keys (uses `lastSeenAt` from API)
- Re-generation of driving-assessment / health duplicate cards from insights

Defensive dedupe by notification `id` only remains in `dedupeNotificationsById()`.

## Rollout steps

1. Deploy backend with `NOTIFICATIONS_V2=true` and shadow producers (Phase 1).
2. Set `VITE_NOTIFICATIONS_V2=shadow` on staging; monitor `console.debug [notifications-v2 shadow]` deltas.
3. Align missing/extra fingerprints with producer migration before cutover.
4. Set `VITE_NOTIFICATIONS_V2=on` for pilot orgs.
5. Global frontend cutover when shadow deltas are acceptable.
6. Remove V1 assembly from ActionQueue path (future prompt — after stable production period).

## Rollback

| Symptom | Action |
|---------|--------|
| V2 API errors / 503 | Set `VITE_NOTIFICATIONS_V2=off` — instant V1 restore |
| Wrong notifications in V2 | `shadow` mode while fixing producers; UI stays V1 |
| Backend instability | `NOTIFICATIONS_V2=false` — API returns 503; frontend off flag |
| Mutation bugs | Disable `on` flag; V1 read-only queue unaffected |

No database rollback required — V2 tables are additive.

## Legacy files to remove later (after V2 stable)

- `actionQueueBuilder.ts` — insight/health/booking merge for notifications (keep if used elsewhere)
- `notificationEngineDedupe.ts` — fachliche dedupe (V1 only today)
- `dashboardNotificationAdapter.ts` — synthetic insight notifications
- `notificationCtaResolver.ts` — local CTA guessing (V1 path)
- `deriveOperationalInsights.ts` / `derivePredictiveOperationsInsights.ts` — notification card inputs (retain for other surfaces if needed)
- Shadow compare module — optional after cutover complete

## Local verification

```bash
cd frontend
npm run typecheck   # or npx tsc --noEmit
npm run lint
npm test
VITE_NOTIFICATIONS_V2=shadow npm run dev
VITE_NOTIFICATIONS_V2=on npm run dev
npm run test:e2e -- dashboard-notifications-v2.spec.ts
```

## Error states (V2 UI)

| Condition | User-facing fallback |
|-----------|---------------------|
| Network error | Banner + empty/safe list |
| API disabled (503) | Explicit “endpoint unavailable” banner |
| Permission denied | Permission banner |
| Mutation failure | Optimistic rollback + silent retry on refresh |
| Unknown template key | `plate` / `label` fallback, no broken card |
| Unknown action type | Safe `open-rental` navigation |
