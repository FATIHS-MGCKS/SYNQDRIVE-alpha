# Internationalization (i18n) — Living Architecture Authority (Audit Bootstrap)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority-native status** | Bootstrap audit V1 (2026-09-10) · substantial reconstruction · runtime-bearing frontend module |
| **Maturity** | Platform runtime **CONFIRMED** · Rental surface migration **SUBSTANTIAL** · Hardcoded-copy elimination **IN_PROGRESS** · Governance **CONFIRMED** |
| **Runtime impact** | Frontend SPA locale selection, translation delivery, Rental/Operator/Master UI presentation, CI governance gates |

## What this module owns

`architecture/internationalization/` is the canonical architectural memory for SynqDrive product internationalization:

- Platform locale contract (9 official locales)
- Runtime translation provider (`LanguageContext`) and lookup semantics
- Translation catalog structure (`frontend/src/i18n/translations/`)
- Locale persistence, browser resolution, English fallback
- Rental / Operator / Master / Login surface integration (post Integration 2C)
- Translation coverage baselines and regression guards
- Hardcoded-copy inventory, scanner, and phased enforce-clean surfaces
- i18n governance scripts, PR gate, and Authority Protection workflow parity
- Targeted backend locale copy (billing email, evaluations metrics) — **not** a general backend i18n framework

## Critical boundaries (non-scope)

| Boundary | Owner / rule |
|----------|----------------|
| General backend API response localization | **Out of scope** — APIs expose machine keys/status; frontend resolves presentation |
| Legal document authoritative text | Separate legal-documents registry; not generic `t()` keys |
| Per-surface business logic | Owning Rental/Operator modules; i18n supplies keys and runtime only |
| DIMO / trip / health calculations | Other module authorities |
| `audit-campaign/architecture/I18N_*` slice docs | **Supporting campaign evidence** — not default authority |

## Epistemic states

| State | Meaning |
|-------|---------|
| `CONFIRMED` | Supported by current code and/or verified evidence |
| `INFERRED` | Reasonable reconstruction; not fully verified |
| `HISTORICAL` | Was true in a past era |
| `UNKNOWN` | Not yet reconstructed |
| `CONTRADICTED` | Sources disagree; recorded explicitly |

## Mandatory entry documents

| Document | Purpose |
|----------|---------|
| [CURRENT_STATE.md](./CURRENT_STATE.md) | Best-known snapshot (repository + Production) |
| [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md) | Human-readable architecture graph |
| [AGENT_CONTRACT.md](./AGENT_CONTRACT.md) | Rules for future agents |
| [AUDIT_MANIFEST.md](./AUDIT_MANIFEST.md) | Audit metadata and coverage matrix |
| [decisions/DECISION_REGISTER.md](./decisions/DECISION_REGISTER.md) | Governed decisions |
| [research/CHANGE_LEDGER.md](./research/CHANGE_LEDGER.md) | Phase evolution ledger |
| [evidence/PRODUCTION_BASELINE.md](./evidence/PRODUCTION_BASELINE.md) | Read-only Production baseline |

## Validation

```bash
bash architecture/internationalization/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
cd frontend && npm run i18n:check:ci && npm run i18n:pr-gate:test
```

## Supporting evidence (not default authority)

| Class | Examples |
|-------|----------|
| Governance (merged on main) | `architecture/I18N_GOVERNANCE_*_2026-09-*.md` |
| Integration audits | `docs/audits/i18n-integration-{1b1,2a,2b,2c}-*.md` |
| Campaign slice records | `audit-campaign/architecture/I18N_*` (~80 files) |
| Engineering rules | `.cursor/rules/i18n.mdc` |

## Neighboring authorities

- **Documents** — legal text localization status
- **Outbound Email** — billing email i18n templates
- **Evaluations Analytics** — backend metric label registry
- **Platform Admin / Rental surfaces** — consumers of `useLanguage()`

## Promotion status

**Not promoted to `AUTHORITY_ACTIVE`.** Blockers documented in [AUDIT_MANIFEST.md](./AUDIT_MANIFEST.md) and [contradictions/KNOWLEDGE_GAPS.md](./contradictions/KNOWLEDGE_GAPS.md).
