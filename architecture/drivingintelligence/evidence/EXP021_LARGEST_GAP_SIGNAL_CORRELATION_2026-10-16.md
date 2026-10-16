# EXP021 — Largest POSITION gap: stored-signal correlation (no provider calls)

| Field | Value |
| --- | --- |
| PR | [#2046](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2046) |
| Trip | `533b2bf8-fa07-4f0b-bc40-d540447a1542` |
| Vehicle | `19fedd4b-c4e8-4de8-a125-dab293326e7e` (Volkswagen Tiguan, Kennzeichen **WOB L 7503**, DIMO `ded052d6-642d-4498-beed-3753afa7e36c`) |
| Token | **192922** |
| WI | `339856c6-a4af-43f8-aecd-07baacec3d22` |
| Gap boundaries (POSITION present) | `2026-10-14T14:58:35Z` → `2026-10-14T15:21:20Z` |
| Provider calls | **0** |
| Production mutations | **NONE** |

## Data sources (historical only)

| Layer | Provenance | Freshness |
| --- | --- | --- |
| POSITION + R1_OBD buckets | Sealed S4 evidence snapshot `DI_V0_S4_EVIDENCE_V1:sha256:80a58405…` (pinned at WI completion **2026-10-14T16:22:44Z**) | Acquisition-time pin; **not** live latest values |
| Trip boundaries | `vehicle_trips` read-only | As persisted |
| Connectivity | `dimo_device_connection_events`, `device_connection_episodes` | As persisted |
| Boundary coordinates (diagnostic) | Provider-compare raw artifact (same pin window); **not** used to backfill gaps |

## Gap definition (reconciled)

| Measure | Value |
| --- | ---: |
| Seconds between returned POSITION labels | **1365** |
| Absent 1 s grid buckets strictly inside boundaries | **1364** |
| Interior bucket range | `[14:58:36Z, 15:21:19Z]` inclusive on grid |

## Pin channel availability inside gap interior (n=1364 buckets)

| Channel / signal | Present | Absent | Interpretation |
| --- | ---: | ---: | --- |
| POSITION | 0 | 1364 | **POSITION-only outage** in pin for interior |
| R1 `speed` | 0 | 1364 | Same sparsity as POSITION in interior |
| R1 `powertrainCombustionEngineSpeed` | 0 | 1364 | Same |

**Full acquisition window (4694 buckets):** POSITION present **1728**; R1 speed present **228**; R1 RPM present **182** — R1 is sparse overall, but the **largest gap interior has zero R1 speed/RPM rows**, not “POSITION missing while R1 continues.”

**Not in sealed R1 pin:** `isIgnitionOn`, odometer (`powertrainTransmissionTravelledDistance`) — **UNKNOWN** for this analysis.

## Boundary POSITION points (stored pin / compare raw)

| Label | Coordinates (AVG bucket) |
| --- | --- |
| `14:58:35Z` | 51.2780466, 9.5262433 |
| `15:21:20Z` | 51.2780466, 9.5262433 |

Equal coordinates at both boundaries **do not** prove continuous standstill through the interior (no samples inside the gap).

## Trip boundary context

| Trip | Start (UTC) | End (UTC) | Relation to gap |
| --- | --- | --- | --- |
| `533b2bf8…` (this WI) | 14:47:05 | **14:58:31** | Canonical trip ends **~4 s before** first gap boundary label |
| `c26d3c13…` (neighbor) | 14:39:00 | **14:58:35** | Ends at first boundary label |
| `6bb3ddf2…` (neighbor) | **15:21:16** | 16:05:18 | Starts **~4 s before** second boundary label |

The **1364 s interior** lies mostly in the **inter-trip** period covered by the S4 acquisition window, not inside `533b2bf8`’s `[start, end]`. Speed QC still evaluates the **pinned grid** for that WI; this does **not** by itself prove mis-segmentation, but it explains why the gap is not “mid-drive inside one DIMO segment” for this trip id.

## Connectivity

| Store | Events overlapping `[14:40, 16:15) UTC` |
| --- | ---: |
| `dimo_device_connection_events` | **0** |
| `device_connection_episodes` | **0** |

No time-aligned plug/unplug episode explains the gap from stored connectivity tables.

## Answers (epistemic)

| Question | Answer |
| --- | --- |
| Missing all stored signals or mainly POSITION? | **Multi-signal in gap interior:** POSITION and sealed R1 speed/RPM are **all absent** for every interior bucket. |
| Belastbare Bewegungsindizien in der Lücke? | **UNKNOWN** — no interior pin samples; R1 is diagnostic-only here and does not replace GPS L3. |
| Standphase / zu weite Fahrtgrenze? | **Plausible inter-trip standstill window** between neighbor trips; canonical `533b2bf8` end precedes the gap. **Not** proven that the vehicle did not move without independent ground truth. |
| Connectivity correlation? | **None observed** in stored events/episodes. |

## Artifacts & tooling

- Machine-readable: `/opt/cursor/artifacts/exp021-largest-gap-pin-correlation.json`
- Regenerate (read-only VPS): `backend/scripts/ops/exp021-largest-gap-pin-correlation.ts`
