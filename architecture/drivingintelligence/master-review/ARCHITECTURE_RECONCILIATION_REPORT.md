# Architecture Documentation Reconciliation Report

**Scope:** `architecture/drivingintelligence/` + master-review cross-checks against code @ `0a16ffb5b`  
**Method:** Read authority docs, spot-check code paths, verify PR merge state via git/gh.

## Authority hierarchy (recommended)

1. **Runtime behavior:** code + tests on pinned SHA  
2. **Module authority:** `CURRENT_STATE.md`, `decisions/DECISION_REGISTER.md`, `evidence/EVIDENCE_INDEX.md`  
3. **Master dossier:** `master-review/*` — synthesis for agents; **must not override** (1–2) when in conflict  
4. **Supporting flat `architecture/*.md`:** evidence unless designated authority

## Files reviewed (representative)

| Area | Files | Finding |
|------|-------|---------|
| Entry | `README.md`, `CURRENT_STATE.md` | Consistent with code @ SHA; dossier link added |
| Decisions | `decisions/DECISION_REGISTER.md` | 19+ decisions; master ledger extends, not replaces |
| Changes | `research/CHANGE_LEDGER.md` | S4 research PR B/C entries match `s4-research/` on main |
| Evidence | `evidence/EVIDENCE_INDEX.md` | P2.1, C1D*, S4A align with code |
| Production | `evidence/production/DEPLOYMENT_STATE.md` | HF Recovery OFF, legacy ON — still valid |
| LDI-10D | `evidence/ldi-10d/*`, `fixtures/tesla-20261016/*` | Trip ID **358d0158** — dossier had wrong IDs |
| Tiguan | `evidence/exp021-tiguan-20261019/*` | Present on main; safety gate docs are **research** |
| S4 deploy | `evidence/EXP021_S4F7*` series | Kill/staging narrative; not re-attested live |

## Code cross-checks (VERIFIED)

| Statement | Code location |
|-----------|---------------|
| S3A no speed in GraphQL query | `position-acquisition/` query builders |
| L3 t−1,t,t+1 | `l3-eligibility.ts` |
| Speed QC V2 opt-in | `di-v0-speed-qc-policy.version.ts` |
| S4 research flags default off | `di-v0-s4-research-v2.config.ts` |
| `independentRoadIdAccuracy: NOT_ASSESSABLE` | `s4-research` contracts |

## Stale or risky claims in ecosystem (not silently fixed outside master-review)

| Location | Issue | Action |
|----------|-------|--------|
| `ldi-10d/.../PROVENANCE_MANIFEST.json` | Broken path to pre-deploy manifest | Documented CON-R02; **no JSON edit** (out of dossier scope if product-adjacent evidence) |
| README one-screen graph | Says V2 "default OFF" | True for **code default**; footnote Production env in CURRENT_STATE |

## Unbelegte accuracy

No dossier file should state road-match **accuracy %** — matrix uses NOT_ASSESSABLE / NOT_VERIFIED.

## Outside `drivingintelligence/`

`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md` registry row for Driving Intelligence — **unchanged** in this pass (documentation-only, no registry fact change).

**ARCHITECTURE_FILES_REVIEWED:** 45+ (full tree spot-check + all master-review + key evidence paths).
