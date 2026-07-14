# Stripe Connect — Isolated Test Environment Readiness (2026-07-14)

Prompt 3: prepare and verify test-mode E2E prerequisites only. No booking or payment execution.

## Environment topology

| Layer | Value | Notes |
|-------|-------|-------|
| Staging | **None (shared prod host)** | `app.synqdrive.eu` — no separate staging DB or host |
| API base | `https://app.synqdrive.eu/api/v1` | Health 200 |
| Database | PostgreSQL `synqdrive` @ VPS localhost | Single tenant org: F.S Mobility Service (`faa710c9-…`) |
| Stripe mode | **Test only** | VPS `STRIPE_SECRET_KEY` prefix `sk_test_` |
| Billing webhook | `/webhooks/stripe` | Separate from Connect; `STRIPE_WEBHOOK_SECRET` empty on VPS |
| Connect webhook | `/webhooks/stripe-connect` | `STRIPE_CONNECT_WEBHOOK_SECRET` set on VPS (2026-07-14) |

## Connect architecture (code + Stripe MCP verified)

- **Adapter:** `StripeConnectV1Adapter` — Express accounts (`type: express`)
- **Charge model:** Direct Charges on connected account + `application_fee_amount` to platform
- **Checkout:** `stripe.checkout.sessions.create` with `stripeAccount` header
- **Capabilities requested:** `card_payments`
- **Testmode guard:** `assertConnectTestModeOnly()` rejects `sk_live_`
- **Feature flag:** `Organization.paymentsEnabled` — default `false`; only explicit org enablement

## Stripe Dashboard (testmode) — 2026-07-14

| Item | Status |
|------|--------|
| Platform account | `acct_1Tnz17KTcW1K1ahf` — SynqDrive Sandbox, DE, EUR |
| Connected accounts | **0** (list empty via API) |
| Connect webhook | `we_1TtAbX…` → `…/webhooks/stripe-connect`, `livemode=false`, Connect scope |
| Webhook events | `account.updated`, `checkout.session.*`, `payment_intent.*`, `charge.refunded`, `charge.dispute.created` |
| EU payment methods | Card (4242…), SEPA (test IBANs per Stripe docs); dynamic PMs when enabled in Dashboard |
| Branding | Platform `settings.branding` available; not configured in test account snapshot |

## VPS deployment gap (blocker)

**Resolved 2026-07-14** — Release `20260714181422_v4994` (`361803f`):

- 106 migrations applied (9 payment migrations included)
- `payments_enabled` column present; default `false` for FMS org
- `POST /webhooks/stripe-connect` → **400** missing signature (route live, secret configured on VPS)
- PM2 stable after `PaymentEmailModule` re-export fix

## Readiness decision

**Deploy complete — E2E prerequisites from Prompt 3 still require:**

1. `paymentsEnabled=true` for FMS test org only
2. Connect onboarding via UI
3. Webhook signature test with `account.updated`
4. `audit-connect-payment-integrity.ts` HIGH = 0

**Prompt 4** can proceed after onboarding + webhook verification.

## VPS env prepared (2026-07-14, no secrets in git)

Non-secret URLs configured in `/opt/synqdrive/shared/backend.env`:

- `APP_URL=https://app.synqdrive.eu`
- `STRIPE_CONNECT_RETURN_URL` / `REFRESH_URL` → rental billing customer-payments tab
- `STRIPE_CHECKOUT_SUCCESS_URL` / `CANCEL_URL` → rental bookings query params
- `STRIPE_CONNECT_ACCOUNT_GENERATION=V1`
- `STRIPE_CONNECT_WEBHOOK_SECRET` — set from Stripe webhook creation (VPS only)

## Readiness decision

**NOT READY FOR TEST E2E** (onboarding/webhook verify pending) — **stack deployed**:

1. ~~Payment branch merged to `main` and VPS deploy~~ ✅
2. ~~PM2 restart with updated env~~ ✅
3. Test org `paymentsEnabled=true` only — **pending Prompt 4**
4. Connect onboarding completed via UI flow — **pending Prompt 4**
5. Connect webhook delivery + signature + dedupe verified — **route live, test pending**
6. `audit-connect-payment-integrity.ts` HIGH = 0 — **pending Prompt 4**

## Next step (Prompt 4)

Deploy payments stack → enable flag for FMS org → complete Express onboarding → send `account.updated` test event → verify `StripeConnectWebhookEvent` row → proceed to booking checkout E2E.

---

## Prompt 4 update (2026-07-14)

- FMS `paymentsEnabled=true` during prep; rollback simulation set `false` at end of E2E run.
- Connected account `acct_1TtB6x…` created; **`chargesEnabled=false`** — onboarding blocked by Stripe CAPTCHA on hosted Account Link.
- Audits re-run: **HIGH = 0** (2 MEDIUM legacy fake-PAID).
- Full E2E report: `architecture/STRIPE_CONNECT_E2E_TEST_REPORT_2026-07-14.md`
- **Verdict: NOT READY FOR INTERNAL PILOT** until manual Connect onboarding completes.
