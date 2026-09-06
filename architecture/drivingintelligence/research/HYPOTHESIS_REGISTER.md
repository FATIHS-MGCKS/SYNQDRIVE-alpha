# Driving Intelligence — Hypothesis Register

Independent record of hypotheses tested during the workstream.  
**Status:** CONFIRMED | PARTIALLY_SUPPORTED | REJECTED | NOT_YET_TESTED

| ID | Hypothesis | Why plausible | Experiment | Result | Consequence |
|----|------------|---------------|------------|--------|-------------|
| DI-HYP-001 | `signals(interval:"1s")` yields ~1 Hz usable detector data | DIMO API documents 1s aggregation | RD002/003 signal quality | **REJECTED** | Median ~2s; detectors unchanged in prod |
| DI-HYP-002 | Point-pair HF detectors valid under observed sparse cadence | Legacy production worked | RD003 accel/jerk analysis | **PARTIALLY_SUPPORTED** | Works as summary; not short-event authority for LTE_R1 |
| DI-HYP-003 | Video/telemetry alignment with low MAE is physically valid | Numeric fit looks good | RD003/RD004 alignment audits | **REJECTED** when violates hard bounds | Hard temporal/physical constraints required |
| DI-HYP-004 | 2s overlap alone recovers late DIMO buckets | Simple watermark extension | RD004-B exact-window replay | **REJECTED** | 26 watermark-excluded; recovery V2 needed |
| DI-HYP-005 | 8s settlement + 6s overlap are optimal production values | Grid simulation B.5 | RD004-B counterfactual | **NOT_YET_TESTED** live | Provisional; live calibration required |
| DI-HYP-006 | 30s block poll preserves ~1s/2s bucket density | Provider returns historical blocks | C.1 testbed + calibration design | **NOT_YET_TESTED** | `HF_30S_BLOCK_POLLING_VALIDATED=NO` |
| DI-HYP-007 | One physical drive can compare 10/20/30/60s poll phases | Same vehicle, same route | C.1c multi-cadence design | **NOT_YET_TESTED** live | Machinery ready; no live run |
| DI-HYP-008 | KS MX 2024 / token 187336 is canonical canary vehicle | Prior RD004-B evidence | C.1b review | **REJECTED** as runtime assumption | Operator selects vehicle at runtime |
| DI-HYP-009 | `synqReceivedAt` suitable for event timing | Ingress timestamp available | RD003 ingress alignment | **REJECTED** | `INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS=0` |
| DI-HYP-010 | LATEST_LIVE fresher than HF for reconstruction | Surface name implies recency | RD003 LATEST_LIVE analysis | **REJECTED** for offline reconstruction | Stale holds; median ~6s |
| DI-HYP-011 | Engine load ≈ vehicle mass/road load | OBD naming | RD003 signal quality | **REJECTED** | CONTEXT_ONLY — demand proxy |
| DI-HYP-012 | Episode V2 replaces point-pair counting | Sparse HF breaks pairs | 0034F design | **NOT_YET_TESTED** in production | Design only |
| DI-HYP-013 | Native DIMO events authoritative for LTE_R1 short events | Provider-classified behavior | RD002/003 + code reframing | **CONFIRMED** | HF = Trip Signal Summary only |
| DI-HYP-014 | Reference capture can run safely with V2 OFF on main | Feature flags default false | PR #1533 merge + deploy discipline | **CONFIRMED** | CODE_DEPLOYED=YES, FEATURE_ENABLED=NO |
| DI-HYP-015 | Phase switch at cycle boundary prevents races | Concurrency review | C.1d/C.1e hardening | **CONFIRMED** in tests | Live multi-replica NOT validated |

**Rejected count:** 7  
**Not yet tested:** 4  
**Confirmed:** 3  
**Partially supported:** 1
