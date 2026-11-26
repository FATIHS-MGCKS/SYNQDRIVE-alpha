# Product Catalog V2 — acceptance test harness evidence (2026-11-26)

## Evidence integrity (SHA separation)

| Field | SHA / value |
|-------|-------------|
| **RUNTIME_BASELINE_SHA** | `7e0a00b49941e0e23553ab568f6e72ddce8da77a` |
| **TEST_HARNESS_HEAD_SHA** | _(PR #2539 HEAD after CI recovery push)_ |
| **POSTGRES_EXECUTION_SHA** | CI `product-catalog-metadata-postgres.yml` on harness PR HEAD |
| **PLAYWRIGHT_EXECUTION_SHA** | CI / agent CLI on harness PR HEAD |

Runtime catalog implementation on `main` is unchanged by harness PR #2539.

### ACC-GAP-02 (main baseline — does not cover V2+20)

| Field | Value |
|-------|--------|
| WORKFLOW_RUN | `45816331418` |
| EXECUTION_SHA | `7e0a00b49941e0e23553ab568f6e72ddce8da77a` |
| P1 | 4/4 PASS |
| P2A | 10/10 PASS |
| P2B | **14/14 PASS** |
| **Total on main** | **28/28** (P1+P2A+P2B only) |

**ACC-GAP-02:** **CLOSED** for audited runtime P1/P2A/P2B on `7e0a00b49` via run `45816331418`. This does **not** certify the **+20** V2 harness cases.

## Test scope integrity (no false PASS)

| Layer | What it proves | What it does **not** prove |
|-------|----------------|---------------------------|
| Mocked Playwright `product-catalog-v2-acceptance-ui.spec.ts` | 9-locale status dialog UI, responsive layout, axe (serious/critical) | Real login, real MFA issuance, DB persistence |
| PG HTTP harness (16) | Controller + service + MFA guard + Postgres | End-user Clerk/session; real step-up token minting |
| Live Playwright block | **Skipped** unless `PRODUCT_CATALOG_V2_LIVE_E2E=1` | **Not** counted as PASS |
| **ACC-GAP-01** | Requires **48/48** PG on harness HEAD **and** explicit untested workflow list | Mocked browser alone does **not** close |

**Untested end-to-end (browser → production auth → API):** full Master Admin login, MFA enrollment + TOTP/WebAuthn step-up, catalog editor metadata save with live session, status dialog 409/MFA drift recovery with real tokens, assign flow against live org directory UI.

**MFA limitation:** HTTP harness uses `Bearer master-*` + `x-step-up-token` simulation and mocked `IamMfaStepUpService.validateGrant`.

## Harness suites

| Suite | Count | Env gate |
|-------|------:|----------|
| P1 metadata | 4 | existing |
| P2A admission | 10 | existing |
| P2B status | 14 | existing |
| V2 HTTP acceptance | 16 | `PRODUCT_CATALOG_V2_ACCEPTANCE_HTTP_POSTGRES_INTEGRATION=1` |
| V2 billing preservation | 1 | `PRODUCT_CATALOG_V2_BILLING_PRESERVATION_POSTGRES_INTEGRATION=1` |
| V2 TOCTOU review | 3 | `VEHICLE_PRODUCT_GRANT_TOCTOU_POSTGRES_INTEGRATION=1` |
| **PG total (CI)** | **48** | `product-catalog-metadata-postgres-ci.sh` |

Playwright (no `package.json` authority change):

```bash
cd frontend && npx playwright test -c e2e/playwright.config.ts product-catalog-v2-acceptance-ui.spec.ts --project=desktop-1280
# repeat --project=tablet-768 --project=mobile-390
```

## HTTP acceptance repairs (#2539 recovery)

- Preview contract: `requestedTargetCatalogStatus` (not `targetCatalogStatus`).
- Admission deny: HTTP **403**, `error=PRODUCT_CATALOG_ADMISSION_DENIED`, `reason=CATALOG_DISABLED`.
- Mandatory audit: ACTIVE→DISABLED asserts new `catalog_status_patch` activity row + metadata.
- Cleanup: append-only `activity_logs` preserved; no org cascade delete; disposable DB drop.

## TOCTOU verdict

| Scenario | Method | Outcome |
|----------|--------|---------|
| C — suspended before call | Service call | **Rejected** (ForbiddenException) |
| Catalog DISABLED | Admission inside grant `$transaction` | **Blocked** |
| B — suspend after org precheck, before grant `$transaction` | Test-only `$transaction` hook (deterministic) | **P2:** ACTIVE grant persists while org product SUSPENDED |
| A — grant then suspend | Documented in evidence (not separate test) | Legitimate ACTIVE grant may remain |

**TOCTOU_REMEDIATION_REQUIRED:** YES — narrow runtime PR to re-validate org-product + vehicle eligibility inside grant transaction. **FINAL_ACCEPTANCE_HOLD** until fixed or owner accepts P2 race.

## Billing snapshot coverage

**Seeded:** rental `price_books`, `price_tariff_versions`, `billing_subscriptions`, `billing_discounts`, `billing_invoices`, `organization_products`.

**Fixture gap (not seeded):** `billing_price_books`, `billing_price_versions`, `billing_subscription_items`, `billing_payments`, `org_invoices`, `vehicle_product_grants` (count asserted 0).

## ACC-GAP mapping

| Gap | Status |
|-----|--------|
| ACC-GAP-01 | **OPEN** until 48/48 PG PASS on #2539 HEAD + scope honesty |
| ACC-GAP-02 | **CLOSED** (main 28/28 run `45816331418` on `7e0a00b49`) |
| ACC-GAP-03 | **OPEN** (P3) |

## CLOSEOUT template

```
FINAL_ACCEPTANCE_VERDICT=HOLD
MERGED=NO
DEPLOYED=NO
```