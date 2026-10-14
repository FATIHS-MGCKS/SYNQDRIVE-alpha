# EXP021 P1 V2 — multi-trip evidence closure

**PR:** #2025  
**Status:** CLOSURE (re-run with committed runner + intervalwise comparator)

## Execution identity (separated)

| Role | SHA / label | Notes |
|------|-------------|--------|
| **POLICY_IMPLEMENTATION_SHA** | `f7a285b59fd1f70e57b5fd72c04406286e1b96f1` | Main merge #2021 — V2 evaluator on Production `/opt/synqdrive/current` |
| **VALIDATION_RUNNER_SHA (closure)** | `185ff1e15c7c3862c243a6e4415a6cbb503575d2` | PR #2025 branch head; comparator code in `4c511a0dd6` |
| **Closure replay artifact** | `/opt/cursor/artifacts/EXP021_P1_V2_MULTI_TRIP_RESULT_CLOSURE.json` | `regressionVerdict: PASS`; counters match historical run |
| **Historical first run** | `executedCodeSha: f7a285b…` in `/opt/cursor/artifacts/EXP021_P1_V2_MULTI_TRIP_RESULT.json` (schema V1) | **Mislabeled:** tagged policy SHA as runner; scripts were **uncommitted** scp to `~/di-r3a-run`; comparator used aggregate-only gates |
| **Uncommitted historical files** | not reproducible by git SHA | VPS copies overwritten on closure scp; preserved as narrative + frozen manifest only |

## Frozen ten-trip binding

`architecture/drivingintelligence/evidence/data/EXP021_P1_V2_MULTI_TRIP_MANIFEST_FROZEN_V1.json` — same trip / WI / shadow / snapshot hashes as first run. Closure replay sets `EXP021_P21_FIXED_MANIFEST_PATH` to this file (no re-selection).

## Comparator upgrades (closure)

- Intervalwise `qcTrustedSpeedKmh` V1 vs V2 for **every** shadow interval (including stationary candidates).
- Allowed V2-only path: `estimatedSpeedKmh === null` + `STATIONARY_SUPPORTED` + `STATIONARY_BAND`.
- `null→0` on v2 whenever shadow speed is null (including candidates).
- V2 accept contract: `TRUSTED_LIMITED`, `qcTrustedSpeedKmh=null`, no conflict/compromised flags, no `RELEASE`/`FROZEN_UNRESOLVED` center accept.
- `RELEASE`/`FROZEN_UNRESOLVED`: interval counts reported; accept violations counted separately; `RELEASE_FROZEN_V2_ACCEPT` **NOT_OBSERVED** when zero accepts on those centers.
- Batch **PASS** requires: all manifest trips evaluated, RO + RR observed, manifest identity match, per-trip interval audit pass.

## Historical vs closure artifacts

| Artifact | Role |
|----------|------|
| `/opt/cursor/artifacts/EXP021_P1_V2_MULTI_TRIP_RESULT.json` (schema V1) | **Historical** first run |
| `/opt/cursor/artifacts/EXP021_P1_V2_MULTI_TRIP_RESULT_CLOSURE.json` | Closure re-run (schema V2) |
| `EXP021_P1_V2_MULTI_TRIP_VALIDATION.md` | Narrative + first-run table (historical) |

## Expected closure counters (informational)

First historical run: **13 534** intervals, **438** candidates, **328** accepted, **103** `SUPPORT_WINDOW_COMPROMISED`, **7** `CROSS_SOURCE_CONFLICT`. Closure re-run (2026-10-14): **identical** counts; `releaseFrozenIntervalsObserved: 750`, `releaseFrozenV2Accepted: 0` (**NOT_OBSERVED** for unsafe accept on those centers).
