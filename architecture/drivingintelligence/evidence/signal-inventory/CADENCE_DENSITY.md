# Signal Cadence & Density — Canonical Record

**Invariant:** DI-INV-CADENCE-FOUR-WAY-001

```
QUERY INTERVAL ≠ PROVIDER POLL CADENCE ≠ OBSERVED BUCKET DENSITY ≠ PHYSICAL SENSOR SAMPLING
```

---

## Requested vs observed

| Surface | Requested | Observed (evidence) | Source |
|---------|-----------|---------------------|--------|
| HF historical | `interval:"1s"` | Median ~2s bucket spacing | RD002, RD003 |
| HF sealed capture (RD004-B) | 1s buckets | Median ~10.6s spacing | Capture/watermark gaps |
| LATEST_LIVE | "live" | Median ~6s; stale holds | RD003 |
| Snapshot | ~30s poll | ~30s | Architecture |
| RC runner | 5s cycle | 5s tick (not HF poll in V2 mode) | C.1 |
| Block poll (hypothesis) | 30s | **NOT VALIDATED** | C.1 |

**Reconciliation:** RD003 ~1–2s provider resolution and RD004 ~10.6s sealed median are **compatible** — latter reflects capture/watermark incompleteness, not DIMO physics.

Exact-window replay (RD004-B): 157 1s-buckets vs 104 sealed over same windows.

---

## Provider behavior

| Phenomenon | Evidence | Mitigation |
|------------|----------|------------|
| Late-arriving buckets | RD001, RD004-B (53 late) | Recovery V2 settlement+overlap |
| Settlement delay | RD004-B simulation | 8s provisional |
| Watermark gaps | 26 excluded in B.4 | 6s recovery overlap |
| Duplicate buckets | RD002: 0 duplicate fingerprints | V2 aggregate identity |
| Provider data gaps | RD001: 151s gap | Documented; not vehicle idle proof |

---

## Physical sampling

**UNKNOWN** — DIMO aggregate buckets do not prove underlying ECU sampling rate.

`REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ = NO` (master plan flag)

---

## Detector implications

| Assumption | Current code | Evidence |
|------------|--------------|----------|
| ~1 Hz HF | `HF_WINDOW_EXPECTED_INTERVAL_MS=1000` | CONTRADICTED by RD002/003 |
| Point-pair Δv/Δt | hf-acceleration, hf-braking | Valid as summary; weak for sparse LTE_R1 events |
| 2.0s max-gap (V2 design) | Not in production | Provisional from RD003 |

---

## Per-signal variability

Documented in `docs/audits/data/rd003-signal-quality/signal-quality-summary.json` — each signal has OBSERVED_SPAN, TEMPORAL_CONTINUITY, gap metrics.
