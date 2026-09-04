# RD004-A.1 — Segment A Video ↔ Telemetry Alignment (Methodology Closeout)

**Date:** 2026-09-04  
**Evidence ID:** DI-EV-0035A.1  
**Supersedes methodology defects in:** DI-EV-0035A  
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)

## Scope

Segment A only (departure → fuel station, ~370.65 s video). Segment B (~16:40) pending.

## Methodology corrections

| Area | DI-EV-0035A defect | DI-EV-0035A.1 fix |
|------|-------------------|-------------------|
| Clock offset | Circular `expectedVideoT = telemetryT` → artificial 0 s | Only independently observed video times contribute |
| Drift | −128.6 s from bad fit | `DRIFT_VALIDATED = NO`, null estimate |
| Preprocessing timing | 127.6 s global speed-value match | Same local event window only |
| Acceleration median | Unsorted percentile → median = max | `sortedPercentile()` everywhere |
| Gear | PARTIAL with 0 samples | `NOT_OBSERVED` |
| Bundle SHA | Single-file hash | Canonical multi-member manifest hash |
| Paths | `/workspace/...` in artifacts | Repo-relative only |

## Preserved valid evidence

- 38 HF speed samples, ~4.7 s median cadence (not 1 Hz)
- 0 legacy hard/extreme events on available data
- Video absolute time anchored (Time.is); provider offset **not validated**
- Reverse: video YES, telemetry NO
- Absolute speed accuracy: NOT VALIDATED

## Module / CLI

- `reference-capture-rd004-a-segment-a.ts`
- `reference-capture-drive-004-a-segment-a-analyze.ts`
- 23 methodology tests

## Artifacts

`docs/audits/data/rd004-segment-a/` — regenerated with corrected methodology.

**No production changes. RD004 whole drive NOT complete.**
