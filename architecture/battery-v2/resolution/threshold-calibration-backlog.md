# Threshold Calibration Backlog (Phase 4)

**Gap:** `BAT-V2-GAP-THRESHOLD-PROVENANCE-001`  
**Readiness:** RESEARCH_REQUIRED — backlog only

## Classification legend

| Class | Meaning |
|-------|---------|
| CODE-CONVENIENCE | Round number / implementation default |
| DOMAIN-HEURISTIC | Engineering judgment, undocumented |
| HISTORICAL | Legacy carry-over |
| EXTERNALLY-SOURCED | OEM/manual reference (not in repo) |
| TEST-DERIVED | From test fixtures |
| UNKNOWN | Not classified |

## LV REST / opening

| Threshold | Value | Class |
|-----------|-------|-------|
| Speed at rest | 0.5 km/h | DOMAIN-HEURISTIC |
| Engine load proxy | >5% | DOMAIN-HEURISTIC |
| LV charging voltage | 13.25 V | DOMAIN-HEURISTIC |
| Wake threshold | max(rest+0.5, 13.8) V | DOMAIN-HEURISTIC |
| Plausible LV band | 9–16 V | DOMAIN-HEURISTIC |
| Stability dwell | 5 min | DOMAIN-HEURISTIC |
| Max rest window | 24 h | CODE-CONVENIENCE |
| Trip bridge tolerance | 120 s | DOMAIN-HEURISTIC |
| REST_60M delay | 60 min | CODE-CONVENIENCE |
| REST_6H delay | 6 h | CODE-CONVENIENCE |
| REST grace | 30 min | CODE-CONVENIENCE |
| REST_60M window | ±15 min | UNKNOWN (was ±30 in unrelated domains) |
| REST_6H window | ±30 min | DOMAIN-HEURISTIC |

## HV M2/M3 (from hv-capacity.md)

| Threshold | Class |
|-----------|-------|
| M2 outlier 15% | DOMAIN-HEURISTIC |
| M3 conflict 10% | DOMAIN-HEURISTIC |
| Cross-session CV 3% | DOMAIN-HEURISTIC |
| Intra-session CV 2% | DOMAIN-HEURISTIC |

## Freshness / readiness

| Threshold | Class |
|-----------|-------|
| Provider SOH 45d | DOMAIN-HEURISTIC |
| Reported SOH 365d | DOMAIN-HEURISTIC |
| Readiness SOH 70% | DOMAIN-HEURISTIC / product policy |

## Execution

| Threshold | Class |
|-----------|-------|
| Redis lock TTL 120s | CODE-CONVENIENCE |
| Start proxy 90s | DOMAIN-HEURISTIC |
| Snapshot stale 5min | CODE-CONVENIENCE |

## Calibration backlog actions

1. Workshop with domain expert for ICE rest voltage thresholds
2. DIMO signal documentation cross-check for HV CV gates
3. A/B not planned in Phase 4 — documentation only

## NON-EFFECTS

No threshold value changes in Phase 4.
