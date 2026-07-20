# Fleet Health Service — Scale Benchmarks (Phase 7 P51)

Reproducible **synthetic** scale coverage for Zustand & Service / Rental Health fleet surfaces.
No production load tests. Run locally or in CI:

```bash
cd frontend && npm test -- fleet-rental-health-pagination.scale fleet-condition-pipeline.scale fleet-health-service.view-model.scale useVehicleHealth.scale
cd backend && npm test -- rental-health-fleet.scale
```

## Fleet tiers

| Tier | Vehicles | Scoped HTTP pages (50/page) | Legacy `?vehicleIds=` URL |
|------|----------|-------------------------------|---------------------------|
| S    | 100      | 2                             | ~3.7 KB (OK)              |
| M    | 500      | 10                            | ~18.5 KB (**over 8 KB warn**) |
| L    | 1,000    | 20                            | ~37 KB                    |
| XL   | 5,000    | 100                           | ~185 KB                   |

**Rule:** Production clients must use `GET .../rental-health/fleet` (scoped, paginated). Legacy `vehicleIds` CSV is compatibility-only.

## Documented limits

| Dimension | Limit / expectation | Test location |
|-----------|---------------------|---------------|
| Scoped URL length | `< 2,048` bytes with filters+cursor | `fleet-rental-health-pagination.scale.test.ts` |
| Legacy URL length | Warn `> 8,192` bytes at 500+ IDs | same |
| Client page requests | `ceil(N / 50)` per full-fleet materialization | `fleet-rental-health-pagination.scale.test.ts` |
| Backend Prisma reads / fleet page | Exactly 3 (`count`, `groupBy`, `findMany`) + 1 summary batch | `rental-health-fleet.scale.spec.ts` |
| Backend page size cap | 50 vehicles / request | `rental-health-fleet-cursor.util` |
| Filter+group CPU (client) | ≤80ms @100, ≤250ms @500, ≤500ms @1k, ≤2s @5k | `fleet-condition-pipeline.scale.test.ts` |
| View-model CPU (client) | ≤120ms @100, ≤400ms @500, ≤800ms @1k, ≤3s @5k | `fleet-health-service.view-model.scale.test.ts` |
| Health map memory (JSON) | `< 2.5 KB × N` vehicles (synthetic) | `useVehicleHealth.scale.test.ts` |
| Expanded list DOM rows | Virtualize when group `> 50` rows | `FleetConditionView` + `FLEET_CONDITION_VIRTUALIZE_THRESHOLD` |

## Virtualization decision (P51)

Measurement: expanded operator groups with **>50** vehicles would mount one DOM node per row.
Default UX auto-expands only `action_required` / `needs_review` (or `good` when ≤8 healthy).

**Action:** `@tanstack/react-virtual` list in `FleetConditionVirtualizedVehicleRows` when
`group.vehicles.length > 50`. Smaller groups keep simple `.map()` rendering.

## Known remaining scale gaps (documented, not fixed in P51)

1. **Full-fleet client materialization** — `useFleetHealthMap` still builds one `Map` for entire org after paginated fetch (bounded by request count, not DOM).
2. **Tasks subtab** — `useServiceCenterData` loads unpaginated org tasks (separate P1 from audits).
3. **Server-side filter on health hook** — `FleetConditionView` filters client-side; station filter not passed to health fetch from FHS shell.

## Fixtures

`frontend/src/rental/components/fleet-health-service/fleet-health-scale.fixtures.ts` — synthetic vehicles/health at 100 / 500 / 1000 / 5000 with mixed severity profile (~5% blocked, ~10% critical, ~15% warning).
