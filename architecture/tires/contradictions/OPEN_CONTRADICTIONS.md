# Tires Health — Open Contradictions

Graph nodes `TIRE-CONTRA-*`. Contradictions are recorded, never silently resolved.

| ID | Contradiction | Evidence A | Evidence B | Status |
|----|---------------|-----------|-----------|--------|
| TIRE-CONTRA-HARSH-COUNTERS-DEPRECATED-ALIAS-001 | Tire ledger fields are named `harshAccelCount/harshBrakeCount/harshCornerCount`, implying a "harsh" semantic, while `trip-behavior-enrichment.service.ts` marks them DEPRECATED aliases of HF-derived `hardAccel/hardBrake` counts | `tire-trip-usage.service.ts` | `trip-behavior-enrichment.service.ts` | OPEN — naming only; values identical. Resolution path: rename in ledger DTO when the ledger schema is next touched (not in P1) |
| TIRE-CONTRA-TWO-ACCEL-BRAKE-SOURCES-001 | Two acceleration/braking evidence sources coexist with different semantics: DI stress scores (per-100 km HF aggregates, 0–100, rolling window) vs DS4 motion events (per manoeuvre, quality-labelled, GPS speed series) | `driving-impact.service.ts` | `motion-event-detector.ts` | OPEN — governed by TIRE-DEC-NO-DOUBLE-COUNTING-001; resolved only when one source is retired from the tire model |

## Reconciled in this bootstrap

None. The setup count discrepancy (5 vs 6) is tracked as a gap (`TIRE-GAP-ACTIVE-SETUP-COUNT-RECONCILE-001`) because both reads were read-only and the filters were not identical; it is not a code contradiction.
