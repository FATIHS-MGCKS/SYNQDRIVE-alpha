# Vehicle and trip binding — Phase 5C Tesla (2026-10-21)

## Identity (verified read-only Production)

| Field | Value |
|-------|-------|
| vehicleId | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| Plate | KS FH 660E |
| dimo_token_id | **186946** (`vehicle_latest_states`) |
| hardware_type | LTE_R1 |
| Tiguan R1 identity (Phase 5B) | **not used** (`19fedd4b…` / token 192922) |

## Provider / source family

- DIMO segment IDs on trips: `dimo-seg-186946-1792583880000` (trip 1), `dimo-seg-186946-1792584900000` (trip 2).
- S4 POSITION channel: **PRESENT** (`DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1`).
- Shadow runs: `source_family=API_SYNTHETIC`, 533 / 535 intervals respectively.

## Backend trips vs two physical video drives

| Video trip | Clips (local display) | Backend tripId | Backend UTC window | Distance |
|------------|----------------------|----------------|--------------------|----------|
| 1 | TC_00073, TC_00074 | `14c41c06-0a54-49d1-b5d2-f9d7373e638d` | 11:58:00Z – 12:06:52.103Z | 1.4 km |
| 2 | TC_00075, TC_00076 | `7a9d6a28-d91a-4919-98d8-d92fbea1573e` | 12:15:00Z – 12:23:54.825Z | 1.5 km |

**Mapping verdict:** Two video drives align **one-to-one** with two completed backend trips on the same vehicle/day, with expected boundary skew:

- Video trip 1 extends ~13 s past backend `end_time` (rows flagged `REFERENCE_AFTER_BACKEND_TRIP_END`).
- Video trip 2 extends ~17 s past backend `end_time`.
- Missing sample at local 14:22:59 does **not** imply a proven 1 s video gap (per protocol).

## Legacy vs S4 paths

| Path | Trip 1 | Trip 2 |
|------|--------|--------|
| Legacy `vehicle_trip_waypoints` | 33 rows | 34 rows |
| Legacy `vehicle_position_updates` in trip window | 0 | 0 |
| S4 pinned gzip + shadow jsonl | exported, hashed | exported, hashed |

Primary replay inputs: **S4 POSITION gzip + full shadow jsonl** (non-empty map; harness empty-shadow failure **not** observed).
