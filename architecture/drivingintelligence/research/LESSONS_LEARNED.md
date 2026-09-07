# Driving Intelligence — Lessons Learned

Evidence-backed lessons future agents must not rediscover.

| ID | Lesson | Evidence | Graph invariant |
|----|--------|----------|-----------------|
| LL-001 | **Requested aggregation interval ≠ physical sampling rate.** RD003: `interval:"1s"` → ~2.00s median physical samples. RD002 sealed: P50 **13.489s** (different metric). | DI-EV-0026, DI-EV-0034E | DI-INV-POLL-NOT-GEN-001 |
| LL-002 | **Query interval ≠ provider poll cadence ≠ observed bucket density ≠ physical sensor rate.** Four separate concepts. | C.1 block polling doc | DI-INV-CADENCE-FOUR-WAY-001 |
| LL-003 | **A numerically low-error video alignment may still be invalid** if it violates hard temporal or physical bounds. | DI-EV-0034C→D, RD004-A | — |
| LL-004 | **HF query responses can be incomplete** because buckets settle late — not because the vehicle was inactive. | DI-EV-0035B.4 | DI-INV-GAP-NOT-IDLE-001 |
| LL-005 | **Simple last-seen watermark insufficient** for late-arriving aggregate buckets; need settlement + recovery overlap + separate watermarks. | DI-EV-0035B.4, 0035C | — |
| LL-006 | **Control-plane calibration writes cannot race data-plane acquisition-state overwrites.** | DI-DEF-011, C.1d | — |
| LL-007 | **Phase requests must be computed inside locked current state**, not from stale pre-lock snapshots. | DI-DEF-013, C.1e | — |
| LL-008 | **Terminal phase evidence requires explicit finalization** on STOP/ABORT/FAILURE — not implicit on next phase. | DI-DEF-014, C.1e | — |
| LL-009 | **Transition windows must not contaminate pure cadence statistics** for 10/20/30/60 comparison. | DI-DEF-016, C.1e | — |
| LL-010 | **`DriverScoreService` may not measure driver quality** — it aggregates vehicle operational stress. | DI-EV-0002 | DI-INV-STRESS-NOT-DRIVER-001 |
| LL-011 | **Tire/brake load ≠ measured wear** — operational proxies with explicit provenance. | DI-EV-0002, load components | DI-INV-LOAD-NOT-WEAR-001 |
| LL-012 | **`synqReceivedAt` is ingress timing**, not physical event time. Use `providerTimestamp`. | DI-EV-0034E | — |
| LL-013 | **In-sample alignment-fit MAE ≠ independent accuracy.** | DI-EV-0034E.1 | — |
| LL-014 | **Reference capture HF policy must stay isolated** from production post-trip enrichment until cutover decision. | DI-EV-0035C | DI-INV-RC-SEPARATION-001 |
| LL-015 | **CODE_DEPLOYED ≠ FEATURE_ENABLED ≠ LIVE_CANARY_EXECUTED.** PR #1533 merged HF policy code with V2/sweep/calibration flags OFF; RC infrastructure may remain ENABLED. | PR #1533, C.1e flags | — |
| LL-016 | **LTE_R1 sparse HF cannot assert short-lived misuse** — native DIMO events are primary authority. | RD003, trip-behavior-enrichment comments | DI-INV-LTE-NATIVE-AUTHORITY-001 |
| LL-017 | **Canary vehicle must be operator-selected at runtime** — no hardcoded production token. | C.1b | — |
| LL-018 | **Empty canary allowlist must fail-closed to LEGACY**, not activate V2 broadly. | C.1a, DI-DEF-008 | — |
| LL-019 | **First live multi-cadence run (EXP-019):** slower poll intervals reduce provider **request rate** (~55–84% vs 10s when normalized/min) but large native max gaps **persist after settlement** — not late-settlement artifacts. 10s had 81.5% zero-results; zero-result windows stayed empty on replay. **NO cadence winner (N=1).** | EXP-019 | DI-INV-CADENCE-FOUR-WAY-001 |
| LL-020 | **Absolute request counts across unequal phase durations are misleading** — use `providerRequestsPerMinute` for scalability comparison. | EXP-019 closeout | DI-INV-CADENCE-FOUR-WAY-001 |
| LL-021 | **Provider HF gap interiors can be empty while video shows clear physical dynamics** — even at 10s poll. Native events did not backfill GT windows on KS MX 2024 (N=1). Do not treat boundary-only speeds as trajectory reconstruction. | EXP-019 video-GT correlation | DI-INV-GAP-NOT-IDLE-001 |
| LL-022 | **Revised video GT can correct prior misclassification** — GT-10-P0 is deceleration-to-stop (36→0), not acceleration; HF boundaries showed 0→0 with interior void. | EXP-019 event register | — |
| LL-023 | **Gap-conditioned GT must not be extrapolated to cadence-wide failure rates** — 5 windows selected around material gaps; 8 video-first control windows show FULL/PARTIAL HF outside gaps. Withdraw cadence-wide CRITICAL labels; split `LOCAL_GAP_FAILURE_SEVERITY` from `CADENCE_WIDE_RECONSTRUCTION_CONFIDENCE`. | EXP-019 bias-control | DI-HYP-016 |
