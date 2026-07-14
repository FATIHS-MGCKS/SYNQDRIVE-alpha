# Stripe Connect Endkundenzahlungen — Baseline & Domain-Trennung (2026-07-14)

## Zweck

Erster Implementierungsschritt für **Stripe Connect Endkundenzahlungen** (Mietkunde → Unternehmen → SynqDrive Application Fee). Dieses Dokument erfasst den **Ist-Zustand vor jeder funktionalen Änderung** und trennt architektonisch die zwei Zahlungswelten.

> **Keine funktionale Implementierung in diesem Schritt.** Keine Prisma-Migration, keine Stripe-Objekte, keine Billing-Änderungen.

---

## Zwei getrennte Zahlungswelten (nicht vermischen)

| Domäne | Geldfluss | Modul | Stripe-Objekte (heute) | Zielgruppe |
|--------|-----------|-------|------------------------|------------|
| **SynqDrive-Abonnement** | Unternehmen → bezahlt SynqDrive | `backend/src/modules/billing` | Customer, Subscription, Invoice, PaymentMethod, Webhook (`/webhooks/stripe`) | Tenant-Org als Stripe-Customer |
| **Endkundenzahlungen (geplant)** | Mietkunde → bezahlt Unternehmen; SynqDrive erhält Application Fee | `backend/src/modules/payments` (**noch nicht angelegt**) | Connect: Connected Accounts, PaymentIntent/Checkout, Application Fee | Rental-Customer → Org als Connected Account |

**Guardrail:** `modules/billing` bleibt ausschließlich für SynqDrive-Abonnements. Connect-Endkundenzahlungen erhalten eine **eigene Payment-Domain** (`modules/payments`, später).

---

## Repository-Layout (relevant)

| Pfad | Rolle |
|------|-------|
| `backend/package.json` | NestJS-Monolith, Scripts für build/test/lint/prisma |
| `frontend/package.json` | Vite + React SPA, `tsc -b` + vite build |
| `backend/prisma/schema.prisma` | Billing-Modelle + OrgInvoice + BookingPriceSnapshot + PricingQuote |
| `backend/src/modules/billing/` | SynqDrive-Abonnement + Stripe Billing (30 Dateien) |
| `backend/src/modules/pricing/` | Tarife, Quotes, Booking-Preis-Snapshots |
| `backend/src/modules/bookings/` | Booking Wizard Draft (`booking-wizard-draft.service.ts`) |
| `backend/src/modules/invoices/` | OrgInvoice / OrgInvoicePayment (manuell, kein Stripe Connect) |
| `backend/src/modules/outbound-email/` | Resend, Dokumentenversand |
| `backend/src/shared/auth/` | RBAC, PermissionsGuard, `RequirePermission` |
| `frontend/src/rental/components/billing/` | Tenant Billing UI (SynqDrive-Abo) |
| `frontend/src/master/components/billing/` | Master Admin Billing Control Center |
| `architecture/` | In-Repo Architektur-Records (kein separates ADR-Verzeichnis) |

**Workspace:** Kein Root-`package.json` / kein pnpm-workspace. Backend und Frontend sind **unabhängige npm-Projekte** mit jeweils `package-lock.json`.

**CI:** Kein `.github/workflows` oder `.gitlab-ci.yml` im Repository gefunden. Qualitätssicherung erfolgt lokal über npm-Scripts.

---

## Stripe-Konfiguration (Ist)

### Env (`backend/.env.example`)

```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CURRENCY=eur
STRIPE_CUSTOMER_PORTAL_RETURN_URL=
STRIPE_DEFAULT_PRICE_ID=
```

### Client (`stripe-client.util.ts`)

- Singleton `Stripe`-Client aus `STRIPE_SECRET_KEY`
- `resetStripeClientForTests()` für Unit-Tests

### Billing-Modul (SynqDrive-Abo)

| Service | Aufgabe |
|---------|---------|
| `StripeBillingService` | Customer, Subscription, Setup Intent, Customer Portal |
| `StripeWebhookService` | Webhook-Verarbeitung, Idempotenz (`StripeWebhookEvent`) |
| `StripeInvoiceMirrorService` | Spiegelung Stripe-Invoices → `BillingInvoice` |
| `StripePreparedService` | Graceful `NOT_CONFIGURED` wenn kein Key |
| `BillingController` | Tenant + Master Admin Endpoints, Permission `billing` |
| `StripeWebhookController` | `POST /webhooks/stripe` |

Prisma-Billing-Modelle: `BillingSubscription`, `BillingInvoice`, `BillingPaymentMethod`, `BillingUsageSnapshot`, `StripeWebhookEvent`, Pricebook-V2.

### Org-Rechnungen & Zahlungen (kein Stripe Connect)

- `OrgInvoice` / `OrgInvoicePayment` — operative Miet-Rechnungen
- `InvoicePaymentMethod` enum enthält `STRIPE`, aber `recordPayment()` schreibt nur manuelle Zahlungsbuchungen (Cash, Bank, Card, Stripe als **Label**, kein Stripe-API-Call)
- Booking Wizard erzeugt Draft → Quote → Snapshot → Invoice Lifecycle; **keine Online-Zahlung**

### Geplante Payment-Domain (noch nicht vorhanden)

- `backend/src/modules/payments/` — **existiert nicht**
- Kein Connect-Account-Modell in Prisma
- Kein separater Connect-Webhook-Pfad
- Stripe MCP (lesend): Connect = Marketplace mit Application Fees (`application_fee_amount` auf PaymentIntent)

---

## Booking Wizard & Pricing (Anknüpfungspunkte für spätere Payments)

| Komponente | Pfad | Relevanz |
|------------|------|----------|
| Pricing Quotes | `pricing-quote.service.ts`, Prisma `PricingQuote` | Preis vor Buchung, Integrity-Hash, Consume-on-Booking |
| Price Snapshot | Prisma `BookingPriceSnapshot`, `BookingPriceLineItem` | Fixierter Preis bei Buchungsbestätigung |
| Wizard Draft | `booking-wizard-draft.service.ts` | Draft → Quote → Bundle → Invoice; kein Payment-Step |
| Frontend Wizard | `NewBookingView.tsx`, `BookingWizardStepper.tsx` | UI-Flow ohne Checkout |

**Später:** Payment-Flow muss `BookingPriceSnapshot.totalDueNowCents` / `OrgInvoice.outstandingCents` als Quelle nutzen — **nicht** `BillingSubscription` oder Stripe Billing APIs.

---

## Outbound Email

- Modul: `backend/src/modules/outbound-email/`
- Provider: Resend (`RESEND_API_KEY`), nicht Stripe
- Keine Überschneidung mit Billing/Payments außer gemeinsamer Org-Kontext

## Auth / Permissions

- `PermissionsGuard` + `@RequirePermission('billing', 'read'|'write')` auf Billing-Routen
- Org-Scoping via `resolveOrgScope()` in `billing-scope.util.ts`
- Zukünftige Payments-Routen brauchen **eigene** Permissions (z. B. `payments`), nicht `billing` wiederverwenden

## Frontend Billing UI (SynqDrive-Abo only)

| Surface | Pfad |
|---------|------|
| Tenant Settings | `frontend/src/rental/components/billing/BillingTab.tsx` |
| Stripe Actions | `useBillingStripeActions.ts`, `billing-stripe-ui.ts` |
| Master Admin | `frontend/src/master/components/billing/` |

---

## Baseline-Befehle & Ergebnisse (2026-07-14)

Ausgeführt in Cloud-Agent-Workspace auf Branch `cursor/stripe-connect-baseline-c2c2`.

| Prüfung | Befehl | Ergebnis |
|---------|--------|----------|
| Backend Typecheck | `cd backend && npx tsc --noEmit -p tsconfig.json` | **PASS** (exit 0) |
| Frontend Typecheck | `cd frontend && npx tsc -b` | **PASS** (exit 0) |
| Backend Lint (scoped) | `cd backend && npm run lint` | **PASS** mit 1 Warning |
| Backend Lint (all) | `cd backend && npm run lint:all` | **FAIL** — 5 errors, 6 warnings |
| Frontend Lint (scoped) | `cd frontend && npm run lint` | **PASS** (exit 0) |
| Frontend Lint (all) | `cd frontend && npm run lint:all` | **FAIL** — 1129 errors, 44 warnings |
| Backend Unit Tests | `cd backend && npm test` | **PASS** — 267 suites, 2291 tests (4 skipped) |
| Frontend Unit Tests | `cd frontend && npm test` | **FAIL** — 1 test failed (913 passed, 1 skipped) |
| Backend E2E | `cd backend && npm run test:e2e` | **PASS** — 4 tests (document-extraction) |
| Backend Build | `cd backend && npm run build` | **PASS** |
| Frontend Build | `cd frontend && npm run build` | **PASS** (chunk size warning) |
| Prisma Validate | `cd backend && npm run prisma:validate` | **PASS** mit 1 Schema-Warning (`SetNull` on required FK) |

### Hinweise zu nicht ausgeführten Integrationstests

Live/Integration-Specs (opt-in via Env):

- `document-extraction.live.integration.spec.ts` — `DOCUMENT_EXTRACTION_LIVE_INTEGRATION=1`
- `notification-evaluation.live.integration.spec.ts`
- `clickhouse-diagnostics.integration.spec.ts`

Diese wurden in der Baseline **nicht** ausgeführt (kein Live-Env).

---

## Bestehende Fehler (vor Implementierung — Regression-Baseline)

### Backend `lint:all` (5 errors)

| Datei | Regel |
|-------|-------|
| `rental-driving-analysis.service.ts:99` | `prefer-const` (`hintTrips`) |
| `stations.service.ts:21-22` | `@typescript-eslint/no-empty-object-type` |
| `trip-analytics-canonical.service.ts:48` | `@typescript-eslint/no-empty-object-type` |
| `trip-behavior-enrichment.service.ts:776` | `prefer-const` (`allAbuse`) |

### Frontend `lint:all` (1129 errors)

Umfangreiche bestehende ESLint-Probleme im gesamten Frontend; scoped lint (document-extraction/ai-upload) ist grün.

### Frontend Unit Test (1 failure)

```
dashboardAttentionBuilder.test.ts
> merges generic and specific service overdue into one attention item
Expected title to contain '117 Tagen', received 'Service überfällig — KS MX 2024'
```

### Prisma Validate (Warning, kein Fail)

- `onDelete: SetNull` auf required FK — siehe Prisma-Dokumentation

### Build-Warnings (kein Fail)

- Frontend: Bundle > 1500 kB (`index-DFbGHSbR.js`)
- Backend tests: PDF worker warning in `DocumentTextExtractorService` spec

---

## Stripe MCP (lesend, 2026-07-14)

| Check | Ergebnis |
|-------|----------|
| Server-Status | **ready** |
| Account | `SynqDrive Sandbox` (`acct_1Tnz17KTcW1K1ahf`) |
| Connect-Doku (lesend) | Application Fees via `application_fee_amount`; Marketplace = Platform als MoR; getrennt von SaaS Direct Charges |

Keine Stripe-Objekte erstellt. Keine Dashboard-Konfiguration geändert.

---

## ADR-Struktur

**Keine** Architecture Decision Record-Struktur im Repository (kein `docs/adr/`, keine ADR-Templates). Es wurde **kein** ADR angelegt — nur dieses beschreibende Architektur-Dokument im bestehenden `architecture/`-Ordner.

---

## Nächste Schritte (nicht Teil dieses Schritts)

1. `modules/payments` als eigenständiges NestJS-Modul anlegen
2. Prisma-Modelle für Connect Connected Accounts (org-scoped)
3. Separater Webhook-Endpoint (nicht `/webhooks/stripe` für Billing mischen)
4. Checkout/PaymentIntent-Flow an Booking Wizard / OrgInvoice anbinden
5. Eigene Frontend-Oberfläche für Endkunden-Checkout (nicht BillingTab)
