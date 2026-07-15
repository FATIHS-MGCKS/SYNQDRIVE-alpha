# Billing — Stripe Sandbox E2E Playbook

**Stand:** Prompt 43/44 · `billing: prompt 43 stripe sandbox e2e`  
**Scope:** Platform SaaS Billing (`/billing/*`, `/webhooks/stripe`) — **Test Mode only**

---

## 1. Grundregeln

| Regel | Umsetzung |
|-------|-----------|
| Nur Stripe **Test Mode** | `STRIPE_SECRET_KEY` muss mit `sk_test_` beginnen |
| Keine Live Keys | Skripte brechen bei `sk_live_*` ab |
| Keine Produktionsdaten | Dedizierte Sandbox-Org (`org-sandbox-billing-e2e` o.ä.) |
| Reproduzierbare Webhooks | Fixtures + Replay-Skript oder Stripe CLI |
| CI vs. Sandbox trennen | CI = gemockte Unit/Matrix-Tests; Live-Sandbox = manuell |

**Nicht in diesem Playbook:** Stripe Connect Endkundenzahlungen (`/webhooks/stripe-connect`) — siehe `architecture/STRIPE_CONNECT_TEST_ENV_READINESS_2026-07-14.md`.

---

## 2. Umgebung

### 2.1 Erforderliche Variablen (`backend/.env`)

```bash
# Pflicht — nur Test Mode
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...          # von Stripe CLI listen oder Dashboard-Endpoint

# Optional
STRIPE_CURRENCY=eur
STRIPE_CUSTOMER_PORTAL_RETURN_URL=http://localhost:5173/rental?view=settings&settingsTab=billing
BILLING_EMAIL_ENABLED=false              # Sandbox: E-Mails aus, außer Resend-Szenario
RESEND_API_KEY=                          # nur für Szenario 29

# Sandbox-Ops
E2E_BILLING_ORG_ID=org-sandbox-billing-e2e
E2E_WEBHOOK_URL=http://localhost:3000/api/v1/webhooks/stripe
```

**Verboten in Sandbox-Läufen:** `sk_live_*`, produktive Organisations-IDs ohne `sandbox` im Namen.

### 2.2 Lokaler Stack

```bash
cd backend
npm run infra:up
npm run prisma:migrate:deploy
npm run start:dev
```

API-Basis: `http://localhost:3000/api/v1`

### 2.3 Stripe CLI — Webhook Forwarding

```bash
# Einmalig: stripe login
stripe listen \
  --forward-to localhost:3000/api/v1/webhooks/stripe \
  --events customer.subscription.*,invoice.*,payment_intent.*,setup_intent.*,payment_method.*,charge.refunded,credit_note.created,charge.dispute.*,customer.updated
```

CLI gibt `whsec_...` aus → in `STRIPE_WEBHOOK_SECRET` setzen.

**Forwarding-Check:**

```bash
stripe trigger invoice.paid
# Erwartung: 200 von /webhooks/stripe, Eintrag in stripe_webhook_events
```

### 2.4 Fixture-Replay (ohne Stripe-Netzwerk)

```bash
cd backend
E2E_FIXTURE_FILE=invoice.paid.json npm run billing:sandbox:replay-webhook
```

Fixtures: `backend/src/modules/billing/__fixtures__/stripe-sandbox/events/`

### 2.5 Stripe-Event aus Dashboard replayen

```bash
E2E_STRIPE_EVENT_ID=evt_... npm run billing:sandbox:replay-webhook
```

---

## 3. Testkarten & SEPA (Stripe Test Mode)

### 3.1 Karte — Erfolg

| Feld | Wert |
|------|------|
| Nummer | `4242 4242 4242 4242` |
| Ablauf | beliebig in der Zukunft |
| CVC | beliebig 3-stellig |
| 3DS | `4000 0027 6000 3184` (falls 3DS-Pfad getestet) |

### 3.2 Karte — Fehlschlag

| Szenario | Nummer |
|----------|--------|
| Generischer Decline | `4000 0000 0000 0002` |
| Insufficient funds | `4000 0000 0000 9995` |

### 3.3 SEPA Direct Debit (Test)

| Feld | Wert |
|------|------|
| IBAN (Erfolg) | `DE89370400440532013000` |
| IBAN (Fehlschlag) | `DE62370400440532013001` |

Setup über Tenant-UI: **Verwaltung → Abrechnung & Abo → Zahlungsmethode** oder Master Admin Sync.

---

## 4. Sandbox-Organisation anlegen

1. Master Admin → Organisation mit Namen `Sandbox Billing E2E` anlegen
2. ID notieren als `E2E_BILLING_ORG_ID` (empfohlen: enthält `sandbox`)
3. **Keine** produktive FSM-/Kunden-Org verwenden
4. Stripe Customer wird beim ersten Billing-Sync angelegt (`metadata.synqdriveOrganizationId`)

---

## 5. Manuelle Szenario-Reihenfolge

Empfohlene Abfolge — jeder Schritt vor dem nächsten abschließen und DB/Stripe prüfen.

### §3.1 Organisation ohne Vertrag

1. Neue Sandbox-Org ohne `BillingSubscription`
2. Tenant-UI: **Abrechnung & Abo → Übersicht** → Empty State „Kein Vertrag“
3. API: `GET /billing/subscription/overview?orgId=...` → kein aktiver Vertrag

**Erwartung:** Kein Stripe Subscription ID, keine Rechnungen.

### §3.2 Rental Draft

1. Master Admin → Subscription Draft für `RENTAL` anlegen
2. Status `DRAFT`, kein Stripe-Sync

### §3.3 Rental aktivieren

1. Aktive Price Version zuweisen → Activate
2. Stripe Subscription erstellen (Orchestrator)
3. Webhook `customer.subscription.created` / `updated`

**Erwartung:** `BillingSubscription.status = ACTIVE`, Stripe `sub_*` gespeichert.

### §3.4 Fleet aktivieren

1. Fleet-Produkt dem Vertrag zuweisen (Konfliktregeln beachten)
2. Quantity/Items aktualisieren

### §3.5 Trial starten/beenden

1. `startTrial` via Master oder Lifecycle-API
2. Webhook `customer.subscription.updated` (status `trialing`)
3. Trial-Ende: automatisch oder manuell beenden

**Fixture:** `customer.subscription.updated-trial.json`

### §3.6 Fahrzeug hinzufügen

1. Fahrzeug mit aktiver Connectivity, `billingExcluded=false`
2. Billable-Vehicle-Liste prüfen
3. Nächste Preview-Rechnung: Quantity +1

### §3.7 Fahrzeug mitten im Monat

1. Fahrzeug mid-period hinzufügen
2. Proration-Zeile in Usage-Snapshot / Preview prüfen

### §3.8 Fahrzeug entfernen

1. Fahrzeug deaktivieren oder `billingExcluded=true`
2. Quantity -1, ggf. Proration-Gutschrift

### §3.9 Rabatt hinzufügen

1. Master → Price Version simulieren mit `discountPercentBps` / `discountCents`
2. Org-Override oder Coupon (falls konfiguriert)
3. Overview-Tab: Rabatt sichtbar

### §3.10 Rabatt ablaufen

1. `effectiveTo` in der Vergangenheit oder Version archivieren
2. Reconciliation-Lauf → Drift-Typ `DISCOUNT_MISMATCH` möglich

### §3.11 Rental → Fleet

1. Fleet zuweisen, Rental-Item ersetzen/konvertieren
2. Audit-Log + Subscription Items prüfen

### §3.12 Neue Price Version

1. Draft-Version erstellen → Tiers → Publish
2. Subscription auf neue Version migrieren (Master)

### §3.13 Kündigung zum Periodenende

1. `cancelAtPeriodEnd=true`
2. Webhook `customer.subscription.updated`

**Fixture:** `customer.subscription.updated-cancel-at-period-end.json`

### §3.14 Kündigung widerrufen

1. Cancel-Flag zurücksetzen vor Periodenende
2. Overview: kein „Kündigung geplant“

---

## 6. Zahlungsmethoden & Rechnungen

### §4.1 Karte

1. Tenant → Zahlungsmethode → Setup Intent
2. Testkarte `4242…` im Stripe Elements / Portal
3. Webhook `setup_intent.succeeded` + `payment_method.attached`

**Fixture:** `setup_intent.succeeded-card.json`

### §4.2 SEPA

1. Setup Intent mit `sepa_debit`
2. Test-IBAN `DE89370400440532013000`
3. Mandat + PM in `billing_payment_methods`

**Fixture:** `setup_intent.succeeded-sepa.json`

### §5.1 Erfolgreiche Rechnung

1. Stripe erzeugt Invoice → `invoice.finalized` → Zahlung → `invoice.paid`
2. Mirror in `billing_invoices`, Status `PAID`

**Fixture:** `invoice.paid.json`

### §5.2 Fehlgeschlagene Zahlung

1. Decline-Karte oder SEPA-Fail-IBAN
2. Webhook `invoice.payment_failed`
3. Tenant-UI: Problem-Panel / `PAST_DUE`

**Fixture:** `invoice.payment_failed.json`

### §5.3 Retry

1. Zahlungsmethode korrigieren
2. Stripe Retry oder manuelles Portal
3. Zweites `invoice.paid` — Idempotenz in `stripe_webhook_events`

### §5.4 Offene Rechnung

1. `invoice.finalized` ohne Zahlung
2. Status `OPEN` im Tenant-Rechnungstab

**Fixture:** `invoice.finalized.json`

### §5.5 Void

1. Invoice in Stripe voiden
2. Webhook `invoice.voided`

**Fixture:** `invoice.voided.json`

### §5.6 Uncollectible

1. Invoice als uncollectible markieren
2. Webhook `invoice.marked_uncollectible`

**Fixture:** `invoice.marked_uncollectible.json`

### §5.7 Vollrefund

1. Charge refund (voll) in Stripe Dashboard
2. Webhook `charge.refunded` → Ledger

**Fixture:** `charge.refunded-full.json`

### §5.8 Teilrefund

1. Partial refund
2. Ledger: `amount_refunded` < `amount`

**Fixture:** `charge.refunded-partial.json`

### §5.9 Credit Note

1. Credit Note in Stripe erstellen
2. Webhook `credit_note.created`

**Fixture:** `credit_note.created.json`

---

## 7. Resilienz & Sicherheit

### §6.1 Doppelter Webhook

```bash
# Gleiches Event zweimal senden
E2E_FIXTURE_FILE=invoice.paid.json npm run billing:sandbox:replay-webhook
E2E_FIXTURE_FILE=invoice.paid.json npm run billing:sandbox:replay-webhook
```

**Erwartung:** Zweiter Lauf `skipped_processed`, keine doppelte Buchung.

### §6.2 Out-of-order Webhook

1. `invoice.paid` vor `invoice.finalized` replayen (Fixture-Reihenfolge invertieren)
2. Domain-Guard `shouldApplyOutOfOrderUpdate` verhindert Regression

### §6.3 Stripe-Ausfall

1. `STRIPE_SECRET_KEY` leer → `NOT_CONFIGURED` in UI
2. Orchestrator-Timeout mocken (Unit-Test) — kein Live-Ausfall simulieren

### §6.4 Resend-Ausfall

1. `BILLING_EMAIL_ENABLED=true`, `RESEND_API_KEY` ungültig
2. Outbox-Retry in `billing_domain_event_outbox`
3. Manueller Resend über Master Admin

### §6.5 Drift Detection

```bash
# Master Admin API
POST /admin/billing/reconciliation/run
GET  /admin/billing/reconciliation/drifts
```

**Erwartung:** Drifts für Quantity/Price/Missing Invoice persistiert.

### §7 Cross-Tenant

1. Tenant JWT Org A → API mit `orgId=B` → **403**
2. Fremde Subscription-ID → **404** (kein Leak)

### §8 Rollenmatrix

Siehe `docs/billing/billing-permissions-matrix.md` — Worker ohne `billing.read` darf `/billing/*` nicht aufrufen.

---

## 8. Ergebnisprotokoll (Vorlage)

| # | Szenario | Modus | Stripe Event / Aktion | DB-Status | UI | OK |
|---|----------|-------|----------------------|-----------|-----|-----|
| 1 | Ohne Vertrag | manual | — | kein sub | Empty | ☐ |
| 13 | Invoice paid | fixture | invoice.paid | PAID | Rechnung grün | ☐ |
| 26 | Duplikat | fixture | 2× replay | 1× processed | — | ☐ |
| … | … | … | … | … | … | ☐ |

---

## 9. Cleanup

```bash
# Nur Sandbox-Orgs (ID muss "sandbox" enthalten)
E2E_BILLING_ORG_ID=org-sandbox-billing-e2e \
E2E_BILLING_CLEANUP_CONFIRM=1 \
npm run billing:sandbox:cleanup
```

Löscht: Webhook-Events, Reconciliation-Drifts, Invoices, Payment Methods, Usage Snapshots, Subscription Items, Subscriptions — **nur** für die angegebene Org.

**Stripe-seitig:** Test-Customers/Subscriptions im Stripe Dashboard Test Mode manuell löschen oder Test-Data resetten.

---

## 10. Automatisiert vs. manuell

Quelle: `backend/src/modules/billing/billing-stripe-sandbox.matrix.ts`

### Vollständig CI-automatisiert (Mock, `ciSafe: true`)

| # | Szenario | Tier | Tests |
|---|----------|------|-------|
| 1 | Organisation ohne Vertrag | unit | overview, summary specs |
| 2 | Rental Draft | unit | lifecycle spec |
| 6 | Fahrzeug hinzufügen | unit | billable-vehicles, quantity |
| 8 | Fahrzeug entfernen | unit | tariff, billable-vehicles |
| 9 | Rabatt hinzufügen | unit | pricebook, overview |
| 10 | Rabatt ablaufen | unit | reconciliation domain |
| 13 | Erfolgreiche Rechnung | ci-mock | invoice mirror, webhook matrix |
| 14 | Fehlgeschlagene Zahlung | ci-mock | webhook matrix, overview |
| 15 | Retry | ci-mock | webhook service |
| 16 | Offene Rechnung | ci-mock | invoice mirror |
| 17 | Void | ci-mock | webhook matrix + fixture |
| 18 | Uncollectible | ci-mock | webhook matrix + fixture |
| 19 | Vollrefund | ci-mock | payment ledger |
| 20 | Teilrefund | ci-mock | payment ledger |
| 21 | Credit Note | ci-mock | webhook matrix + fixture |
| 22 | Rental → Fleet | unit | lifecycle |
| 23 | Neue Price Version | unit | pricebook |
| 26 | Doppelter Webhook | ci-mock | webhook service |
| 27 | Out-of-order Webhook | ci-mock | domain matrix |
| 28 | Stripe-Ausfall | unit | stripe-prepared, orchestrator |
| 29 | Resend-Ausfall | unit | email processor |
| 30 | Drift Detection | ci-mock | reconciliation service |
| 31 | Cross-Tenant | ci-mock | multi-tenant, controller security |
| 32 | Rollenmatrix | ci-mock | permissions matrix |

```bash
cd backend && npm run test:billing:sandbox-matrix
```

### Integration-Mock (CI mit Mocks, Live-Sandbox empfohlen)

| # | Szenario |
|---|----------|
| 3 | Rental aktivieren |
| 4 | Fleet aktivieren |
| 5 | Trial starten/beenden |
| 11 | Karte |
| 12 | SEPA |
| 24 | Kündigung zum Periodenende |

### Manuell im Stripe Test Mode (Live-Sandbox)

| # | Szenario | Warum manuell |
|---|----------|---------------|
| 3–5 | Aktivierung, Fleet, Trial | Echter Stripe Subscription Create |
| 7 | Fahrzeug mid-month | Proration + Stripe Quantity Sync |
| 9–10 | Rabatte | Master-UI + Stripe Coupon |
| 11–12 | Karte/SEPA | Stripe Elements / 3DS / SEPA-Mandat |
| 13–21 | Zahlungsflüsse | Echte Charges im Test Dashboard |
| 24–25 | Kündigung | Stripe Billing Portal / Periodenende |

### CI-unfähig → zusätzlich gemockt

Diese Flows haben **kein** HTTP-E2E gegen Stripe, werden in Unit/Matrix-Tests mit Fixtures abgedeckt:

- Webhook-Ingest (Fixtures + `stripe-webhook.service.spec.ts`)
- Invoice Mirror (gemockter Stripe SDK)
- Payment Ledger Refunds/Credit Notes
- Reconciliation Batch
- Permissions / Cross-Tenant

---

## 11. Referenzen

| Artefakt | Pfad |
|----------|------|
| Szenario-Registry | `backend/src/modules/billing/billing-stripe-sandbox.matrix.ts` |
| Matrix-Test | `backend/src/modules/billing/billing-stripe-sandbox.matrix.spec.ts` |
| Webhook-Fixtures | `backend/src/modules/billing/__fixtures__/stripe-sandbox/events/` |
| Replay-Skript | `backend/scripts/ops/stripe-billing-e2e-replay-webhook.ts` |
| Cleanup-Skript | `backend/scripts/ops/stripe-billing-sandbox-cleanup.ts` |
| Permissions | `docs/billing/billing-permissions-matrix.md` |
| Architektur | `docs/billing/billing-current-state.md` |
