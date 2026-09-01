# Threshold Calibration Backlog (Phase 4)

**Gap:** `BAT-V2-GAP-THRESHOLD-PROVENANCE-001`  
**Readiness:** RESEARCH_REQUIRED — backlog only

## Classification axes (separate)

### IMPLEMENTATION_ROLE

Where the threshold is used in code (policy, ingestion, job, display).

### PROVENANCE

Epistemic source of the value. **Default UNKNOWN** unless cited evidence exists.

| Provenance | Meaning | Evidence required |
|------------|---------|-------------------|
| `CONFIRMED_DOMAIN_RATIONALE` | Documented engineering/domain decision in repo | PR, commit, architecture doc, code comment with rationale |
| `EXTERNALLY_SOURCED` | OEM/manual/industry reference | External doc citation |
| `TEST_DERIVED` | From test fixtures or calibration run | Test file / experiment record |
| `HISTORICAL_DECISION` | Inherited from prior system with traceable decision | Commit / migration note |
| `UNKNOWN` | No verified source found | — |

**Rejected invented classes:** `DOMAIN-HEURISTIC`, `CODE-CONVENIENCE` without citation — round numbers and technical plausibility are **not** evidence.

## LV REST / opening

| Threshold | Value | Role | Provenance | Source |
|-----------|-------|------|------------|--------|
| Speed at rest | 0.5 km/h | REST window detection | UNKNOWN | — |
| Engine load proxy | >5% | Wake proxy | UNKNOWN | — |
| LV charging voltage (REST window) | 13.25 V | REST charging detection (`DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V`) | UNKNOWN | — |
| Canonical live charging safety | 13.2 V | Live-voltage decision safety (`lv-canonical-battery.resolver.ts` `CHARGING_VOLTAGE_THRESHOLD`; legacy contamination `LV_REST_CONTAMINATION_THRESHOLD_V`) | UNKNOWN | — |
| Max resting voltage band | 13.2 V | Policy default `maxRestingV` / plausible resting ceiling | UNKNOWN | — |
| Wake threshold | max(rest+0.5, 13.8) V | Wake detection | UNKNOWN | — |
| Stability dwell | 5 min | REST stability | UNKNOWN | — |
| Max rest window | 24 h | Window cap | UNKNOWN | — |
| Trip bridge tolerance | 120 s | Bridge fallback bind | UNKNOWN | — |
| REST_60M delay | 60 min | Target schedule | UNKNOWN | — |
| REST_6H delay | 6 h | Target schedule | UNKNOWN | — |
| REST grace | 30 min | Target retry grace (not session SLA) | UNKNOWN | — |
| REST_60M window | ±15 min | Evaluation window | UNKNOWN | — |
| REST_6H window | ±30 min | Evaluation window | UNKNOWN | — |

## HV M2/M3 (from hv-capacity.md)

| Threshold | Role | Provenance | Source |
|-----------|------|------------|--------|
| M2 outlier 15% | M2 gate | UNKNOWN | — |
| M3 conflict 10% | M3 gate | UNKNOWN | — |
| Cross-session CV 3% | Cross-session | UNKNOWN | — |
| Intra-session CV 2% | Intra-session | UNKNOWN | — |

## Freshness / readiness

| Threshold | Role | Provenance | Source |
|-----------|------|------------|--------|
| Provider SOH 45d | Freshness | UNKNOWN | — |
| Reported SOH 365d | Freshness | UNKNOWN | — |
| Readiness SOH 70% | Readiness | UNKNOWN | — |

## Execution

| Threshold | Role | Provenance | Source |
|-----------|------|------------|--------|
| Redis lock TTL 120s | Lock scope | UNKNOWN | — |
| Start proxy 90s | Start proxy window | UNKNOWN | — |
| Snapshot stale 5min | Snapshot freshness | UNKNOWN | — |

## Calibration backlog actions

1. Workshop with domain expert — cite decisions into repo or mark UNKNOWN
2. DIMO signal documentation cross-check for HV CV gates
3. No threshold value changes in Phase 4

## NON-EFFECTS

No threshold value changes in Phase 4. Gap `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` remains open.
