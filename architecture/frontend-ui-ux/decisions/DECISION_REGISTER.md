# Frontend UI/UX — Decision Register (Bootstrap)

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| FEUX-DEC-PLATFORM-PROFILES-001 | Shared platform design-system authority with three product UI profiles | VALIDATED | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| FEUX-DEC-SHARED-TOKEN-SSOT-001 | `theme.css` + style contracts as shared visual SSOT (no parallel CSS authority) | VALIDATED | FEUX-EVID-CODE-THEME-001 |
| FEUX-DEC-RENTAL-REFERENCE-001 | Rental as positive design reference; Master retains control-plane IA | PROPOSED | FEUX-EVID-CODE-RENTAL-001; FEUX-EVID-CODE-MASTER-001 |
| FEUX-DEC-NO-I18N-DUP-001 | Do not create competing i18n authority; defer copy locale to internationalization | VALIDATED | FEUX-EVID-CROSS-I18N-001 |

---

## FEUX-DEC-PLATFORM-PROFILES-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | UI knowledge scattered across `docs/ui/`, `frontend/src/styles/*.md`, ad-hoc audits; no registry module for cross-app UI |
| **WHY** | Owner requires durable governance for redesign and cross-team changes without duplicating token/i18n authorities |
| **CHANGE** | Create `architecture/frontend-ui-ux/` with shared design-system doc + `products/{master-admin,rental,operator}/` profiles |
| **EXPECTED_EFFECT** | Agents and designers have one navigation layer for shared vs product-specific UI rules |
| **NON_EFFECTS** | Does not implement visual redesign; does not merge Master/Rental shells |
| **EVIDENCE** | FEUX-EVID-AUDIT-BOOTSTRAP-001 |

---

## FEUX-DEC-SHARED-TOKEN-SSOT-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Legacy `.sq-*` classes coexist with `.surface-*` naming |
| **WHY** | Single token layer prevents forked “design systems” per product |
| **CHANGE** | Authority treats `frontend/src/styles/theme.css` and named contracts as canonical; documents aliases only as migration state |
| **NON_EFFECTS** | Does not mandate immediate class rename in components |
| **EVIDENCE** | FEUX-EVID-CODE-THEME-001 |

---

## FEUX-DEC-RENTAL-REFERENCE-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | Master page framework converging independently from Rental polish patterns |
| **WHY** | Rental demonstrates mature density, KPI tiles, and pattern-library usage; Master needs selective adoption without copying fleet nav |
| **CHANGE** | Maintain comparison matrix with `ADOPT` / `ADAPT` / `RETAIN_MASTER` / `DO_NOT_COPY` classifications (see inventories) |
| **EXPECTED_EFFECT** | Redesign decisions traceable; no silent layout parity |
| **NON_EFFECTS** | **Not implemented** — proposals only |
| **EVIDENCE** | FEUX-EVID-CODE-RENTAL-001; FEUX-EVID-CODE-MASTER-001 |

---

## FEUX-DEC-NO-I18N-DUP-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Master chrome uses parallel `tMasterNav` DE map outside platform `LanguageProvider` dictionaries |
| **WHY** | `.cursor/rules/i18n.mdc` + `architecture/internationalization/` already own locale contract |
| **CHANGE** | This authority records Master i18n debt as **gap/contradiction**; remediation tracked via i18n authority |
| **NON_EFFECTS** | Does not migrate strings in this bootstrap |
| **EVIDENCE** | FEUX-EVID-CROSS-I18N-001 |