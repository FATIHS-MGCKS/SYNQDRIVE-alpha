# Contradictions & Evidence Gaps

## Resolved in reconciliation pass

| ID | Was | Source of truth | Fix |
|----|-----|-----------------|-----|
| CON-001 | Fake commit SHA in completion block | `git rev-parse` | [GIT_INTEGRITY.md](./GIT_INTEGRITY.md) |
| CON-002 | `TRIP_1` = `11f5a645…` treated as in-repo frozen trip | `ldi-10d/fixtures/tesla-20261016` uses `358d0158…` | [REFERENCE_TRIP_REGISTRY.md](./REFERENCE_TRIP_REGISTRY.md) splits REF-001 vs REF-002/003 |
| CON-003 | "12 trips" implied 12 physical drives | Register has 12 **rows** including sessions + TC anchor set | [DOSSIER_INVENTORY.md](./DOSSIER_INVENTORY.md) |
| CON-004 | B6 "on branch merged to main" ambiguous | `180c74da8` **not** ancestor of `origin/main`; #2092 merged **different** live-fsm commits | DECISION_LEDGER + this file |

## Remaining (documented, not resolved)

| ID | Conflict | Evidence | Recommended handling |
|----|----------|----------|----------------------|
| CON-R01 | PR #2051 title (F4-B) vs body (DB recovery) vs commits (EV GT) | `gh pr view 2051` | Trust **commit diff**; fix PR body in separate ops PR |
| CON-R02 | `PROVENANCE_MANIFEST.json` → `exp021-ev-ground-truth/pre-deploy/...` | Path **missing** on `main` @ `0a16ffb5b` | Mark **BROKEN_LINK**; baseline may exist only on #2051 branch |
| CON-R03 | Production S4 activation vs kill-gated dormant | S4F7* evidence series | Require fresh read-only VPS attestation — **NOT run** in dossier |
| CON-R04 | `DRIVING_INTELLIGENCE_V2_ENABLED` code default false vs Production true | C1D.10A read-only | Always cite **code default** and **env override** separately |

## Missing artifacts (do not reconstruct)

| Artifact | Status | Notes |
|----------|--------|-------|
| `/opt/cursor/artifacts/exp021-tesla-b3` … `b7-4` | **NOT_AVAILABLE** in this VM | Prior agent REPORTED; not copied to git |
| `architecture/drivingintelligence/evidence/exp021-tesla-b3-human-review/` | **NOT on main** @ dossier SHA | May exist on other branches |
| `exp021-ev-ground-truth/pre-deploy/*` | **NOT on main** | Referenced by ldi-10d manifest |
| PR #2081 backpointer merge | **OPEN** | Not on main |
| Live VPS S4 attestation | **NOT_RUN** | Gap recorded in PRODUCTION_RESEARCH_STATUS |

## PR #2051 actual role (VERIFIED metadata)

- **State:** OPEN  
- **Head:** `cursor/exp021-ev-ground-truth-7d78`  
- **Commits:** EXP021 EV Ground Truth baseline, forensic supplements, admission verification docs — **documentation / evidence**, not F4-B code merge  
- **F4-B helpers:** on **main** via #2065 `s4-research/` — separate from PR #2051 merge state

## B6 commit `180c74da8`

- **Message:** `feat(s4-research): EXP021 B6 direction-aware P1 safety gates library`  
- **On `origin/main` @ `0a16ffb5b`:** **NO** (`git merge-base --is-ancestor` fails)  
- **On branch:** `cursor/live-fsm-admission-scope-hardening-192d` (contains commit)  
- **PR #2092** merged admission-scope fixes **without** this B6 commit — do not equate #2092 with B6 gates

## B7.3 / B7.4 causality corrections

**REPORTED only** (cloud artifacts unavailable here): strict online L3 mask → fewer `STOPPED_SUPPORTED`; batch L3 and DI fast-path circularity; ingestion timestamps not in pins. **NOT_VERIFIED** in this reconciliation run.
