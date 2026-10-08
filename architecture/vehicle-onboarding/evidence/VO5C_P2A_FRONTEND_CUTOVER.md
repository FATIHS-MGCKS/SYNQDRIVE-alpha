# VO-5C-P2A — Master Admin safe offboard frontend cutover

| Field | Value |
|-------|-------|
| **Slice** | VO5C-P2A (Connected Vehicles UI only) |
| **Status** | P2A.3 CONCURRENCY CLOSURE (draft PR #1921) |
| **Depends on** | VO5C-P1 merge `340b4c86ab30e9c06c0b74d39ae394dc0af170bb` |
| **Last updated** | 2026-10-08 |

## Scope

- Connected Vehicles Master Admin UI calls `POST /admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard` only.
- **No** `api.vehicles.deregister` from Connected Vehicles surfaces.
- MFA step-up (`MASTER_INTEGRATIONS`) with stable per-intent idempotency key.
- Registry lifecycle badges + server-side `registryLifecycle` list filter (default `ACTIVE`).
- **Unchanged:** legacy `POST admin/vehicles/:vehicleId/deregister`, tenant DELETE routes, RE_ONBOARD, Stripe/provider network from UI.

## Release gate

```
PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED=NO (as of P2A implementation)
```

Do **not** deploy P2A to production before P1 offboard route is verified live. **Fail-closed:** `VITE_MASTER_VEHICLE_OFFBOARD_UI` must be explicitly `on`/`true`/`1` to show the action; absent/invalid → hidden.

### P2A.3 final concurrency closure (2026-10-08)

- Request-generation ownership: stale HTTP completions cannot release `httpInFlight` or mutate B’s pending intent/phase.
- Hub uncertain UX keyed off `VehicleOffboardRequestError.kind === TRANSPORT_UNCERTAIN` (not stale React phase).
- Failed offboard: no success toast/refresh; OFFBOARDED list/detail/history mounted tests.
- **Overview counts policy (open):** `getOverview().counts.registered` uses full `vehicle.count()` (all lifecycles); attention sample uses 500 registered rows **without** lifecycle predicate — OFFBOARDED vehicles may appear in attention sample if flagged; not changed in P2A.
- **Enriched filter pagination (legacy):** `attention` / connectivity / freshness filters fetch `take: 500` then filter/slice — pre-existing; not introduced by P2A; tracked separately if product needs deep pages.

### P2A.2 reliability seal (2026-10-08)

- `requestResult` status `0` classified as `TRANSPORT_UNCERTAIN` (pending intent + idempotency key retained).
- Pending-intent conflict guards for MFA/uncertain phases; stale HTTP responses ignored after abandon.
- Fetch-boundary client tests + hub refresh/MFA integration tests; backend operational list integration proofs.

### P2A.1 hardening (2026-10-08)

- MFA HTTP in-flight lock released on `STEP_UP_REQUIRED`; Hub `onClose` does not abandon intent after successful MFA (`skipMfaCancelCleanupRef`).
- Semantic offboard intent session binds idempotency key to org/vehicle/reason/note.
- Uncertain transport UX with retry/abandon in detail drawer.
- `registryLifecycle=all` sent explicitly; backend omits lifecycle filter only when param omitted or `all`.
- i18n governance: removed ad-hoc generator; `hardcoded-copy-inventory.json` unchanged vs main.
- `TR_NATIVE_OFFBOARD_COPY=NO` (English runtime fallback per registry policy).

## Flags

| Flag | Meaning |
|------|---------|
| `VO5C_P1_COMPLETE` | YES (merged on main) |
| `VO5C_P2A_IMPLEMENTED` | YES (this slice) |
| `VO5C_P2B_LEGACY_LOCKDOWN` | NOT_DONE |
| `VO5C_TOTAL_CUTOVER_COMPLETE` | NO |

## Validation

```bash
cd frontend && npm run test -- connected-vehicles-offboard
cd frontend && npm run i18n:check
cd backend && npm test -- vehicles-operational.registry-lifecycle-filter
```
