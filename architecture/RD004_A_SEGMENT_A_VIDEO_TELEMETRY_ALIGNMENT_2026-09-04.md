# RD004-A — Segment A Video ↔ Telemetry Alignment

**Date:** 2026-09-04  
**Evidence ID:** DI-EV-0035A  
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)  
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`  
**Scope:** Segment A only (departure → fuel station, ~370.65 s video)

## Architecture preserved

- **HF_HISTORICAL** speed uses `providerTimestamp` as physical event-time authority.
- Acquisition surfaces (HF_HISTORICAL, LATEST_LIVE, LATEST_SLOW) analyzed separately — not merged.
- Legacy detectors (`hf-preprocessing`, `hf-acceleration`, `hf-braking`, `hf-abuse`) evaluated **offline only** on preserved Segment-A data.
- **No** production score, detector, tire, or brake runtime changes.

## Analysis module

- `backend/src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-a-segment-a.ts`
- CLI: `backend/scripts/ops/reference-capture-drive-004-a-segment-a-analyze.ts`

## Key findings

| Topic | Result |
|-------|--------|
| HF speed samples (envelope) | 38 unique physical / median cadence ~4.7 s |
| Video clock (mid-segment landmarks) | ~0 s offset under Time.is anchor |
| Absolute speed accuracy | NOT validated (no frame-exact OCR) |
| Calm-drive legacy detectors | 0 hard/extreme events |
| Reverse telemetry | NOT supported in HF for early window |
| Segment B | PENDING — whole-drive drift NOT finalized |

## Artifacts

`docs/audits/data/rd004-segment-a/` — immutable evidence directory for RD004-A.

## Related

- RD004 capture: `DIMO_LTE_R1_REFERENCE_DRIVE_004`
- RD003 signal quality: DI-EV-0034E (preserved)
- V2 design: DI-EV-0034F (preserved, not calibrated)
