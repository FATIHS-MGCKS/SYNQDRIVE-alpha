# DIMO Signal Surface Audit

**Evidence:** DI-EV-0003–0006, DI-EV-0026, DI-EV-0034E  
**Status:** COMPLETED (forensic); per-vehicle variance documented

## Four concepts — NEVER conflate

| Concept | Definition | Example |
|---------|------------|---------|
| **AVAILABLE SIGNAL** | Field exists in provider schema + vehicle capability | `powertrainCombustionEngineSpeed` on Tiguan |
| **OBSERVED UPDATE FREQUENCY** | Median spacing of new physical samples | ~2s HF on RD003 |
| **REQUEST FREQUENCY** | How often SynqDrive queries DIMO | 5s RC runner; 30s block poll hypothesis |
| **HISTORICAL AGGREGATION INTERVAL** | DIMO query parameter | `interval:"1s"` |

---

## Surfaces

### SNAPSHOT (~30s)
| Aspect | Detail |
|--------|--------|
| Purpose | Live vehicle state; trip FSM ACTIVE_TICK |
| Query | `DimoSnapshotProcessor` |
| Cadence | ~30s polling |
| Persistence | Optional CH `telemetry_snapshots` |
| DI use | Live context only; not behavior reconstruction |

### LIVE / LATEST
| Aspect | Detail |
|--------|--------|
| Purpose | Near-real-time values |
| Observed | Median ~6s; stale holds; large age tails |
| DI use | CONTEXT_WITH_FRESHNESS_GATING — not offline reconstruction authority |

### HISTORICAL / HF (`signals interval:"1s"`)
| Aspect | Detail |
|--------|--------|
| Purpose | Post-trip behavior; reference capture incremental |
| Production | Whole-trip single fetch per enrichment |
| Reference capture | Incremental with watermarks + recovery V2 |
| Observed density | Median ~2s buckets (NOT 1 Hz) |
| Persistence | Derived events in PG; optional CH mirror |

### NATIVE DRIVING EVENTS
| Aspect | Detail |
|--------|--------|
| Purpose | Provider-classified behavior.* events |
| Authority | Primary short-event misuse for LTE_R1 |
| Persistence | `DrivingEvent`; dedup by providerFingerprint |
| RD002 | NOT_OBSERVED on C63 |

### WEBHOOK / RPM candidates
| Aspect | Detail |
|--------|--------|
| Purpose | High-RPM stationary abuse intake |
| Status | `RpmWebhookCandidate` table; partial integration |

---

## Vehicle-specific inventories

| Vehicle | Fields (approx) | Notes |
|---------|-----------------|-------|
| Tiguan WOB L 7503 | 31 | RD003 authority |
| KS MX 2024 C63 | 29 | RD002; 1s≠1Hz discovery |
| Cross-vehicle | Shared HF set; gear signals vehicle-specific | DI-EV-0031 |

Supporting gap analyses: `docs/audits/dimo-*-signal-inventory-gap-analysis-2026-08-30.md`
