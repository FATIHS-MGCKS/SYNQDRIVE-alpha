# EED-EV-0110 — RFRF OQ-014 R4B WOB L 7503 2026-10-09 natural evidence admission

**Classification:** READ_ONLY_PRODUCTION_FORENSIC + BOUNDED_SPINE  
**Production SHA at extract:** `ab72f574014d6657cac158c253696b7237cdd3e6`  
**Event id:** `WOB_7503_2026_10_09`  
**Admission grade:** `BOUNDED_SPINE_EXTRACT_REPLAYABLE_NOT_CALIBRATION_GRADE` — **not** promoted into R4A eligible N=6.

## Safety

| Attestation | Value |
|-------------|-------|
| PRODUCTION_WRITES | **0** |
| RUNTIME_CHANGED | **NO** |
| CALIBRATION_GRADE_UPGRADE | **NO** |
| **CALIBRATION_DECISION** | **CALIBRATION_INSUFFICIENT** (unchanged) |

## A. Source provenance & sample validation

| Check | Result |
|-------|--------|
| DIMO token | **192922** (production `vehicle_latest_states`, read-only) |
| Fetch API | `fetchRefuelEvidenceSignalsStandalone` — telemetry GraphQL `signals`, **20s** `AVG` buckets |
| Window | `2026-10-09T16:47:00.000Z` → `2026-10-10T00:47:00.000Z` |
| Sample count | **109** (committed spine matches agent extract) |
| Timestamp monotonicity | **PASS** (strictly non-decreasing observation times) |
| Ingestion timestamps | **Not available** in export — observation time only |
| Committed spine | `evidence/data/EED-EV-0110-WOB-L-7503-2026-10-09-ABSOLUTE-SPINE.json` |

### Observation gaps (explicit)

| From (UTC) | To (UTC) | Duration (s) |
|------------|----------|--------------|
| `2026-10-09T17:36:40Z` | `2026-10-09T17:44:40Z` | **480** |
| `2026-10-09T17:54:00Z` | `2026-10-09T18:44:40Z` | **3040** |

**Max gap:** **3040 s** — preserved in spine `telemetryObservationGaps` and `maxObservationGapSeconds`.

## B. Ground truth (independent quantity)

| Field | Value |
|-------|-------|
| User pump volume | **18.11 L** (`USER_PHOTO_PUMP_ASSOCIATION`) |
| Approx anchor | **2026-10-09T18:47:00Z** (Europe/Berlin 20:47) — **not** proven rise onset |
| DIMO absolute rise | **6 → 24 L** (Δ **18 L**) |
| Pump vs sensor Δ | **+0.11 L** (quantity validation only) |

## C. Per-axis classification (R4B)

| Axis | Status | Notes |
|------|--------|-------|
| **Quantity validation** | **USABLE** (offline / replay hypothesis) | Pump 18.11 L vs DIMO Δ 18 L |
| **Physical event identity** | **PROVEN one canonical native** | V2 `SAME_PHYSICAL_REFUEL`; product read **1** refuel |
| **Settling timing calibration** | **EXCLUDED** | 3040 s pre-rise gap; refuel-in-motion telemetry |
| **Locality calibration** | **EXCLUDED** | Forensic coordinates on reconciliation rows only; no R4B route spine |
| **R4A authoritative statistics** | **EXCLUDED** | Not in eligible N=6; no grade upgrade |

## D. Production native duplicate (read-only)

| dimo_segment_id | vehicle_energy_event UUID | Role |
|-----------------|---------------------------|------|
| `dimo-refuel-192922-1791567172000` | **`412f17f7-7380-4dd0-8e24-6939be4809d6`** | **Canonical** (`enrichment_eligible=true`) |
| `dimo-refuel-192922-1791571503000` | `5ba5a03c-8713-47c2-9373-a744e1bce30e` | Late sibling (`enrichment_eligible=false`) |

**Reconciliation group:**  
`19fedd4b-c4e8-4de8-a125-dab293326e7e:412f17f7-7380-4dd0-8e24-6939be4809d6|5ba5a03c-8713-47c2-9373-a744e1bce30e`  
**Finality:** `FINAL_CANONICAL` · **Matcher:** `SAME_PHYSICAL_REFUEL` · **reason_codes:** `late_sibling_after_finalization`

**Fallback ambiguity (no code change):** `raw_refuel_candidates` `e4d65b04-…` remains `READY_FOR_PERSIST` with recovery `AMBIGUOUS_RECOVERY_OBSERVATION` because authoritative convergence sees **two** `SAME_PHYSICAL_REFUEL` native rows (`multiple_same_native_siblings`) even though V2 product projection collapses to one canonical UUID — **documented behavior**, not treated as a new recurring defect in this slice.

## E. Offline replay

| Layer | Result |
|-------|--------|
| R3A phase scanner | Runnable on spine absolute series + production rise anchors — see Jest `rfrf-oq014-r4b-wob-7503-admission.spec.ts` |
| R4A calibration metrics | **Not admitted** to authoritative N=6; anchor uses native `fuel_level_rise_start` for forensic classification only |

## F. Further data needed (before calibration-grade promotion)

- Independent forecourt-stationary segment or DIMO segment revision stability proof  
- Reduced pre-rise observation gap or explicit gap-authorized replay policy  
- Optional: ingestion-time metadata if DIMO exposes it for latency forensics  

## Open questions

- **EED-OQ-014:** **OPEN**  
- **EED-OQ-019:** **PARTIALLY_RESOLVED**

## Validation

```bash
cd backend && npm run test:rfrf:settled-post-replay -- --testPathPattern=r4b-wob-7503
bash architecture/scripts/validate-module-registry.sh
```
