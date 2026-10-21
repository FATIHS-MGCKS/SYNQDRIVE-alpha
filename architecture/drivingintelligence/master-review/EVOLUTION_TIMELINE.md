# Evolution Timeline — Driving Intelligence

Chronology is **REPORTED** from merge dates, `research/CHANGE_LEDGER.md`, and `WORKSTREAM_HISTORY.md`, cross-checked against GitHub PR metadata at dossier time.

## Era map

| Era | Dates (approx.) | Theme |
|-----|-----------------|-------|
| Phase 1–2 | 2026-08-30 – 09-06 | Forensic baseline, DIMO signal audits, reference drives RD001–004 |
| HF Recovery / RC | 2026-09-04 – 09-07 | Recovery V2 code, block polling, EXP-019/020 video GT, EXP-021 settlement shadow design |
| R1 containment | 2026-09-24 | C0.3 temporal-safety — R1 point-in-time claims gated |
| DI V0 slices | 2026-09-26 – 09-28 | S2 shadow schema, S3A (#1800), S3B, S4A contract + dormant impl (#1816) |
| P1/P2 Speed QC | 2026-10-13 – 10-15 | P2.1 preview (#2013), Speed QC V2 (#2021), P2 auto dormant (#2028) |
| S4 production shadow | 2026-10-10 – 10-16 | Admission finalization (#2047), S4P monitoring (#1990), deploy freeze series S4F7* |
| LDI-10D / S4 research | 2026-10-16 – 10-19 | PR B (#2065), topology (#2082), route Viterbi (#2084), direction-aware P1 shadow (#2085) |
| EXP021 EV ground truth | 2026-10-16+ | Open PR #2051 branch — Tesla protocols, forensic supplements |

## Selected PR milestones

| Date | PR | SHA (merge) | Outcome |
|------|-----|-------------|---------|
| 2026-09-26 | #1800 | (S3A) | Dormant position acquisition |
| 2026-09-28 | #1816 | `2c321823a` | S4A dormant DB foundation |
| 2026-10-12 | #1990 | — | Master Admin DI S4 monitoring |
| 2026-10-14 | #2013 | — | Read-only real-trip QC preview CLI |
| 2026-10-14 | #2021 | `f7a285b59`… | Speed QC V2 policy (opt-in) |
| 2026-10-15 | #2027, #2028 | — | V2 readiness passthrough; P2 auto dormant |
| 2026-10-16 | #2047 | — | S4 admission gated on Trip-FSM boundary |
| 2026-10-17 | #2065 | — | `s4-research/` pure library on main |
| 2026-10-19 | #2082 | `784c4b0c`… | Strict OSM node-id topology R1 |
| 2026-10-19 | #2084 | `cf20c49f`… | Route-aware Viterbi R1 |
| 2026-10-19 | #2085 | — | Production shadow wiring direction-aware emission P1 |

## PR #2051 — title vs body vs commits (VERIFIED discrepancy)

| Aspect | Content |
|--------|---------|
| **GitHub title** | `EXP021 / LDI-10D: F4-B ambiguous promotion evidence audit (offline)` |
| **PR body (agent wrapper)** | Describes **P0 isolated DB recovery** script `vps-isolated-db-recovery-verify.sh` — **no mention of F4-B or LDI-10D in body text** |
| **Branch** | `cursor/exp021-ev-ground-truth-7d78` |
| **Commits (sample, VERIFIED via `gh pr view 2051`)** | `feat(di): EXP021 EV Ground Truth pre-deploy baseline`, forensic supplements, admission verification, ChatGPT review bundle — **EV / Tesla ground-truth documentation**, not DB recovery |
| **Assessment** | **VERIFIED mismatch** between PR description template and commit stream. **INFERRED:** PR body may be stale/wrong agent template. **NOT_ASSESSABLE** without owner confirmation whether F4-B audit commits were ever on this branch vs a different workstream. |
| **F4-B on main** | Promotion audit helpers ship with PR B (#2065) in `s4-research/` — **VERIFIED** on `origin/main`. |

**Rule for agents:** Do not claim PR #2051 merged F4-B or executed isolated DB recovery based on title/body alone; read the commit list and diff.

## Research branches (read-only identification)

| Branch pattern | Topic | On main? |
|----------------|-------|----------|
| `cursor/exp021-ev-ground-truth-7d78` | Tesla GT, forensics | Partial docs may land via #2051 |
| `cursor/s4-*-192d` | Viterbi, topology, backpointer | #2082, #2084 merged; #2081 backpointer **OPEN** |
| `cursor/live-fsm-admission-scope-hardening-192d` | B6 safety gates (`180c74da8`) | Commit **exists on branch**; **NOT** on `origin/main` @ `0a16ffb5b` (#2092 merged other commits) |

## Commits reviewed (method)

- Full `origin/main` ancestry not enumerated line-by-line.
- **~15 PRs** deep-read via metadata + evidence docs.
- **CHANGE_LEDGER** append-only entries 2026-09 → 2026-10 scanned for S4 research and geometry V2.

See [DECISION_LEDGER.md](./DECISION_LEDGER.md) for decision-level dating.
