# Dossier Inventory — Verified Counts

Reconciliation pass **2026-10-21**. Prior agent headline numbers **audited below**.

## Prior claims vs verified

| Claim | Prior | Verified | Notes |
|-------|-------|----------|-------|
| New dossier documents | 16 | **16** | `master-review/*.md` excluding this file until added |
| Modified files | (implicit 1) | **1** | `architecture/drivingintelligence/README.md` |
| PRs reviewed | 13 | **13** | Rows in [README.md](./README.md) PR table |
| Algorithms compared (A–J) | 10 | **10** | [ALGORITHM_COMPARISON_MATRIX.md](./ALGORITHM_COMPARISON_MATRIX.md) |
| Reference register rows | 12 | **12** | [REFERENCE_TRIP_REGISTRY.md](./REFERENCE_TRIP_REGISTRY.md) `REF-*` table |
| Decisions in master ledger | 12 | **13** | [DECISION_LEDGER.md](./DECISION_LEDGER.md) (+ DI-MLR-DEC-013 B6/#2092) |
| Failure modes | 20 | **20** | [FAILURE_MODE_CATALOG.md](./FAILURE_MODE_CATALOG.md) |
| Contradictions flagged | 2 | **≥4 documented** | See [CONTRADICTIONS_AND_EVIDENCE_GAPS.md](./CONTRADICTIONS_AND_EVIDENCE_GAPS.md) |

## File inventory (initial dossier commit `cb59ed916`)

| Path | Purpose | Introduced in | Theme | Key sources | Evidence status | Reconciled |
|------|---------|---------------|-------|-------------|-----------------|------------|
| `master-review/README.md` | Entry, epistemic labels, PR list | `cb59ed916` | Meta | git, PR metadata | VERIFIED | YES — SHA note |
| `SYSTEM_ARCHITECTURE.md` | Pipeline + Mermaid | `cb59ed916` | DI V0 | CURRENT_STATE, code | VERIFIED | YES |
| `EVOLUTION_TIMELINE.md` | PR chronology, #2051 | `cb59ed916` | History | gh pr view | VERIFIED | YES |
| `L3_SPEED_RESEARCH.md` | L3, QC, R1 | `cb59ed916` | Kinematics | C1D7, P2.1 | VERIFIED | YES — see L3_AUTHORITY |
| `MOTION_STOP_GO_RESEARCH.md` | B3–B7, Trip FSM | `cb59ed916` | Stop/go | evidence gaps | PARTIAL | YES — trip ID fix |
| `ROAD_MATCHING_EVOLUTION.md` | S4 research | `cb59ed916` | Road match | PR B,C,2082,2084 | VERIFIED | YES |
| `ALGORITHM_COMPARISON_MATRIX.md` | Variants A–J | `cb59ed916` | Algorithms | s4-research | VERIFIED | YES — validation tiers |
| `REFERENCE_TRIP_REGISTRY.md` | Trip register | `cb59ed916` | GT | ldi-10d, RD | **WAS WRONG** | **REWRITTEN** |
| `GROUND_TRUTH_AND_VALIDATION.md` | GT classes | `cb59ed916` | Validation | audits | VERIFIED | YES |
| `DECISION_LEDGER.md` | MLR decisions | `cb59ed916` | Decisions | register | VERIFIED | YES — B6/#2092 |
| `FAILURE_MODE_CATALOG.md` | FM-* | `cb59ed916` | Risks | mixed | VERIFIED | YES |
| `PRODUCTION_RESEARCH_STATUS.md` | Deploy matrix | `cb59ed916` | Ops | DEPLOYMENT_STATE | REPORTED | YES |
| `EVIDENCE_INDEX.md` | Routing | `cb59ed916` | Meta | EVIDENCE_INDEX | VERIFIED | YES |
| `OPEN_QUESTIONS.md` | OQ-* | `cb59ed916` | Open | — | VERIFIED | YES |
| `INDEPENDENT_AGENT_REVIEW_BRIEF.md` | Review brief | `cb59ed916` | Meta | — | VERIFIED | superseded by `review/*` |
| `REPRODUCIBILITY_GUIDE.md` | Commands | `cb59ed916` | Tests | package.json | VERIFIED | YES |

## Files added in reconciliation pass

Listed in git commit message after this inventory is committed.
