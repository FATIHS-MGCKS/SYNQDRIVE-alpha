# Internationalization (i18n) — Evidence Index

**origin/main (synchronized baseline):** `83546cc37f9f05f9a170223f2ef114c6cac3b9f5`  
**audit evidence snapshot commit:** `335b1a9ace772d25147f9767d201964903c08c5c`  
**Production release (read-only):** `2e82171d11862a80c2e8cd62c65023393ef0ce64` @ `/opt/synqdrive/releases/20260909220606_v4994`

| Evidence ID | Source type | Source path | Supported claim | Currentness | Limitations |
|-------------|-------------|-------------|-----------------|-------------|-------------|
| I18N-EVID-REPO-001 | CURRENT_CODE | `frontend/src/i18n/LanguageContext.tsx` | Platform runtime provider | CONFIRMED_ON_MAIN | — |
| I18N-EVID-REPO-002 | CURRENT_CODE | `frontend/src/i18n/translation-registry.ts` | Nine-locale registry | CONFIRMED_ON_MAIN | — |
| I18N-EVID-REPO-003 | AUDIT_DOCUMENT | `docs/audits/i18n-integration-2c-rental-bridge-retirement-2026-09-08.md` | Rental bridge retired | CONFIRMED_ON_MAIN | — |
| I18N-EVID-REPO-004 | CURRENT_CODE | `frontend/src/i18n/hardcoded-copy-inventory.json` | Inventory v3 **historical snapshot** | CONFIRMED_ON_MAIN @ 2026-09-07 | 3,091 total / 1,661 enforce-clean — not mutated in this PR |
| I18N-EVID-SCAN-READONLY-001 | CURRENT_CODE | `node scripts/i18n-hardcoded-scan.mjs --read-only` | Current hardcoded-copy scan | CONFIRMED @ 2026-09-10 post-main-sync | 3,088 total / 1,658 enforce-clean; inventory file not written |
| I18N-EVID-REPO-005 | CURRENT_CODE | `frontend/src/i18n/translations/en.ts` | 10,431 canonical keys | CONFIRMED_ON_MAIN | — |
| I18N-EVID-REPO-006 | CURRENT_CODE | `frontend/scripts/lib/i18n-governance/` | P2.3 governance scripts | CONFIRMED_ON_MAIN | — |
| I18N-EVID-REPO-007 | CURRENT_CODE | `backend/src/modules/billing/email/billing-email-i18n.ts` | Targeted backend DE/EN copy only | CONFIRMED_ON_MAIN | Not general backend i18n |
| I18N-EVID-PROD-001 | PRODUCTION_OBSERVATION | SSH release tree grep | `LanguageContext.tsx` present | CONFIRMED_AT_PRODUCTION_RELEASE | Structural only |
| I18N-EVID-PROD-002 | PRODUCTION_OBSERVATION | `GET https://app.synqdrive.eu/api/v1/health` | API liveness | CONFIRMED_AT_PRODUCTION_RELEASE | — |
| I18N-EVID-PROD-003 | PRODUCTION_OBSERVATION | Deployed workflow file | `i18n-authority-protection.yml` present | CONFIRMED_AT_PRODUCTION_RELEASE | Deployed SHA may lack #1589 parity |
| I18N-EVID-CODE-RUNTIME-001 | CURRENT_CODE | `LanguageContext.tsx` | Lookup + fallback semantics | CONFIRMED_ON_MAIN | Graph node alias |
| I18N-EVID-CODE-LOCALES-001 | CURRENT_CODE | `locales.ts` | Locale contract | CONFIRMED_ON_MAIN | Graph node alias |
| I18N-EVID-CODE-COVERAGE-001 | CURRENT_CODE | `en.ts` + coverage tests | Key baseline | CONFIRMED_ON_MAIN | Graph node alias |
| I18N-EVID-AUDIT-2C-001 | AUDIT_DOCUMENT | Integration 2C audit | Bridge retirement | CONFIRMED_ON_MAIN | Graph node alias |
| I18N-EVID-CODE-INVENTORY-001 | CURRENT_CODE | Inventory JSON | Hardcoded debt snapshot | CONFIRMED_ON_MAIN | Graph node alias |
| I18N-EVID-CODE-GOV-001 | CURRENT_CODE | Governance lib + workflows | P2.3 stack | CONFIRMED_ON_MAIN | Graph node alias |

## Document classification (supporting evidence — not default authority)

| Class | Examples | Classification |
|-------|----------|----------------|
| Governance memos | `architecture/I18N_GOVERNANCE_*_2026-09-*.md` | Supporting evidence / change record |
| Integration audits | `docs/audits/i18n-integration-{1b1,2a,2b,2c}-*.md` | Supporting evidence |
| Campaign slices | `audit-campaign/architecture/I18N_*` (~80 files) | Supporting campaign evidence |
| Engineering rules | `.cursor/rules/i18n.mdc` | Engineering rules (partially stale on rental path) |
| Flat architecture | `architecture/I18N_*` without registry row | Historical/supporting until this authority promoted |
