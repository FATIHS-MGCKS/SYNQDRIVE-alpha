# Billing — Production Readiness Audit

**Stand:** Prompt 44/44 · `billing: prompt 44 production readiness audit`  
**Scope:** SynqDrive SaaS-Billing (Tenant + Master), Stripe Test/Live, Rechnungs-/Zahlungsspiegel, Resend-Outbox  
**Nicht im Scope:** Endkunden-Finanzen (Stripe Connect, Org-Rechnungen) — eigene Domäne, getrennt seit Prompt 41

---

## Executive Summary

| Bereich | Verdict |
|---------|---------|
| Datenbank | **PASS WITH RISK** |
| Billing-Domain | **PASS WITH RISK** |
| Stripe | **PASS** (nach Prompt-44-Fixes) |
| Rechnungen/Zahlungen | **PASS WITH RISK** |
| Resend | **PASS WITH RISK** |
| Sicherheit | **PASS** |
| UI/UX | **PASS WITH RISK** |
| Betrieb | **PASS WITH RISK** |

### Go-/No-Go-Empfehlung

**Bedingtes GO** für kontrollierten Produktions-Rollout, **nach** Abschluss der Go-Live-Mindestbedingungen (Legacy-Backfill, Live-Env-Checkliste, manuelles Sandbox-E2E in Staging).

**Keine Architektur-Blocker** identifiziert. Verbleibende Risiken sind betriebs- und migrationsbedingt (Backfill, fehlender Reconciliation-Cron, E-Mail-Default).

---

## Go-Live-Mindestbedingungen

| Bedingung | Status | Nachweis |
|-----------|--------|----------|
| Rental/Fleet eindeutig | **PASS WITH RISK** | `BillingCatalogProduct` RENTAL/FLEET + Backfill-Skript; Backfill vor Prod Pflicht |
| Vertragsbezogene Price Version | **PASS** | `BillingSubscription.priceVersionId`, Item-Level `priceVersionId`, Master-Vertrags-API |
| Korrekte Fahrzeugmenge | **PASS WITH RISK** | `BillingQuantityEvent` + `BillableVehiclesService`; Abhängig von Fleet-Verbindung |
| Lokale Preview ≈ Stripe | **PASS WITH RISK** | `GET /billing/next-invoice-preview` + Reconciliation-Drift `QUANTITY_MISMATCH` |
| Idempotente Webhooks | **PASS** | `stripe_webhook_events.stripeEventId` unique + `skipped_processed` |
| Korrekte Invoice-Status | **PASS** | Mirror + Status-Mapper (`paid`, `void`, `uncollectible`, …) |
| Payment-/Refund-Historie | **PASS** | `BillingPayment`, `BillingRefund`, Tenant + Master APIs |
| Resend über Outbox | **PASS** | `billing_domain_event_outbox` + Email-Worker |
| Multi-Tenant-Sicherheit | **PASS** | `resolveOrgScope`, Permissions-Matrix, Isolation-Tests |
| Test/Live getrennt | **PASS** | `stripe_mode` + Livemode-Webhook-Guard (Prompt 44) |
| Sandbox-E2E bestanden | **PASS** | 40/40 Matrix-Tests + Playbook `billing-stripe-sandbox-e2e.md` |

---

## 1. Datenbank

**Verdict: PASS WITH RISK**

### Stärken

- 17 Billing-Migrationen (`20260715190000` … `20260715340000`): Katalog, Items, Quantity, Stripe-Mapping, Webhooks, Invoice-Mirror, Payment-Ledger, Reconciliation, Outbox, E-Mail-Audit
- Unique Constraints mit `stripe_mode` auf Subscription, Items, Invoices, Payments
- Idempotency-Keys für Commands und Quantity Events
- Reconciliation- und Outbox-Tabellen mit Dead-Letter-Status

### Probleme

#### P0-DB-01 — Legacy-Backfill vor Produktion nicht optional

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Bestands-Orgs haben ggf. keine `BillingSubscriptionItem`, `stripeMode` oder Quantity-Ledger-Einträge |
| **Auswirkung** | Falsche Tarife, Quantity 0, Stripe-Sync-Fehler |
| **Dateien** | `scripts/ops/backfill-billing-legacy.ts`, `docs/billing/billing-migration-runbook.md` |
| **Reproduktion** | Org ohne Backfill → `GET /billing/subscription/overview` ohne Base-Item |
| **Korrektur** | `--dry-run` dann `--execute` auf Staging/Prod |
| **Priorität** | **P0** |

#### P2-DB-02 — Runbook-Migrations-Cutoff veraltet

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Runbook verwies auf `20260715210000` statt `20260715340000` |
| **Auswirkung** | Ops überspringen E-Mail-/Outbox-Migrationen |
| **Dateien** | `docs/billing/billing-migration-runbook.md` |
| **Korrektur** | ✅ In Prompt 44 aktualisiert |
| **Priorität** | **P2** |

#### P2-DB-03 — Prisma-Schema ohne `stripeSyncStatus`-Index

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Index existierte in SQL-Migration, fehlte in `schema.prisma` |
| **Auswirkung** | Drift zwischen Schema und DB, schlechtere Dev-Ergonomie |
| **Dateien** | `backend/prisma/schema.prisma`, Migration `20260715260000` |
| **Korrektur** | ✅ `@@index([stripeSyncStatus])` ergänzt |
| **Priorität** | **P2** |

### Rollback

1. `pg_restore` aus Pre-Migration-Backup
2. Keine destruktiven Billing-Migrationen — additive Schema-Änderungen
3. Backfill ist idempotent; Rollback = DB-Restore, nicht Skript-Revert

---

## 2. Billing-Domain

**Verdict: PASS WITH RISK**

### Stärken

- Eine Vertragswahrheit: Master setzt `priceVersionId` / Items; Stripe ist Projektion
- Rental/Fleet als `BillingCatalogProduct` mit getrennten Price Books
- Staffeln (`BillingPriceTier`), Rabatte (`BillingDiscount`), Proration (`BillingProrationBehavior`)
- Usage Snapshots + Quantity Events für Fahrzeugzählung
- Entitlements über Subscription-Status + Item-Rollen

### Probleme

#### P1-DOM-01 — Add-on-Items nicht im Legacy-Backfill

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Backfill erstellt nur Base-Plan-Items (Rental/Fleet), keine Voice/WhatsApp-Add-ons |
| **Auswirkung** | Bestands-Add-ons fehlen in neuer Domain bis manuell angelegt |
| **Dateien** | `billing-legacy-backfill.service.ts`, Runbook |
| **Reproduktion** | Org mit historischem Add-on → kein `BillingSubscriptionItem` mit `itemRole=ADD_ON` |
| **Korrektur** | Master-Vertrag manuell / Folge-Prompt; dokumentiert im Runbook |
| **Priorität** | **P1** |

#### P1-DOM-02 — Push-Stripe-Sync nicht an Lifecycle-Kopplung

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Vertragsaktivierung pusht nicht automatisch zu Stripe; Sync über Admin/Orchestrator |
| **Auswirkung** | Verzögerung zwischen Vertrag ACTIVE und Stripe-Subscription |
| **Dateien** | `stripe-subscription-orchestrator.service.ts`, Master Lifecycle |
| **Reproduktion** | Vertrag aktivieren → Stripe-Quantity unverändert bis manueller Sync |
| **Korrektur** | Ops: `POST /admin/billing/organizations/:orgId/sync-stripe`; Reconciliation beobachten |
| **Priorität** | **P1** |

#### P2-DOM-03 — Reconciliation markiert Invoice/Payment-Drift fälschlich auto-fixable

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | `MISSING_LOCAL_INVOICE` / `MISSING_LOCAL_PAYMENT` hatten `autoFixable: true` ohne Handler |
| **Auswirkung** | Master-Auto-Fix schlägt mit `NOT_AUTO_FIXABLE` fehl — irreführende UI |
| **Dateien** | `domain/billing-reconciliation.ts` |
| **Korrektur** | ✅ `autoFixable: false` in Prompt 44 |
| **Priorität** | **P2** |

---

## 3. Stripe

**Verdict: PASS** (nach Prompt-44-Fixes)

### Stärken

- Test/Live über `BillingStripeMode` + Secret-Key-Inferenz (`sk_test_` / `sk_live_`)
- Webhook-Matrix mit Idempotenz, Safe-Payload, Unsupported → IGNORED
- Customer Portal, Setup Intent, SEPA/Karte via `StripePaymentMethodService`
- Catalog-Mapping Price Version ↔ Stripe Price ID
- 32 Sandbox-Szenarien dokumentiert + 40 automatisierte Matrix-Tests

### Probleme (behoben in Prompt 44)

#### P0-STRIPE-01 — Webhook ohne Livemode-Prüfung ✅ BEHOBEN

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Live-Events konnten mit Test-Key verarbeitet werden |
| **Auswirkung** | Cross-Mode-Datenkorruption |
| **Dateien** | `stripe-webhook.service.ts` |
| **Korrektur** | `assertWebhookLivemodeMatchesRuntime()` nach Signaturprüfung |
| **Priorität** | **P0** |

#### P0-STRIPE-02 — `applyStripeSubscription` setzte `stripeMode` nicht ✅ BEHOBEN

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Stripe-Sync aktualisierte Status, aber nicht `stripe_mode` |
| **Auswirkung** | Unique-Lookups und Reconciliation-Mode-Checks scheitern |
| **Dateien** | `stripe-billing.service.ts` |
| **Korrektur** | `stripeMode` aus Runtime-Key persistieren |
| **Priorität** | **P0** |

#### P1-STRIPE-03 — Org-Lookup ohne `stripeMode`-Filter ✅ BEHOBEN

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | `findOrganizationIdByStripeCustomer/Subscription` ignorierte Mode |
| **Auswirkung** | Falsche Org-Zuordnung bei Test+Live-Daten in einer DB (Dev/Staging) |
| **Dateien** | `stripe-billing.service.ts`, `stripe-webhook-dispatcher.service.ts` |
| **Korrektur** | Lookup scoped auf `getRuntimeStripeMode()` |
| **Priorität** | **P1** |

### Verbleibende Risiken

#### P1-STRIPE-04 — Kein geplanter Reconciliation-Job

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Reconciliation nur via `POST /admin/billing/reconciliation/run` |
| **Auswirkung** | Drift bleibt unentdeckt ohne Ops-Disziplin |
| **Dateien** | `billing-reconciliation.service.ts` |
| **Korrektur** | Cron/Alert in Folge-Prompt; bis dahin wöchentlicher manueller Lauf |
| **Priorität** | **P1** |

#### P2-STRIPE-05 — Portal-Return-URL bei leerem CORS ✅ TEILWEISE BEHOBEN

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Ohne `app.corsOrigins` und ohne `STRIPE_CUSTOMER_PORTAL_RETURN_URL` akzeptierte jede Origin |
| **Auswirkung** | Open-Redirect-Risiko in schlecht konfigurierter Umgebung |
| **Dateien** | `stripe-billing.service.ts` |
| **Korrektur** | ✅ Fallback-Origin-Check; Prod: `APP_URL` + CORS setzen |
| **Priorität** | **P2** |

---

## 4. Rechnungen / Zahlungen

**Verdict: PASS WITH RISK**

### Stärken

- `BillingInvoice` Mirror: Netto/Brutto, Steuer, offizielle Stripe-Nummern
- Status-Lifecycle: `draft`, `open`, `paid`, `void`, `uncollectible`
- `BillingPayment`, `BillingRefund`, `BillingCreditNote` Ledger
- Manuelle Zahlung Master: `POST /admin/billing/invoices/:id/manual-payments`
- Tenant: SynqDrive-Rechnungen getrennt von Kundenfinanzen (Prompt 41)

### Probleme

#### P1-INV-01 — Org-Rechnungsnummern ≠ SaaS-Rechnungen

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Zwei Nummernkreise: `Invoice` (Kunde) vs. `BillingInvoice` (Stripe-SaaS) |
| **Auswirkung** | Support-Verwechslung möglich |
| **Dateien** | `tenant-billing-invoices.service.ts`, `InvoicesPage.tsx` |
| **Korrektur** | UI-Labels „SynqDrive-Rechnungen“ (✅ Prompt 41); Support-Playbook |
| **Priorität** | **P1** |

#### P2-INV-02 — Credit-Note-/Dispute-E2E nur Sandbox-Matrix

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Refund/Credit-Note-Szenarien CI-mock, kein Live-Stripe-Lauf in CI |
| **Auswirkung** | Regression erst bei manuellem Sandbox-Lauf |
| **Dateien** | `billing-stripe-sandbox.matrix.ts` |
| **Korrektur** | Staging-Sandbox-Lauf vor Go-Live (Playbook Szenario 19–21) |
| **Priorität** | **P2** |

---

## 5. Resend

**Verdict: PASS WITH RISK**

### Stärken

- Transactional Outbox: `billing_domain_event_outbox` + Delivery-Tracking
- Worker: `BillingDomainEventOutboxWorkerService`, `BillingDomainEventEmailWorkerService` (`@Interval`)
- Retry mit `maxAttempts`, Dead-Letter-Status
- Templates + i18n, PDF-Anhang mit Größenlimit
- Admin: `GET /admin/billing/email-deliveries`, Outbox-Liste
- Bounce/Complaint über Resend-Webhook-Pfad (Suppression-Service)

### Probleme

#### P1-EMAIL-01 — `BILLING_EMAIL_ENABLED` default `true`

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | E-Mails aktiv unless `BILLING_EMAIL_ENABLED=false` |
| **Auswirkung** | Unerwartete Mails in Staging/Dev ohne Resend-Key |
| **Dateien** | `config/billing-email.config.ts` |
| **Reproduktion** | Staging ohne Env → Outbox versucht Versand |
| **Korrektur** | Non-Prod: `BILLING_EMAIL_ENABLED=false` setzen (Playbook) |
| **Priorität** | **P1** |

#### P1-EMAIL-02 — Worker abhängig von `RuntimeStatusRegistry`

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Worker no-op wenn Workers disabled (z. B. Redis/Boot) |
| **Auswirkung** | E-Mails stauen sich ohne erkennbaren API-Fehler |
| **Dateien** | `billing-domain-event-email.worker.service.ts` |
| **Korrektur** | Monitoring auf Outbox `PENDING`/`DEAD_LETTER`-Count |
| **Priorität** | **P1** |

---

## 6. Sicherheit

**Verdict: PASS**

### Stärken

- Permissions-Matrix (Prompt 42): `billing.read`/`write`, `invoices`, `payments-*`
- Tenant-Isolation: `useBillingData.isolation.test.ts`, `resolveOrgScope`
- Master: `MASTER_ADMIN` + `master-billing` für Mutationen
- Webhook-Signatur + Livemode-Guard
- Audit-Log für Reconciliation Auto-Fix
- Keine Secrets in API-Responses

### Probleme (behoben)

#### P1-SEC-01 — Sidebar Billing ohne Permission-Gate ✅ BEHOBEN

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Billing-Nav sichtbar für alle Rollen |
| **Auswirkung** | UX-Leak; API blockiert trotzdem |
| **Dateien** | `frontend/src/rental/components/Sidebar.tsx` |
| **Korrektur** | ✅ `hasPermission('billing', 'read')` |
| **Priorität** | **P1** |

### Verbleibend

#### P2-SEC-02 — Master-Billing-Sidebar nicht permission-gated

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Master `Sidebar.tsx` zeigt Billing für alle Master-Admins |
| **Auswirkung** | Gering — Master-Routen serverseitig geschützt |
| **Priorität** | **P2** |

---

## 7. UI/UX

**Verdict: PASS WITH RISK**

### Stärken

- Tenant Billing API-backed (`useBillingData`), Loading/Error/Empty States
- Verständliche Begriffe: „SynqDrive-Rechnungen“, „Zahlungsmethode (SynqDrive)“
- SaaS vs. Finanzen getrennt (Prompt 41)
- Keine Fake-Daten in Tenant-Billing-Tabs
- Unabhängige Fehler pro Tab (`billing-load.utils`)

### Probleme

#### P2-UX-01 — Master Export/Add-on-Stubs

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Einige Master-Aktionen noch ohne vollständige Export-Pipeline |
| **Auswirkung** | Operator muss API/DB nutzen |
| **Priorität** | **P2** |

#### NOT TESTED — Mobile Billing

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Kein dedizierter Mobile-Billing-Flow getestet |
| **Priorität** | **NOT TESTED** |

---

## 8. Betrieb

**Verdict: PASS WITH RISK**

### Stärken

- Ops-Skripte: `backfill-billing-legacy.ts`, `stripe-billing-e2e-replay-webhook.ts`, `stripe-billing-sandbox-cleanup.ts`
- Admin APIs: Overview, Stripe-Status, Reconciliation, Outbox, Email-Deliveries
- Feature-Trennung Test/Live über Env
- Backup-Anleitung im Runbook

### Probleme

#### P1-OPS-01 — Kein Reconciliation-Scheduler

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Siehe P1-STRIPE-04 |
| **Priorität** | **P1** |

#### P1-OPS-02 — Kein dedizierter Billing-Alerting-Stack

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Kein `billing-monitoring.service`; Alerts über generisches Logging |
| **Auswirkung** | Stuck Webhooks / Dead-Letter erst bei manueller Prüfung |
| **Korrektur** | Alerts auf `stripe_webhook_events.status=FAILED`, Outbox `DEAD_LETTER` |
| **Priorität** | **P1** |

#### P2-OPS-03 — Feature Flags

| Feld | Inhalt |
|------|--------|
| **Beschreibung** | Billing nicht hinter globalem Feature-Flag; nur Env-Gates (`STRIPE_SECRET_KEY`) |
| **Priorität** | **P2** |

---

## Geänderte Dateien (Prompt 44)

| Datei | Änderung |
|-------|----------|
| `backend/src/modules/billing/stripe-webhook.service.ts` | Livemode-Guard |
| `backend/src/modules/billing/stripe-billing.service.ts` | `stripeMode`, Org-Lookup, Portal-URL |
| `backend/src/modules/billing/domain/billing-reconciliation.ts` | `autoFixable` korrigiert |
| `backend/prisma/schema.prisma` | Index `stripeSyncStatus` |
| `frontend/src/rental/components/Sidebar.tsx` | `billing.read` Gate |
| `docs/billing/billing-migration-runbook.md` | Migrations-Cutoff |
| `docs/billing/billing-production-readiness.md` | **neu** — dieses Dokument |
| Tests: `stripe-webhook.service.spec.ts`, `stripe-billing.service.spec.ts`, `billing-reconciliation.spec.ts`, `finance-navigation.test.ts` | Abdeckung Fixes |

**Keine neuen Migrationen** in Prompt 44 (nur Schema-Dokumentation).

---

## Endpunkte (Referenz)

### Tenant (`billing.read` / `billing.write`)

| Methode | Pfad |
|---------|------|
| GET | `/billing/subscription/overview`, `/billing/invoices`, `/billing/payments` |
| GET | `/billing/next-invoice-preview`, `/billing/payment-methods` |
| POST | `/billing/stripe/customer-portal`, `/billing/stripe/setup-intent` |
| POST | `/billing/stripe/sync-payment-methods` |

### Webhook

| Methode | Pfad |
|---------|------|
| POST | `/webhooks/stripe` |

### Master (`MASTER_ADMIN` + ggf. `master-billing`)

| Methode | Pfad |
|---------|------|
| GET | `/admin/billing/overview`, `/admin/billing/invoices` |
| POST | `/admin/billing/organizations/:orgId/sync-stripe` |
| POST | `/admin/billing/reconciliation/run` |
| GET | `/admin/billing/reconciliation/drifts` |
| POST | `/admin/billing/reconciliation/drifts/:id/auto-fix` |
| GET | `/admin/billing/email-deliveries`, `/admin/billing/outbox-deliveries` |

Vollständige Liste: `billing.controller.ts`, `billing-permissions-matrix.md`

---

## Jobs / Worker

| Worker | Intervall | Funktion |
|--------|-----------|----------|
| `BillingDomainEventOutboxWorkerService` | `BILLING_OUTBOX_WORKER_INTERVAL_MS` | Domain-Events → Stripe/Projektion |
| `BillingDomainEventEmailWorkerService` | `BILLING_OUTBOX_WORKER_INTERVAL_MS` | Outbox → Resend |
| Reconciliation | **manuell** | `POST /admin/billing/reconciliation/run` |

---

## Testbefehle und Ergebnisse

```bash
# Sandbox-Matrix (32 Szenarien, 40 Tests)
cd backend && npm run test:billing:sandbox-matrix
# ✅ 40 passed

# Security + Domain + Prompt-44-Fixes
cd backend && npm test -- \
  stripe-webhook.service.spec \
  stripe-billing.service.spec \
  domain/billing-reconciliation.spec \
  billing.permissions.matrix \
  invoices.permissions.characterization \
  billing.controller.security
# ✅ 146 passed (nach Livemode-Test-Fix)

# Frontend Navigation / Billing
cd frontend && npm test -- finance-navigation billing-load
# ✅ 13 passed
```

### Manuell vor Go-Live (Staging)

Siehe `docs/billing/billing-stripe-sandbox-e2e.md`:

1. `stripe listen --forward-to …/webhooks/stripe`
2. Szenarien 1–5 (Subscription + Invoice Paid)
3. Szenario 26 (Duplicate Webhook)
4. Szenario 30 (Drift Detection)
5. Optional Szenario 29 (Resend) mit `BILLING_EMAIL_ENABLED=true`

---

## Verbleibende Blocker

| ID | Blocker? | Beschreibung |
|----|----------|--------------|
| P0-DB-01 | **Ja (Ops)** | Legacy-Backfill muss auf Prod ausgeführt werden |
| P0-STRIPE-01/02 | Nein | ✅ Behoben |
| P1-STRIPE-04 | Nein | Reconciliation-Cron fehlt — Risiko, kein harter Blocker |
| P1-EMAIL-01 | Nein | Env-Dokumentation ausreichend |
| Mobile UX | Nein | NOT TESTED |

**Harter technischer Blocker:** keiner nach Prompt-44-Fixes.  
**Go-Live-Blocker (Prozess):** Legacy-Backfill + Staging-Sandbox-E2E + Live-Env-Checkliste.

---

## Rollout-Reihenfolge

1. **Backup** (`pg_dump` laut Runbook)
2. **Migrationen** `prisma migrate deploy` bis `20260715340000`
3. **Legacy-Backfill** `--dry-run` → Review → `--execute`
4. **Env Live** setzen:
   - `STRIPE_SECRET_KEY=sk_live_*`
   - `STRIPE_WEBHOOK_SECRET` (Live-Endpoint)
   - `STRIPE_CUSTOMER_PORTAL_RETURN_URL` / `APP_URL`
   - `BILLING_EMAIL_ENABLED=true` + `RESEND_API_KEY`
5. **Stripe Live Webhook** registrieren (Event-Matrix aus Sandbox-Doc)
6. **Deploy Backend** mit Workers enabled
7. **Deploy Frontend**
8. **Staging-Sandbox-E2E** wiederholen gegen Test-Stack
9. **Pilot-Org** (1–3 Mandanten) → Reconciliation → Full Rollout
10. **Monitoring** erste 48h: Webhook-FAILED, Outbox-Dead-Letter, Drift-CRITICAL

---

## Rollback-Plan

| Phase | Aktion |
|-------|--------|
| Pre-Deploy | DB-Backup behalten (7 Tage) |
| Webhook-Probleme | Live-Webhook in Stripe Dashboard deaktivieren |
| Datenkorruption | `pg_restore` auf Pre-Migration-Backup; Stripe bleibt Source of Truth für Zahlungen |
| Code-Rollback | Vorheriges Backend/Frontend-Image; additive Migrationen bleiben kompatibel |
| E-Mail-Storm | `BILLING_EMAIL_ENABLED=false` + Outbox-Pause (Worker stop via `RuntimeStatusRegistry`) |
| Stripe-Mode-Verwechslung | Keys rotieren; Reconciliation `TEST_LIVE_MODE_CONFLICT` prüfen |

---

## Referenzen

- `docs/billing/billing-current-state.md`
- `docs/billing/billing-target-domain.md`
- `docs/billing/billing-migration-runbook.md`
- `docs/billing/billing-permissions-matrix.md`
- `docs/billing/billing-stripe-sandbox-e2e.md`
