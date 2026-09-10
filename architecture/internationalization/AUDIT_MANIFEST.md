# Audit Manifest — Internationalization (i18n)

| Field | Value |
|-------|-------|
| **MODULE** | Internationalization (i18n) |
| **MODULE_SLUG** | `internationalization` |
| **AUDIT_STARTED_AT** | `2026-09-10T02:30:00Z` |
| **AUDIT_COMPLETED_AT** | `2026-09-10T03:00:00Z` (bootstrap authority reconstruction — promotion blocked) |
| **REGISTRY_STATUS_AT_START** | absent from inventory (treated as `NOT_STARTED`) |
| **REGISTRY_STATUS_AT_END** | `AUDIT_IN_PROGRESS` |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **REPO_BASE_BRANCH** | `main` |
| **ORIGIN_MAIN_SHA** | `8186b4d830f472bc5f687c711bb53c72da243cb0` |
| **AUDIT_BRANCH_SHA** | set at PR commit |
| **PRODUCTION_AUDITED_AT** | `2026-09-10T02:34:30Z` |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_RELEASE_SHA** | `2e82171d11862a80c2e8cd62c65023393ef0ce64` |
| **PRODUCTION_RELEASE_PATH** | `/opt/synqdrive/releases/20260909220606_v4994` |
| **REPO_PRODUCTION_DRIFT** | **YES** — `origin/main` is ahead of Production; i18n governance hardening (#1589) and trip-detection commits on main not yet deployed |
| **RUNTIME_FOOTPRINT** | Frontend SPA (primary); scripts/CI; targeted backend copy modules; no dedicated i18n DB |
| **AUDIT_MODE** | `READ_ONLY` |
| **VALIDATION_STATUS** | graph validator + registry validator + `i18n:check:ci` (at audit time) |
| **REMAINING_LIMITATIONS** | No browser-level Production locale UX probe; partial-locale completion not Production-validated per locale; campaign slice inventory not fully re-validated file-by-file |

## Audit coverage matrix

| Surface | Repository | Production | Evidence ID | Result | Limitation |
|---------|------------|------------|-------------|--------|------------|
| Platform `LanguageContext` / locales | Inspected | `LanguageContext.tsx` present in release tree | I18N-EVID-REPO-001 | CONFIRMED | No live UI locale switch test on Production |
| Translation registry / 9 locales | Inspected | `translation-registry.ts` present | I18N-EVID-REPO-002 | CONFIRMED | — |
| Rental bridge removal (2C) | Tests + code | INFERRED same on deployed SHA | I18N-EVID-REPO-003 | CONFIRMED (repo) | Production SHA predates latest main |
| Hardcoded-copy inventory | `hardcoded-copy-inventory.json` | Not re-scanned on VPS | I18N-EVID-REPO-004 | CONFIRMED (repo snapshot) | Inventory dated 2026-09-07 |
| Translation coverage baseline | 10,431 keys | Not measured on VPS | I18N-EVID-REPO-005 | CONFIRMED (repo) | — |
| PR gate / governance scripts | Inspected | Not executed on VPS | I18N-EVID-REPO-006 | CONFIRMED | — |
| Authority Protection workflow | On main | Present in deployed tree | I18N-EVID-PROD-001 | CONFIRMED | Deployed SHA may lack #1589 parity fixes |
| Health endpoint | — | HTTP 200 `app.synqdrive.eu` | I18N-EVID-PROD-002 | CONFIRMED | — |
| Backend general i18n framework | Inspected | N/A | I18N-EVID-REPO-007 | CONFIRMED absent | By design |

## AUTHORITY_ACTIVE promotion blockers

1. Bootstrap authority files newly created — not yet reviewed externally.
2. Production baseline is read-only structural presence only — no per-locale Production UX validation.
3. Remaining migration debt (hardcoded copy, partial locales) not fully catalogued per-surface in authority graph.
4. `hardcoded-copy-guard.test.ts` referenced by `i18n-check.mjs` missing from main `frontend/` (documentation/test gap).
