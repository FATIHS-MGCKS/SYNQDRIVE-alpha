# Snapshot export notes (2026-10-22)

Read-only Production PostgreSQL via `sudo -n -u postgres psql -d synqdrive` on Hostinger VPS `srv1374778.hstgr.cloud`. No writes, no flag changes.

| File | Source |
| --- | --- |
| `di_v0_shadow_intervals.csv` | `COPY ... FROM di_v0_shadow_intervals WHERE trip_id=98d2a8e0-...` |
| `di_v0_shadow_run.json` | `di_v0_shadow_runs` |
| `di_v0_s4_work_item.json` | `di_v0_s4_work_items` (selected columns) |
| `di_v0_motion_core_shadow_run_meta.json` | `di_v0_motion_core_shadow_runs_v1` metadata |
| `di_v0_motion_core_shadow_payload.json` | `payload_gzip` → gunzip |
| `di_v0_s4_evidence_container.bin` | `di_v0_s4_evidence_snapshots.payload_gzip` → gunzip (container text) |
| `r1_obd_evidence_snapshot.json` | Parsed from container via `scripts/extract_s4_channels.mjs` + backend `parseDiV0R1ObdSnapshot` |
| `s4_evidence_channel_manifest.json` | Channel manifest from container parse |
| `TRIP_IDENTITY.json` | Vehicle/trip cross-check + DI artifact IDs |

Export performed: **2026-10-22** (UTC evening). Hashes recorded in `PROVENANCE_MANIFEST.json` after evaluation run.
