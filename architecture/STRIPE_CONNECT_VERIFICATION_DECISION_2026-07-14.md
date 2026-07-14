# Stripe Connect — Test Configuration Verification & Architecture Decision (2026-07-14)

**Mode:** Read-only verification via Stripe MCP. **No Stripe objects created or modified.**

Verification timestamp: 2026-07-14 (Cursor Cloud Agent, Stripe MCP `serverStatus: ready`).

---

## 1. Verified facts (Stripe MCP read-only)

| # | Question | Verified result | Source |
|---|----------|-----------------|--------|
| 1 | Test mode reachable? | **Yes.** `GET /v1/balance` returned `livemode: false`, currency EUR. | `stripe_api_read` → `GetBalance` |
| 2 | Platform account | **acct_1Tnz17KTcW1K1ahf** — display name **SynqDrive Sandbox**, country **DE**, default currency **eur**. | `get_stripe_account_info`, `GetAccountsAccount` |
| 3 | Connected accounts (test) | **0** — `GET /v1/accounts` returned empty `data: []`. | `stripe_api_read` → `GetAccounts` |
| 4 | Platform charge readiness | `charges_enabled: false`, `payouts_enabled: false`, `details_submitted: false`, `capabilities: {}`. Platform merchant onboarding incomplete. | `GetAccountsAccount` |
| 5 | Account object shape (platform) | `type: standard`, `controller.type: account` — v1-style Account object in response. | `GetAccountsAccount` |
| 6 | Connect Accounts API | **Callable** — list endpoint succeeds (empty list). Implies platform API access to Connect account resources; does **not** prove full Connect Dashboard onboarding completed. | `GetAccounts` |
| 7 | MCP / OpenAPI preview version | Stripe MCP tools reference OpenAPI **`2026-07-29.preview`**. | MCP tool metadata |
| 8 | Backend Stripe SDK | `stripe@^17.7.0` in `backend/package.json`. | Codebase |
| 9 | Existing platform webhook (SynqDrive) | Single route `POST /api/v1/webhooks/stripe` in `modules/billing`; env `STRIPE_WEBHOOK_SECRET` only. Handles **billing** events (subscriptions, platform invoices, PM attach). **No Connect event handlers.** | Codebase inspection |
| 10 | Separate Connect webhook secret | **Not present** in `backend/.env.example` or `stripe.config.ts`. | Codebase inspection |

**Redacted in outputs:** email, phone, support_email (MCP redacted `[REDACTED]`).

---

## 2. Not verifiable via Stripe MCP (manual Dashboard required)

| # | Question | Why not verifiable | Manual check |
|---|----------|-------------------|--------------|
| 1 | Connect explicitly enabled for platform | No dedicated MCP tool; platform `charges_enabled` alone is insufficient. | Dashboard → [Connect settings](https://dashboard.stripe.com/settings/connect) — confirm platform profile / Connect activation. |
| 2 | Accounts v2 early access enabled | Accounts v2 uses API v2 + Dashboard toggle; MCP returned v1 Account shape only. | Dashboard → Settings → Early access → **Accounts v2**. |
| 3 | Default account API version | Not returned by `get_stripe_account_info` or account retrieve. | Dashboard → Workbench → Overview → **API versions**. |
| 4 | Webhook endpoints (test/live) | `webhook_endpoints` list operation **not exposed** in MCP OpenAPI `2026-07-29.preview`. | Dashboard → Developers → Webhooks — list test & live endpoints, note URLs and `connect` flag. |
| 5 | Separate Connect webhook signing secret | Cannot list endpoints via MCP. | If a Connect-specific endpoint exists, copy **signing secret** to secure store (never commit). |
| 6 | DE/EU payment methods enabled | `payment_method_configurations` / `country_specs` not available in MCP preview. | Dashboard → Settings → Payment methods (test mode) — confirm **card**, **SEPA Debit**, etc. |
| 7 | Live mode configuration | Guardrail: test-only verification in this prompt. | Repeat checks in live mode only before production cutover. |
| 8 | Connected-account branding support | No connected accounts exist to inspect. | After first test connected account: verify branding fields via Dashboard or Account retrieve. |

---

## 3. Stripe documentation findings (MCP `search_stripe_documentation`, read-only)

Applicable to SynqDrive **Direct Charges + application fee** (end-customer → rental org):

### Capabilities (Direct Charges)

- **`card_payments`** — required on connected account (merchant) to accept card payments.
- **`transfers`** — **not required** for pure Direct Charges. Needed for destination charges, separate charges & transfers, or `stripe_balance.stripe_transfers` recipient flows.

### Direct Charge responsibilities

| Topic | Direct charge behavior (Stripe docs) |
|-------|--------------------------------------|
| Merchant of record | **Connected account** (rental org) |
| Processing fees | Configurable: `fees_collector: stripe` (connected account pays) or `application` (platform pays Stripe fees, collects app fee). Stripe recommends reviewing [integration recommendations](https://docs.stripe.com/connect/integration-recommendations). |
| Refunds / disputes | **Connected account** handles refunds and chargebacks on direct charges |
| Negative balances | For direct charges, Stripe recommends `losses_collector: stripe` on connected account where platform should not carry connected-account negative balance liability |
| Application fee | `application_fee_amount` on PaymentIntent / Checkout Session; for direct charges use `stripe_account` + fee on connected account charge |

### Onboarding options (all supported by Stripe; choice is product/UX)

| Model | Notes |
|-------|-------|
| **Account Links + Stripe-hosted onboarding** | Lowest integration effort; redirect flow |
| **Embedded onboarding** | Account Session + Connect embedded component; stays on SynqDrive |
| **API onboarding** | Full control; highest maintenance — not recommended unless required |

### Account generations

| Generation | Stripe guidance |
|------------|-----------------|
| **Accounts v2** | Recommended for **new** platform integrations; configurations (`merchant`, `customer`, `recipient`) |
| **Accounts v1** | Still widely used; controller properties; legacy Express/Custom/Standard types |
| **Controller-based** | v1 Accounts use `controller` properties; v2 uses `defaults.responsibilities` |

---

## 4. Architecture decision (SynqDrive Connect — pending manual Dashboard confirmation)

> Decisions below are **architecture recommendations** for implementation planning. Items marked **⏳ manual** must be confirmed in Stripe Dashboard before implementation starts.

### 4.1 Account generation

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Target** | **Accounts v2** with `merchant` configuration ⏳ manual | Stripe recommends v2 for new platforms; aligns with future SaaS fee + merchant dual role. **Blocked until** Dashboard Accounts v2 early access confirmed. |
| **Fallback** | Accounts v1 **Custom** or **Express** with controller properties | If v2 not enabled on SynqDrive Sandbox account. |
| **Not chosen** | Legacy Standard connected accounts as default | Less control over onboarding UX for embedded SynqDrive rental surface. |

### 4.2 Onboarding model

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Primary** | **Stripe-hosted Account Links** OR **Embedded onboarding** | Avoid full API onboarding maintenance. SynqDrive rental UI can deep-link or embed component from org settings. |
| **Not chosen** | Pure API onboarding | High maintenance when verification rules change. |

### 4.3 Capabilities

| Capability | Required? | Notes |
|------------|-----------|-------|
| `card_payments` | **Yes** | Minimum for rental checkout card payments in DE/EU |
| `transfers` / `stripe_balance.stripe_transfers` | **No** (initially) | Not needed for Direct Charges + `application_fee_amount` only |
| EU methods (SEPA, etc.) | **Later / optional** | Enable per connected account after card MVP; confirm in Dashboard ⏳ manual |

### 4.4 Direct Charge configuration

| Parameter | Planned value |
|-----------|---------------|
| Charge type | **Direct Charges** on connected account (`stripe_account` / `Stripe-Account` header) |
| Platform fee | `application_fee_amount` (SynqDrive application fee) |
| Checkout | **Checkout Sessions** with `payment_intent_data.application_fee_amount` and connected account context — supported by Stripe docs for marketplace patterns |
| Fee collector | **⏳ Product decision:** `fees_collector: stripe` (org pays processing) vs `application` (platform pays processing, keeps app fee net). Default recommendation: **`stripe`** on connected account for direct charges per Stripe integration recommendations |
| Losses collector | **`stripe`** on connected account (platform not liable for connected negative balances on direct charges) |

### 4.5 Webhook strategy

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `POST /api/v1/webhooks/stripe` | **Billing only** (existing) — subscriptions, platform invoices | Exists in codebase |
| `POST /api/v1/webhooks/stripe/connect` (proposed) | **Connect / end-customer payments** — `payment_intent.succeeded`, `charge.refunded`, `account.updated`, etc. | **Not implemented**; no Connect secret in env |
| Signing secrets | `STRIPE_WEBHOOK_SECRET` (billing) + proposed `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect secret **not verified** — ⏳ manual Dashboard |

**Rule:** Never mix billing and Connect event verification on one secret if event sources differ.

### 4.6 Testmode strategy

| Step | Action |
|------|--------|
| 1 | Continue using **SynqDrive Sandbox** (`livemode: false` verified) |
| 2 | Complete platform Connect onboarding in Dashboard ⏳ manual |
| 3 | Enable Accounts v2 in Dashboard if available ⏳ manual |
| 4 | Create **test** connected accounts only during implementation phase (out of scope for this prompt) |
| 5 | Register **test** Connect webhook endpoint before payment implementation |
| 6 | Use Stripe CLI / test cards for PI/Checkout validation |

---

## 5. SynqDrive payment domain — Stripe adapter boundary (conceptual only)

**Guardrail:** `modules/payments` (future) must **not** import Stripe SDK types into domain services. Only the adapter implements Stripe v1/v2 details.

### Port interface (conceptual)

```
StripeConnectAdapter (infrastructure)
├── createConnectedAccount(orgId, profile) → ConnectedAccountRef
├── createOnboardingSession(accountRef, returnUrl, refreshUrl) → OnboardingSessionRef
├── getAccountStatus(accountRef) → ConnectedAccountStatus
├── createCheckoutSession(params) → CheckoutSessionRef
└── createRefund(paymentRef, amount?) → RefundRef
```

### Domain types (internal, Stripe-agnostic)

- `ConnectedAccountRef`, `OnboardingSessionRef`, `CheckoutSessionRef`, `PaymentRef`, `RefundRef` — opaque IDs + status enums
- `ConnectedAccountStatus` — `pending | active | restricted | disabled` mapped from Stripe capabilities/requirements in adapter only

### Mapping responsibility

| Adapter method | Stripe API (implementation phase) |
|----------------|-----------------------------------|
| `createConnectedAccount` | Accounts v2 create + `merchant` config **or** v1 Account create |
| `createOnboardingSession` | Account Links (hosted) **or** Account Session (embedded) |
| `getAccountStatus` | Account retrieve + capabilities/requirements hash |
| `createCheckoutSession` | Checkout Sessions create on connected account with `application_fee_amount` |
| `createRefund` | Refunds create on connected account charge |

**No implementation in this prompt.**

---

## 6. Required manual Stripe steps (before Connect implementation)

1. Dashboard → Connect → complete **platform profile** and confirm Connect enabled.
2. Dashboard → Early access → enable **Accounts v2** (if available for this account).
3. Dashboard → Workbench → note **default API version**; align SDK/webhook version strategy.
4. Dashboard → Payment methods (test) → enable **card** (+ desired EU methods).
5. Dashboard → Webhooks → document existing **test** endpoints; plan separate **Connect** endpoint.
6. Store Connect webhook signing secret as `STRIPE_CONNECT_WEBHOOK_SECRET` (Runtime Secret) — separate from billing `STRIPE_WEBHOOK_SECRET`.
7. Complete platform **details_submitted** / `charges_enabled` if platform itself must accept test charges during development.

---

## 7. Confirmation

- **No Stripe objects were created, modified, or deleted.**
- **No webhooks, capabilities, or connected accounts were provisioned.**
- **No Dashboard settings changed.**
- **No secrets printed** — MCP redacted sensitive account fields.
- Verification used **test mode only** (`livemode: false` on balance).
