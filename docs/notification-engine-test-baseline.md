# Notification Engine — Test Baseline

**Stand:** 2026-07-10  
**Grundlage:** `docs/notification-engine-current-state.md`

## Neue Testdateien

- `frontend/src/rental/components/dashboard/notificationEngine.fixtures.ts`
- `frontend/src/rental/components/dashboard/notificationEngine.test-utils.ts`
- `frontend/src/rental/components/dashboard/dashboardNotificationAdapter.ts` (minimal prod extract)
- `frontend/src/rental/components/dashboard/dashboardNotificationAdapter.test.ts`
- `frontend/src/rental/components/dashboard/notificationEngine.characterization.test.ts`
- `frontend/src/rental/components/dashboard/notificationEngine.wob-l7503.test.ts`
- `backend/src/modules/business-insights/notification-engine.characterization.spec.ts`
- `backend/src/modules/business-insights/business-insights-trigger.characterization.spec.ts`

## Testkommandos

```bash
cd frontend && npm test -- --run src/rental/components/dashboard/notificationEngine*.test.ts src/rental/components/dashboard/dashboardNotificationAdapter.test.ts
cd backend && npm test -- --testPathPattern="notification-engine|business-insights-trigger.characterization"
cd frontend && npm test -- --run
cd backend && npm test
```

## Ergebnisse (2026-07-10)

| Suite | Pass | Fail |
|-------|------|------|
| Neue Frontend | 32 | 12 (target architecture — expected) |
| Neue Backend | 20 | 0 |
| Frontend total | 774 | 12 |

## Reproduzierte Bugs (bestätigt)

- Driving assessment: 2–3 ActionQueue items per run (normalized + legacy + synthetic)
- RECOVERING shown as warning via synthetic notification
- Synthetic CTA: open-rental without vehicleId
- timeSortMs uses Date.now() for normalized issues
- EN locale shows German backend titles
- complaints health module hidden from ActionQueue (health_review_required visibility)

## Ziel-Tests (12 failing until fix)

See `notificationEngine.characterization.test.ts` describe block `target architecture`.

## Prod change

Only `dashboardNotificationAdapter.ts` extraction + `useDashboardViewModel` import.

Changes/Architektur: not updated (test-only prompt).
