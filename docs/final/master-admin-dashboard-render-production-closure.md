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
| **Pre-fix Production SHA** | `8bec2c03` / frontend `index-Dn0wo6ra.js` |
| **Fix commit** | `28138344` |
| **Post-fix Production SHA** | `28138344` |
| **Production Release** | `20260818182759_v4994` |
| **Frontend Asset (post-fix)** | `index-DB0NbaUr.js` |
| **Rollback target** | Release `20260818164953_v4994` / `index-Dn0wo6ra.js` |

---

## Authenticated Production Verification

| Check | Ergebnis |
|-------|----------|
| `/master?view=dashboard` renders | **PASS** |
| No white screen | **PASS** |
| No React render error (#185) | **PASS** (CSP warnings only) |
| API `GET /admin/dashboard/operational` 200 | **PASS** (pre-fix evidence retained) |
| Sidebar + header visible | **PASS** |
| Platform state visible | **PASS** |
| Dashboard ↔ Organizations navigation | **PASS** |
| Drilldowns: Organizations, Billing, Vehicles, Operations | **PASS** (read-only) |
| Mobile dashboard (414×896) | **PASS** |
| Smoke cleanup + gate disabled | **PASS** (`verification.ok: true`, gate `false`) |

### Walkthrough artifacts

| Artifact | Beschreibung |
|----------|--------------|
| `dashboard_fix_verified_desktop.png` | Desktop dashboard nach Fix — Sidebar, Header, Platform State sichtbar |
| `dashboard_fix_verified_mobile.png` | Mobile dashboard (414×896) |
| `dashboard_render_fix_production_verification.mp4` | End-to-end: Login → Dashboard → Drilldowns → Mobile → Cleanup |

Console: keine React #185; nur CSP-Warnungen. Network: `GET /api/v1/admin/dashboard/operational` → 200.

---

## Reconciliation impact

- `UI-DASH-RENDER-P1-001` → **CLOSED**
- `UI-STAGING-SMOKE` → **CLOSED** (default dashboard view now verified)

---

**Changes / Architektur:** `architecture/MASTER_ADMIN_DASHBOARD_RENDER_FIX_2026-08-18.md`
