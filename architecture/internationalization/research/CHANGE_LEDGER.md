# Internationalization (i18n) — Change Ledger

Scientific history of the i18n rebuild workstream. No runtime code changes in this bootstrap authority PR unless noted.

## Phase P0 — Production hardening (2026-08)

| Field | Detail |
|-------|--------|
| **CHANGE** | Canonical runtime stabilization, locale persistence hardening |
| **EVIDENCE** | `audit-campaign/architecture/I18N_PRODUCTION_HARDENING_P0_2026-08-18.md` |
| **STATUS** | COMPLETE (repository) |

## Phase P1 — Canonical runtime (2026-08)

| Field | Detail |
|-------|--------|
| **CHANGE** | `LanguageContext`, `locales.ts`, translation registry |
| **EVIDENCE** | `audit-campaign/architecture/I18N_CANONICAL_RUNTIME_P1_2026-08-18.md` |
| **STATUS** | COMPLETE (repository) |

## Integration 1 — Platform infrastructure (2026-09)

| Field | Detail |
|-------|--------|
| **CHANGE** | Governance baseline, platform i18n infrastructure |
| **EVIDENCE** | `docs/audits/i18n-integration-1b1-governance-authority-2026-09-08.md` |
| **STATUS** | COMPLETE |

## Integration 2A — Runtime provider (2026-09)

| Field | Detail |
|-------|--------|
| **CHANGE** | Unified `LanguageProvider` at SPA root |
| **EVIDENCE** | `docs/audits/i18n-integration-2a-runtime-provider-2026-09-08.md` |
| **STATUS** | COMPLETE |

## Integration 2B — Language surfaces (2026-09)

| Field | Detail |
|-------|--------|
| **CHANGE** | Language picker, locale surfaces across apps |
| **EVIDENCE** | `docs/audits/i18n-integration-2b-language-surfaces-2026-09-08.md` |
| **STATUS** | COMPLETE |

## Integration 2C — Rental bridge retirement (2026-09)

| Field | Detail |
|-------|--------|
| **CHANGE** | Removed `frontend/src/rental/i18n/`; direct platform imports |
| **EVIDENCE** | `docs/audits/i18n-integration-2c-rental-bridge-retirement-2026-09-08.md` |
| **STATUS** | COMPLETE |
| **DECISION** | I18N-DEC-BRIDGE-RETIRE-001 |

## P2.2 — Rental surface key migration campaign (2026-08 – 2026-09)

| Field | Detail |
|-------|--------|
| **CHANGE** | ~60+ campaign slice PRs migrating Rental/Operator surfaces to `t()` keys |
| **EVIDENCE** | `audit-campaign/architecture/I18N_*` |
| **STATUS** | SUBSTANTIAL — enforce-clean debt remains |
| **NON_EFFECTS** | Did not complete Master migration or partial locales |

## P2.1 — Hardcoded-copy inventory (2026-09)

| Field | Detail |
|-------|--------|
| **CHANGE** | Inventory v3 + scanner classification |
| **EVIDENCE** | `hardcoded-copy-inventory.json` |
| **STATUS** | COMPLETE (inventory); cleanup IN_PROGRESS |

## P2.3 — Governance (#1581, #1585, #1589) (2026-09)

| Field | Detail |
|-------|--------|
| **CHANGE** | Authority Protection, PR new-debt gate, authority-path contract, workflow classifier parser |
| **EVIDENCE** | `architecture/I18N_GOVERNANCE_*_2026-09-*.md`; merged on main |
| **STATUS** | COMPLETE (main); Production behind (I18N-GAP-005) |
| **DECISION** | I18N-DEC-GOV-P23-001 |

## 2026-09-10 — Module authority bootstrap (this workstream)

| Field | Detail |
|-------|--------|
| **CHANGE** | Registry intake `NOT_STARTED` → `AUDIT_IN_PROGRESS`; `architecture/internationalization/` authority bootstrap |
| **NON_EFFECTS** | No feature implementation, translation migration, or governance redesign |
| **STATUS** | Documentation only |

---

## Remaining workstreams (next implementation)

See [KNOWLEDGE_GAPS.md](../contradictions/KNOWLEDGE_GAPS.md) § Remaining workstreams.
