# Decision Ledger (Master Review)

Extends [`../decisions/DECISION_REGISTER.md`](../decisions/DECISION_REGISTER.md) — **does not supersede** canonical rows. New IDs prefixed `DI-MLR-DEC-*`.

| ID | Date | Problem | Alternatives | Chosen | Rejected | Rationale | Evidence | Limits then | New knowledge | Valid today | PRs / commits |
|----|------|---------|--------------|--------|----------|-----------|----------|-------------|---------------|-------------|---------------|
| DI-MLR-DEC-001 | 2026-09-05 | Safe deploy HF Recovery | Enable V2 on prod | Code deployed, flags OFF | Big-bang enable | DI-DEC-DEPLOY-DISABLED | #1533, DEPLOYMENT_STATE | No live cal | EXP-019/020 ran later | **YES** | #1533 |
| DI-MLR-DEC-002 | 2026-09-26 | DI V0 input identity | Ad-hoc CSV | S3A 1s grid + SHA identity | Unpinned replay | C1D.7 | #1800 | Provider mutability | C1G AVG=FIRST=LAST | **YES** | C1D.7 |
| DI-MLR-DEC-003 | 2026-09-24 | R1 temporal abuse | Tune thresholds | Containment fail-closed | Rewrite history | C0.3 | EXP_021_C03 | Tesla unaffected | CG-01 extensions draft | **YES** | C0.3 merge |
| DI-MLR-DEC-004 | 2026-09-27 | S4A authority | Ad-hoc workers | Contract v2 + dormant tables | Immediate runtime | C1D.10C | #1816 | No caller | S4B orchestration dormant | **YES** | #1816 |
| DI-MLR-DEC-005 | 2026-10-14 | Stationary null QC | Force numeric 0 | Speed QC V2 opt-in | Change V1 default silently | P1 V2 semantics | #2021 | P1 order NO_NUMERIC first | P2.1 127 stationary rows | **REASSESS** | #2021, P2.1 |
| DI-MLR-DEC-006 | 2026-10-16 | S4 admission timing | Immediate on COMPLETED | After Trip-FSM boundary finalization | Skip FSM | Admission scope | #2047 | Reconcile window gaps | Tesla missing admission row REPORTED | **YES** | #2047 |
| DI-MLR-DEC-007 | 2026-10-17 | Road match research isolation | Inline prod matcher | Pure `s4-research/` library | Cherry-pick ops scripts | PR B | #2065 | NOT_ASSESSABLE accuracy | Geometry V2 correction | **YES** | #2065 |
| DI-MLR-DEC-008 | 2026-10-19 | Topology fidelity | Lat/lon rounding only | Node-id strict adjacency R1 | Ignore layer | #2082 | topology tests | Turn restrictions open | — | **YES** | #2082 |
| DI-MLR-DEC-009 | 2026-10-19 | Route constraints | Unconstrained Viterbi | Route-aware Viterbi R1 | — | #2084 | offline replay | Compute cost | — | **YES** | #2084 |
| DI-MLR-DEC-010 | 2026-10-19 | Heading use in emission | Distance only | Direction-aware P1 shadow | Blind merge | #2085 | Tesla 135 way audit | NO accuracy claim | — | **REASSESS** | #2085 |
| DI-MLR-DEC-011 | 2026-10-16 | EV GT campaign packaging | Single doc | Frozen baseline + forensic supplements | Mutate baseline | #2051 commits | bc0bbed… series | PR body wrong template | Title/body mismatch | **YES** (process) | #2051 OPEN |
| DI-MLR-DEC-012 | 2026-09-03 | Alignment fit trust | MAE-only GT | Hard bounds gate | Video as auto-GT | DI-HYP-003 | RD003/004 | — | LL-013 | **YES** | audits |

**Count reconstructed:** 12 master ledger rows (+ full register in parent doc).
