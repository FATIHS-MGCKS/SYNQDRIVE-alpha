# Fleet White Screen + Full Repo Audit (2026-04-15)

## Scope
- Reproduce and isolate the Fleet white-screen runtime failure in the Rental shell.
- Apply targeted runtime fixes with low blast radius.
- Audit frontend runtime hotspots, backend/workers/integrations, and dead/duplicate code paths.

## Confirmed Runtime Failure Risks
1. **Unsafe shell render path**
   - `frontend/src/rental/App.tsx` used `detailCustomer.id.replace(...)` without validating `id` type.
   - Any non-string or missing `id` could crash the full Rental tree.

2. **No Rental-level crash boundary**
   - A single component render error could propagate to a full white screen.

3. **Fleet response-shape drift risk**
   - Fleet map store assumed array-only API payload shape.
   - Wrapped payloads (`{ data: [...] }`) could cause runtime mapping failures.

4. **Auth redirect route mismatch**
   - Frontend hard-redirects to `/login` on `401`.
   - Backend SPA fallback previously did not include `/login`, enabling blank/404 outcomes in production deployments.

5. **Unsafe enum formatting in health/fleet condition UI**
   - Multiple `.replace('_', ' ')` calls on runtime values that may be non-string.

## Implemented Fixes
- `frontend/src/components/AppErrorBoundary.tsx`
  - Added reusable app-level runtime boundary with recovery UI.

- `frontend/src/rental/App.tsx`
  - Guarded `detailCustomerId` generation against malformed customer IDs.
  - Wrapped Rental shell with `AppErrorBoundary`.

- `frontend/src/rental/stores/useFleetMapStore.ts`
  - Added response normalization (`array` vs `{ data: array }`).
  - Filtered invalid fleet rows before mapping.

- `frontend/src/components/MapboxMap.tsx`
  - Added map initialization error handling and fallback render state.

- `frontend/src/rental/components/FleetConditionView.tsx`
- `frontend/src/rental/components/FleetConditionDetailView.tsx`
- `frontend/src/rental/components/HealthErrorsView.tsx`
  - Added safe enum-label formatting helper to avoid non-string `.replace()` crashes.

- `backend/src/spa-fallback.controller.ts`
  - Added SPA fallback routes for `/login` and `/login/*`.

- `backend/src/modules/high-mobility/high-mobility-eligibility.service.ts`
  - Hardened HM config access (`apiBaseUrl`, timeout) with safe fallbacks to avoid undefined-property runtime crashes.

## Dead Code / Duplicate Architecture Inventory
### Confirmed dead code removed
- Deleted unreferenced legacy Rental pages:
  - `frontend/src/rental/BookingsPage.tsx`
  - `frontend/src/rental/CustomersPage.tsx`
  - `frontend/src/rental/DashboardPage.tsx`
  - `frontend/src/rental/StationsPage.tsx`
  - `frontend/src/rental/VehiclesPage.tsx`

### Duplicate architecture still present (kept for now)
- `frontend/figma-rental/*`
- `frontend/figma-master/*`
- Not wired into active app routing; treat as parallel design/prototype surfaces until explicit decommission decision.

### Hygiene / tracking observations (no destructive cleanup performed)
- Large generated/runtime artifact surfaces are still present in workspace history and should remain ignored/segregated operationally.
- Existing repo has broad pre-existing dirty state and mixed legacy/canonical paths from earlier refactors.

## Additional Audit Findings (Not changed in this pass)
- `frontend/src/rental/components/TopBar.tsx` still contains mock search datasets; not a crash source but a realism/maintainability smell.
- `frontend/src/rental/components/HealthErrorsView.tsx` has many `catch(() => null)` paths that suppress diagnostics; recommend phased error-surface refactor.
- Backend startup robustness still depends on process hygiene (observed `EADDRINUSE` risk when multiple backend instances run on same port).

## Recommended Next Cleanup Waves
1. Add structured frontend error logging surface instead of silent `catch(() => null)` in high-value health views.
2. Consolidate or retire `figma-*` frontend mirrors after product/design sign-off.
3. Introduce lightweight startup guard or operator message for backend port collisions.
4. Split oversized `frontend/src/lib/api.ts` into domain API clients to reduce coupling and drift risk.
