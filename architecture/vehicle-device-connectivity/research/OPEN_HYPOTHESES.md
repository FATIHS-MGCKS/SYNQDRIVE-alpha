# Vehicle & Device Connectivity — Open Hypotheses

Falsifiable questions — each hypothesis has a graph node `VDC-HYP-*`.

Phase 2 Production results: [../evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](../evidence/LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md).  
Phase 3 classification: [../reconciliation/PHASE3_RECONCILIATION.md](../reconciliation/PHASE3_RECONCILIATION.md) §4.

**Rule:** Hypothesis IDs are **retained** when facts are promoted to invariants or decisions — status trail preserved.

---

## VDC-HYP-001 — ~24h stationary source update

| Field | Value |
|-------|-------|
| **Statement** | LTE_R1 may emit a periodic source update approximately every 24h while the vehicle remains stationary. |
| **Phase 2 result** | **STRONGLY_SUPPORTED** |
| **Evidence** | KS MX 2024: 3 post-trip intervals 86,563–86,581 s (2026-09-08 → 2026-09-11) |
| **Epistemic state** | PRODUCTION_OBSERVATION |
| **Validation status** | PRODUCTION_VALIDATED (single vehicle, 3 samples) |
| **Remaining falsifier** | Physical IO174 timer not proven; fleet distribution (VDC-Q-001) |
| **Phase 3** | Retained as hypothesis; partial promotion to profile observation |

---

## VDC-HYP-002 — IO174 not exposed via signalsLatest

| Field | Value |
|-------|-------|
| **Statement** | Periodic standby update may be device-timer initiated, but IO174 is not exposed through the SynqDrive DIMO `signalsLatest` ingestion path. |
| **Phase 2 result** | **STRONGLY_SUPPORTED** |
| **Evidence** | No IO174/sleep/Ruptela/0x10 in VLS or webhook payloads searched |
| **Classification** | IO174_NOT_EXPOSED_BY_CURRENT_INGEST |
| **Epistemic state** | PRODUCTION_OBSERVATION |
| **Validation status** | PRODUCTION_VALIDATED |
| **Phase 3** | Retained; IO174_NOT_EXPOSED_BY_CURRENT_INGEST promoted to gap fact |

---

## VDC-HYP-003 — Poll frequency ≠ R1 source-update frequency

| Field | Value |
|-------|-------|
| **Statement** | SynqDrive snapshot poll frequency is independent of actual R1 source-update frequency. |
| **Phase 2 result** | **CONFIRMED** |
| **Evidence** | 1,030 SUCCESS polls vs 3 strict source advances (~343:1) in 3.75 d stationary window |
| **Epistemic state** | PRODUCTION_OBSERVATION |
| **Validation status** | PRODUCTION_VALIDATED |
| **Phase 3** | **Promoted** to VDC-INV-004 (three frequency layers); hypothesis ID retained |

---

## VDC-HYP-004 — Per-signal timestamp heterogeneity

| Field | Value |
|-------|-------|
| **Statement** | Individual signals may retain older timestamps even when `signalsLatest.lastSeen` advances on standby wakes. |
| **Phase 2 result** | **CONFIRMED** |
| **Evidence** | Fuel/ECT frozen at trip end; LV/GNSS on latest wake; odometer partial Sep 9 wake |
| **Epistemic state** | PRODUCTION_OBSERVATION |
| **Validation status** | PRODUCTION_VALIDATED (latest payload only; per-wake archive limited) |
| **Phase 3** | Retained; per-wake archive limitation (VDC-GAP-003) |

---

## VDC-HYP-005 — Long silence is not disconnect

| Field | Value |
|-------|-------|
| **Statement** | A healthy sleeping LTE_R1 may remain source-silent for many hours and must not be classified as disconnected based solely on short `lastSeen` age. |
| **Phase 2 result** | **STRONGLY_SUPPORTED** |
| **Evidence** | CONNECTED + plugged + standby at 18 h source age; polls succeeding |
| **Epistemic state** | PRODUCTION_OBSERVATION |
| **Validation status** | PRODUCTION_VALIDATED |
| **Phase 3** | **Promoted** to VDC-INV-003 (standby silence tolerance confirmed) |

---

## VDC-HYP-006 — Distinct fault states required

| Field | Value |
|-------|-------|
| **Statement** | Device disconnected, device sleeping, DIMO provider unavailable, permission failure, and vehicle not producing CAN data require separate connectivity states. |
| **Phase 2 result** | **STRONGLY_SUPPORTED** |
| **Evidence** | Observed CONNECTED + stale source + fresh poll + standby simultaneously |
| **Epistemic state** | PRODUCTION_OBSERVATION |
| **Validation status** | PRODUCTION_VALIDATED |
| **Phase 3** | Retained as design principle; supports VDC-DEC-004 target model |

---

## VDC-HYP-007 — FULL_CONNECTIVITY_RECOVERED requires strict source advance

| Field | Value |
|-------|-------|
| **Statement** | **FULL_CONNECTIVITY_RECOVERED** should require strict source advance, not merely poll success or equality upsert. |
| **Phase 2 result** | **STRONGLY_SUPPORTED** |
| **Evidence** | Aug 2026 recovery resolved episode via snapshot plug signal; Sep window shows poll success without source advance for ~18 h while still "healthy standby" |
| **Epistemic state** | PRODUCTION_OBSERVATION + CODE (VDC-CX-010) |
| **Validation status** | PRODUCTION_VALIDATED |
| **GT-R1 result** | **PARTIALLY_VALIDATED** — replug strict source advance `14:27:47`→`15:02:29` without PLUG webhook; no TELEMETRY/FULL recovery notifications in capture window |
| **Phase 3** | **Promoted** to recovery rule VDC-DEC-010; GT-R1 snapshot replug path **CONFIRMED** (VDC-EVID-GT-R1-EXECUTION-001) |
