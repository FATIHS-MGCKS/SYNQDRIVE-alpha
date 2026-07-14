# End-Customer Payments — Go-Live Audit & Hardening (2026-07-14)

Prompt 20 final hardening record. No new product features — reconciliation job, observability, read-only audit, checklists.

---

## Teil A — Periodic Reconciliation Job

**Scheduler:** `PaymentConnectReconciliationScheduler` — every 5 minutes (workers enabled).

**Service:** `PaymentConnectReconciliationService.runPeriodicReconciliation()`:

| Scope | Behavior |
|-------|----------|
| Webhooks `RECEIVED` / `FAILED` | Reprocess batch (max 8 attempts); alert on exhaustion |
| `UNRESOLVED_ACCOUNT` | Re-link when org account appears; reprocess |
| `PROCESSING` stuck | Stripe PI retrieve in connected-account context; **alert only** if succeeded remotely |
| Expired checkouts | Transition `CHECKOUT_READY`/`LINK_SENT` → `EXPIRED` when past `checkoutExpiresAt` |
| Connect accounts | Sync status/payout summary for `paymentsEnabled` orgs |
| Integrity | Alert on PAID without CHARGE, PAID without `OrgInvoicePayment`, refund>paid, fee>amount, duplicate PI, booking summary mismatch |

**Webhook processor:** failures mark `FAILED` (no throw) — Stripe gets 200, periodic job retries.

**Rules preserved:** no duplicate invoice payments, no silent auto-repair of unclear mismatches.

---

## Teil B — Observability

**Structured logs:** `formatPaymentLogPayload()` — correlation fields `organizationId`, `bookingId`, `paymentRequestId`, `stripeEventId`, truncated `connectedAccountId`. No PII/secrets.

**Prometheus metrics** (`PaymentMetricsService` on shared registry):

| Metric | Purpose |
|--------|---------|
| `synqdrive_payment_checkout_creation_total{result}` | Checkout success/failure |
| `synqdrive_payment_webhook_processing_total{event_type,outcome}` | Webhook reconcile |
| `synqdrive_payment_reconciliation_mismatch_total{kind}` | Integrity alerts |
| `synqdrive_payment_success_total` | `payment_intent.succeeded` processed |
| `synqdrive_payment_email_failure_total` | Email failures |
| `synqdrive_payment_refund_failure_total` | Refund failures |
| `synqdrive_payment_unknown_connected_account_total` | Unmapped accounts |
| `synqdrive_payment_connect_webhook_backlog{status}` | Webhook queue depth |
| `synqdrive_payment_email_dead_letter` | Outbox dead letters |

**Alerts:** `backend/monitoring/prometheus/alerts.yml` — `synqdrive_payments` group.

**Dead letter:** `payment.email` queue monitored via `MONITORED_QUEUES`; gauge from `PaymentEmailOutbox` DEAD_LETTER count.

---

## Teil C — Read-Only Data Audit

**Service:** `ConnectPaymentAuditService`  
**Script:** `backend/scripts/ops/audit-connect-payment-integrity.ts`

Checks: missing booking/invoice, deposit in amount, fee>amount, PAID without transaction/invoice payment, duplicate PI/checkout session, duplicate stripe events, livemode mismatch, booking summary mismatch, stuck webhooks, unresolved accounts, fake-PAID candidates (Prompt 3 integration).

**No automatic repair** of unsafe findings. Exit code 2 if any HIGH severity.

---

## Teil D — E2E Stripe Testmode

**Cloud agent:** Live Stripe testmode E2E (steps 1–25) **not executed** — no Stripe test API keys / Connect onboarding in agent environment.

**Automated coverage instead:**

- 221 payment module unit/integration contract tests passing
- `payment-connect-flow.integration.spec.ts` — fee/refund/ledger contracts
- Reconciliation + webhook idempotency specs from Prompts 15–19

**Manual testmode checklist:** see § Stripe Dashboard + internal pilot in deployment plan.

---

## Teil E — Technical Verification (2026-07-14)

| Check | Result |
|-------|--------|
| `npm run prisma:validate` | ✅ Valid (existing SetNull warning) |
| `npx prisma migrate status` | ⚠️ `DATABASE_URL` not set in agent — run on VPS with `backend.env` |
| Backend `npm run build` | ✅ Pass |
| Backend `npm test -- payments` | ✅ 31 suites, 221 tests |
| Backend full `npm test` | See CI / full run |
| Frontend `npm run build` | ⚠️ Pre-existing TS errors in `CustomerPaymentsTab.tsx`, `BookingPaymentSuccessPanel.tsx` (not introduced by Prompt 20) |
| `npm run lint` (backend) | Narrow scope (document-extraction only) |
| `npm run test:e2e` | No payment e2e spec yet |
| OpenAPI | Nest Swagger on controllers; payment DTOs validated via class-validator |

---

## Teil F — Security Audit Summary

| Control | Status |
|---------|--------|
| No client totals/currency on payment create | ✅ Server snapshot |
| No card/IBAN in DB | ✅ Stripe refs + safe webhook payload only |
| Raw body webhook | ✅ Connect controller |
| Signature verification | ✅ `constructEvent` + connect secret |
| Event deduplication | ✅ Unique `stripeEventId` + ledger `providerEventId` |
| Connected account context | ✅ `stripeAccount` on Direct Charge/refund/retrieve |
| Multi-tenant isolation | ✅ Org guards + metadata alignment |
| Idempotency | ✅ Headers + ledger keys |
| Replay protection | ✅ Webhook dedupe + idempotent reconcile |
| Return URLs | ✅ `resolveAllowedCheckoutRedirectUrl` allowlist |
| Secret separation | ✅ `STRIPE_CONNECT_WEBHOOK_SECRET` ≠ billing webhook |
| Test/live separation | ✅ `assertConnectTestModeOnly` + livemode checks |
| Payment vs billing permissions | ✅ `payments-refund` separate from `billing` |
| Audit log | ✅ Reconciliation/refund/dispute activity logs |
| Log redaction | ✅ `buildSafeConnectWebhookEventData`, `payment-log.util` |
| Rate limits | ✅ Global ThrottlerGuard |

---

## Teil G — Stripe Dashboard Checklist (manual)

### Test mode

1. Enable Connect (Express) for platform account
2. Create test connected account per pilot org
3. Complete Express onboarding (test data)
4. Verify `card_payments` capability active
5. Configure Connect webhook endpoint: `https://app.synqdrive.eu/api/v1/webhooks/stripe-connect`
6. Events: `account.updated`, `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`
7. Copy webhook signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET` on VPS
8. Set platform branding (logo, colors) on Connect settings
9. Configure return/refresh URLs to production allowlist domains
10. Test card `4242…` through full booking payment link flow
11. Verify webhook delivery in Stripe Dashboard → succeed + idempotent replay

### Live mode (after review)

1. Complete Stripe Connect platform profile / compliance
2. Switch `STRIPE_SECRET_KEY` to live (remove test-only guard in deploy process)
3. Create live Connect webhook with same events + new signing secret
4. Re-onboard pilot org connected accounts in live mode
5. Verify `charges_enabled` + `payouts_enabled` before enabling `paymentsEnabled`
6. Pilot with single org; monitor Prometheus payment alerts

---

## Teil H — Legal / Tax Go-Live Blockers

| Topic | Status |
|-------|--------|
| Application fee tax treatment (USt.) | **Open** — Steuerberater |
| Fee basis gross vs net | **Open** — align with `feeBasis` policy doc |
| B2B fee invoice SynqDrive → tenant | **Open** — billing module separate |
| Merchant of record | **Open** — tenant is MoR via Direct Charge; legal sign-off |
| Stripe processing fee responsibility | Documented: connected account (Direct Charge) |
| Refund/chargeback rules in AGB | **Open** — legal |
| Fee communication to end customers | **Open** — product/legal |
| GDPR retention for payment metadata | **Open** — DPA with Stripe + retention policy |

---

## Teil I — Deployment & Rollout

1. **Backup** — `vps-deploy-release.sh` pre-migrate DB backup
2. **Migration** — `prisma migrate deploy` on VPS
3. **Backend** — PM2 restart API + workers (scheduler runs in worker process)
4. **Workers** — ensure `WORKERS_ENABLED=1` for reconciliation + email
5. **Frontend** — static build deploy
6. **Connect webhook test** — Stripe CLI or Dashboard send test event
7. **Read-only audit** — `audit-connect-payment-integrity.ts` + `audit-fake-paid-card-invoices.ts`
8. **Internal test org** — enable `paymentsEnabled`, full payment_link flow
9. **Pilot org** — single tenant, monitor alerts 48h
10. **Monitoring** — Grafana/Prometheus `synqdrive_payments` alerts
11. **Feature flag** — `paymentsEnabled` default false; enable per org

### Rollback

1. Set `paymentsEnabled=false` on affected orgs (stops new requests)
2. Revert git release on VPS to prior `main` tag
3. Do **not** delete `PaymentTransaction` / webhook events
4. Stripe webhooks can remain; unreconciled events stay for manual replay
5. Restore DB from pre-deploy backup only if schema migration incompatible

---

## Final Acceptance Mapping

| Criterion | Evidence |
|-----------|----------|
| No fake PAID from card intent | Prompt 3 audit + checkout lifecycle fix |
| Billing ≠ payments | Separate modules/permissions/webhooks |
| Deposit not online charged | Fee snapshot excludes deposit |
| Server snapshot | `PaymentFeeService.buildFeeSnapshotForBooking` |
| Direct Charge | `stripeAccount` on checkout/refund |
| Application fee policy | Prompt 8 + proportional refund |
| Idempotent webhooks | Unique event + ledger keys |
| Single PI success booking | Reconciliation guards |
| Invoice/request/ledger consistency | Reconciliation job alerts |
| Email failures visible | Outbox DEAD_LETTER gauge + scheduler retry |
| Refunds/fee refunds | Prompt 19 |
| Multi-tenant | Org scoping + alignment asserts |
| Feature default off | `paymentsEnabled` platform flag |
| Tests/build | Backend pass; frontend pre-existing TS debt documented |
