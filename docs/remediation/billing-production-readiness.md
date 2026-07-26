# Master Admin Remediation — Phase 2B.10: Billing Production Readiness

**Date:** 2026-07-26  
**Status:** Final readiness assessment (Master Admin remediation 2B.1–2B.9)  
**Branch assessed:** `main` (commit at assessment time) + open remediation PRs #967–#973

---

## Executive answer

# Ist das Billing-System jetzt production ready?

## **Nein.**

Das Billing-System ist **architektonisch weit fortgeschritten** und für **Staging / Pilot mit engem Scope** geeignet, aber **nicht** für uneingeschränktes Production-Go-Live aller Mandanten.

**Verdict:** `NO-GO` (full production) · `CONDITIONAL-GO` (Pilot: 1–3 Orgs nach abgeschlossener Checkliste)

**Begründung in einem Satz:** Kritische Remediation-Arbeit (Guards, Reconciliation-Hardening, Stripe-Trennung, Datenmigration) ist **noch nicht auf `main` gemerged**, Production-Daten sind **nicht inventarisiert/migriert**, und **Live-Stripe-E2E-Sign-off fehlt**.

---

## 1. Assessment scope

This document re-evaluates billing across nine remediation dimensions after phases 2B.1–2B.9:

| # | Dimension | Primary evidence |
|---|-----------|------------------|
| 1 | Source of Truth | Contract model, entitlements, legacy paths |
| 2 | Webhooks | Platform billing + Connect separation |
| 3 | Guards | Activation, idempotency, permissions |
| 4 | Reconciliation | Drift engine, scheduler, acknowledgment |
| 5 | Trial | Lifecycle, Stripe projection, expiry |
| 6 | Connect | End-customer payments (separate domain) |
| 7 | Acceptance tests | CI + sandbox matrix + live E2E |
| 8 | Migration | Legacy backfill, data anomaly inventory |
| 9 | Monitoring | Alerts, ops runbooks |

**Related docs:**

| Phase | Document | On `main`? |
|-------|----------|------------|
| 2B.2 Stripe env | `docs/remediation/stripe-environment-separation.md` | ❌ PR #967 |
| 2B.3 Webhooks | `docs/remediation/stripe-webhook-hardening.md` | ❌ PR #968 |
| 2B.5 Reconciliation | `docs/remediation/billing-reconciliation.md` | ❌ PR #969 |
| 2B.6 Trial | `docs/remediation/trial-model.md` | ❌ PR #970 |
| 2B.7 Guards | `docs/remediation/billing-guards.md` | ❌ PR #971 |
| 2B.8 Migration | `docs/remediation/billing-data-migration.md` | ❌ PR #972 |
| 2B.9 Acceptance | `docs/remediation/billing-acceptance.md` | ❌ PR #973 |
| Prompt 44 (legacy) | `docs/billing/billing-production-readiness.md` | ✅ |

---

## 2. Dimension-by-dimension verdict

### 2.1 Source of Truth

| Aspect | Status | Detail |
|--------|--------|--------|
| Commercial contract SoT | ✅ **PASS** | `BillingSubscription` + `BillingSubscriptionItem` — Master Admin lifecycle |
| Stripe role | ✅ **PASS** | Payment projection; local contract drives `trial_end`, items (orchestrator) |
| Entitlements SoT | ⚠️ **RISK** | `BillingEntitlementResolver` is canonical; `OrganizationProduct` + `EntitlementResolverService` legacy merge still active |
| Connect vs SaaS | ✅ **PASS** | Separate modules: `modules/billing` vs `modules/payments`; separate webhooks |
| Tenant isolation | ✅ **PASS** | `resolveOrgScope`, permission matrix, isolation tests |

**Remaining risk:** Dual entitlement reads can grant access from stale `organization_products` rows. Registry explicitly marks legacy as projection-only — **not synced automatically**.

**Blocker?** P1 — not a hard stop for pilot if backfill + reconciliation clean per org.

---

### 2.2 Webhooks

| Aspect | Status (`main`) | After 2B.3 PR |
|--------|-----------------|---------------|
| Signature verification | ✅ | Shared hardening util |
| Livemode vs runtime key | ✅ `assertWebhookLivemodeMatchesRuntime` | ✅ |
| Idempotency (`stripeEventId`) | ✅ | ✅ |
| Event matrix (22 types) | ✅ | ✅ |
| Safe payload storage | ✅ | Enhanced |
| `trial_will_end` tested | ⚠️ Registered, no matrix spec | Same |
| Connect webhook | ✅ Separate `/webhooks/stripe-connect` | N/A |

**Remaining risks:**

- Stuck `FAILED` webhooks require ops intervention (monitoring warns, no auto-heal except admin replay)
- Live webhook endpoint must be registered with **exact** event list before prod cutover
- 2B.3 **not merged** — additional hardening not in production branch

**Blocker?** P1 for merge of #968; P2 for `trial_will_end` test gap.

---

### 2.3 Guards

| Guard | Status (`main`) | After 2B.7 PR |
|-------|-----------------|---------------|
| Master billing permission | ✅ `MasterBillingGuard` | ✅ |
| Command idempotency | ✅ `BillingCommandService` | ✅ |
| Optimistic locking | ✅ `lockVersion` | ✅ |
| **Stripe-before-ACTIVE** | ❌ **MISSING** | ✅ `BillingActivationGuardService` |
| Legacy `POST /billing/subscriptions` | ❌ **Creates ACTIVE directly** | ✅ Blocked |
| Trial cancel from TRIALING | ❌ `scheduleCancel` blocked | Documented only |
| Entitlement date guard (`trialEndAt`) | ❌ Not enforced | Not in PR |

**Critical finding on `main`:** `activate()` commits local `ACTIVE` **before** Stripe confirms; sync is async via outbox listener and can fail silently (logged).

**Blocker?** **P0 — YES** until PR #971 merged and deployed.

---

### 2.4 Reconciliation

| Aspect | Status (`main`) | After 2B.5 PR |
|--------|-----------------|---------------|
| Drift detection engine | ✅ | Extended drift types |
| Scheduler (6h) | ✅ | ✅ |
| No contract auto-overwrite | ✅ | ✅ |
| Manual acknowledgment gate | ❌ | ✅ `acknowledged_at` |
| Drift types: customer, cancel, renewal, invoice status | ❌ Partial | ✅ |
| Monitoring → CRITICAL drift alert | ✅ `BillingMonitoringService` | ✅ |

**On `main`:** Reconciliation runs but lacks acknowledgment workflow and several drift dimensions documented in 2B.5.

**Blocker?** **P0 for full prod** — operators can resolve drifts without formal acknowledgment audit trail. **P1** if pilot accepts manual Stripe Dashboard verification.

---

### 2.5 Trial

| Aspect | Status |
|--------|--------|
| Model documented (2B.6) | ❌ Not on `main` (PR #970) |
| Master `configureTrial` path | ✅ |
| Stripe `trial_end` push | ✅ Orchestrator |
| Trial expiry worker | ❌ **Missing** |
| Entitlements after `trialEndAt` | ❌ **Still grants access** |
| Cancel during trial | ❌ Lifecycle gap |

**Blocker?** **P1** — expired trials may retain access until manual activate/cancel. Unacceptable for self-service prod without ops oversight.

---

### 2.6 Connect (Stripe Connect)

| Aspect | Status |
|--------|--------|
| Architectural separation from SaaS billing | ✅ |
| Separate webhook secret + event store | ✅ |
| Booking payment flow | ✅ Separate domain (Prompt 41+) |
| Risk of operator confusion | ⚠️ Two Stripe integrations in one product |

**Connect is NOT a blocker for SaaS billing go-live** if teams treat it as independent. SaaS billing does not depend on Connect for subscription lifecycle.

**Blocker?** **No** for SaaS billing readiness (document training for support).

---

### 2.7 Acceptance tests

| Layer | Result (2026-07-26, `main`) |
|-------|----------------------------|
| Sandbox matrix | **40/40** ✅ |
| Billing module specs | **782/784** ✅ (2 Resend email mock failures) |
| Core parity suites | **98/98** ✅ |
| Live Stripe sandbox E2E | ❌ **Not executed** in remediation run |
| Downgrade E2E | ❌ Gap |
| Renewal E2E | ❌ Gap |

**2B.9 verdict:** CONDITIONAL GO — automated layer accepted; live sign-off required.

**Blocker?** **P0** — no recorded live sandbox run with zero CRITICAL drifts for pilot orgs.

---

### 2.8 Migration

| Aspect | Status |
|--------|--------|
| Migration plan (2B.8) | ❌ Not on `main` (PR #972) |
| Legacy backfill script | ✅ Exists |
| Backfill executed on production | ❌ **Unknown / likely not** |
| Data anomaly SQL inventory | Documented in 2B.8, **not run on prod** |
| Runbook | ✅ `docs/billing/billing-migration-runbook.md` |

**Blocker?** **P0 (Ops)** — Prompt 44 and runbook require `--dry-run` → review → `--execute` on target DB before go-live. **Cannot go live without this for existing tenants.**

---

### 2.9 Monitoring

| Signal | Implemented | External alert |
|--------|-------------|----------------|
| Failed webhooks | ✅ `BILLING_WEBHOOK_FAILED` | ❌ Log only |
| Outbox dead letter | ✅ `BILLING_OUTBOX_DEAD_LETTER` | ❌ Log only |
| CRITICAL reconciliation drifts | ✅ | ❌ Log only |
| Outbox backlog > 50 | ✅ Warning | ❌ Log only |
| Prometheus/Grafana/PagerDuty | ❌ | ❌ |

**Blocker?** **P1** — monitoring exists in code but **not wired to on-call**. Acceptable for pilot with daily manual checks; **not** for full prod.

---

## 3. CI test snapshot (`main`, 2026-07-26)

```bash
npm run test:billing:sandbox-matrix          # 40/40 pass
npm test -- --testPathPattern=modules/billing  # 782/784 pass (2 failures)
```

| Failure | File | Impact |
|---------|------|--------|
| Resend webhook mock | `billing-email-delivery.spec.ts` (×2) | Billing **email** delivery path, not Stripe parity |

---

## 4. Prioritized blocker list

### P0 — Must resolve before full production

| ID | Blocker | Owner | Resolution |
|----|---------|-------|------------|
| **P0-1** | **Remediation PRs #967–#972 not on `main`** | Engineering | Merge + deploy: env separation, webhooks, reconciliation, guards, migration docs |
| **P0-2** | **Activation without Stripe confirmation** (`main`) | Engineering | Merge PR #971; verify activate/reactivate gate |
| **P0-3** | **Legacy backfill not executed on production DB** | Ops | `backfill-billing-legacy.ts --dry-run` → review → `--execute` with backup |
| **P0-4** | **No live Stripe Test Mode E2E sign-off** | QA/Ops | Run playbook `docs/billing/billing-stripe-sandbox-e2e.md`; archive report |
| **P0-5** | **Production data inventory not run** | Ops | Execute SQL from migration plan (2B.8); triage conflicts |
| **P0-6** | **Live Stripe webhook + keys not verified** | Ops | Register live endpoint; `sk_live_*` + `whsec_*`; smoke test one event |

### P1 — Must resolve before scaling beyond pilot

| ID | Blocker | Resolution |
|----|---------|------------|
| **P1-1** | Trial expiry not enforced | Entitlement guard on `trialEndAt` + optional lifecycle worker |
| **P1-2** | Reconciliation acknowledgment not on `main` | Merge PR #969 |
| **P1-3** | Legacy `OrganizationProduct` parallel entitlements | Complete projection sync or remove legacy reads |
| **P1-4** | No external monitoring/alerting | Wire `BillingMonitoringService` to PagerDuty/Slack |
| **P1-5** | Downgrade + renewal E2E gaps | Add scenarios + manual sandbox runs |
| **P1-6** | `trial_will_end` webhook untested in matrix | Add spec case |
| **P1-7** | 2 failing billing email specs | Fix Resend mock in `billing-email-delivery.spec.ts` |
| **P1-8** | Stripe env separation not on `main` | Merge PR #967 |

### P2 — Risks to track (not hard blockers)

| ID | Risk | Mitigation |
|----|------|------------|
| P2-1 | Portal return URL open-redirect if CORS misconfigured | Set `APP_URL` + `STRIPE_CUSTOMER_PORTAL_RETURN_URL` in prod |
| P2-2 | Two invoice number spaces (SaaS vs rental) | Support playbook + UI labels (partially done) |
| P2-3 | No global billing feature flag | Env-gate via `STRIPE_SECRET_KEY` only |
| P2-4 | Master sidebar not permission-gated | Low risk — API guarded |
| P2-5 | Discount drift detection incomplete | Extend reconciliation |
| P2-6 | Prompt 44 doc says "GO" — superseded | This document is authoritative for 2B remediation |

---

## 5. Production readiness matrix

| Criterion | Ready? | Notes |
|-----------|--------|-------|
| Schema + migrations deployed | ⚠️ | Code ready; prod deploy required |
| Source of truth clear | ✅ | Contract-first architecture |
| Stripe test/live separation | ⚠️ | On `main` partially; PR #967 pending |
| Webhooks secure + idempotent | ⚠️ | Good on `main`; hardening in #968 |
| Activation guards | ❌ | PR #971 required |
| Reconciliation operational | ⚠️ | Runs; hardening in #969 |
| Trial model understood | ⚠️ | Doc in #970; expiry gap remains |
| Connect isolated | ✅ | Separate from SaaS billing |
| CI tests green | ⚠️ | 782/784 |
| Live E2E passed | ❌ | Not recorded |
| Data migrated | ❌ | Backfill not confirmed on prod |
| Monitoring + on-call | ❌ | In-app only |
| Rollback plan documented | ✅ | Runbook + Prompt 44 |

**Score: 4/12 hard ready · 5/12 partial · 3/12 not ready**

---

## 6. Path to production ready

### Phase A — Merge remediation (Engineering)

1. Merge **#971** (guards) — highest priority
2. Merge **#969** (reconciliation)
3. Merge **#968** (webhooks), **#967** (stripe env)
4. Merge docs **#970, #972, #973**
5. Deploy to staging; re-run full billing test suite

### Phase B — Data & ops (before any live charges)

1. `pg_dump` backup
2. `prisma migrate deploy`
3. `backfill-billing-legacy.ts --dry-run` → triage conflicts → `--execute`
4. Run 2B.8 anomaly SQL inventory; resolve P0 data issues
5. Configure live Stripe webhook + secrets

### Phase C — Validation

1. Live sandbox E2E sequence (acceptance doc §5)
2. Reconciliation per pilot org: **zero CRITICAL drifts**
3. Activate one pilot org with guard path; verify Stripe + DB parity
4. 48h monitoring: webhooks, outbox, drifts

### Phase D — Pilot → GA

1. 1–3 pilot tenants (2 weeks recommended minimum)
2. Fix P1 items (trial expiry, alerting)
3. Sign-off: Engineering + Ops + Product

**Only after Phase C for pilot orgs:** `CONDITIONAL-GO`  
**Only after Phase D + P0/P1 closed:** `GO` for general availability

---

## 7. What is production ready today?

| Component | Ready for prod? |
|-----------|-----------------|
| DB schema & billing domain model | ✅ Yes (after migrate) |
| Tenant billing UI (read paths) | ✅ Yes |
| Master Admin contract API | ⚠️ Yes with guard gap |
| Stripe orchestrator (sync) | ⚠️ Yes with async failure risk |
| Invoice/payment mirror | ✅ Yes |
| Email outbox | ⚠️ Yes if Resend configured |
| Connect booking payments | ✅ Separate track |
| **End-to-end billed subscription lifecycle** | ❌ **No** (until P0 closed) |

---

## 8. Honest risk register (nothing hidden)

| Risk | Likelihood | Impact | Mitigated? |
|------|------------|--------|------------|
| Local ACTIVE without Stripe sub | **High** on `main` | Revenue leakage / wrong entitlements | PR #971 |
| Stale legacy org products grant access | Medium | Wrong features | Backfill + entitlement cleanup |
| Trial never expires automatically | **High** | Free usage past trial | **Not mitigated** |
| Stripe/local drift undetected | Low | Billing disputes | Reconciliation scheduler |
| Drift resolved without audit | Medium on `main` | Compliance | PR #969 |
| Live/test key mix-up | Low | Data corruption | Livemode guard + PR #967 |
| Webhook storm / duplicate events | Low | Double charges prevented by idempotency | ✅ |
| Migration partial failure | Medium | Broken contracts | Dry-run + checkpoint |
| Ops unaware of failures | **High** | Silent degradation | No external alerts |
| Connect vs SaaS confusion | Medium | Wrong webhook secret | Documentation |
| Renewal not E2E tested | Medium | Missed invoice cycles | Manual Test Clock |
| Downgrade untested | Low-Medium | Wrong pricing | Manual only |

---

## 9. Comparison with Prompt 44 audit

`docs/billing/billing-production-readiness.md` (Prompt 44) concluded **GO after backfill** with code blockers fixed.

**Master Admin remediation 2B.x supersedes that verdict** by adding:

- Explicit Stripe-before-activate requirement (2B.7)
- Formal reconciliation acknowledgment (2B.5)
- Trial model gaps (2B.6)
- Data migration inventory (2B.8)
- Acceptance criteria with CONDITIONAL GO (2B.9)

**Prompt 44 "GO" is not valid for full production** until this document's P0 list is closed.

---

## 10. Sign-off template

| Role | Name | Date | Full prod GO | Pilot GO |
|------|------|------|--------------|----------|
| Engineering | | | ☐ | ☐ |
| Ops | | | ☐ | ☐ |
| Product | | | ☐ | ☐ |

**Pilot GO requires:** P0-3, P0-4, P0-5, P0-6 + PR #971 deployed  
**Full prod GO requires:** All P0 + all P1 resolved

---

## 11. References

- `docs/billing/billing-production-readiness.md` (Prompt 44 — historical)
- `docs/billing/billing-stripe-sandbox-e2e.md`
- `docs/billing/billing-migration-runbook.md`
- `docs/remediation/billing-acceptance.md` (PR #973)
- `docs/remediation/billing-guards.md` (PR #971)
- `docs/remediation/billing-reconciliation.md` (PR #969)
- `docs/remediation/trial-model.md` (PR #970)
- `docs/remediation/billing-data-migration.md` (PR #972)
- Open PRs: [#967](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/967)–[#973](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/973)

**Changes:** Updated (`ChangesView.tsx`, V4.9.889).  
**Architektur:** Updated (`architecture/MASTER_ADMIN_BILLING_PRODUCTION_READINESS_2026-07-26.md`).
