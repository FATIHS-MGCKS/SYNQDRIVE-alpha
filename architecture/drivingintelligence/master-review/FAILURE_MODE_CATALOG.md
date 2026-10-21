# Failure Mode Catalog

| ID | Mode | Symptoms | Repro evidence | Epistemic | Mitigation status |
|----|------|----------|----------------|-----------|-------------------|
| FM-001 | Speed signal time shift | Detector misalignment vs video | RD004-A offset | CONFIRMED | Documented; not auto-corrected in legacy HF |
| FM-002 | Missing provider timestamps | Unprovable instant claims | R1 containment C0 | CONFIRMED | R1 gates |
| FM-003 | GPS outage / SIGNAL_NULL | Null L3, gaps | S3A tri-state | CONFIRMED | Abstain |
| FM-004 | Stationary GPS jitter | Hold/frozen coords | FULL-R1-002 golden | CONFIRMED | Hold/release |
| FM-005 | Service road false match | Wrong way ID | Tiguan `TIGUAN_FAILURE_CASES.md` | REPORTED | Research matchers |
| FM-006 | Viterbi without backpointer | Suboptimal path retrieval | Forward-only on main | CONFIRMED | PR #2081 open |
| FM-007 | Rounded OSM nodes | False adjacency | PR B adjacency note | CONFIRMED | Node-id topology #2082 |
| FM-008 | Directed graph ignored | Reverse on one-way | Direction-aware P1 | REPORTED | Shadow wiring |
| FM-009 | Unknown turn restrictions | Illegal transitions | F4-B impossible graph | REPORTED | Flag only |
| FM-010 | Implausible way switch | Topology conflict | F4-B promotions | VERIFIED tests | No auto-promote |
| FM-011 | Speed QC null semantics | Stationary counted untrusted | P2.1 forensic | CONFIRMED | V2 partial |
| FM-012 | No road-match GT | Accuracy % claims | S4 contract | CONFIRMED | NOT_ASSESSABLE |
| FM-013 | Batch L3 leakage | Online stop false confidence | B7.3 REPORTED | REPORTED | Mask policy |
| FM-014 | Trip FSM vs DI stop conflation | Wrong root cause | KS MX forensic | REPORTED | Docs |
| FM-015 | PR metadata drift | Wrong review scope | #2051 body vs commits | VERIFIED | Process fix |
| FM-016 | Merge ≠ production ON | False activation belief | DEPLOYMENT_STATE | CONFIRMED | Status matrix |
| FM-017 | Live DB re-query ≠ pin | Replay non-reproducible | C1G mutability | CONFIRMED | Pin snapshots |
| FM-018 | Sparse provider speed | False stop at waypoint 0 | B7.4 REPORTED | REPORTED | Do not override L3 |
| FM-019 | CROSS_SOURCE_CONFLICT | R1 0–10 vs L3 26–52 | P2.1 trip | CONFIRMED | INTERVAL_ONLY |
| FM-020 | Admission reconcile window | Shadow work item missing | EXP021 post-deploy doc | REPORTED | Ops runbook |

**Failure modes documented:** 20
