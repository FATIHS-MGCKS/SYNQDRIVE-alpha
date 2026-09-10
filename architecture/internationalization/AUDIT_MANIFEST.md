# Audit Manifest — Internationalization (i18n)

| Field | Value |
|-------|-------|
| **MODULE** | Internationalization (i18n) |
| **MODULE_SLUG** | `internationalization` |
| **AUDIT_STARTED_AT** | `2026-09-10T02:30:00Z` |
| **AUDIT_COMPLETED_AT** | `2026-09-10T03:30:00Z` (Gate A satisfied — promoted `AUTHORITY_ACTIVE`) |
| **REGISTRY_STATUS_AT_START** | absent from inventory (treated as `NOT_STARTED`) |
| **REGISTRY_STATUS_AT_END** | `AUTHORITY_ACTIVE` |
| **REPOSITORY** | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **REPO_BASE_BRANCH** | `main` |
| **ORIGIN_MAIN_SHA** | `7203b5bd63dd3a32a65e2cc077f3d4fda8fe4584` (post-sync baseline for promotion PR) |
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

## Gate A promotion (2026-09-10)

**Result:** `AUTHORITY_ACTIVE` — all normative Gate A checklist items satisfied per [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) §6 and §8.

**Explicit non-blockers (product/runtime debt, documented in authority):**

1. Partial locale dictionaries (fr/pl/cs/nl/es/it) and fallback-only `tr`
2. 1,661 enforce-clean hardcoded-copy findings remaining
3. Master surface migration debt (1,071 inventory findings)
4. No browser-level per-locale Production UX probe
5. `hardcoded-copy-guard.test.ts` referenced by `i18n-check.mjs` but missing from `frontend/src/i18n/` (I18N-GAP-004)
6. Production SHA behind `origin/main` (governance parity commits not yet deployed)
