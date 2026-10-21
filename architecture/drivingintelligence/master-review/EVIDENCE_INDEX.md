# Evidence Index (Master Review Routing)

Canonical catalog remains [`../evidence/EVIDENCE_INDEX.md`](../evidence/EVIDENCE_INDEX.md). This file routes dossier readers to **high-signal** pins.

## By topic

| Topic | Primary evidence |
|-------|------------------|
| Current architecture | `../CURRENT_STATE.md` |
| L3 / S1 | `../evidence/EXP021_C1D7_S3A_*`, `core/kinematics/l3-eligibility.ts` |
| Speed QC | `../evidence/EXP021_P1_V2_*`, `EXP021_P21_R3_*`, PR #2021 |
| R1 containment | `../evidence/reference-capture/EXP_021_C03_*` |
| S4 dormant | `../evidence/EXP021_S4A_*`, S4F7* deploy series |
| S4 research | `../evidence/EXP021_S4_RESEARCH_PR_B_*`, `ldi-10d/` |
| Tiguan replay | `../evidence/exp021-tiguan-20261019/` |
| Tesla fixture | `../evidence/ldi-10d/fixtures/tesla-20261016/` |
| Reference drives | `../evidence/reference-capture/REFERENCE_DRIVES.md` |
| Production flags | `../evidence/production/DEPLOYMENT_STATE.md` |
| Change history | `../research/CHANGE_LEDGER.md` |

## Cloud-only (NOT_IN_REPO)

| Path | Content |
|------|---------|
| `/opt/cursor/artifacts/exp021-tesla-b7-*` | B7.1–B7.4 stop/causality/provenance |
| `/opt/cursor/artifacts/exp021-p21-r3-forensic.json` | P2.1 aggregates |

## Coverage estimate

| Area | Coverage |
|------|----------|
| Main @ 0a16ffb5b code paths | HIGH |
| Production runtime flags | MEDIUM (read-only audits, no live VPS in dossier run) |
| Open PR branches | MEDIUM |
| Independent road GT | NONE (by design) |

**EVIDENCE_COVERAGE:** ~75% of dossier claims tied to in-repo path or PR; remainder REPORTED cloud or NOT_AVAILABLE.
