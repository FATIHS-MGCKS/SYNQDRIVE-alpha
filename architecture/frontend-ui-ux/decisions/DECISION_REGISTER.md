# Shared UI Design Foundation — Decision Register

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| FEUX-DEC-PLATFORM-PROFILES-001 | Single authority + three product profiles only | SUPERSEDED | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| FEUX-DEC-INDEPENDENT-AUTHORITIES-002 | Shared foundation + three independent product UI/UX authorities | VALIDATED | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| FEUX-DEC-CHANGE-ISOLATION-001 | PRODUCT_LOCAL / SHARED_FOUNDATION / NO_SILENT_PROPAGATION rules | VALIDATED | FEUX-EVID-AUDIT-BOOTSTRAP-001 |
| FEUX-DEC-SHARED-TOKEN-SSOT-001 | theme.css + contracts as shared visual SSOT | VALIDATED | FEUX-EVID-CODE-THEME-001 |
| FEUX-DEC-NO-I18N-DUP-001 | No competing i18n authority | VALIDATED | FEUX-EVID-CROSS-I18N-001 |
| FEUX-DEC-RENTAL-REFERENCE-001 | Rental as positive reference (cross-product doc only) | PROPOSED | FEUX-EVID-CODE-RENTAL-001 |

---

## FEUX-DEC-PLATFORM-PROFILES-001

| Field | Value |
|-------|-------|
| **STATUS** | SUPERSEDED |
| **Successor** | FEUX-DEC-INDEPENDENT-AUTHORITIES-002 |
| **WHY** | Owner refinement: product profiles are not sufficient; each product requires full module authority governance. |
| **EVIDENCE** | FEUX-EVID-AUDIT-BOOTSTRAP-001 |

---

## FEUX-DEC-INDEPENDENT-AUTHORITIES-002

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **CHANGE** | Registry: Shared UI Design Foundation + Master Admin UI/UX + Rental UI/UX + Operator UI/UX (all `AUDIT_IN_PROGRESS` where Gate A open). |
| **EVIDENCE** | FEUX-EVID-AUDIT-BOOTSTRAP-001 |

---

## FEUX-DEC-CHANGE-ISOLATION-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **CHANGE** | Mandatory policy in `governance/CROSS_PRODUCT_CHANGE_POLICY.md`. |
| **NON_EFFECTS** | Does not claim runtime CSS isolation today. |
| **EVIDENCE** | FEUX-EVID-AUDIT-BOOTSTRAP-001 |

---

## FEUX-DEC-SHARED-TOKEN-SSOT-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **EVIDENCE** | FEUX-EVID-CODE-THEME-001 |

---

## FEUX-DEC-NO-I18N-DUP-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **EVIDENCE** | FEUX-EVID-CROSS-I18N-001 |

---

## FEUX-DEC-RENTAL-REFERENCE-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **NOTE** | Product-specific evolution tracked in Rental UI/UX authority; matrix remains foundation governance artifact. |
| **EVIDENCE** | FEUX-EVID-CODE-RENTAL-001 |