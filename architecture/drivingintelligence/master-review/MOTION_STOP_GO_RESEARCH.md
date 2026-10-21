# Motion, Stop/Go & Micro-Motion Research

## Scope separation (VERIFIED)

| Layer | Module / artifact | Stop semantics |
|-------|-------------------|----------------|
| Trip FSM | Trip Detection | Trip RESTING/COMPLETED — **not** per-second stop GT |
| DI S1 | `compute-trip-intervals.ts` | `STATIONARY_SUPPORTED`, hold, release, gaps |
| CUSUM / trip detectors | Outside DI V0 core | **NOT_ASSESSABLE** in this dossier without trip-detection authority read |
| Micro-motion FSM | EXP021 B7.1 design | Separate research FSM — **NOT_IN_REPO** as product code |

## Phase map (EXP021 Tesla campaign)

| Phase | Topic | Repo evidence | Cloud artifacts |
|-------|-------|---------------|-----------------|
| B3 | Human-review maps | `evidence/exp021-tesla-b3-human-review/` on some branches; **NOT on dossier main** | `/opt/cursor/artifacts/exp021-tesla-b3/` |
| B4 | TC-1..TC-6 driver reports | **NOT_AVAILABLE** on main @ `0a16ffb5b` | REPORTED in agent summary |
| B5 | TC-3 forensics | Forensic supplements in #2051 commits | — |
| B6 / B6.1 | Safety gates | Branch `live-fsm-admission-scope-hardening` — **not on main** | — |
| B7.1 | Micro-motion design | **NOT_IN_REPO** | `/opt/cursor/artifacts/exp021-tesla-b7-1/` |
| B7.2 | Offline FSM replay | **NOT_IN_REPO** | `/opt/cursor/artifacts/exp021-tesla-b7-2/` |
| B7.3 | Causal speed audit | **NOT_IN_REPO** | `/opt/cursor/artifacts/exp021-tesla-b7-3/` |
| B7.4 | Telemetry provenance | **NOT_IN_REPO** | `/opt/cursor/artifacts/exp021-tesla-b7-4/` |

## Tesla reference trips (REPORTED)

| ID | Vehicle | Trip UUID | Notes |
|----|---------|-----------|-------|
| TRIP_1 | `68868291-5478-42cd-b0c4-cc77b2a78e21` | `11f5a645-752e-4b8a-b20a-9f1fc3a6673e` | Shadow replay pins in agent runs |
| TRIP_2 | same | `0f8d2f76-9b09-4aba-8c56-fa7e2ce1c5a8` | B3 maps |

DIMO token **186946** — `S4_PRODUCTION_SHADOW_P1_INTEGRATION.md`.

## TC-1 .. TC-6 (classification)

| Anchor | Classification | Why |
|--------|----------------|-----|
| TC-1 .. TC-6 | **DRIVER_REPORTED** | Owner/driver narrative in review protocols — not independent sensors |
| TC-3 | **NOT second-accurate confirmed** | B5/B7: video vs telemetry alignment gaps; waypoint `speed_kmh: 0` at one timestamp does not prove stop duration |
| TC-5 | **Has stationary evidence** | B7.2/B7.3: stop candidate under strict L3 mask; gap abort — **REPORTED** |
| Data gaps | **Do not prove stops** | ROW_ABSENT / missing buckets ≠ physical stop (P2.1 taxonomy) |

## Why batch L3 is not strictly online-causal

**VERIFIED:** `evaluateL3AtCenter` uses i+1. Full-trip replay therefore leaks future position into past seconds unless masked.

**REPORTED (B7.3):** Backward 2-point GPS variant increases stopped seconds on TRIP_1 in simulation — illustrates policy sensitivity, not production recommendation.

## FSM variants emitting more stops

**REPORTED (B7.2):** Micro-motion FSM variants can emit more `STOP_CANDIDATE` labels without verified accuracy vs driver report or independent GT.

**INFERRED:** More stop **labels** ≠ higher **precision**; absence of independent road/GT prevents scoring.

## Provider speed is not automatically better

| Reason | Source |
|--------|--------|
| Sparse waypoints vs 1s grid | B7.4 audit |
| INTERVAL_ONLY R1 semantics | S3B contract |
| Timestamp/provenance not in pins | B7.4 |
| Conflicts with L3 on real trip | P2.1 — 26 `CROSS_SOURCE_CONFLICT` |

## Tiguan EXP021 (on main)

`architecture/drivingintelligence/evidence/exp021-tiguan-20261019/` — direction-aware P1, variants A–E replay, **NO_ACCURACY_CLAIM** in merge closeout.

See [REFERENCE_TRIP_REGISTRY.md](./REFERENCE_TRIP_REGISTRY.md).
