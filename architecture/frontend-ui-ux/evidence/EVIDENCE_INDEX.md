# Evidence Index — Frontend UI/UX & Design System

| Evidence ID | Type | SHA / window | Claim supported | Epistemic | Limitations |
|-------------|------|--------------|-----------------|-----------|-------------|
| FEUX-EVID-AUDIT-BOOTSTRAP-001 | AUDIT_DOCUMENT | `413175e8c` | Authority bootstrap scope and owner profile split | CONFIRMED | Architecture-only PR |
| FEUX-EVID-AUDIT-READONLY-2026-11-22 | AUDIT_DOCUMENT | baseline `01bd08a4` → reconciled `413175e8c` | Prior comprehensive Master/shared UI inventory | PARTIALLY_VERIFIED | Backend org change only on main delta |
| FEUX-EVID-CODE-ROUTES-001 | CODE | `413175e8c` | Three SPA routes under `App.tsx` | CONFIRMED | — |
| FEUX-EVID-CODE-THEME-001 | CODE | `413175e8c` | Tokens, surfaces L0–L4, motion, brand `#4F86E8` | CONFIRMED | File size; spot-checked sections |
| FEUX-EVID-CODE-PATTERNS-001 | CODE | `413175e8c` | Shared pattern library barrel exports | CONFIRMED | — |
| FEUX-EVID-CODE-MASTER-001 | CODE | `413175e8c` | Master shell, 24 nav views, hub URL sync | CONFIRMED | Not all 207 TSX opened |
| FEUX-EVID-CODE-RENTAL-001 | CODE | `413175e8c` | Rental view-state union, `AppShell`, pattern imports | PARTIAL | Full component matrix not exhaustive |
| FEUX-EVID-CODE-OPERATOR-001 | CODE | `413175e8c` | Operator mobile shell, bottom nav, glass cards | CONFIRMED | — |
| FEUX-EVID-DOC-UI-001 | ARCHITECTURE_DOCUMENT | `docs/ui` 2026-08-18 | Master IA/framework intent | HISTORICAL | URL/nav claims often CONTRADICTED |
| FEUX-EVID-CROSS-I18N-001 | CODE | `413175e8c` | i18n authority owns locales; Master `tMasterNav` isolated | CONFIRMED | — |
| FEUX-EVID-GAP-FIGMA-001 | DOMAIN_REASONING | N/A | No in-repo Figma SSOT | UNKNOWN | — |
| FEUX-EVID-GAP-BROWSER-001 | DOMAIN_REASONING | N/A | Live render, responsive, contrast not measured | UNKNOWN | Explicitly out of scope |
| FEUX-EVID-GAP-PROD-UI-001 | DOMAIN_REASONING | N/A | Production deployed UI not observed | UNKNOWN | VPS UI audit not authorized |