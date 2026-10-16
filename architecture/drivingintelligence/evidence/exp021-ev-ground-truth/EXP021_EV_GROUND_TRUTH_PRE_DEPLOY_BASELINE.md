# EXP021 EV Ground Truth — pre-deploy baseline (read-only)

**Status:** CAPTURED  
**Observed (UTC):** `2026-10-16T11:44:44.239Z`  
**Production SHA:** `a0ce01f192d888974e49c2558ee05e534f3dfeea` (`20261016063725_v4994`)  
**Replay / analysis code for this capture:** same Production tree (symlinked `src` on VPS staging — not the joint-deploy target `d3a936…`).  
**DB session:** `transaction_read_only=on`, isolation `repeatable read`.

Frozen package: [`pre-deploy/`](./pre-deploy/) — verify `sha256sum -c SHA256SUMS`.

## Reference identities — verified

All owner-supplied IDs match Production read-only inventory.

| Artifact | Verified id / hash |
|----------|-------------------|
| Trip | `358d0158-b2a9-47ed-af26-33926c5770b4` |
| Vehicle | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| PRIMARY WI | `99fe9d1b-5cb6-4cbb-ba0c-e5f27a5cd50a` (`COMPLETED`, `ACTIVE_PRIMARY` replay) |
| Shadow run | `62117347-71b5-4946-b633-52cb10017043` |
| Pinned snapshot | `DI_V0_S4_EVIDENCE_V1:sha256:c703e9c4…84503` |
| CURRENT V2 projection | `567c3dc2-d514-447a-97d5-bc294c8c6c12` |
| Boundary fingerprint (pinned = live) | `DI_V0_S4_BOUNDARY_FP_V1:sha256:59fcdaad…f4020` |

## Trip boundary vs acquisition grid

| Boundary | UTC |
|----------|-----|
| Trip start | `2026-10-16T03:36:00.000Z` (Berlin 05:36:00) |
| Trip end (segment) | `2026-10-16T03:54:55.989Z` (owner ms matches) |
| Snapshot acquisition start | `2026-10-16T03:36:00.000Z` |
| Snapshot acquisition end (exclusive grid) | `2026-10-16T03:54:56.000Z` |
| Grid labels | `03:36:00Z` → `03:54:56Z` (**1136** one-second rows) |

Trip end **≠** exclusive raster end: grid extends **0.011 s** past segment end to the next second-aligned bucket.

## FSM, admission, product gate

- FSM: `RESTING`, `active_trip_id=null`  
- Admission: **`ADMISSION_RECORD_MISSING`** (expected pre–joint-deploy on this SHA)  
- Product read gate (evaluated against post-merge contract): **`ADMISSION_NOT_SATISFIED`**  
- Production today still serves CURRENT V2 on pre-gate read paths; post-deploy expectation documented in [POST_DEPLOY_VERIFICATION_PLAN.md](./POST_DEPLOY_VERIFICATION_PLAN.md).

## Repair history

One **`PARTIAL_TRIP_BOUNDARY_EXTENSION`** row, status **`SUPPRESSED`** (“End extension below minimum repair span — treated as exact match”). Not applied.

## Outbox / projection (verified aggregates)

| Metric | Verified value |
|--------|----------------|
| Outbox | `SUCCEEDED` |
| `qcTrustedMaxKmh` | **129.7885665128692** |
| `qcTrustedMeanKmh` | **66.09** |
| `trustedNumericCoveragePercent` | **68.2** |
| Assessability | **PARTIAL** (`TRUSTED_COVERAGE_PARTIAL`) |

## POSITION / R1 evidence

- **POSITION:** pinned `DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1` present (see manifest `channelManifest`).  
- **R1_OBD:** `NOT_APPLICABLE` (`SOURCE_FAMILY`) on this Tesla trip — per-second export has position availability + L3/QC only.

## Per-second replay

`PRE_DEPLOY_PER_SECOND_REPLAY.json` — **1136** rows, no lat/lon (availability + L3 + V2 QC replay).  
SHA-256: `68bff4d695ee1a922be1c980a1a9d441dcc1145e1dee57e8c17fe73ed0864157`.

## Video

Owner reports video exists; **not received or analyzed** in this workstream.

## Non-effects

`PRODUCTION_MUTATIONS=NONE`, `PROVIDER_CALLS=NONE`.
