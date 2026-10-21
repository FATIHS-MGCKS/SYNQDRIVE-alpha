# Trip detection replay harness (offline, read-only)

Analysis tooling for `architecture/TRIP_DETECTION_HARDENING_DESIGN_2026-08-28.md`.

This directory is **not** part of the NestJS application. Nothing here is imported by
`src/`, nothing here opens a database connection, and nothing here writes to any
datastore. It reads TSV extracts and prints a report.

## What it does

1. Reconstructs **evidence-backed drives** from exported `telemetry_state_changes`
   using an unbounded ON/OFF state machine, coalescing fragments and splitting at
   internal stops so a "drive" means the same thing to the harness as it does to
   the product.
2. Measures **time coverage** of those drives by canonical `vehicle_trips`
   (union of intervals, clipped to the drive, CANCELLED excluded) — not binary
   overlap.
3. Replays the **current** detection semantics (`baseline.ts`) over the same
   evidence, simulating the fast/warm/cold scheduler tiers chronologically.
4. Replays the **proposed** semantics (`proposed.ts`) over the identical evidence.
5. Reports recovered gaps, residual misses, false positives, false merges and
   scheduler-phase sensitivity for both.

`baseline.ts` is a deliberate line-by-line mirror of production. When production
changes, update it and re-run, or the comparison stops being meaningful.

## Extracting the data

Run on the production host. All statements are `SELECT`-only.

```bash
set -a; . /opt/synqdrive/shared/backend.env; set +a
PG="${DATABASE_URL%%\?*}"
CH() { curl -sS "${CLICKHOUSE_URL}/?database=${CLICKHOUSE_DATABASE}" \
        --user "${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}" --data-binary "$1"; }
OUT=/tmp/tdh_export; mkdir -p "$OUT"

CH "SELECT vehicle_id, signal_name, toString(changed_at), toString(new_value), toString(old_value)
    FROM telemetry_state_changes
    WHERE changed_at >= now() - INTERVAL 100 DAY AND signal_name IN ('ignition','motion')
    ORDER BY vehicle_id, signal_name, changed_at FORMAT TSV" > "$OUT/state_changes.tsv"

CH "SELECT vehicle_id, toString(toStartOfMinute(recorded_at)),
           toString(round(max(speed_kmh),1)), toString(round(avg(speed_kmh),1)), count(),
           toString(max(odometer_km)), toString(min(odometer_km))
    FROM telemetry_snapshots WHERE recorded_at >= now() - INTERVAL 100 DAY
    GROUP BY vehicle_id, toStartOfMinute(recorded_at)
    ORDER BY vehicle_id, toStartOfMinute(recorded_at) FORMAT TSV" > "$OUT/minute_agg.tsv"

psql "$PG" -At -F$'\t' -c "
  select t.id, t.vehicle_id, t.start_time, coalesce(t.end_time::text,''), t.trip_status,
         coalesce(t.trip_source::text,''), coalesce(t.distance_km::text,''),
         coalesce(t.dimo_segment_id,''), coalesce(t.is_repaired::text,'false'), t.created_at,
         coalesce(t.start_detection_mode,''), coalesce(t.end_detection_mode,'')
  from vehicle_trips t where t.start_time >= now() - interval '105 days'
  order by t.vehicle_id, t.start_time" > "$OUT/trips.tsv"

psql "$PG" -At -F$'\t' -c "
  select v.id, coalesce(v.license_plate,'?'), coalesce(v.fuel_type::text,''),
         coalesce(s.detection_profile::text,''), coalesce(d.token_id::text,''),
         v.organization_id, coalesce(v.hardware_type::text,'')
  from vehicles v
  left join vehicle_trip_detection_states s on s.vehicle_id = v.id
  left join dimo_vehicles d on d.id = v.dimo_vehicle_id" > "$OUT/vehicles.tsv"

psql "$PG" -At -F$'\t' -c "
  select c.id, c.vehicle_id, c.observed_at, c.observed_value, coalesce(c.trip_id,''), c.status
  from rpm_webhook_candidates c order by c.observed_at" > "$OUT/rpm_candidates.tsv"

psql "$PG" -At -F$'\t' -c "
  select r.id, r.vehicle_id, r.repair_type, r.status, coalesce(r.confidence,''),
         r.window_from, r.window_to, r.created_at, coalesce(r.trip_id,'')
  from trip_repairs r where r.created_at >= now() - interval '105 days'
  order by r.vehicle_id, r.created_at" > "$OUT/trip_repairs.tsv"
```

## Running

```bash
cd backend
npx ts-node --compiler-options '{"module":"commonjs","target":"es2022","esModuleInterop":true,"strict":false,"skipLibCheck":true}' \
  scripts/analysis/trip-detection-replay/replay.ts --data /tmp/tdh_export --out /tmp/replay_result.json
```

Runtime is roughly 20 seconds for 90 days across 9 vehicles.

## Files

| File | Role |
|------|------|
| `types.ts` | Shared shapes |
| `data.ts` | TSV loading, interval algebra, ground-truth reconstruction |
| `baseline.ts` | Mirror of current production semantics |
| `proposed.ts` | Executable specification of R1–R4 and containment-aware overlap |
| `replay.ts` | Orchestration and reporting |

## Caveats

- The DIMO segments API is not replayable offline, so `collectRepairCandidatesBaseline`
  omits the DIMO early-return. That is charitable to the baseline: the early-return
  can only suppress ClickHouse candidates, never add them.
- Movement evidence comes from the ClickHouse snapshot mirror, which is
  fire-and-forget. A drive with no mirrored snapshots scores on ignition/motion
  transitions alone.
- `minute_agg` odometer columns are present but not currently trusted for distance;
  the confidence model treats distance as optional.
