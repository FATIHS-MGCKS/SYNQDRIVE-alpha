# EXP021 — Coverage & motion diagnostic after V2 production activation

| Field | Value |
| --- | --- |
| Status | **READ_ONLY_ANALYSIS** (no QC/flag/deploy changes) |
| Production SHA (verified) | `7de8f3ae2040a229f2a9c4b6a663117f1871fe55` |
| Analysis code SHA | workspace branch `cursor/exp021-coverage-diagnostic-7d78` (partition + ops CLI) |
| Org | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| Observed at (UTC) | 2026-10-16 (report `observedAtUtc` in JSON artifact) |
| Grid assumption | One shadow row ≈ one UTC second when consecutive `reference_time` steps are 1 s |
| Persisted interval parity | **N/A** — no per-interval arrays in `di_v0_trip_speed_quality_projections_v1`; compute-interval partition from pinned snapshot replay only |
| Authenticated browser QA | **Not claimed** (still open from joint deploy) |

## Repro (read-only)

On Production VPS (uses shared `backend.env`, no writes):

```bash
cd /opt/synqdrive/current/backend
sudo bash -c 'set -a; source /opt/synqdrive/shared/backend.env; set +a; \
  export GIT_SHA=7de8f3ae2040a229f2a9c4b6a663117f1871fe55; \
  export EXP021_COVERAGE_OUT=/tmp/exp021-coverage-diagnostic-report.json; \
  npx ts-node --transpile-only scripts/ops/exp021-coverage-diagnostic.ts'
```

Artifact copy: `/opt/cursor/artifacts/exp021-coverage-diagnostic-report.json`

**DB session:** `SET LOCAL transaction_read_only = on`, isolation `RepeatableRead` per trip load (forensic loader).

## Selection

| Item | Value |
| --- | --- |
| Rule | `EXP021_COVERAGE_DIAGNOSTIC_SELECTION_RULE_V1` (P2.1 pool + forced reference trips + greedy diversity, max **20**) |
| Pool size | **80** completed active PRIMARY rows with pinned snapshot + shadow + evidence snapshot |
| Selected | **20** trips |
| Forced included | `9ead317c-8725-4373-b9ac-8bb84d5549be`, `72617129-0b33-4ef7-92ae-33ce1c4feffc` |
| Omissions | 60 trips not selected by cap; trips failing pool predicates excluded entirely |

**Hardware / link note:** Active `vehicle_data_source_links` for sampled vehicles show **DIMO/DIMO** (not HM LTE-R1). S4 `source_family` on work items is **`RUPTELA_R1` vs `API_SYNTHETIC`** — do **not** equate `API_SYNTHETIC` with LTE-R1; treat as distinct acquisition envelope in evidence.

## Fleet time-weighted summary (20 trips, 22 858 s)

### Primary partition (disjoint, sums to interval count)

| Partition | Seconds | % of trip time |
| --- | ---: | ---: |
| TRUSTED_NUMERIC | 11 072 | **48.4%** |
| NUMERIC_QC_WITHHELD | 366 | 1.6% |
| ACCEPTED_STATIONARY_NULL | 707 | 3.1% |
| NO_NUMERIC_SPEED | 10 713 | 46.9% |

Numeric shadow coverage (S1 `estimatedSpeedKmh` finite): **~50.5%** time-weighted (derived from primary buckets).

Accepted stationary reported separately (not folded into trusted numeric).

### Unassessable cause (within WITHHELD + NO_NUMERIC only; sums to 11 079 s)

| Cause bucket | Seconds | % of all interval-seconds |
| --- | ---: | ---: |
| **POSITION_GAP** (missing/null/invalid L3 buckets) | 7 665 | **33.5%** |
| FROZEN_OR_UNRESOLVED_HOLD | 1 913 | 8.4% |
| RELEASE_OR_TRANSITION | 560 | 2.4% |
| CROSS_SOURCE_CONFLICT | 379 | 1.7% |
| SUPPORT_WINDOW_COMPROMISED | 265 | 1.2% |
| MOVEMENT_SPEED_UNKNOWN | 257 | 1.1% |
| ACQUISITION_EDGE_SUPPORT | 40 | 0.2% |

Overlap diagnostic flags (non-disjoint): e.g. `SHADOW_SOURCE_CONFLICT_MARKED` counted per interval in JSON — use for review, not primary partition.

### Reference production trips (replay V2 compute)

| Trip | source_family | Trusted numeric % | Numeric shadow % | Longest unassessable run |
| --- | --- | ---: | ---: | --- |
| `9ead317c…` | RUPTELA_R1 | 76.6 | 79.6 | 59 s (MIXED) |
| `72617129…` | API_SYNTHETIC | 60.3 | 60.3 | 291 s (MIXED) |

Persisted CURRENT V2 aggregate vs replay: **match** on all 20 trips (coverage %, max, stationary counts).

## Longest unassessable segments (examples)

| Trip | Longest run (s) | Dominant cause label |
| --- | ---: | --- |
| `533b2bf8…` | **1570** | POSITION_GAP |
| `6bb3ddf2…` | 903 | MIXED |
| `913e780d…` | 301 | MIXED |
| `72617129…` | 291 | MIXED |

Identical coordinates are **not** interpreted as proven device fault or true standstill without motion/QC context.

## Acceleration / braking readiness (preparatory)

Across sample: trusted-numeric runs exist but **adjacent 1 s TRUSTED samples share L3 support windows** — not independent for Δv/Δt acceleration. Do not derive accel/brake events across hold, gap, or RELEASE boundaries. Longest trusted-numeric runs and gap breaks are in per-trip `accelBrakeReadiness` in JSON.

## Top three improvement experiments (by observed time share)

### 1 — Position gaps inside acquisition window (~33.5% fleet seconds)

| | |
| --- | --- |
| Measured scope | 7 665 s POSITION_GAP-classified (ROW_ABSENT, SIGNAL_NULL, missing bucket, invalid coords) |
| Mechanism | **CONFIRMED** — L3 calendar support incomplete before QC can trust numeric speed |
| Smallest change | Targeted acquisition/backfill design for missing 1 s buckets on DIMO coordinate channel (vehicle-specific), not QC threshold relaxation |
| Reference proof | Tacho video + independent GPS trace aligned to bucket labels; success = gap seconds ↓ with stable trusted-max/mean error band |
| Success criterion | ≥30% relative reduction of POSITION_GAP seconds on 3 validation trips without increasing CROSS_SOURCE_CONFLICT or RELEASE_FROZEN accepts |

### 2 — Frozen / unresolved hold (~8.4%)

| | |
| --- | --- |
| Measured scope | 1 913 s `FROZEN_OR_UNRESOLVED_HOLD` |
| Mechanism | **CONFIRMED** — position hold-release policy blocks trusted numeric even when shadow marks motion |
| Smallest change | Review hold-release tuning only with frozen-segment replay harness (no production flag change in this workstream) |
| Reference proof | Video segments spanning hold→release with known movement |
| Success criterion | Reduced hold-classified seconds without widening trusted numeric on true gaps |

### 3 — Release / neighbor hold transitions (~2.4%)

| | |
| --- | --- |
| Measured scope | 560 s `RELEASE_OR_TRANSITION` |
| Mechanism | **CONFIRMED** — transition semantics + neighbor FROZEN/RELEASE on fresh center |
| Smallest change | Narrow transition classifier evaluation on pinned replays |
| Reference proof | Same tacho protocol at stop/start |
| Success criterion | Shorter transition-untrusted windows; max speed error ≤ agreed km/h band vs tacho |

**Not prioritized for QC easing:** CROSS_SOURCE_CONFLICT (1.7%) — treat time-offset hypotheses as **HYPOTHESIS** without independent dual-source ground truth.

## Tacho reference video protocol (draft)

1. **Vehicle / source:** Record `vehicle_id`, active `vehicle_data_source_links`, S4 `source_family`, trip id + UTC window from shadow.
2. **Media:** Original video file hash, mount (dash vs passenger), resolution/FPS.
3. **Sync points:** Clapper events (stop line, known landmark) + odometer cross-check; document **remaining uncertainty (s)**.
4. **Scenes:** Natural stop, pull-away, steady cruise, normal braking (no choreographed abuse).
5. **Safety:** Passenger filming or fixed mount only.
6. **Tacho:** Treat dashboard speed as **reference with bias** (display lag/rounding); compare distributions, not single-frame equality.
7. **Separation:** Label development-validation drives vs untouched canonical validation trips.

## Ground-truth limitations

- No interval-level persistence for aggregate parity beyond stored JSON projection.
- Historical 46.7% single-trip trusted figure is **not** used as fleet benchmark.
- Browser UI not verified in this analysis.
- Production DB analysis only; no provider re-fetch (replay uses pinned snapshot).

## Tests

- `di-v0-exp021-coverage-interval-partition.unit.spec.ts` — disjoint primary partition sums.
- `exp021-coverage-diagnostic-selection.unit.spec.ts` — forced trip inclusion.
