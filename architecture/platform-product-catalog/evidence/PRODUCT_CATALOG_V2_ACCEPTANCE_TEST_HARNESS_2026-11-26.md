# Product Catalog V2 — acceptance test harness evidence (2026-11-26)

## Evidence integrity (SHA separation)

| Field | SHA / value |
|-------|-------------|
| **RUNTIME_BASELINE_SHA** | `7e0a00b49941e0e23553ab568f6e72ddce8da77a` |
| **TEST_HARNESS_HEAD_SHA** | `09952835f3db360150b58d967c67875dc348397c` |
| **POSTGRES_EXECUTION_SHA** | `09952835f3db360150b58d967c67875dc348397c` — workflow run `45842923193` |
| **POSTGRES_WORKFLOW_RUN** | `45842923193` (`product-catalog-metadata-postgres.yml`) |
| **CANONICAL_CI_GATE_RUN** | `45842923114` — **CI gate (all critical jobs)** success |
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

### TOCTOU runtime remediation (separate PR — not #2539)

Proposed scope for a follow-up runtime change (evidence-only here):

1. Re-validate organization-product entitlement and vehicle eligibility **inside** the grant persistence transaction (after row locks).
2. Use consistent lock order (`product` / `organization_product` / `vehicle` / `grant`) to avoid deadlocks under concurrent org suspension.
3. On concurrent org-product **SUSPENDED** during grant: fail closed with a domain error (no silent ACTIVE grant).
4. Catalog **DISABLED** admission remains enforced inside the transaction (existing path).
5. **Do not** auto-revoke existing ACTIVE grants when catalog or org-product state changes.

Classification: reproducible **service-level P2 race** (scenario B hook). Full production exploitability not claimed without further evidence.

## P2B race C — concurrent CAS seal (test-only)

| Field | Value |
|-------|--------|
| **P2B_RACE_C_ROOT_CAUSE** | Test assumed fixed primary/peer winner; both writers could succeed or peer could win under timing. |
| **Fix** | `Promise.allSettled`; exactly one fulfill + one `ConflictException`; audit counts `[0,1]` by correlation id; final catalog `DISABLED`; `finally` restores ACTIVE. |
| **TEST_FIX_ONLY** | YES — no `ProductsService` runtime change on #2539. |
| **Introduced** | `6014a4d34` (hardened `HEAD` with `snapshotCatalog` assert in race C) |

## Billing snapshot coverage

**Seeded:** rental `price_books`, `price_tariff_versions`, `billing_subscriptions`, `billing_discounts`, `billing_invoices`, `organization_products`.

**Fixture gap (not seeded):** `billing_price_books`, `billing_price_versions`, `billing_subscription_items`, `billing_payments`, `org_invoices`, `vehicle_product_grants` (count asserted 0).

## ACC-GAP mapping

| Gap | Status |
|-----|--------|
| ACC-GAP-01 | **CLOSED** for 48/48 disposable PG on `09952835f` (run `45842923193`); live browser E2E still excluded |
| ACC-GAP-02 | **CLOSED** (main 28/28 run `45816331418` on `7e0a00b49`) |
| ACC-GAP-03 | **OPEN** (P3) |

## CLOSEOUT — SYNQDRIVE_PRODUCT_CATALOG_V2_PR2539_P2B_RACE_CI_SEAL

```
OPERATION=SYNQDRIVE_PRODUCT_CATALOG_V2_PR2539_P2B_RACE_CI_SEAL
PR_NUMBER=2539
BASE_MAIN_SHA=7e0a00b49941e0e23553ab568f6e72ddce8da77a
OLD_HEAD_SHA=e44a81b89213715efb5beca7e7eecd4f64b347ba
NEW_HEAD_SHA=09952835f3db360150b58d967c67875dc348397c

P2B_RACE_C_ROOT_CAUSE=non-deterministic winner in concurrent ACTIVE→DISABLED CAS test (assumed fixed primary writer)
ONE_SUCCESS_ONE_CONFLICT=YES (Promise.allSettled invariant)
AUDIT_EXACTLY_ONCE=YES ([0,1] by correlation id)
TEST_FIX_ONLY=YES

POSTGRES_P1=4/4 PASS
POSTGRES_P2A=10/10 PASS
POSTGRES_P2B=14/14 PASS (race C sealed)
POSTGRES_HTTP=16/16 PASS
POSTGRES_BILLING=1/1 PASS
POSTGRES_TOCTOU=3/3 PASS
POSTGRES_TOTAL=48/48 PASS (run 45842923193)

TOCTOU_VERDICT=service-level P2 race documented; catalog admission in tx OK for new grants
TOCTOU_RUNTIME_REMEDIATION_PR_REQUIRED=YES

I18N_AUTHORITY=PASS
I18N_NEW_DEBT=PASS
TYPECHECK=PASS (canonical CI 45842923114)
BUILD=PASS
CANONICAL_CI_GATES=PASS (45842923114)
CI_NOTE=parallel Vehicle Detail Production Readiness workflow may emit duplicate Backend unit failure (exit 143); canonical CI gate job passed Backend unit on same HEAD
CI_FAILED=0 on canonical gate run
CI_PENDING=varies by parallel workflows

MERGEABLE_STATE=MERGEABLE (GitHub may show UNSTABLE until duplicate checks reconcile)
FINAL_MERGE_VERDICT=OWNER_REVIEW (not auto-merged)
FINAL_ACCEPTANCE_VERDICT=HOLD (TOCTOU runtime remediation + no live E2E)

ACC_GAP_01=CLOSED (48/48 PG on harness HEAD)
ACC_GAP_02=CLOSED
ACC_GAP_03=OPEN

MERGED=NO
DEPLOYED=NO
```