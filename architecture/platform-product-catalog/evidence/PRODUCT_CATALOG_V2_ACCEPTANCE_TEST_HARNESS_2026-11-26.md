# Product Catalog V2 — acceptance test harness evidence (2026-11-26)

## Evidence integrity (SHA separation)

| Field | SHA / value |
|-------|-------------|
| **RUNTIME_BASELINE_SHA** | `7e0a00b49941e0e23553ab568f6e72ddce8da77a` |
| **TEST_HARNESS_HEAD_SHA** | `77d9f5285` (PR #2539) |
| **POSTGRES_EXECUTION_SHA** | _(CI `product-catalog-metadata-postgres.yml` on harness PR HEAD)_ |
| **PLAYWRIGHT_EXECUTION_SHA** | _(CI / agent run on harness PR HEAD)_ |

Runtime behavior on audited `main` is unchanged by this harness PR. Acceptance **backend** proof is disposable-PostgreSQL HTTP + service integration only (not mocked Playwright routes).

## Harness scope (test-only)

| Suite | Env gate | Proof class |
|-------|----------|-------------|
| `product-catalog-v2-acceptance.http.postgres.integration.spec.ts` | `PRODUCT_CATALOG_V2_ACCEPTANCE_HTTP_POSTGRES_INTEGRATION=1` | Real `ProductsController` + `ProductsService` + MFA guard + Postgres |
| `product-catalog-v2-billing-preservation.postgres.integration.spec.ts` | `PRODUCT_CATALOG_V2_BILLING_PRESERVATION_POSTGRES_INTEGRATION=1` | Commercial row fingerprints before/after catalog transitions |
| `vehicle-product-grant-toctou.postgres.integration.spec.ts` | `VEHICLE_PRODUCT_GRANT_TOCTOU_POSTGRES_INTEGRATION=1` | Concurrency / admission review |
| `frontend/e2e/product-catalog-v2-acceptance-ui.spec.ts` | default (mocked API) | UX / a11y / nine-locale UI only |
| `frontend/e2e/product-catalog-v2-acceptance-ui.spec.ts` live block | `PRODUCT_CATALOG_V2_LIVE_E2E=1` | Optional live API probe (not required for ACC-GAP-01 closure) |

CI entry: `backend/scripts/test/product-catalog-metadata-postgres-ci.sh` extended (+16 +1 +3 Jest cases after P1/P2A/P2B).

## ACC-GAP mapping

| Gap | Closure condition | Harness contribution |
|-----|-------------------|---------------------|
| **ACC-GAP-01** | Backend-integrated E2E / HTTP acceptance with real guards | **Closable after CI Postgres HTTP suite PASS on harness SHA** — mocked Playwright explicitly **does not** close this gap alone |
| **ACC-GAP-02** | Postgres workflow 28+ on audited runtime SHA | **Extended gate 48 Jest cases** when all suites enabled on harness PR; audited `7e0a00b49` still needs owner `workflow_dispatch` if not run on that SHA |
| **ACC-GAP-03** | pg_locks race instrumentation (P3) | **Remains OPEN** — not addressed in harness |

## Vehicle grant TOCTOU verdict (review)

| Item | Finding |
|------|---------|
| Catalog admission | **Safe for new/re-grant** — `assertProductCatalogRowAdmissionAllowed` runs inside `$transaction` |
| Org-product eligibility | **TOCTOU window** — `assertOrganizationProductActive` and `loadGrantEligibleVehicle` run **before** `$transaction`; concurrent `organizationProduct` suspension can race ahead of grant persistence (see concurrent test) |
| Severity | **P2 engineering debt** — not classified as proven production exploit without broader entitlement enforcement paths |
| Remediation | Separate minimal runtime PR: re-validate org-product + vehicle eligibility inside grant transaction |
| Acceptance impact | **HOLD** for strict zero-TOCTOU certification until remediation merges or owner accepts documented race |

## Billing preservation

Snapshots include: rental `price_books` / `price_tariff_versions`, `billing_subscriptions`, `billing_discounts`, `billing_invoices`, `organization_products`, `vehicle_product_grants`. Only `products.catalog_status` and new admin audit rows may change during status lifecycle under test.

No Stripe or payment-provider calls.

## CLOSEOUT template (fill after CI)

```
OPERATION=SYNQDRIVE_PRODUCT_CATALOG_V2_ACCEPTANCE_TEST_HARNESS
RUNTIME_BASELINE_SHA=7e0a00b49941e0e23553ab568f6e72ddce8da77a
TEST_HARNESS_HEAD_SHA=<harness-pr-head>
TEST_PR_NUMBER=<pr>
TEST_PR_URL=<url>

POSTGRES_MAIN_DISPATCH=<owner|ci>
POSTGRES_MAIN_RESULT=<pass|fail|pending>

METADATA_E2E=<pg-http|pending>
STATUS_LIFECYCLE_E2E=<pg-http|pending>
MFA_E2E=<pg-http|pending>
AUTHORIZATION_E2E=<pg-http|pending>
RESPONSIVE=<playwright-mocked|pending>
ACCESSIBILITY=<axe-playwright|pending>
LOCALIZATION=<9-locale-playwright|pending>

BILLING_SNAPSHOT=<pg|pending>
ENTITLEMENT_PRESERVATION=<pg-http|pending>
VEHICLE_GRANT_PRESERVATION=<pg|pending>
VEHICLE_TOCTOU_VERDICT=ORG_PRODUCT_PRE_TX_RACE_P2

JEST=<ci>
VITEST=<ci>
PLAYWRIGHT=<ci>
TYPECHECK=<ci>
BUILD=<ci>
CI_STATUS=<ci>

NEW_P0_P1_FINDINGS=none
REMAINING_EVIDENCE_GAPS=ACC-GAP-03; TOCTOU remediation optional; audited-SHA PG dispatch if not re-run
FINAL_ACCEPTANCE_VERDICT=HOLD until postgres CI green + owner reconcile #2538

MERGED=NO
DEPLOYED=NO
```