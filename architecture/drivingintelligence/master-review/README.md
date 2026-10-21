# Driving Intelligence — Master Architecture & Research Dossier

**Purpose:** Independent-agent-readable, source-backed reconstruction of SynqDrive Driving Intelligence (DI) through **2026-10-21**.  
**Scope:** Documentation only — no product code, flags, migrations, or deploy changes on this branch.  
**Base repository SHA:** `origin/main` @ `0a16ffb5b0add0bec30fefc4e55a41973428677b` (2026-10-20).  
**Branch:** `cursor/di-master-architecture-research-20261021`  
**Verified dossier commit:** see [GIT_INTEGRITY.md](./GIT_INTEGRITY.md) (`git rev-parse` on research branch — **never** use truncated placeholder SHAs).  
**Canonical authority (unchanged):** [`../CURRENT_STATE.md`](../CURRENT_STATE.md), [`../evidence/EVIDENCE_INDEX.md`](../evidence/EVIDENCE_INDEX.md), [`../decisions/DECISION_REGISTER.md`](../decisions/DECISION_REGISTER.md).

## Epistemic labels (used throughout)

| Label | Meaning |
|-------|---------|
| **VERIFIED** | Reproducible from committed code, tests, or pinned artifacts in-repo |
| **REPORTED** | Documented claim with cited source; not independently re-run in this dossier |
| **INFERRED** | Logical synthesis from multiple VERIFIED/REPORTED facts |
| **HYPOTHESIS** | Explicitly unproven design direction |
| **NOT_ASSESSABLE** | Cannot answer without missing ground truth or runtime access |
| **NOT_AVAILABLE** | Artifact referenced elsewhere but absent or unreachable in this environment |

## Document map

| Document | Contents |
|----------|----------|
| [MASTER_ARCHITECTURE_OVERVIEW.md](./MASTER_ARCHITECTURE_OVERVIEW.md) | Single-page entry + terminology (S3A/S1/L3/S4) |
| [GIT_INTEGRITY.md](./GIT_INTEGRITY.md) | Branch SHAs, invalid-SHA postmortem |
| [DOSSIER_INVENTORY.md](./DOSSIER_INVENTORY.md) | Verified file/count audit |
| [ARCHITECTURE_RECONCILIATION_REPORT.md](./ARCHITECTURE_RECONCILIATION_REPORT.md) | Doc vs code reconciliation |
| [CONTRADICTIONS_AND_EVIDENCE_GAPS.md](./CONTRADICTIONS_AND_EVIDENCE_GAPS.md) | Open/resolved conflicts |
| [L3_AUTHORITY_DECISION.md](./L3_AUTHORITY_DECISION.md) | L3 vs R1 authority (Task E) |
| [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | End-to-end pipeline, component contracts, Mermaid diagram |
| [EVOLUTION_TIMELINE.md](./EVOLUTION_TIMELINE.md) | Git/PR-era chronology (EXP-019 → EXP-021, S4, LDI-10D) |
| [L3_SPEED_RESEARCH.md](./L3_SPEED_RESEARCH.md) | L3, S1/S3A, Speed QC V1/V2, R1 containment, video tacho |
| [MOTION_STOP_GO_RESEARCH.md](./MOTION_STOP_GO_RESEARCH.md) | Stop/go, hold/release, Trip FSM vs CUSUM vs micro-motion, B3–B7 |
| [ROAD_MATCHING_EVOLUTION.md](./ROAD_MATCHING_EVOLUTION.md) | S4 shadow, research library, topology, Viterbi, direction-aware |
| [ALGORITHM_COMPARISON_MATRIX.md](./ALGORITHM_COMPARISON_MATRIX.md) | Variants A–J with SHA, status, comparability |
| [REFERENCE_TRIP_REGISTRY.md](./REFERENCE_TRIP_REGISTRY.md) | Tesla, Tiguan, RD00x, video/tacho witnesses |
| [GROUND_TRUTH_AND_VALIDATION.md](./GROUND_TRUTH_AND_VALIDATION.md) | What counts as GT; independence rules |
| [DECISION_LEDGER.md](./DECISION_LEDGER.md) | Master decision ledger (extends register, does not replace) |
| [FAILURE_MODE_CATALOG.md](./FAILURE_MODE_CATALOG.md) | Known failure modes with evidence pointers |
| [PRODUCTION_RESEARCH_STATUS.md](./PRODUCTION_RESEARCH_STATUS.md) | Deployed vs enabled vs research-only matrix |
| [EVIDENCE_INDEX.md](./EVIDENCE_INDEX.md) | Dossier-specific evidence routing |
| [OPEN_QUESTIONS.md](./OPEN_QUESTIONS.md) | Unresolved technical disputes |
| [INDEPENDENT_AGENT_REVIEW_BRIEF.md](./INDEPENDENT_AGENT_REVIEW_BRIEF.md) | Review package + ≥10 neutral questions |
| [review/REVIEW_PIN.md](./review/REVIEW_PIN.md) | Pinned context for reviewers A/B/C |
| [REPRODUCIBILITY_GUIDE.md](./REPRODUCIBILITY_GUIDE.md) | Offline commands and harness entry points |

## PRs explicitly reviewed for this dossier

| PR | State (2026-10-21) | Topic |
|----|-------------------|--------|
| #1800 | MERGED | S3A position acquisition (dormant library) |
| #1816 | MERGED | S4A dormant foundation |
| #1990 | MERGED | Master Admin S4 monitoring |
| #2013 | MERGED | P2.1 read-only real-trip speed QC preview |
| #2021 | MERGED | P1 Speed QC policy V2 (opt-in) |
| #2027 | MERGED | P1 V2 runtime integration readiness |
| #2028 | MERGED | P2 auto V2 trip speed QC after S4 (dormant) |
| #2047 | MERGED | S4 admission after Trip-FSM boundary finalization |
| #2051 | **OPEN** | Title vs body vs commits **discrepancy documented** — see [EVOLUTION_TIMELINE.md](./EVOLUTION_TIMELINE.md) |
| #2065 | MERGED | S4 research PR B — pure road-matching library |
| #2082 | MERGED | OSM node-id topology R1 |
| #2084 | MERGED | Route-aware Viterbi R1 |
| #2085 | MERGED | Production shadow wiring direction-aware emission P1 |

Additional PRs inferred from `research/PR_TIMELINE.md` and git history are cited in [EVOLUTION_TIMELINE.md](./EVOLUTION_TIMELINE.md).

## Cloud-only artifacts (NOT_IN_REPO)

Several EXP021 Tesla B3–B7 experiments produced artifacts under `/opt/cursor/artifacts/exp021-tesla-b*` on Cloud Agent VMs. They are **cited as REPORTED** in [MOTION_STOP_GO_RESEARCH.md](./MOTION_STOP_GO_RESEARCH.md) but are **NOT_AVAILABLE** in git unless copied into `architecture/drivingintelligence/evidence/`.

## How to use this package

1. Read [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) for the pipeline map and separation of Trip FSM / CUSUM / micro-motion.
2. Use [PRODUCTION_RESEARCH_STATUS.md](./PRODUCTION_RESEARCH_STATUS.md) before assuming any merge implies production activation.
3. Run checks in [REPRODUCIBILITY_GUIDE.md](./REPRODUCIBILITY_GUIDE.md) to verify code-level claims.
4. Answer review questions in [INDEPENDENT_AGENT_REVIEW_BRIEF.md](./INDEPENDENT_AGENT_REVIEW_BRIEF.md) without presupposed conclusions.
