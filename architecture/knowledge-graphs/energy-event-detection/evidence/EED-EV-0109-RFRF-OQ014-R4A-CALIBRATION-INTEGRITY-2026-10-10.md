# EED-EV-0109 — RFRF OQ-014 R4A Calibration Integrity & Sufficiency (2026-10-10)

**Classification:** OFFLINE_EVIDENCE + DESIGN_REPLAY  
**Baseline main:** `d717caf8e168f4671ea1cf592d52c3f7bca38bb4`  
**Predecessors:** R2 #1942, R3A #1947, R3B #1952 (merged)

## Safety attestations

| Attestation | Value |
|-------------|-------|
| PRODUCTION_DB_WRITES | **0** |
| RUNTIME_CHANGED | **NO** |
| PRODUCTION_NUMERIC_CAPS_SELECTED | **NO** |
| Hybrid Trust Alpha authorization changed | **NO** |
| Schema migration | **NO** |

## A. Event accounting (reconciled)

| Population | N | Source |
|------------|--:|--------|
| Canonical physical | 14 | `rfrf-oq014-r4a-event-accounting.ts` |
| Positive-labeled physical | 13 | exclude `KS_MS_661_2026_09_14_SUSPECT_57L` |
| Drop calibration eligible | 6 | = eligible naturals |
| Settling timing calibration eligible | 5 | exclude `WOB_7503_2026_09_19` |
| Locality calibration eligible | 5 | same as timing-eligible |
| Committed full-replay fixtures | 6 | fixture rows + EED-EV-0104 spine JSON |
| Independent vehicles (eligible) | 3 | KS MS 661, WOB L 7503, KS MX 2024 |

**WOB concentration correction:** see **EED-EV-0104-ADDENDUM-R4A-WOB-CONCENTRATION-2026-10-10** — **3/6**, not 4/6.

## B. Calibration sufficiency (reproducible offline)

Per-event metrics computed by `rfrf-oq014-r4a-calibration-metrics.lib.ts` + Jest `rfrf-oq014-r4a-calibration-integrity.spec.ts` (REPLAY_HYPOTHESIS bundle only).

| Statistic (eligible N=6) | Observed (offline replay) |
|--------------------------|---------------------------|
| Peak→settled drop L min / median / max | 0 / 0 / 1 |
| Peak→settled ratio min / median / max | 0 / 0 / ≤0.0714 |
| WOB 09-19 `peakToSettledElapsedMs` | 2_325_000 (**observation delay**, timing-ineligible) |
| KS MS 661 09-30 drop | 1 L, `MATURE_SHADOW_READY` under hypothesis bundle |

| Decision | Value |
|----------|-------|
| **PRODUCTION_UPPER_BOUND_ESTABLISHED** | **NO** |
| **CALIBRATION_DECISION** | **CALIBRATION_INSUFFICIENT** |

**Limitations:** six events, three vehicles, WOB **50%** of eligible set; two eligible events depend on bounded read-only spine JSON extracts; seven-row defensible pack ≠ eligible six (see R4A-REP-2).

## C. Adversarial offline replay

| Check | Result |
|-------|--------|
| Terminal F3 dominance | `assertTerminalRejectionDominatesSettledPost` — PASS |
| REPLAY_HYPOTHESIS sensitivity grid SAFETY_NEGATIVE leaks | 0 at default hypothesis point |
| A12 second refuel (T21 class) | remains SAFETY_NEGATIVE |
| R3A + settled-post harness | 17/17 Jest tests PASS (`npm run test:rfrf:settled-post-replay`) |

Per-event eligible outcomes recorded in spec **R4A-MET-2** (stdout contract in CI).

## D. Additional evidence required (acquisition plan)

| Gap | Minimum additional evidence | Authorization |
|-----|----------------------------|---------------|
| Fleet diversity | ≥3 **additional independent vehicles** with calibration-grade absolute spines | Later read-only provider / production audit — **not R4A** |
| Natural count | ≥12 eligible naturals with **FULL_REPLAY** committed spines | Same |
| WOB de-clustering | Reduce single-vehicle fraction below **0.4** of eligible set | Same |
| HMÜ / additional orgs | At least one non-FMS-alpha cohort natural with settled READY replay | Provider read-only extract |

## E. Next recommended slice

**R4B — bounded spine ingestion + fixture promotion gate:** commit sanitized spines only via existing EED-EV-0104 pattern; expand `COMMITTED_FULL_REPLAY` without runtime activation; still **no** Production numeric caps.

## Validation

```bash
cd backend && npm run test:rfrf:settled-post-replay
cd backend && npm test -- raw-fuel-rise-phase-scanner --runInBand --forceExit
bash architecture/scripts/validate-module-registry.sh
```

## Open questions

- **EED-OQ-014:** **OPEN** — calibration insufficient; integrity reconciled in R4A.
- **EED-OQ-019:** **PARTIALLY_RESOLVED** — unchanged.
