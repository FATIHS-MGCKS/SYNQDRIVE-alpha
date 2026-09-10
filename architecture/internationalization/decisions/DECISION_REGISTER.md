# Internationalization (i18n) — Decision Register (Bootstrap)

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| I18N-DEC-CANONICAL-EN-001 | English as canonical key source and fallback | VALIDATED | I18N-EVID-CODE-RUNTIME-001 |
| I18N-DEC-BRIDGE-RETIRE-001 | Retire Rental i18n bridge (Integration 2C) | VALIDATED | I18N-EVID-AUDIT-2C-001 |
| I18N-DEC-GOV-P23-001 | P2.3 governance fail-closed PR gate | VALIDATED | I18N-EVID-CODE-GOV-001 |
| I18N-DEC-NINE-LOCALES-001 | Nine official product locales including tr fallback-only | VALIDATED | I18N-EVID-CODE-LOCALES-001 |
| I18N-DEC-HARDCODED-PHASED-001 | Phased enforce-clean hardcoded-copy elimination | VALIDATED | I18N-EVID-CODE-INVENTORY-001 |

---

## I18N-DEC-CANONICAL-EN-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Mixed DE-first hardcoded copy; inconsistent fallback behavior across surfaces |
| **WHY** | Single canonical key namespace enables coverage tests, governance scanner, and predictable fallback |
| **CHANGE** | `en.ts` is canonical; `translateKey` resolves locale dict → en → key passthrough |
| **NON-EFFECTS** | Does not require all locales to be complete; partial locales still fall back to en |
| **EVIDENCE** | I18N-EVID-CODE-RUNTIME-001 |

---

## I18N-DEC-BRIDGE-RETIRE-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | `frontend/src/rental/i18n/` compat bridge re-exported platform i18n |
| **WHY** | Duplicate import paths obscured ownership and blocked governance path contracts |
| **CHANGE** | Bridge removed; Rental imports `../../i18n/LanguageContext` directly |
| **NON-EFFECTS** | Does not complete hardcoded-copy migration; does not populate partial locales |
| **EVIDENCE** | I18N-EVID-AUDIT-2C-001; `docs/audits/i18n-integration-2c-rental-bridge-retirement-2026-09-08.md` |

---

## I18N-DEC-GOV-P23-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | No structural PR gate for i18n new debt; authority protection paths could drift |
| **WHY** | Prevent regression during large Rental migration campaign |
| **CHANGE** | Layer 0 Authority Protection (`pull_request_target`); Layer 1–2 new-debt gate; `authority-path-contract.mjs` SSOT; structural workflow classifier (#1581, #1585, #1589) |
| **NON-EFFECTS** | Does not auto-translate remaining hardcoded copy; does not promote module authority |
| **EVIDENCE** | I18N-EVID-CODE-GOV-001; `architecture/I18N_GOVERNANCE_*_2026-09-*.md` (supporting evidence) |

---

## I18N-DEC-NINE-LOCALES-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Eight runtime locales without Turkish official slot |
| **WHY** | Product commitment to nine official locales with explicit fallback-only Turkish |
| **CHANGE** | `OFFICIAL_PRODUCT_LOCALE_CODES` length 9; `tr.ts` empty by design |
| **EVIDENCE** | I18N-EVID-CODE-LOCALES-001 |

---

## I18N-DEC-HARDCODED-PHASED-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Ad-hoc hardcoded German/English across Rental/Master/Operator |
| **WHY** | Need measurable inventory and phased enforce-clean to avoid blocking all PRs |
| **CHANGE** | `hardcoded-copy-inventory.json` v3; scanner + PR gate on enforce-clean surfaces (P21–P23) |
| **OPEN GAPS** | 1,658 enforce-clean findings remain per current scan (I18N-GAP-001); 1,661 in 2026-09-07 snapshot |
| **EVIDENCE** | I18N-EVID-CODE-INVENTORY-001 |
