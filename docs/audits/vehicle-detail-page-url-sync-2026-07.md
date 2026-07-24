# Vehicle Detail Page — URL Sync (2026-07)

## Scope

Prompt 23/36: synchronize `vehicleId` and active vehicle detail tab with the browser URL on `/rental`.

## URL contract

| Param | Name | Example |
|-------|------|---------|
| `vehicleId` | Vehicle UUID (operator-aligned) | `?vehicleId=v-op-avl` |
| `vdTab` | Vehicle detail tab key | `&vdTab=health-errors` |
| `vehicleTab` | Legacy alias for `vdTab` | `&vehicleTab=trips` |

Default tab when omitted: `overview`.

Finance `view` and fleet-health `fhs*` params are unchanged.

## Behavior

- Direct link → resolves vehicle after fleet load, opens tab
- Reload → same vehicle + tab from URL
- Browser back/forward → `popstate` reapplies URL state
- Invalid `vehicleId` → toast, clear params, fleet view (no fallback to first vehicle)
- Missing fleet read permission → error toast, clear params, fleet view
- Invalid tab → safe default `overview`
- Close detail / leave vehicle views → strip vehicle params
- Org switch (full reload) → URL re-resolved against new org fleet

## Files

- `frontend/src/rental/lib/vehicle-detail-navigation.ts`
- `frontend/src/rental/App.tsx` — `openVehicleDetail`, resolver, popstate, sync
- `frontend/src/rental/lib/vehicle-detail-navigation.test.ts`
- `frontend/e2e/vehicle-detail-url-sync.spec.ts`

## Tests

```bash
cd frontend && npm test -- vehicle-detail-navigation
cd frontend && npm run test:e2e -- vehicle-detail-url-sync
```
