# Master Admin — Stripe Live Readiness Preflight (MA-BILL-P0-001)

| Feld | Wert |
|------|------|
| **Finding-ID** | `MA-BILL-P0-001` |
| **Modus** | Read-only Preflight — **keine Stripe-/DB-Mutationen** |
| **Datum (UTC)** | 2026-08-18 |
| **Production Release** | `20260818205259_v4994` (`929a16cf`) |
| **Preflight-Status** | **Superseded by sandbox closure** — see `docs/final/master-admin-stripe-sandbox-canonicalization-closure.md` |
| **Operator Decision** | **Stripe Live cutover intentionally deferred** until full SynqDrive software go-live readiness |

---

## Operator Decision (2026-08-18)

`Stripe Live Cutover intentionally deferred until full SynqDrive software go-live readiness.`

The state `NOT READY FOR LIVE CUTOVER` is **not** a current production defect while sandbox operation is deliberate. It remains the **future go-live gate** (G1–G10). Sandbox acceptance S1–S10 passed in `docs/final/master-admin-stripe-sandbox-canonicalization-closure.md`.

**MA-BILL-P0-001:** **CLOSED FOR CURRENT SANDBOX OPERATING MODE** (not “Stripe Live production-ready”).

SynqDrive Production läuft **bewusst im Stripe-TEST-Modus** (`runtime=TEST`, `STRIPE_ALLOW_TEST_IN_PRODUCTION=true`, `STRIPE_ENVIRONMENT=test`). Die technische Billing-Remediation (Environment Guards, Webhook-Livemode-Checks, Reconciliation Engine, Catalog-Schema) ist im Code vorhanden und deployt — **ein kontrollierter Live-Cutover ist jedoch nicht möglich**.

**Kernblocker (read-only nachgewiesen):**

| Blocker | Evidenz |
|---------|---------|
| Kein Live-Betrieb | `STRIPE_SECRET_KEY` = **TEST**; Boot-Log: `runtime=TEST nodeEnv=production` |
| Billing-Webhook nicht produktionsfähig | `STRIPE_WEBHOOK_SECRET` = **MISSING**; 0 Billing-Webhook-Events in DB (90d) |
| Gemischter Environment-State | 1 lokale Subscription mit `stripe_mode=LIVE` bei TEST-Runtime → offener Drift `TEST_LIVE_MODE_CONFLICT` (CRITICAL) |
| Keine Stripe-Katalog-Mappings | `billing_stripe_catalog_mappings` = **0**, `billing_stripe_price_mappings` = **0** |
| TRIALING ohne Stripe-Subscription | 1× `TRIALING`, `stripe_customer_id` ja, `stripe_subscription_id` nein → `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE` |
| Live-Ressourcen nicht verifizierbar | Kein `sk_live_*` verfügbar — Live Products/Prices/Webhooks nicht read-only prüfbar |

**Finale Preflight-Entscheidung:** **NOT READY FOR LIVE CUTOVER**

**MA-BILL-P0-001:** bleibt **OPEN** (kein Closure in diesem Task).

---

## 2. Production Baseline

| Feld | Wert |
|------|------|
| **Deployed SHA / Release** | `929a16cf` / `20260818205259_v4994` |
| **NODE_ENV** | `production` |
| **Stripe Runtime (Secret Key)** | **TEST** (`sk_test_*`) |
| **STRIPE_ENVIRONMENT** | `test` (explizit gesetzt) |
| **STRIPE_ALLOW_TEST_IN_PRODUCTION** | `true` (Sandbox-Escape-Hatch aktiv) |
| **STRIPE_SECRET_KEY** | **TEST** |
| **STRIPE_WEBHOOK_SECRET** (Billing SaaS) | **MISSING** |
| **STRIPE_CONNECT_WEBHOOK_SECRET** | **WEBHOOK_SECRET_SET** |
| **Frontend Publishable Key** | **MISSING** (kein `pk_*` in `frontend.env` — korrekt, Backend-only-Architektur) |
| **Stripe Account Context (API)** | Testmode (`livemode:false` auf allen MCP-read Ressourcen) |
| **Stripe Connect** | Separater Webhook `/api/v1/webhooks/stripe-connect`; Connect-Secret gesetzt |
| **Catalog Mappings (DB)** | 0 Zeilen in `billing_stripe_catalog_mappings` und `billing_stripe_price_mappings` |
| **Reconciliation Scheduler** | Aktiv (6h); letzte Runs `COMPLETED`, `stripe_mode=TEST`, je 2 Drifts |
| **Billing Workers** | PM2 `synqdrive` online; `BillingReconciliationScheduler` in Code |
| **Boot Evidence** | `Stripe environment locked: runtime=TEST nodeEnv=production` (PM2 logs 2026-08-18) |

**Rollback-Ziel (aktuell):** Release `20260818205259_v4994` — Stripe TEST Sandbox-Konfiguration.

---

## 3. Environment Matrix

| Komponente | Environment | Bewertung |
|------------|-------------|-----------|
| Backend Stripe Client | **TEST** | Konsistent mit Secret Key |
| `STRIPE_ENVIRONMENT` Guard | **TEST** | Explizit `test` — würde `sk_live_*` mit `STRIPE_EXPLICIT_ENV_MISMATCH` blockieren |
| Frontend | **N/A** | Kein Stripe.js / kein Publishable Key (by design) |
| Billing Webhook Ingest | **MISSING** | Kein Signing Secret → Endpoint nicht betriebsfähig |
| Connect Webhook | **TEST** | Secret gesetzt; Stripe-Endpoint `livemode:false` |
| DB `billing_subscriptions.stripe_mode` | **MIXED** | 1× LIVE bei TEST-Runtime |
| Catalog Mappings | **MISSING** | 0 Mappings für TEST oder LIVE |
| Reconciliation Engine | **TEST** | Runs mit `stripe_mode=TEST` |
| Stripe API (aktueller Key) | **TEST** | Alle Ressourcen `livemode:false` |
| Live Stripe Account | **NOT VERIFIED** | Kein Live-Secret verfügbar |

**P0-Cutover-Stop:** **MIXED** — lokale Subscription `stripe_mode=LIVE` bei TEST-Runtime.

---

## 4. Account Readiness

| Check | TEST (verifiziert) | LIVE (verifiziert) |
|-------|-------------------|-------------------|
| API erreichbar | **PASS** (MCP `GetProducts`, `GetCustomers`) | **NOT TESTABLE** (kein Live-Key) |
| Account Identity | Testmode-Ressourcen | Operator-Voraussetzung |
| Sperre/Blockade | Keine offensichtliche | Unbekannt |
| Webhook-Endpoints | 1 Connect-Endpoint aktiv | Nicht prüfbar |

**Hinweis:** Live-Account-Readiness ist **Operator-Voraussetzung** — nicht durch diesen Preflight belegt.

---

## 5. Products / Prices

### 5.1 Lokaler Katalog (DB)

| Product Key | Name | Role | Status |
|-------------|------|------|--------|
| `RENTAL` | SynqDrive Rental | BASE_PLAN | ACTIVE |
| `FLEET` | SynqDrive Fleet | BASE_PLAN | ACTIVE |
| `VOICE_AGENT` | Voice Agent | ADDON | ACTIVE |
| `AI_PACKAGE` | AI Package | ADDON | ACTIVE |
| `WHATSAPP` | WhatsApp | ADDON | ACTIVE |

**Mappings:** 0 Einträge in `billing_stripe_catalog_mappings` / `billing_stripe_price_mappings`.

### 5.2 Stripe TEST Inventory (read-only API)

| Ressource | Anzahl | livemode |
|-----------|--------|----------|
| Products | 1 | false |
| Prices | 2 | false |
| Customers | 9 | false |
| Subscriptions | 0 | — |
| Webhook Endpoints | 1 (Connect only) | false |

**Einzelnes TEST-Produkt:** „Rental Operation Staffelung 1“ mit monatlichem Recurring-Price (EUR 24,99) und One-Time-Price.

### 5.3 Mapping-Matrix (SynqDrive → Stripe)

| SynqDrive Plan | Local Mapping | Stripe TEST | Stripe LIVE | Status |
|----------------|---------------|-------------|-------------|--------|
| RENTAL | **MISSING** | Partial (1 Test-Produkt, nicht gemappt) | **NOT VERIFIED** | **LIVE RESOURCE MISSING** / **MISMATCH** |
| FLEET | **MISSING** | **MISSING** | **NOT VERIFIED** | **LIVE RESOURCE MISSING** |
| VOICE_AGENT | **MISSING** | **MISSING** | **NOT VERIFIED** | **LIVE RESOURCE MISSING** |
| AI_PACKAGE | **MISSING** | **MISSING** | **NOT VERIFIED** | **LIVE RESOURCE MISSING** |
| WHATSAPP | **MISSING** | **MISSING** | **NOT VERIFIED** | **LIVE RESOURCE MISSING** |

**Fahrzeugstaffeln:** Im Katalog als `PER_CONNECTED_VEHICLE` / Tier-Modell vorgesehen; keine veröffentlichten Price Versions mit Stripe-Mapping auf Production.

---

## 6. Customers

| Kategorie | Anzahl (Production DB) | Details |
|-----------|------------------------|---------|
| TEST-only mapping | 0 (explizit TEST) | — |
| LIVE mapping (lokal) | 1 | Org `F.S Mobility Service` — `stripe_customer_id` gesetzt, `stripe_mode=LIVE` |
| No mapping | 3 | Orgs ohne Billing-Subscription |
| Ambiguous/mixed | 1 | LIVE-mode Customer bei TEST-Runtime |
| Invalid reference | Nicht nachgewiesen | — |

**Stripe TEST:** 9 Customers (API); keine Zuordnung aller 9 zu Production-Orgs in diesem Preflight (keine Voll-ID-Enumeration).

**Regel:** Test-Customer-IDs dürfen nicht stillschweigend als Live interpretiert werden — aktuell ist Runtime TEST, lokaler Modus fälschlich LIVE.

---

## 7. Subscriptions

| Org (redigiert) | Local Status | stripe_mode | Customer | Stripe Sub | Klassifikation |
|-----------------|-------------|-------------|----------|------------|----------------|
| F.S Mobility Service | TRIALING | LIVE | yes | no | **MISMATCH** / **LOCAL ONLY** |
| Voice Staging E2E | NONE | NULL | no | no | **LOCAL ONLY** (nie billing-aktiv) |
| Data Auth PG Org A | NONE | NULL | no | no | **Testdaten** |
| Data Auth PG Org B | NONE | NULL | no | no | **Testdaten** |

**Stripe TEST API:** 0 Subscriptions.

**TRIALING orphan (MA-BILL-P0-001 Kontext):** 1 Organisation in `TRIALING` ohne `stripe_subscription_id` — konsistent mit offenem Reconciliation-Drift.

---

## 8. Webhooks

### 8.1 Stripe Dashboard (TEST, read-only)

| Endpoint | Environment | URL | Status | Events |
|----------|-------------|-----|--------|--------|
| Connect | **TEST** | `https://app.synqdrive.eu/api/v1/webhooks/stripe-connect` | enabled | account.updated, checkout.*, payment_intent.*, charge.refunded, dispute.* |
| Billing SaaS | **NOT CONFIGURED** | — | — | — |

### 8.2 Application Runtime

| Endpoint | Secret | DB Events (90d) | Delivery Health |
|----------|--------|-----------------|-----------------|
| `/api/v1/webhooks/stripe` | **MISSING** | 0 | **NOT CONFIGURED** |
| `/api/v1/webhooks/stripe-connect` | **SET** | Nicht in `stripe_webhook_events` (Connect nutzt separate Tabelle) | **TEST: DEGRADED/UNKNOWN** (keine Billing-Events) |

### 8.3 Event Contract (Repository)

24 Billing-Event-Typen in `stripe-webhook-matrix.ts` — Subscription, Invoice, PaymentIntent, SetupIntent, PaymentMethod, Refund, Dispute, Customer.

| Event-Klasse | Handler | Side Effect | Idempotency |
|--------------|---------|-------------|-------------|
| `customer.subscription.*` | Dispatcher → Mirror/Sync | Lokale Subscription/Items | `stripeEventId` unique + payload hash |
| `invoice.*` | Invoice Mirror | Invoice/Payment State | Idempotent ingest |
| `payment_intent.*` | Payment Ledger | Zahlungsstatus | Idempotent ingest |
| `payment_method.*` | PM Service | PM Sync | Idempotent ingest |

**Livemode Guard:** `assertStripeWebhookLivemodeMatchesRuntime()` — Test-Events werden bei LIVE-Runtime abgewiesen und umgekehrt.

---

## 9. Source of Truth

| Domäne | Kanonische Quelle | Frontend |
|--------|-------------------|----------|
| Subscription Lifecycle | `billing_subscriptions` + Stripe Mirror | Master Admin Billing Ops API |
| Payment Health | `BillingPayment` + Stripe | Backend API only |
| Trial / Cancellation | Domain + Webhook Mirror | Kein lokaler Shadow-State im Frontend |
| Invoice State | `billing_invoices` + Stripe Mirror | Backend API |
| Reconciliation | `billing_reconciliation_drifts` | Master Admin Reconciliation Tab |

**Bewertung:** Architektur korrekt — **Production-Daten sind nicht live-konsistent** (offene Drifts).

---

## 10. Reconciliation Dry Run

### 10.1 Methodik

- **Kein** `POST /admin/billing/reconciliation/run` ausgeführt (würde DB-Writes in `billing_reconciliation_runs` / `billing_reconciliation_drifts` erzeugen).
- **Read-only Evidenz:** bestehende offene Drifts + letzte 10 Scheduler-Runs + Domain-Klassifikation.

### 10.2 Offene Drifts (Production)

| Klasse | Drift Type | Severity | Organization (redigiert) | Local | Stripe/Runtime |
|--------|------------|----------|--------------------------|-------|----------------|
| **ENVIRONMENT_MISMATCH** | `TEST_LIVE_MODE_CONFLICT` | CRITICAL | `faa710c9-…` | `LIVE` | `TEST` |
| **LOCAL_ONLY** | `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE` | WARNING | `faa710c9-…` | Subscription ohne Stripe-Sub | — |

### 10.3 Scheduler-Historie

10× `COMPLETED`, `stripe_mode=TEST`, `total_scanned=1`, `drift_count=2`, `error_count=0`.

### 10.4 Dry-Run-Urteil

| Metrik | Ergebnis |
|--------|----------|
| MATCH | 0 |
| LOCAL_ONLY | 1 |
| ENVIRONMENT_MISMATCH | 1 |
| STRIPE_ONLY | 0 (bei TEST-Key, 0 Stripe Subscriptions) |
| Automatische Reparatur sicher | **Nein** für CRITICAL drift |

**Reconciliation ist nicht zero-diff — Cutover STOP.**

---

## 11. Existing Organizations (Cutover-Klassifikation)

| Org | Klasse | Begründung |
|-----|--------|------------|
| F.S Mobility Service | **E — Inkonsistent** | TRIALING + LIVE-mode + Customer ohne Subscription |
| Voice Staging E2E (Internal) | **A — nie billing-aktiv** | Keine Subscription |
| Data Auth PG Org A/B | **B — Testdaten** | Auth-Test-Artefakte; **dürfen nicht nach Live migriert werden** |

---

## 12. Test Data

| Datensatz | Klassifikation | Aktion vor Live |
|-----------|----------------|-----------------|
| Data Auth PG Org A/B | Historische Testdaten | Logisch separiert halten |
| Voice Staging E2E | Interne Staging-Org | Keine Live-Migration |
| F.S Mobility Service TRIALING | Sandbox/Test-Rest | Manuelle Migrationsentscheidung |
| Stripe TEST Customers (9) | Testmode | **Niemals** als Live übernehmen |

**Keine Cleanup-Aktionen durchgeführt.**

---

## 13. Frontend Readiness

| Check | Ergebnis |
|-------|----------|
| Publishable Key | **N/A** — Backend-only (kein Stripe.js) |
| Secret Exposure | **PASS** — keine `pk_*`/`sk_*` in Frontend-Env |
| Hardcoded Price IDs | **PASS** — keine im Frontend-Code |
| Billing UI | Master Admin + Rental Billing über Backend APIs |
| TEST/LIVE Indicator | Teilweise in Master Admin (`BillingStripeTab`) — Runtime TEST |

---

## 14. Backend Readiness

| Check | Ergebnis |
|-------|----------|
| Stripe client init | **PASS** — `getStripeClient()` + Environment Module |
| Environment Guard | **PASS** — fail-fast; TEST in Prod nur mit Flag |
| Secret loading | **PASS** — `backend.env` chmod 600 |
| Webhook verification | **PASS** (Code) — Billing secret **MISSING** (Runtime) |
| Idempotency | **PASS** — `stripeEventId`, payload hash |
| Reconciliation | **PASS** (Code) — Drifts offen |
| Connect live guard | **PASS** — `assertConnectTestModeOnly()` blockiert Live Connect MVP |

---

## 15. Financial Side Effects

| Aktion | Side Effect | Trigger | Prevention | Confirmation |
|--------|-------------|---------|------------|--------------|
| Live Subscription Create | Abbuchung / Invoice | Cutover-Sync | Kein Live-Key | Operator + Runbook |
| Trial End | Erste Rechnung | Webhook `trial_will_end` | Billing-Webhook fehlt aktuell | Live Webhook + Test |
| Plan Change | Proration | Subscription update | Kein Mapping | Catalog LIVE mappings first |
| Payment Method Attach | Off-Session Charge möglich | SetupIntent success | Sandbox only now | Live sandbox acceptance |

**Irreversibel:** Echte Live-Zahlungen, ausgestellte Live-Invoices — nicht per Deploy rollback-fähig.

---

## 16. Migration Model (Plan only — nicht ausgeführt)

1. **Freeze:** `STRIPE_ALLOW_TEST_IN_PRODUCTION` entfernen erst nach Live-Key validiert.
2. **Secrets:** Operator stellt `sk_live_*`, `STRIPE_WEBHOOK_SECRET` (Live), optional Live Connect secret bereit.
3. **Catalog:** LIVE `billing_stripe_catalog_mappings` für RENTAL, FLEET, Add-ons anlegen (Master Admin + `stripe-catalog-sync`).
4. **Datenbereinigung:** `stripe_mode=LIVE` auf TRIALING-Sub korrigieren oder Org neu zuordnen (manuell).
5. **Reconciliation:** Dry-run bis zero CRITICAL; TRIALING orphan auflösen.
6. **Webhook:** Live Billing-Endpoint in Stripe Dashboard → `https://app.synqdrive.eu/api/v1/webhooks/stripe`.
7. **Key swap:** `STRIPE_SECRET_KEY` → Live; `STRIPE_ENVIRONMENT=live`; Flags entfernen.
8. **Per Org:** F.S Mobility → neuer Live Customer + Subscription **oder** bestehenden Test-Customer verwerfen (keine stille Migration).
9. **Test Orgs:** Data Auth A/B isoliert lassen.
10. **Verify:** Webhook-Test-Event (Live) + Reconciliation PASS + 0 orphan TRIALING.

**Race Prevention:** Webhook Live erst nach DB-Umgebung konsistent; Key-Swap als letzter Schritt mit Rollback-Snapshot.

---

## 17. Rollback

| Artefakt | Rollback |
|----------|----------|
| Production Release | `20260818205259_v4994` (aktuell) |
| Stripe Env | `STRIPE_SECRET_KEY=sk_test_*`, `STRIPE_ENVIRONMENT=test`, `ALLOW_TEST=true` |
| DB Mappings | DB-Backup vor Cutover (Pflicht) |
| Webhook | Test-Endpoint reconnect |
| Secrets | Vorherige `backend.env` Version |

**Nicht rollback-fähig:** Live-Zahlungen, Live-Invoices, Live-Customers mit echten Zahlungsmethoden.

---

## 18. Operator Actions

| Aktion | Verantwortlich |
|--------|----------------|
| `sk_live_*` bereitstellen | Operator |
| Live `STRIPE_WEBHOOK_SECRET` | Operator |
| Stripe Live Products/Prices anlegen | Operator (+ Master Admin Mapping) |
| Live Webhook Endpoint registrieren | Operator (Stripe Dashboard) |
| Account/Payout/Compliance | Operator |
| TRIALING-Orphan Entscheidung | Product/Ops |
| Test-Org-Separation bestätigen | Ops |

**Keine Secrets in diesem Dokument.**

---

## 19. Cutover Gates G1–G10

| Gate | Kriterium | Ergebnis |
|------|-----------|----------|
| **G1** Environment | Einheitlich LIVE ohne MIXED | **FAIL** |
| **G2** Secrets | Live Key + Billing Webhook Secret | **FAIL** |
| **G3** Products/Prices | LIVE Mappings vollständig | **FAIL** |
| **G4** Webhooks | Live Billing Endpoint + Delivery | **FAIL** |
| **G5** Source of Truth | Keine CRITICAL Drifts | **FAIL** |
| **G6** Reconciliation Dry Run | Zero-diff akzeptabel | **FAIL** |
| **G7** Customer Mapping | Keine ambiguous/mixed | **FAIL** |
| **G8** Subscription Migration Plan | Konkret pro Org | **PASS** (Plan in §16) |
| **G9** Financial Side Effects | Verstanden + gated | **PASS** |
| **G10** Rollback | Dokumentiert | **PASS** |

---

## 20. Final Preflight Decision

# NOT READY FOR LIVE CUTOVER

**Begründung:** Mindestens G1–G7 **FAIL**. Production ist ein **bewusst konfigurierter Stripe-TEST-Sandbox-Betrieb** mit offenen Reconciliation-Drifts und fehlender Billing-Webhook-Konfiguration. Technische Code-Guards sind vorhanden, aber **Live-Cutover-Voraussetzungen sind nicht erfüllt**.

**Nächster Schritt (separater Task):** Operator-Prerequisites + kontrollierter Cutover + Live-Reconciliation — **nicht** Teil dieses Preflights.

---

## Anhang A — Secret Safety

| Check | Ergebnis |
|-------|----------|
| Secrets im Frontend/Bundle | **PASS** (kein `pk_*` in `frontend.env`; Backend-only) |
| Secrets in Git/Docs | **PASS** (nur Platzhalter in `.example` / Tests) |
| Secrets in API Responses | Code-Guards vorhanden (Scrubbing in Tests) |
| `backend.env` Permissions | **600** root |
| Process Args | Nicht exponiert |

---

## Anhang B — Sandbox Acceptance Evidence (bestehend)

| Bereich | Evidenz | Lücke |
|---------|---------|-------|
| Subscription/Webhook Matrix | 40/40 `billing-stripe-sandbox.matrix.spec.ts` | Production Billing-Webhook nicht konfiguriert |
| Sandbox E2E Playbook | `docs/billing/billing-stripe-sandbox-e2e.md` | Live-Pfad nicht getestet |
| Reconciliation Unit Tests | `billing-reconciliation.service.spec.ts` | Production Drifts offen |
| Connect E2E | Architektur-Docs 2026-07-14 | Separater Scope |

---

## Anhang C — Live-Mutation Guard

| Guard | Status |
|-------|--------|
| `validateStripeEnvironmentOrThrow` | **Aktiv** — blockiert `sk_test_*` in Prod ohne Flag |
| `STRIPE_ENVIRONMENT` vs Key Prefix | **Aktiv** — würde Live-Key bei `test` blockieren |
| Webhook Livemode Check | **Aktiv** |
| `assertConnectTestModeOnly` | **Aktiv** für Connect Account Ops |
| Dediziertes `LIVE_CUTOVER_ENABLED` Flag | **Fehlt** — Cutover-Voraussetzung: explizites Runbook + Operator Confirmation |

**Kein Quick-and-dirty Backdoor implementiert (read-only Task).**

---

**MA-BILL-P0-001 Status:** **OPEN** — Closure erst nach kontrolliertem Live-Cutover + verifizierter Live-Reconciliation.

**Nicht bearbeitet:** MA-BKP-P1-001 (Offsite), andere Production-Blocker.
