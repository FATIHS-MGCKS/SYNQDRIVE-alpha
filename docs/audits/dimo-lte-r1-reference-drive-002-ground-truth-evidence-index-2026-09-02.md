# Reference Drive #002 — Ground Truth Evidence Index

**Date:** 2026-09-02  
**Reference Drive ID:** `DIMO_LTE_R1_REFERENCE_DRIVE_002`  
**Session ID:** `e095d273-eb03-4bc9-aa2b-d0d709abd9bc`  
**Vehicle:** Mercedes-Benz C 63 AMG — KS MX 2024 (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)  
**Evidence ID:** DI-EV-0026  
**Maturity:** CONFIRMED_FROM_PROTOCOL (intentional scope boundary)

---

## Ground Truth status

| Field | Value |
|-------|-------|
| `VIDEO_GROUND_TRUTH_AVAILABLE` | **NO** |
| `VIDEO_GROUND_TRUTH` | **NOT_PLANNED_BY_PROTOCOL** |
| `GROUND_TRUTH_VIDEO_STATUS` | **NOT_CAPTURED_BY_DESIGN** |
| `RD003_RESERVED_FOR_VIDEO_GT` | **YES** |

---

## Protocol decision (owner-authorized)

Reference Drive #002 was authorized specifically as the **motion HF production canary** on KS MX 2024. Instrument-cluster video was **not part of the RD002 protocol**.

This is **not** the RD001 negative-evidence case (`VIDEO_NOT_CAPTURED` due to ARM workflow failure). Do **not** classify RD002 as `REJECTED` video GT.

---

## What RD002 validates

| Validation type | Status |
|-----------------|--------|
| Phase 3A.3.2 HF watermark + V2 aggregate identity under motion | **VALIDATED** |
| FAST PRE-ARM/GO operator workflow under motion | **VALIDATED** |
| Full C63 LTE_R1 signal field parity (29/29) | **VALIDATED** |
| STOP lifecycle + post-stop zombie proof | **VALIDATED** |
| Sealed telemetry export integrity | **VALIDATED** |

See: `docs/audits/dimo-lte-r1-reference-drive-002-capture-report-2026-09-02.md` (DI-EV-0023).

---

## What RD002 does not validate (deferred to RD003)

| Validation type | Status |
|-----------------|--------|
| Speed absolute accuracy vs tachometer | **DEFERRED_TO_RD003** |
| Video-based MAE / RMSE | **DEFERRED_TO_RD003** |
| Video-aligned onset latency | **DEFERRED_TO_RD003** |
| Visual maneuver Ground Truth | **DEFERRED_TO_RD003** |

---

## Next step

`READY_FOR_RD003 = YES` — owner may authorize Reference Drive #003 when prepared for video Ground Truth capture using the validated FAST PRE-ARM/GO workflow.
