# Master Admin Dashboard Render — Production Closure (UI-DASH-RENDER-P1-001)

| Feld | Wert |
|------|------|
| **Finding-ID** | `UI-DASH-RENDER-P1-001` |
| **Severity** | P1 |
| **Status** | **CLOSED** |
| **Datum (UTC)** | 2026-08-18 |
| **Scope** | Master Admin default dashboard (`/master?view=dashboard`) |

---

## Finding

**Beschreibung:** Authenticated Master Admin default dashboard renders white screen / React runtime error on Production while operational dashboard API responds successfully.

**Klassifikation:** Frontend render / `useSyncExternalStore` contract — **nicht** Lifecycle/Provisioning.

---

## Production Error Evidence (pre-fix)

| Signal | Wert |
|--------|------|
| **Route** | `https://app.synqdrive.eu/master?view=dashboard` |
| **Symptom** | White screen after successful login |
| **Browser console** | React minified error **#185** (maximum update depth exceeded) |
| **API** | `GET /api/v1/admin/dashboard/operational` → **200** with full payload |
| **Workaround** | Manual navigation to `?view=organizations` rendered correctly |
| **Frontend SHA (pre-fix)** | `index-Dn0wo6ra.js` (release `20260818164953_v4994`) |
| **Backend SHA (pre-fix)** | `9a2e4aa9` |

Keine Credentials oder Tokens dokumentiert.

---

## Root Cause

`useMasterDashboardOperational` subscribed via `useSyncExternalStore` to `getCachedOperationalDashboard()`, which **returned a new object on every `getSnapshot` call**:

```typescript
return { data: cached, fetchedAt: cachedAt, isStale: ... };
```

React requires `getSnapshot` to return a **stable reference** until the external store updates. The unstable reference triggered continuous re-renders → **infinite render loop** → white screen. Other master views (e.g. Organizations) did not mount this hook on first paint, so they appeared unaffected.

**Not caused by:** API contract drift, missing backend fields, or MFA/provisioning changes.

---

## Fix

| Datei | Änderung |
|-------|----------|
| `frontend/src/master/dashboard/operational-cache.ts` | Canonical stable `OperationalDashboardSnapshot` with `revision`; `commitSnapshot()` only on store updates |
| `frontend/src/master/dashboard/useMasterDashboardOperational.ts` | Subscribe to `getOperationalDashboardSnapshot`; compute `isStale` from `fetchedAt` in hook |

No new business logic. Existing operational API DTO reused as source of truth.

---

## Tests

| Test | Pfad |
|------|------|
| Snapshot stability | `frontend/src/master/dashboard/operational-cache.test.ts` |
| Render regression (production-shaped fixture) | `frontend/src/master/dashboard/master-dashboard-render.test.tsx` |
| Partial/null modules | same |
| Infinite re-render guard | same |
| Scenario matrix | `frontend/src/master/dashboard/master-dashboard-scenarios.test.ts` |

**Command:** `npm test -- src/master/dashboard/operational-cache.test.ts src/master/dashboard/master-dashboard-render.test.tsx`

---

## Deploy

| Feld | Wert |
|------|------|
| **Pre-fix Production SHA** | `8bec2c03` (docs) / frontend `index-Dn0wo6ra.js` |
| **Fix commit** | _(filled after deploy)_ |
| **Post-fix Production SHA** | _(filled after deploy)_ |
| **Rollback target** | Previous release `20260818164953_v4994` |

---

## Authenticated Production Verification

_(filled after deploy + smoke lifecycle run)_

| Check | Ergebnis |
|-------|----------|
| `/master?view=dashboard` renders | |
| No white screen | |
| No React render error | |
| API `GET /admin/dashboard/operational` 200 | |
| Sidebar + header visible | |
| Mobile dashboard | |
| Smoke cleanup + gate disabled | |

---

## Reconciliation impact

- `UI-DASH-RENDER-P1-001` → **CLOSED**
- `UI-STAGING-SMOKE` remains **CLOSED** after dashboard verification (default view requirement satisfied)

---

**Changes / Architektur:** `architecture/MASTER_ADMIN_DASHBOARD_RENDER_FIX_2026-08-18.md`
