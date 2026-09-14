# EXP-021 — KS MX 2024 Short A/B Incomplete 90s Evidence Freeze

**Frozen at:** 2026-09-14T14:00:47Z (deep forensic generation)  
**Pre-abort snapshot:** 2026-09-14T13:40:26Z  
**Controlled stop:** 2026-09-14T13:43:11Z

## Run identity

| Field | Value |
|-------|-------|
| `RUN_CLASSIFICATION` | `INCOMPLETE_SHORT_AB_PARTIAL_OPERATIONAL_EVIDENCE` |
| `VEHICLE_PLATE` | KS MX 2024 |
| `vehicleId` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| `tokenId` | 187336 |
| `RC_SESSION_ID` | `332c1549-622d-4535-afd9-867962003280` |
| `CALIBRATION_SERIES_ID` | `0657d5df-16c3-4768-b37d-d2f21d7c4a62` |
| `SETTLEMENT_EXPERIMENT_ID` | `exp-021-332c1549-2efc9ef2` |
| `TRIP_ID` | `f6809e13-181f-4264-b5e3-341b71a57c82` |
| `PLAN_ID` | `candidate_short_ab_90_60` |
| `PLAN_VERSION` | `EXP021_CANDIDATE_SHORT_AB_90_60` |
| `PRODUCTION_SHA` | `d1501d171c1cc6dc4b83b2720e3a96549ef24185` |
| `PHYSICAL_T0` | `2026-09-14T11:43:53.000Z` |
| `TRIP_PHYSICAL_END` | `2026-09-14T12:04:15.000Z` |
| `PHYSICAL_END` | **NULL** (no orchestrated seal) |
| `RC_FINAL_STATUS` | `ABORTED` |

## Scientific classification (immutable)

| Question | Answer |
|----------|--------|
| `VALID_90_STANDALONE_EVIDENCE` | **YES** |
| `VALID_90_VS_60_COMPARISON` | **NO** |
| `VALID_FOR_CADENCE_SELECTION` | **NO** |
| `ANOTHER_PHYSICAL_RUN_REQUIRED` | **YES** |

## Authoritative evidence documents

1. `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.md` — full 20-phase human forensic
2. `EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.json` — machine-readable metrics
3. `EXP_021_KS_MX_2024_INCOMPLETE_SHORT_AB_FORENSIC_FREEZE_2026-09-14.md` — pre-abort lifecycle freeze

## VPS production paths

- `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-deep-90s-forensic.json`
- `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-incomplete-short-ab-forensic-freeze.json`
- `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-t0-watcher.jsonl`
- `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-run-monitor.jsonl`
- `/opt/synqdrive/shared/reference-evidence/exp-021-ks-mx-2024-controlled-stop.log`

## Immutable observation policy

Historical `ReferenceCaptureObservation` and `ReferenceCaptureSettlementShadowObservation` rows are **not mutated** by this freeze. PR #1618 KS MS 661 frozen evidence is **not modified**.

## #1621 physical acceptance (from this run)

| Check | Result |
|-------|--------|
| Slot fix (7/7 vs 4/7) | **PASS** |
| Settlement geometry (19/19 vs 9/19) | **PASS** |
