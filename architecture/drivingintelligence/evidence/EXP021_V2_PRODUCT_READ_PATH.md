# EXP021 — V2 trip speed evaluation product read path

| Field | Value |
| --- | --- |
| Status | **PRODUCTION_BACKEND_READ_ON** (UI gate still OFF) |
| QC policy | `DI_V0_SPEED_QC_POLICY_V2` only |
| API | `GET /api/v1/vehicles/:vehicleId/trips/:tripId/gps-speed-evaluation-v2` |
| Backend gate | `DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENABLED` |
| UI gate | `VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED` |
| P2 auto-write gate | `DI_V0_P2_AUTO_PROJECTION_V2_*` (unchanged, independent) |

## Behavior

- Read-only: uses `DiV0TripSpeedQualityProjectionService.readCurrentOpsProjection(org, trip, V2)`; no compute, queue, provider, or DB writes.
- Stale CURRENT rows (non-active PRIMARY work item) are not returned (`null` → product `UNAVAILABLE` / `PENDING` via outbox).
- V1 rows are never mapped to the V2 product contract.
- Slim DTO: `DiV0TripGpsSpeedEvaluationProductV1` — no snapshot hashes, claim tokens, or raw worker errors.

## UI

- `TripGpsSpeedEvaluationPanel` in `TripTimelineExpanded` (rental trip detail).
- Null speed metrics render as “not available”, not `0`.
- Stationary interval count is shown separately from numeric coverage percentages.

## Validation (executed in CI / local)

- Backend unit: `di-v0-trip-speed-quality-product-read.{mapper,service,availability}.unit.spec.ts`
- Backend HTTP: `trip-gps-speed-evaluation-v2.http-security.integration.spec.ts` (guards, feature OFF, tenant isolation, GET side-effect spies on projection read vs write / P2 `runPass`)
- Frontend: `trip-gps-speed-evaluation-{ui,feature}.test.ts`, `TripGpsSpeedEvaluationPanel.test.tsx` (happy-dom rendered states)

## UI stationary semantics

- Panel primary count: `coverage.trustedLimitedStationaryIntervalCount` (V2 accepted).
- Optional separate row: `motion.stationarySupportedIntervalCount` (S1 motion candidates) when it differs.
- Numeric coverage percentages are unchanged by stationary acceptance counts.

## i18n

- Product keys live in `rental.tripGpsSpeedEvaluation.{en,de,pl,fr,cs,nl,es,it}.ts` only.
- Turkish (`tr`) remains **fallback-only** per registry — no owned `tripGpsSpeedEvaluation.*` keys.

## Production backend activation (2026-10-15)

| Field | Value |
| --- | --- |
| Owner authorization | YES — backend product-read only; UI separate |
| Application SHA | `a0dfaf2badac61eda280842981564e7ea160efc2` (unchanged — env-only) |
| Activation T0 (UTC) | `2026-10-15T21:45:13Z` |
| Changed | `DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_READ_ENABLED=true` in `/opt/synqdrive/shared/backend.env` |
| Previous value | **UNSET** (treated as OFF) |
| Env backup | `/opt/synqdrive/shared/backend.env.bak-exp021-product-read-v2-20261015214513` |
| Rollback | Remove line or set `false`; rolling restart both replicas at same SHA |

**Not changed:** `DI_V0_P2_AUTO_PROJECTION_V2_ENABLED=true`, `DI_V0_P2_AUTO_PROJECTION_V2_ENABLED_SINCE=2026-10-15T10:29:51.000Z`, outbox backoff, projections, `VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED` (not in production frontend build).

**Rolling restart:** canonical `vps-production-replica.lib.sh` A→B; post-verify SHA invariant + scheduler convergence (1 leader); public health 200.

**Authenticated HTTP proof (localhost nginx path, SynqDrive JWT + active org membership, fleet read):**

| Trip | Vehicle | HTTP | Availability | Assessability |
| --- | --- | --- | --- | --- |
| `9ead317c-8725-4373-b9ac-8bb84d5549be` | `8c850ff1-4201-432b-af2e-2711dbc7ca48` | 200 | READY | FULL |
| `72617129-0b33-4ef7-92ae-33ce1c4feffc` | `68868291-5478-42cd-b0c4-cc77b2a78e21` | 200 | READY | PARTIAL |

Product DTO fields matched persisted CURRENT V2 projection (max/mean, numeric + trusted numeric coverage, stationary limited count, assessability). Outbox rows unchanged across GETs; P2 scheduler pass log count delta 0 during GET window.

**Interval-wise preview parity:** remains **N/A_STORED_AGGREGATE_ONLY** at persistence layer (aggregate product DTO only).

## UI activation preparation (2026-10-15, not executed)

| Item | Value |
| --- | --- |
| Proposed target SHA (minimal) | `a0dfaf2badac61eda280842981564e7ea160efc2` — panel + API client already in tree; CI gate **success** @ 2026-10-15T20:37:17Z |
| Alternate SHA | `7de8f3ae2040a229f2a9c4b6a663117f1871fe55` (`main`) — adds **VSI P3** (#2041) + **PDI P1B.1** (#2043) + **2 Prisma migrations**; CI gate **success** on tip |
| Production frontend release | `20261015204530_v4994` → static `backend/public/assets/index-Y0Z0oChY.js` (built ~2026-10-15T20:57Z) |
| UI gate build config | `/opt/synqdrive/shared/frontend.env` — **`VITE_DI_V0_TRIP_SPEED_QUALITY_V2_PRODUCT_UI_ENABLED` absent** (not `true`) |
| UI gate shipped bundle | Code + i18n strings present; Vite gate strict `=== 'true'` → **OFF** at last production build (no build-time `true`) |
| Canonical deploy | **No frontend-only path** — `vps-deploy-release.sh` always `npm ci && npm run build` in `frontend/` (reads symlinked `frontend.env`) then promotes `backend/public`; owner path `CLOUD_AGENT_OWNER_DEPLOY_AUTHORIZED=1` + `cloud-agent-deploy.sh` + pinned SHA |
| Pre-activation frontend artifact | `index-Y0Z0oChY.js` @ release `20261015204530_v4994` |
| Browser check (post-activation) | Rental → vehicle detail → trip timeline expanded → section **GPS-based speed evaluation**; paths e.g. vehicle `8c850ff1-…` trip `9ead317c-…` and vehicle `68868291-…` trip `72617129-…` |
| Rollback UI | Restore `frontend.env` backup (remove/ false Vite flag); redeploy **same SHA** to rebuild bundle; prior artifact `index-Y0Z0oChY.js` |
