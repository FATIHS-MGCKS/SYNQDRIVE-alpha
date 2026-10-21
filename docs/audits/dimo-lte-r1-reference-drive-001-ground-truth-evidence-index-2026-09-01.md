# Reference Drive #001 — Ground Truth Evidence Index

**Date:** 2026-09-01  
**Reference Drive ID:** `DIMO_LTE_R1_REFERENCE_DRIVE_001`  
**Session ID:** `06638509-6213-419b-9df4-3def6c024f41`  
**Vehicle:** VW Tiguan — WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`)  
**Evidence ID:** DI-EV-0019  
**Maturity:** CONFIRMED_FROM_RUNTIME (negative evidence)

---

## Ground Truth status

| Field | Value |
|-------|-------|
| `VIDEO_GROUND_TRUTH_AVAILABLE` | **NO** |
| `GROUND_TRUTH_VIDEO_STATUS` | **NOT_AVAILABLE** |
| `GROUND_TRUTH_ALIGNMENT_NOT_POSSIBLE_FOR_DRIVE_001` | **YES** |
| `VIDEO_NOT_CAPTURED` | **YES** |

---

## Reason (permanent negative evidence)

The physical drive occurred and telemetry capture succeeded, but the project owner could **not** record instrument-cluster video because the ARM workflow took too long (~12 minutes before first successful acquisition).

The owner had to depart before video recording could practically begin.

**Do not fabricate video evidence.**  
**Do not discard this experiment.**  
**Do not rename or reuse Reference Drive #001.**

---

## What this session cannot validate

| Validation type | Status |
|-----------------|--------|
| Speed absolute accuracy vs tachometer | **NOT_POSSIBLE** |
| Video-based MAE / RMSE | **NOT_POSSIBLE** |
| Video-aligned onset latency | **NOT_POSSIBLE** |
| Visual maneuver Ground Truth | **NOT_POSSIBLE** |
| Driver maneuver Ground Truth | **NOT_POSSIBLE** |

---

## What this session can still validate

Telemetry/runtime evidence from Reference Drive #001 remains valuable for:

- Provider signal availability during real motion
- HF_HISTORICAL behavior under driving (vs stationary 3A.2 canary)
- Observed cadence, dropouts, jitter, duplicates
- BullMQ lifecycle and STOP semantics
- Broad acquisition behavior on LTE_R1 + ICE_GASOLINE

See: `docs/audits/dimo-lte-r1-reference-drive-001-capture-report-2026-09-01.md` (DI-EV-0016).

---

## Next ground-truth-capable drive

| Field | Value |
|-------|-------|
| **Next reference drive ID** | `DIMO_LTE_R1_REFERENCE_DRIVE_002` |
| **Requirement** | Instrument-cluster video captured **before** departure; ARM workflow must not block owner |
| **Status** | **NOT_STARTED** |

Reference Drive #001 is **not** erased or superseded — it remains canonical telemetry evidence without Ground Truth alignment.

---

## Related artifacts

| Artifact | Evidence ID | Path |
|----------|-------------|------|
| Capture report | DI-EV-0016 | `docs/audits/dimo-lte-r1-reference-drive-001-capture-report-2026-09-01.md` |
| Session summary JSON | DI-EV-0017 | `docs/audits/data/dimo-lte-r1-reference-drive-001-session-summary.json` |
| Signal quality metrics | DI-EV-0018 | `docs/audits/data/dimo-lte-r1-reference-drive-001-signal-quality-metrics.json` |
| Sealed raw export (off-Git) | — | `/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-001/observations-export.jsonl` |

**Sealed export SHA-256:** `f8e3097e28899d7a2cbdd269b266c16e5cf3eed69be810aba4e1247ec9a65bbd`  
**Purge blocked:** `PURGE_BLOCKED_REFERENCE_EVIDENCE = YES`
