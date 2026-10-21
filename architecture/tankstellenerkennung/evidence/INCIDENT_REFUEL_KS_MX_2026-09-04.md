# Incident evidence — KS MX 2024 natural post-cutover REFUEL (2026-09-04)

**ID:** `FST-EVID-INCIDENT-REFUEL-2026-09-04-001`  
**Classification:** `PRODUCTION_OBSERVATION` (read-only forensic pass)  
**Status:** Forensic + design phase complete; production rows preserved as evidence  
**Vehicle:** KS MX 2024 — Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)

## Owner ground truth (authoritative station identity)

| Field | Value |
|-------|-------|
| Station | Esso Tankstelle |
| Address | Ysenburgstraße 22, 34125 Kassel, Germany |
| OSM | `way/260122108` |
| Centroid | `51.32133585, 9.51465858` |
| Approx. arrival | ~05:43 local (CEST) — human recollection, ±few minutes |
| Approx. departure | ~05:47 local (CEST) — human recollection, ±few minutes |

## Production SHA context (forensic pass)

| Reference | SHA / release |
|-----------|----------------|
| `origin/main` at forensic branch base | `95234b28bfa88b328430bb7af769e57ad30a275a` |
| Production deployed (2026-09-03 21:11 UTC) | `5b788a223d0461f29b96b142e51388c9831366a2` |
| Production release dir | `20260903211138_v4994` |
| **Production ≠ main** | **Yes** |

## Persisted REFUEL rows (not modified)

### Event A — `3892fda9-fec6-4412-b735-918ccee75b38`

| Field | Value |
|-------|-------|
| Local window | ~05:40:45 → 05:55:10 |
| UTC window | `2026-09-04T03:40:45Z` → `03:55:10Z` |
| Created | `2026-09-04T03:48:44Z` |
| Confidence | HIGH |
| Fuel | 7 L → 28 L (+21 L, 31.76 %) |
| `dimoSegmentId` | `dimo-refuel-187336-1788493245000` |
| Start GPS | `51.3305883, 9.5126383` |
| `fuelLevelRise` | `03:47:45Z` → `03:52:45Z` (~05:47:45 → 05:52:45 local) |
| Duration | 865 s |

### Event B — `5e0d7e51-42d2-464d-897f-844854614579`

| Field | Value |
|-------|-------|
| Local window | ~05:48:43 → 05:55:10 |
| UTC window | `2026-09-04T03:48:43.109Z` → `03:55:10Z` |
| Created | `2026-09-04T04:33:44Z` (~45 min after A) |
| Confidence | MEDIUM |
| Fuel | 21 L → 28 L (+7 L, 8.63 %) |
| `dimoSegmentId` | `dimo-refuel-187336-1788493723109` |
| Start GPS | `51.3150216, 9.5170483` |
| `fuelLevelRise` | `03:49:13Z` → `03:52:43Z` |
| Duration | 386 s |

### Structural relationships (CONFIRMED from production SELECT)

- B temporally contained in A; identical `endTime`, terminal fuel (28 L / 43.14 %), `odometerEndKm` 187740
- B describes suffix transition 21→28 inside A's envelope 7→28
- Segment start delta ≈ 478 s; start-coordinate distance ≈ 1,758 m
- Different `dimoSegmentId` → separate upsert keys

## Enrichment outcomes (CONFIRMED)

Both rows: `vehicle_energy_event_fuel_station_enrichments` → `processingStatus=COMPLETED`, `resolutionStatus=NOT_FOUND`.

| Event | Input coordinate | Resolver | OSM dataset |
|-------|------------------|----------|-------------|
| A | `51.3305883, 9.5126383` | `fuel-station-resolver-v1` | `geofabrik-germany-20260830` |
| B | `51.3150216, 9.5170483` | same | same |

Resolver executed successfully (not queue/worker failure). V1 policy: `deriveCanonicalFuelStationCoordinate` → segment `startLatitude/startLongitude`.

## OSM spatial probes (read-only PostGIS)

| Probe point | Candidates ≤250 m | Resolver outcome |
|-------------|-------------------|------------------|
| Event A start | 0 | NOT_FOUND |
| Event B start | 0 | NOT_FOUND |
| Midpoint A/B (`51.3228, 9.5148`) | Aral + Esso ~150 m | score 8 each → NOT_FOUND (<55) |
| Esso centroid (`51.32133585, 9.51465858`) | Esso | MATCHED HIGH, score 178 |

Distances to Esso centroid:

| Point | Distance |
|-------|----------|
| Event A start | ~1,038 m |
| Event B start | ~721 m |
| A/B midpoint | ~163 m |

Nearby competitor: Aral `way/697554280` ~297 m from Esso.

## Pipeline path exercised (CONFIRMED — partial E2E)

| Stage | Exercised? |
|-------|------------|
| Natural REFUEL detection | Yes |
| REFUEL persistence | Yes (×2 — defect A) |
| Post-persist enrichment hook | Yes (×2) |
| BullMQ enqueue + processor | Yes |
| Enrichment persistence | Yes |
| Resolver execution | Yes |
| API/UI NOT_FOUND presentation | Yes |
| **MATCHED station / trusted UI** | **No** |

**NATURAL POSITIVE REFUEL MATCH PATH STILL NOT PRODUCTION_VALIDATED.**

## Timing hypothesis (INFERRED — HF telemetry pending)

Owner departure ~05:47 local vs `fuelLevelRise` end ~05:52:45 local implies **≥~5 min fuel-signal observation lag** after physical fueling. Cannot treat rise-window GPS as physical stop location without HF dwell reconstruction.

## Cross-domain defects identified

| ID | Domain | Summary |
|----|--------|---------|
| `EED-GAP-PHYSICAL-REFUEL-IDENTITY-001` | EED | One physical fill → two rows; sibling reconcile arrival-order dependent |
| `FST-GAP-PHYSICAL-STOP-COORD-001` | Tankstellenerkennung | V1 start-coordinate policy wrong for this incident |
| `FST-HYP-GPS-OFFSET-001` | Tankstellenerkennung | **Partially confirmed** — segment starts 721–1038 m from true station |

## Related artifacts

- Full report: `docs/audits/refuel-physical-event-coordinate-forensics-2026-09-04.md`
- Offline replay: `refuel-sibling-reconciliation.sept04-2026.spec.ts`
- Fixture: `ks-mx-2024-sept04-refuel.fixture.ts`
