# Master Admin — Billing Deep Audit

**Datum:** 2026-08-18  
**Phase:** UI-6.1 (Read-only Audit — keine Implementierung)  
**Branch:** `cursor/master-admin-ia-audit-6608`  
**Scope:** Master-Admin-Billing-Oberflächen im Billing Control Center (BCC)

**Verbindliche Referenzen:**

| Referenz | Pfad / Modul |
|----------|--------------|
| Kanonische Billing Source of Truth | `docs/billing/billing-target-domain.md` |
| Technischer Ist-Zustand | `docs/billing/billing-current-state.md` |
| Subscription State Machine | `backend/src/modules/billing/domain/subscription-lifecycle.ts` |
| Reconciliation Engine | `backend/src/modules/billing/domain/billing-reconciliation.ts`, `billing-reconciliation.service.ts` |
| Trial Model | `MasterSubscriptionController` → `POST …/subscription/trial`, Domain `SubscriptionStatus.TRIALING` |
| Billing Guards | `docs/billing/billing-permissions-matrix.md`, `MasterBillingGuard`, `MasterAdminMfaGuard` |
| Page Framework (UI-2) | `docs/ui/master-admin-canonical-page-framework.md` |
| Dashboard Billing Signals (UI-3) | `docs/ui/master-admin-dashboard-post-remediation.md` |
| Organizations Billing Handoff (UI-5) | `docs/ui/master-admin-canonical-organization-management-blueprint.md` |

**Frontend-Einstieg:** `view=billing` → `BillingControlCenter` (`frontend/src/master/App.tsx`)  
**URL-Parameter:** `masterBilling`, `masterBillingTab`, `orgId`

---

## 1. Executive Summary

Das **Billing Control Center** (BCC) ist funktional breit aufgestellt: sechs Hauptsektionen, 19 Unter-Tabs, Backend-Anbindung an kanonische Admin-APIs und eine etablierte Vertrags-Mutations-Schicht (`MasterSubscriptionController`). Die **Backend-Architektur** (Domain State Machine, Reconciliation Engine, Idempotency, Audit Log) ist dem Zielbild aus der Billing-Remediation deutlich näher als die **Master-UI**.

Die UI leidet unter vier strukturellen Problemen:

1. **Vermischte Status-Dimensionen** — Subscription Lifecycle (Prisma `BillingStatus` vs. Domain `SubscriptionStatus`), Payment Health, Sync Health und Preis-Konfiguration werden teils in einem Badge, teils in separaten Spalten, teils nur als Warn-Codes gezeigt; List und Detail nutzen nicht dieselbe kanonische Statusquelle.
2. **Kein operatives Attention-Modell im BCC** — Aufmerksamkeit ist auf der Übersicht begrenzt (Top 12 Warnungen), aber nicht in der Subscription List sortierbar/filterbar; Reconciliation und Anomalien sind in `System & Synchronisation` versteckt.
3. **Stripe-Admin-Tabelle statt Ops-Kontrollfläche** — Breite Tabellen (`min-w-[1280px]`), technische IDs (Price Version ID manuell), UUID in Reconciliation; Mobile/Tablet unzureichend.
4. **Action Safety Lücke** — Nur Pause/Kündigung/Aktivieren haben `AlertDialog`; Trial, Rabatt, Tarifwechsel, Stripe Sync, Reconciliation Resolve/Auto-Fix und manuelle Zahlung sind Plain-Buttons ohne verpflichtenden Grund, ohne MFA-Feedback in der UI und ohne einheitliche Bestätigungssprache.

**10-Sekunden-Test Subscription Detail:** **FAIL (~45/100)** — Organisation und Tarif erkennbar; Domain-Status im Drawer Header; Billing-Gesundheit, Trial-Typ, Reconciliation und Handlungsbedarf erfordern Tab-Wechsel, Warn-Parsing oder externes Wissen.

### Scores (0–100)

| Dimension | Score | Kurzbegründung |
|-----------|-------|----------------|
| Billing Clarity | **52** | Viele KPIs, aber vermischte Dimensionen und EN-Labels (`Preview`, `Draft`, `Sync`) |
| Subscription Clarity | **48** | List = Prisma-Status; Detail = Domain-Status; kein Renewal/Trial-Typ klar |
| Source-of-Truth Integrity | **45** | Frontend-Ableitungen (OVERDUE, missing PM rows, TEST-Stripe-URL) |
| Invoice UX | **62** | Paginierte Liste, Detail-Drawer, Filter — aber Client-Overdue und Stripe-Mode-Bug |
| Reconciliation UX | **38** | Drifts ohne Org-Name, ohne Local/Stripe-Werte, schwache Resolution |
| Action Safety | **40** | Idempotency Backend ja; UI-Bestätigung/Reason/MFA ungleichmäßig |
| Information Hierarchy | **50** | Overview gut; Detail-Aktionen vergraben; kein dediziertes Anomalie-Board |
| Responsive UX | **35** | Durchgängig breite Tabellen, Drawer-only Detail |
| Accessibility | **55** | Sub-Tab `ariaLabel` vorhanden; destructive flows und Tabellen teils schwach |
| Technical Cleanliness | **58** | Saubere API-Schicht; Client-Filter, Voll-Load Orgs, ungenutzte APIs |

**Gesamt-Reifegrad BCC:** **~49/100** — solide Backend-Basis, UI noch nicht remediation-konform.

---

## 2. Page Inventory

### 2.1 Routing & Shell

| Element | Route / Parameter | Zweck | SoT | Endpoint | Berechtigung |
|---------|-------------------|-------|-----|----------|--------------|
| BCC Root | `?view=billing` | Master-Abrechnung Shell | — | — | `hasMasterBillingAccess()` |
| Sektion | `masterBilling=overview\|organizations\|pricing\|invoices-payments\|system-sync\|audit` | Hauptnavigation | `master-billing-navigation.ts` | — | Master Billing |
| Unter-Tab | `masterBillingTab=<sub>` | Sub-Navigation pro Sektion | `master-billing-navigation.ts` | — | Master Billing |
| Org Drawer | `orgId=<uuid>` | Vertrags-Drawer deep link | `GET /admin/billing/organizations` (row lookup) | gleich | Master Billing |
| Org → BCC Handoff | `OrganizationDetailView` → `onOpenBillingCenter` | Drilldown aus Org-Detail | `billing/organizations` | gleich | Master Admin |

**Page Framework:** `MasterPageHeader` + `MasterBillingSectionTabBar` — **konform** mit UI-2 Page Framework (`wide` implizit über breite Tabellen). Kein `PageContainer variant="wide"` explizit gesetzt.

---

### 2.2 Sektion: Übersicht (`overview`)

| Element | Zweck | SoT | Endpoint | Datenmodell | Interaktion | Berechtigung |
|---------|-------|-----|----------|-------------|-------------|--------------|
| KPI MRR | Monatlich wiederkehrender Umsatz | `BillingAdminService.getOverview()` | `GET /admin/billing/overview` | `AdminBillingOverviewDto.mrr`, `mrrIncomplete` | Read-only | MASTER_ADMIN |
| KPI Aktive Verträge | Count ACTIVE | Backend-Aggregation Prisma `BillingStatus.ACTIVE` | overview | `activeSubscriptions` | Read-only | MASTER_ADMIN |
| KPI Trials | Count TRIALING | Backend | overview | `trialingSubscriptions` | Read-only | MASTER_ADMIN |
| KPI Past Due | Count PAST_DUE | Backend | overview | `pastDueSubscriptions` | Read-only | MASTER_ADMIN |
| KPI Offene Rechnungen | Count OPEN invoices | Backend | overview | `openInvoices` | Read-only | MASTER_ADMIN |
| KPI Fehlzahlungen | Failed payments | Backend | overview | `failedPayments` | Read-only | MASTER_ADMIN |
| KPI Ohne Zahlungsmethode | Active subs ohne PM | Backend | overview | `missingPaymentMethods` | Read-only | MASTER_ADMIN |
| KPI Drift | Offene Reconciliation Drifts | Backend | overview | `reconciliationDrifts` | Read-only | MASTER_ADMIN |
| KPI Fehlgeschlagene E-Mails | Outbox dead letters | Backend | overview | `failedEmailDeliveries` | Read-only | MASTER_ADMIN |
| MRR-Incomplete Banner | Transparenz bei fehlenden Staffeln | `mrrIncomplete`, `mrrIncompleteReason` | overview | — | Info | MASTER_ADMIN |
| Attention List (max 12) | Orgs mit `warnings[]` | `listOrganizationsBilling()` | `GET /admin/billing/organizations` | `AdminOrgBillingRowDto.warnings` | Klick → Org Drawer | MASTER_ADMIN |
| Link „Alle anzeigen“ | → Organizations Tab | — | — | — | Navigation | MASTER_ADMIN |

**Header Actions:** „Preisstaffel erstellen“ (→ Pricing), „Rechnungsexport“ (disabled), „Aktualisieren“ (reload core).

---

### 2.3 Sektion: Unternehmen & Verträge (`organizations`)

#### Subscription List (`BillingOrganizationsTab`)

| Spalte | Zweck | SoT | Endpoint | Interaktion |
|--------|-------|-----|----------|-------------|
| Unternehmen | Mandantenidentität | `organization.companyName` | organizations | Klick → Drawer |
| Tarif | Rental/Fleet | `tariffLabel` / `contract.productKey` | organizations + `entitlementResolver` | Read |
| Status | Subscription Lifecycle | **Prisma** `subscription.status` | organizations | Badge |
| Fahrzeuge | Abrechenbare Menge | `billableVehicleCount` | `previewUsage` | Read |
| Price Version | Vertragliche Preisversion | `contract.priceVersionLabel` | subscription item | Read |
| Monatswert | Projizierter Betrag | `projectedMonthlyAmountCents` | usage preview | Read |
| Rabatt | Discount summary | `discountCents` / `discountSummary` | preview | Read |
| Zahlung | Payment method health | `paymentMethodStatus` | `BillingPaymentMethod` | Badge |
| Letzte Rechnung | Letzte Invoice | `lastInvoice` | subscription.invoices[0] | Read |
| Offen | Open amount | `openAmountCents` | aggregated open invoices | Read |
| Nächste Abbuchung | Next charge | `nextChargeAt` / `currentPeriodEnd` | subscription | Read |
| Sync | Stripe mapping health | `syncStatus` (computed) | organizations (derived) | Badge |

**Filter:** Suche (client, companyName), Status-Select (Prisma enum), Problem-Filter (`payment_missing`, `price_not_configured`, `past_due` via `warnings[]`).

**Datenladung:** `useAdminBillingCore` — **Voll-Load aller Orgs**, Filter **client-seitig**, keine Pagination.

#### Subscription Detail (`BillingOrgDetailDrawer`)

| Bereich | Tabs | Zweck | SoT | Endpoints |
|---------|------|-------|-----|-----------|
| Header | — | Org-Name, Domain-Status, Sync | `domainStatus` (contract API) + `syncStatus` (list row) | `GET …/subscription/contract` |
| Warnungen | — | Attention chips | `warnings[]` (list row) | organizations |
| Details | `details` | Vertragssnapshot | Mix list row + `masterSubscriptionOverview` | contract, overview |
| Aktionen | `actions` | Privileged mutations | `MasterSubscriptionController` | `POST/PATCH …/subscription/*` |
| Historie | `history` | Audit trail | `BillingAuditLog` | `GET …/subscription/history` |

**Organisation-Link:** Kein direkter Link zu `OrganizationDetailView` — nur BCC-intern.

---

### 2.4 Sektion: Tarife & Preise (`pricing`)

| Unter-Tab | Komponente | Zweck | SoT | Endpoints |
|-----------|------------|-------|-----|-----------|
| Produkte | `BillingPricingTab` | Katalog BASE/ADDON | `BillingProduct` registry | `GET /admin/billing/catalog-products` |
| Versionen | `BillingPricingTab` | Price Version Lifecycle | `BillingPriceVersion` DRAFT/ACTIVE/ARCHIVED | `GET …/pricebooks/:id/versions` |
| Staffeln | `BillingPricingTab` | Tier editing (DRAFT only) | `BillingPriceTier` | `PUT …/price-versions/:id/tiers` |
| Simulation | `BillingPricingTab` | Preisrechner | `BillingUsageService` | `POST …/simulate` |
| Stripe | `BillingPricingTab` | Catalog mapping TEST/LIVE | `StripeCatalogMapping` | `GET …/stripe-mappings/…/status` |

**Dialoge:** `BillingPublishModal` (Publish confirmation), Create Pricebook Modal.

**Actions:** Create pricebook, create version, save tiers, publish, archive, Stripe map verify.

---

### 2.5 Sektion: Rechnungen & Zahlungen (`invoices-payments`)

| Unter-Tab | Zweck | SoT | Endpoint | Pagination |
|-----------|-------|-----|----------|------------|
| Rechnungen | Invoice list + drawer | `BillingInvoice` + resolver `displayStatus` | `GET /admin/billing/invoices` | Server (25/page) |
| Zahlungsmethoden | PM overview | `BillingPaymentMethod` + synthetic missing rows | `GET /admin/billing/payment-methods` | Nein (full load) |
| Zahlungsversuche | Payment attempts | Payment ledger | `GET /admin/billing/payment-attempts` | Server |
| Refunds | Refunds | Refund entities | `GET /admin/billing/refunds` | Server |
| Credit Notes | Credit notes | Credit note entities | `GET /admin/billing/credit-notes` | Server |

**Invoice Drawer:** Zeilen, Payment History, PDF/Hosted URL, Stripe link, manuelle Zahlung.

---

### 2.6 Sektion: System & Synchronisation (`system-sync`)

| Unter-Tab | Zweck | SoT | Endpoint |
|-----------|-------|-----|----------|
| Stripe API | Integration status, KPIs | `adminStripeStatus` | `GET /admin/billing/stripe-status` |
| Webhooks | Event list | `StripeWebhookEvent` | `GET /admin/billing/webhook-events` |
| Reconciliation | Drift list + run | `BillingReconciliationDrift` | `GET/POST …/reconciliation/*` |
| Resend | Email delivery ops | Outbox/Resend | `GET …/email-deliveries` |
| Outbox | Consumer deliveries | Outbox | `GET …/outbox-deliveries` |

---

### 2.7 Sektion: Audit (`audit`)

| Unter-Tab | Entity-Filter | Endpoint |
|-----------|---------------|----------|
| Verträge | BillingSubscription, BillingSubscriptionItem | `GET /admin/billing/audit-log` |
| Preise | PriceBook, PriceVersion, PriceTier | gleich |
| Zahlungen | Payment, Invoice, PaymentMethod | gleich |
| System | alle | gleich |

---

### 2.8 Querschnitt: Status Badges

| Badge-Typ | Utility | Quelle |
|-----------|---------|--------|
| Subscription (List) | `subscriptionStatusLabel/Tone` | **Prisma** `BillingStatus` via `rental/.../billing.utils.ts` |
| Domain (Drawer) | `domainStatusLabel/Tone` | **Domain** `SubscriptionStatus` |
| Payment Method | `paymentMethodStatusLabel` | `BillingPaymentMethod.status` / `MISSING` |
| Sync | `syncStatusLabel` | Computed `NONE/SYNCED/PARTIAL/MISSING` |
| Invoice | `invoiceDisplayStatusLabel` | `displayStatus` or client OVERDUE |
| Warning chips | `warningLabel` | Backend `warnings[]` codes |
| Price Version | `priceVersionDisplayStatusLabel` | DRAFT/ACTIVE/ARCHIVED |

---

## 3. Source-of-Truth Review

**Kanonische Regel** (`billing-target-domain.md`): SynqDrive hält lokale Vertrags-, Preis- und Audit-Wahrheit; Stripe ist Zahlungsprovider. Domain `SubscriptionStatus` ist die fachliche Lifecycle-Wahrheit; Prisma `BillingStatus` ist Persistenz + Stripe-Spiegel.

### 3.1 Sichtbare Billing-Informationen — Prüfmatrix

| UI-Element | Verwendete Quelle | Kanonische Quelle | Risiko |
|------------|-------------------|-------------------|--------|
| List Status-Badge | `subscription.status` (Prisma) | `domainStatus` via contract resolver | **Hoch** — `CANCEL_SCHEDULED`, `PAUSED`, `DRAFT` fehlen in List-Filter; Abweichung zu Drawer |
| Drawer Status-Badge | `contract.domainStatus` | Domain State Machine | Mittel — Fallback auf Prisma wenn contract load fails |
| Overview KPI „Trials“ | Count `BillingStatus.TRIALING` | Domain TRIALING | Niedrig — wenn Mapper konsistent |
| Payment Badge (List) | `paymentMethodStatus` | `BillingPaymentMethod` + rules | Niedrig |
| Sync Badge | ID presence only | Reconciliation Engine findings | **Hoch** — `SYNCED` obwohl Quantity/Price Drift möglich |
| Trial bis (Detail) | `trialEndAt` / overview | Subscription + trial config API | Mittel — **Trial-Typ nicht unterschieden** |
| Monatswert | `projectedMonthlyAmountCents` | Usage preview resolver | Niedrig — kanonisch berechnet |
| Invoice Status | `displayStatus` or **client OVERDUE** | `invoice-resolver.service` | **Mittel** — doppelte OVERDUE-Logik im Frontend |
| Stripe Dashboard Link (Invoice) | Hardcoded `'TEST'` | `runtimeStripeMode` from stripe-status | **Hoch** — falsche Umgebung in LIVE |
| Missing PM rows | **Client-synthetisiert** | Backend payment-methods API | Mittel — Duplikat-Wahrheit für Anzeige |
| Org Detail Billing Tab | `subscription.status` raw | `domainStatus` | **Hoch** — UI-5.3 zeigt Prisma-String |

### 3.2 Gesuchte Anti-Patterns — Befund

| Pattern | Gefunden? | Details |
|---------|-----------|---------|
| Lokale Frontend-Ableitungen | **Ja** | OVERDUE, missing PM rows, MRR incomplete display |
| Alte Statusmodelle | **Ja** | Prisma 4-Werte vs Domain 8-Werte parallel in UI |
| Legacy-Felder | **Teilweise** | `products[]` / `OrganizationProduct` in DTO, nicht prominent |
| Widersprüchliche Badges | **Ja** | List ACTIVE + warnings PAST_DUE möglich wenn Mapper drift |
| DB vs Stripe | **Teilweise sichtbar** | syncStatus simplistisch; Reconciliation nicht in List |
| Doppelte Wahrheiten | **Ja** | List status vs Drawer domainStatus; Org Detail vs BCC |

---

## 4. Subscription List

### 4.1 Ist-Spalten vs. Ops-Bedarf

| Spalte | Erforderlich? | Bewertung |
|--------|---------------|-----------|
| Unternehmen | **Ja** | Kern |
| Tarif | **Ja** | Kern |
| Status | **Ja** | Muss Domain-Lifecycle sein, nicht Prisma-Rohwert |
| Fahrzeuge | **Ja** | Für per-vehicle pricing relevant |
| Price Version | **Optional** | Fachlich wichtig, aber Label statt ID — OK |
| Monatswert | **Ja** | Ops-relevant |
| Rabatt | **Optional** | Kann in Detail |
| Zahlung | **Ja** | Eigene Dimension — gut |
| Letzte Rechnung | **Optional** | Redundant zu Offen/Status |
| Offen | **Ja** | Payment health signal |
| Nächste Abbuchung | **Ja** | Renewal signal |
| Sync | **Ja** | Aber zu grob — sollte Drift-Severity andeuten |

### 4.2 Fehlende Ops-Spalten

| Spalte | Warum |
|--------|-------|
| **Attention** | Aggregiertes Warning/Reconciliation-Signal — heute nur implizit via Filter |
| **Trial** | Trial end / days left — nicht sichtbar |
| **Letzte Änderung** | Audit `createdAt` oder subscription `updatedAt` |
| **Kündigung** | `cancelAtPeriodEnd` / `CANCEL_SCHEDULED` — nicht in List |

### 4.3 Redundanz & technische Prominenz

- **Letzte Rechnung + Offen + Status** — teilweise redundant; für Ops reichen Offen + Payment Badge.
- **Price Version** als truncate Label akzeptabel; **keine** rohen UUIDs in List (gut).
- **Kein Stripe-Subscription-ID** in List (gut — kein Stripe-Admin-Klon).

### 4.4 Problem-Identifikation

| Mechanismus | Wirksamkeit |
|-------------|-------------|
| Filter Past Due | Nur via `warnings.includes('PAST_DUE')` — nicht Domain-Status |
| Filter Payment Missing | OK |
| Filter Price Not Configured | OK |
| Sortierung nach Severity | **Fehlt** |
| Reconciliation Filter | **Fehlt** |
| Trial expiring | **Fehlt** |

**Fazit:** Liste ist **datenreich aber nicht ops-optimal** — ähnelt einer Stripe-nahen Vertragstabelle ohne Attention-First-Sortierung.

---

## 5. Subscription Detail — 10-Sekunden-Test

| # | Frage | Erkennbar in <10s? | Wo / Problem |
|---|-------|-------------------|--------------|
| 1 | Welche Organisation? | **Ja** | Drawer title |
| 2 | Welcher Plan? | **Ja** | Tarif-Zeile |
| 3 | Subscription Status? | **Teilweise** | Domain badge — aber List/Detail inkonsistent |
| 4 | Billing gesund? | **Nein** | Payment, Offen, Warnings verstreut; kein Health-Hero |
| 5 | Trial oder regulär? | **Nein** | „Trial bis“ nur wenn gesetzt; kein Trial-Typ |
| 6 | Nächste Verlängerung? | **Nein** | Nicht prominent; `nextChargeAt` nicht im Detail-Grid |
| 7 | Kündigung geplant? | **Teilweise** | Kündigungszeile im Grid |
| 8 | Reconciliation-Probleme? | **Nein** | Nicht im Drawer; eigener Tab |
| 9 | Offene/fehlgeschlagene Zahlungen? | **Nein** | Nur letzte Rechnung Snippet |
| 10 | Muss gehandelt werden? | **Teilweise** | Warning chips — wenn vorhanden |

**Score: ~45/100 FAIL**

**IA-Empfehlung (Ziel, nicht implementiert):** Status-Hero mit 3–4 orthogonale Chips (Lifecycle | Payment | Sync | Attention) + primäre CTA „Zum Handlungsbedarf“.

---

## 6. Status Model

### 6.1 Inventar sichtbarer Status

#### Subscription Lifecycle (Domain — kanonisch)

`DRAFT`, `TRIALING`, `ACTIVE`, `PAUSED`, `PAST_DUE`, `CANCEL_SCHEDULED`, `CANCELLED`, `INCOMPLETE`

**UI-Nutzung:**

| Status | List | Drawer | Filter |
|--------|------|--------|--------|
| ACTIVE | Ja | Ja | Ja |
| TRIALING | Ja | Ja | Ja |
| PAST_DUE | Ja | Ja | Ja |
| CANCELLED | Ja | Ja | Ja |
| DRAFT | Nein | Ja | Nein |
| PAUSED | Nein | Ja | Nein |
| CANCEL_SCHEDULED | Nein | Ja | Nein |
| INCOMPLETE | Nein | Nein | Nein |

#### Payment / Invoice Health (eigene Dimension)

- `paymentMethodStatus`: MISSING, ACTIVE, FAILED, REQUIRES_ACTION, EXPIRED
- Invoice `displayStatus`: OPEN, PAID, OVERDUE, FAILED, VOID, UNCOLLECTIBLE, REFUNDED, …
- Warning codes: `PAYMENT_METHOD_MISSING`, `PAST_DUE`, …

#### Reconciliation Health (eigene Dimension)

- `syncStatus`: NONE, MISSING, PARTIAL, SYNCED (ID-basiert, nicht drift-basiert)
- `BillingReconciliationDriftType`: STATUS_MISMATCH, QUANTITY_MISMATCH, WRONG_PRICE_ID, MISSING_ITEM, …
- Severity in Drift model

#### Organization Operational State

- `organization.status` im DTO — **nicht** in BCC List sichtbar (korrekt für Billing-Fokus)

### 6.2 Vermischungs-Risiken

| Risiko | Beispiel |
|--------|----------|
| Subscription = Payment | PAST_DUE als einziger „Problem“-Status |
| Sync = Healthy | SYNCED Badge trotz offener Drifts |
| Trial = Org PENDING | Org-Status Trial (UI-5) vs Billing TRIALING — in BCC selten, aber Org-Handoff zeigt Prisma |

**Regel verletzt:** Lifecycle, Payment, Reconciliation und Preis-Konfiguration werden **nicht durchgängig orthogonal** dargestellt.

---

## 7. Trials

### 7.1 Trial-Mechanismen (Backend)

| Typ | Kanonisch? | API | UI |
|-----|------------|-----|-----|
| Domain Trial (`TRIALING`) | **Ja** | `POST …/subscription/trial` mit `priceVersionId`, `trialEndAt` | Drawer Actions |
| Stripe Trial | Stripe-spiegelnd | Via Stripe orchestrator | **Nicht explizit** |
| Org Product TRIAL | Legacy/Entitlement | `OrganizationProduct` | Nicht in BCC |
| Manuelle Trial-Verlängerung | Via `trial` mutation (neues End) | trial endpoint | „Trial konfigurieren“ — kein Extend-Label |

### 7.2 UX-Befunde

| Aspekt | Status |
|--------|--------|
| Trial-Typ erkennbar | **Nein** — nur Enddatum |
| Start / Restzeit | **Nein** |
| Conversion-Pfad | **Teilweise** — „Aktivieren“ mit Price Version |
| Ablauf-Warnung | Nur wenn in `warnings[]` — nicht dediziert |
| Price Version ID manuell | **Unsicher** — Ops muss UUID kopieren |
| Implizite lokale Aktivierung | **Nein** — Backend-gated (gut) |

### 7.3 Trial UX Score: **42/100**

---

## 8. Plans & Pricing

### 8.1 Abdeckung

| Bereich | UI | Backend SoT |
|---------|-----|-------------|
| Rental / Fleet BASE | Produkte-Tab, Assign in Drawer | `BillingProductKind` |
| Fahrzeugstaffeln | Tiers-Tab, Simulation | `BillingPriceTier` |
| Add-ons (Voice, AI, WhatsApp) | Katalog ADDON sichtbar | `BillingAddonKey` — **Subscription Items in UI limitiert** |
| Rabatte | Drawer + Simulation % | `MasterSubscriptionAddDiscount` |
| Stripe Mapping | Pricing → Stripe sub-tab | `StripeCatalogMapping` TEST/LIVE |

### 8.2 Editing Safety

| Kontrolle | Vorhanden? |
|-----------|------------|
| DRAFT-only tier edit | **Ja** — `isPublishedVersionEditable` |
| Publish confirmation modal | **Ja** — `BillingPublishModal` |
| Usage count before archive | **Ja** — `price-versions/:id/usage` |
| Version immutability after publish | Backend enforced |
| Simulation before apply | Preview in Drawer — **getrennt** von Pricing Simulation |

### 8.3 Risiko: Preisänderungen beeinflussen Bestandskunden

| Szenario | Schutz |
|----------|--------|
| Tier edit auf ACTIVE version | **Blockiert** im UI + Backend |
| Publish neue Version | Bestehende Subs behalten gebundene `priceVersionId` — **korrekt** |
| `select-price-version` im Drawer | **Wirkt auf Vertrag** — Preview vorhanden, aber leicht klickbar |
| Stripe mapping change | Separater Pfad — Auswirkung auf **neue** Stripe syncs |

**Score Plans & Pricing UX: 65/100** — stärkster Bereich im BCC.

---

## 9. Invoices

### 9.1 List & Detail

| Feature | Status |
|---------|--------|
| Organization name | **Ja** |
| Zeitraum | Detail (lines); List nur Fälligkeit |
| Betrag Netto/Steuer/Brutto | **Ja** |
| Status | Badge mit Filter |
| Payment summary | Versuche + PM Label |
| Dokument links | Hosted + PDF wenn vorhanden |
| Stripe Reference | Link — **TEST hardcoded** |
| Drilldown | Drawer mit payment history |
| Server pagination | **Ja** (25) |
| Search | Rechnungsnr. / Stripe-ID |

### 9.2 Probleme

| Problem | Severity |
|---------|----------|
| `resolveInvoiceDisplayStatus` client OVERDUE | P1 |
| UUID in Fallback `invoice.id.slice(0,8)` | P2 |
| Manuelle Zahlung ohne starke Confirmation | P1 |
| Kein Org-Link aus Invoice | P2 |
| `credit_notes` filter ohne UI chip | P3 |

**Score: 62/100**

---

## 10. Reconciliation

### 10.1 Sichtbarkeit

| Ort | Was |
|-----|-----|
| Overview KPI | Count open drifts |
| System → Reconciliation Tab | Drift table |
| Stripe Tab | „Reconciliation starten“ (duplicate entry point) |
| Subscription List/Detail | **Nicht sichtbar** |

### 10.2 Drift-Tabelle — Ist vs. Soll

| Feld | Ist | Soll (ops) |
|------|-----|------------|
| Organisation | **UUID** | companyName + link |
| Subscription | Nicht angezeigt | sub label / id |
| Feld | Nicht angezeigt | `detailJson` parsed |
| Stripe Value | **Fehlt** | aus `detailJson` |
| Local Value | **Fehlt** | aus `detailJson` |
| Detected At | Ja | Ja |
| Severity | Rohstring | Badge + Sort |
| Status | resolvedAt implicit | Open/Resolved |
| Resolution | „Gelöst“ / „Auto-Fix“ | Reason + MFA + Preview |

### 10.3 Operativ handhabbar?

**Teilweise.** Backend (`billing-reconciliation.service`) unterstützt run, resolve, auto-fix für definierte Drift-Typen (QUANTITY_MISMATCH, WRONG_PRICE_ID, MISSING_DEFAULT_PAYMENT_METHOD, STUCK_WEBHOOK, …). UI erlaubt Aktionen, aber **ohne Kontext** ist Entscheidung „Gelöst vs. Auto-Fix“ nicht sicher ops-tauglich.

**Score: 38/100**

---

## 11. Billing Anomalies

Es gibt **keinen dedizierten Anomalies-Tab**. Anomalien verteilen sich auf:

| Anomalie | Sichtbarkeit | Klassifikation (Soll) |
|----------|--------------|------------------------|
| Fehlende Stripe Subscription | `syncStatus` MISSING/PARTIAL | **Sofort** |
| Fehlender Customer | syncStatus | **Sofort** |
| Webhook Failure | Stripe Tab, Overview emails | **Warning → Critical** by count |
| Duplicate Customer | Reconciliation (wenn erkannt) | **Sofort** |
| Invalid Price | warnings PRICE_* | **Warning** |
| Subscription Mismatch | Drift STATUS_MISMATCH | **Sofort** |
| Payment Failure | Overview KPI, Invoice filter | **Sofort** |
| Past Due | warnings / KPI | **Sofort** |
| Stale Sync | **Nicht explizit** | **Warning** |

**Dashboard `billingAnomaly` Badge** (UI-3 post-remediation): aggregiert `failedPayments`, `reconciliationDrifts`, `pastDueSubscriptions`, `stripeSyncErrors` — **gut**, aber BCC selbst hat kein äquivalentes Attention-Board.

---

## 12. Privileged Actions

### 12.1 Inventar

| Aktion | UI-Ort | Permission | Step-up/MFA | Confirm | Reason | Audit | Idempotency | Stripe Effect |
|--------|--------|------------|-------------|---------|--------|-------|-------------|---------------|
| Draft erstellen | Drawer | MasterBilling | Controller MFA | Nein | Nein | Ja | Ja | Nein |
| Rental/Fleet zuweisen | Drawer | MasterBilling | MFA | Nein | Nein | Ja | Ja | Später |
| Price Version übernehmen | Drawer | MasterBilling | MFA | Nein | Nein | Ja | Ja | Ja |
| Trial konfigurieren | Drawer | MasterBilling | MFA | Nein | Nein | Ja | Ja | Ja |
| Aktivieren | Drawer | MasterBilling | MFA | **AlertDialog** | Nein | Ja | Ja | Ja |
| Pausieren | Drawer | MasterBilling | MFA | **AlertDialog** | Nein | Ja | Ja | Ja |
| Reaktivieren | Drawer | MasterBilling | MFA | Nein | Nein | Ja | Ja | Ja |
| Kündigung planen | Drawer | MasterBilling | MFA | **AlertDialog** | Nein | Ja | Ja | Ja |
| Kündigung widerrufen | Drawer | MasterBilling | MFA | Nein | Nein | Ja | Ja | Ja |
| Tarifwechsel planen | Drawer | MasterBilling | MFA | Nein | Nein | Ja | Ja | Ja |
| Rabatt hinzufügen | Drawer | MasterBilling | MFA | Nein | Optional field | Ja | Ja | Ja |
| Stripe Sync starten | Drawer | Admin sync | ? | Nein | Nein | ? | Nein | **Ja** |
| Reconciliation run | Reconciliation/Stripe | MasterBilling | MFA | Nein | Nein | Ja | ? | Read |
| Drift resolve/auto-fix | Reconciliation | MasterBilling | MFA | Nein | Nein | Ja | ? | Variiert |
| Manuelle Zahlung | Invoice Drawer | MasterBilling | MFA | Mini-form | Nein | Ja | Ja | Ledger |
| Price publish | Pricing modal | MASTER_ADMIN | MFA | Modal | Nein | Ja | Nein | Indirekt |
| Tier save | Pricing | MASTER_ADMIN | MFA | Nein | Nein | Ja | Nein | Nein |

**Kritisch:** Die meisten Vertragsmutationen verhalten sich wie gewöhnliche Buttons trotz Stripe-Seiteneffekten.

---

## 13. Search & Filter

### 13.1 Ist

| Surface | Search | Filter |
|---------|--------|--------|
| Overview | — | — (Attention implicit) |
| Organizations | companyName (client) | Prisma status + 3 warning filters |
| Invoices | number/Stripe (server) | displayStatus chips |
| Payment Methods | — | — |
| Reconciliation | — | — |
| Pricing | — | Sub-tabs only |
| Audit | — | Entity sub-tabs |

### 13.2 Soll (kanonisch, nicht implementiert)

Orthogonale Filter — **nicht** jeden Stripe-State:

- Subscription Lifecycle (Domain)
- Billing Health (composite)
- Plan (RENTAL/FLEET)
- Trial (active / expiring 7d)
- Payment Issue
- Reconciliation Issue
- Organization search (server-side)

---

## 14. Attention Model

| Signal | Zentral sichtbar? |
|--------|-------------------|
| Past Due | Overview KPI + Filter — **nicht sortiert in List** |
| Stripe Sync fail | syncStatus column — **nicht in Attention sort** |
| Reconciliation offen | KPI only — **Tab 5 Klicks entfernt** |
| Trial auslaufend | **Nicht** |
| Payment missing | Filter + KPI |
| Price not configured | Filter + KPI |

**Dashboard** (UI-3): Domain chips + `billingAnomaly` nav badge — **besser als BCC List**.

**Lücke:** Master Admin muss heute **mehrere Tabs** durchsuchen (Overview → Organizations → System → Reconciliation).

---

## 15. Responsive

| Surface | Mobile | Tablet | Notebook | Desktop |
|---------|--------|--------|----------|---------|
| Overview KPIs | 2-col grid — OK | OK | OK | OK |
| Org List | **Horizontal scroll 1280px** | Scroll | Scroll | OK |
| Org Drawer | Full-screen drawer — OK | OK | OK | OK |
| Pricing | Multi-panel — cramped | Partial | OK | OK |
| Invoice List | **Scroll 1280px** | Scroll | Scroll | OK |
| Reconciliation | **Scroll 960px** | Scroll | OK | OK |
| Dialoge | Mostly OK | OK | OK | OK |

**Kein** Card-Fallback / Spalten-Priorisierung für Mobile — **Framework-Verstoß** (UI-2: Mobile darf keine Stripe-Tabellen erzwingen).

**Score: 35/100**

---

## 16. Accessibility

| Bereich | Befund |
|---------|--------|
| Status Semantik | Badges sind `span`, nicht `role="status"` |
| Tables | `<table>` semantisch OK; keine `scope` auf `<th>` |
| Dialogs | `AlertDialog` für 3 Aktionen — gut; andere Modals OK |
| Destructive Actions | Pause/Cancel — Dialog ohne `destructive` variant emphasis |
| Focus | Drawer/Dialog Radix — OK |
| Keyboard | Tabellenzeilen `click` only — **nicht keyboard-activatable** |
| Screenreader | Sub-tab `ariaLabel` vorhanden; Warning chips ohne `aria-label` |
| Confirmation | Uneinheitlich |

**Score: 55/100**

---

## 17. Technical Architecture

### 17.1 Datenfluss

```
BillingControlCenter
  useAdminBillingCore → GET overview + organizations (parallel, mount once)
  BillingOrgDetailDrawer → useMasterOrgContract → contract + overview + history (on open)
  BillingInvoicesTab → paginated adminInvoices
  BillingReconciliationTab → drifts (full load)
  BillingPricingTab → catalog + pricebooks (multi-fetch)
```

### 17.2 Befunde

| Thema | Befund |
|-------|--------|
| APIs | Kanonische `/admin/billing/*` — **gut** |
| Caching | Kein shared cache; Dashboard operational cache **separat** |
| Pagination | Invoices ja; Organizations **nein** |
| Mutation handling | Idempotency-Key + lockVersion — **gut** |
| Optimistic updates | **Nein** — reload after mutation (gut für Billing) |
| Webhook refresh | Kein SSE; manuell „Aktualisieren“ |
| Polling | Nur Dashboard (30s), nicht BCC |
| Duplicate requests | Drawer lädt 3 APIs pro open — akzeptabel |
| Stale data | List row stale nach Drawer mutation bis `reload()` |
| Local state machines | **Keine** im Frontend — gut |
| Direct Stripe im FE | **Nein** — nur Dashboard URLs |
| Ungenutzte APIs | `subscriptions()`, `revenueStats()` in `api.ts` |

### 17.3 Frontend interpretiert Stripe-State?

**Teilweise vermieden** — Status kommt aus Backend. **Ausnahmen:** `syncStatus`-Berechnung ist im Backend, aber zu simpel; `resolveInvoiceDisplayStatus` OVERDUE client-seitig.

**Score: 58/100**

---

## 18. Duplicate Truth Risks

| # | UI-Element | Verwendete Quelle | Kanonische Quelle | Risiko |
|---|------------|-------------------|-------------------|--------|
| D1 | Org List Status | Prisma `BillingStatus` | Domain `SubscriptionStatus` | **P0** |
| D2 | Org Drawer Status | Domain | Domain | OK |
| D3 | Org Detail Billing Tab | Prisma status string | Domain + billing health | **P1** (UI-5 Handoff) |
| D4 | Invoice OVERDUE | Client date compare | `invoice-resolver` `displayStatus` | **P1** |
| D5 | Sync SYNCED | Stripe ID presence | Reconciliation drift-free | **P1** |
| D6 | Missing PM rows | Client merge | `adminPaymentMethods` only | **P2** |
| D7 | Stripe invoice URL | Hardcoded TEST | `runtimeStripeMode` | **P0** |
| D8 | Overview MRR vs List Monatswert | Aggregat vs per-org preview | Beide backend — OK wenn complete |
| D9 | Warning codes vs Domain status | Parallel signals | Attention resolver | **P1** |
| D10 | `subscriptionStatusLabel` import | `rental/.../billing.utils` | Master contract utils | **P2** — Tenant/Master shared |

---

## 19. Findings P0 / P1 / P2 / P3

### P0 — Blocker / Vertrauensbruch

| ID | Finding |
|----|---------|
| P0-1 | Subscription List nutzt Prisma-Status, Drawer Domain-Status — widersprüchliche Lifecycle-Anzeige |
| P0-2 | Stripe Dashboard Invoice URL hardcoded `TEST` — falsche Umgebung in LIVE |
| P0-3 | `syncStatus=SYNCED` suggeriert Gesundheit trotz möglicher Reconciliation-Drifts |
| P0-4 | 10-Sekunden-Test Subscription Detail FAIL — kein Billing-Health-Hero |
| P0-5 | Kritische Mutationen (Trial, Rabatt, Tarifwechsel, Stripe Sync) ohne Confirmation/Reason |

### P1 — Hohe Ops-Relevanz

| ID | Finding |
|----|---------|
| P1-1 | Organizations List: Voll-Load + Client-Filter — nicht skalierbar |
| P1-2 | Reconciliation UI ohne Org-Name, Local/Stripe-Werte, Severity-Sort |
| P1-3 | Kein Trial-Typ / Restzeit / Expiring-Signal |
| P1-4 | Attention nicht in List sortierbar; Anomalien über 4+ Tabs verstreut |
| P1-5 | Invoice OVERDUE client-abgeleitet statt nur Backend `displayStatus` |
| P1-6 | Price Version Eingabe als rohe UUID — hohe Fehlerquote |
| P1-7 | Org Detail Billing Tab zeigt Prisma-Status (UI-5 Handoff inkonsistent) |
| P1-8 | Fehlende Domain-Status-Filter (PAUSED, CANCEL_SCHEDULED, DRAFT) |
| P1-9 | `Aktualisieren` / `Stripe Sync starten` — unscharfe Action Copy |

### P2 — UX / Skalierung

| P2-1 | Subscription List: 12 Spalten — Letzte Rechnung redundant |
| P2-2 | Kein Link Org Detail ↔ BCC bidirektional |
| P2-3 | Ungenutzte APIs `subscriptions`, `revenueStats` |
| P2-4 | Payment Methods: synthetic rows — verwirrende Datenherkunft |
| P2-5 | Rechnungsexport disabled ohne Roadmap in UI |
| P2-6 | EN-Labels (`Preview`, `Draft`, `Auto-Fix`, `Sync`) im DE-UI |
| P2-7 | Tabellen nicht keyboard-bedienbar |

### P3 — Polish

| P3-1 | `credit_notes` filter ohne Chip |
| P3-2 | Audit history max-height scroll ohne „alle anzeigen“ |
| P3-3 | Header „Preisstaffel erstellen“ springt zu Pricing products — leicht irreführend |
| P3-4 | Warning codes als Roh-Labels wenn unmapped |

---

## 20. Recommended Target State

### 20.1 Informationsarchitektur (kanonisch)

```
Master-Abrechnung
├── Übersicht (Control Plane)
│   ├── KPI Strip (MRR, Active, Attention Count)
│   └── Attention Queue (sortable, alle Signale)
├── Verträge
│   ├── List (server paginated, attention-first)
│   └── Detail Page (nicht nur Drawer) mit Status-Hero
├── Tarife & Preise (bestehend, minor polish)
├── Rechnungen & Zahlungen (bestehend + Org drilldown)
├── Abgleich & Anomalien (merged reconciliation + anomalies)
└── Audit (bestehend)
```

### 20.2 Status-Hero (Subscription Detail)

Vier orthogonale Chips:

1. **Vertrag** — Domain `SubscriptionStatus`
2. **Zahlung** — PM status + open amount + last failed payment
3. **Abgleich** — drift count + sync summary
4. **Preis** — price configuration status

### 20.3 Source of Truth Regeln (UI)

| Daten | Regel |
|-------|-------|
| Subscription lifecycle | **Nur** `domainStatus` aus contract API |
| Invoice status | **Nur** `displayStatus` vom Backend |
| Stripe mode | **Nur** `runtimeStripeMode` |
| Attention | Backend `warnings[]` + open drifts aggregated |
| Trial | Explicit `trialType` field in API (SYNQDRIVE / STRIPE) |

### 20.4 Action Safety Standard

Jede Mutation mit Stripe- oder Vertragswirkung:

1. Preview (wenn vorhanden) **vor** Confirm
2. `AlertDialog` mit **konkretem** Effekttext
3. Pflichtfeld **Grund** (min. 10 Zeichen)
4. MFA-Step-up Feedback (bereits Backend — UI zeigt Erfolg/Fehler)
5. Idempotency-Key (bereits vorhanden)
6. Audit sichtbar im Detail

**Copy-Beispiele:**

| Statt | Verwenden |
|-------|-----------|
| Aktualisieren | Daten neu laden |
| Stripe Sync starten | Vertrag mit Stripe abgleichen |
| Auto-Fix | Abweichung automatisch korrigieren (Stripe anpassen) |
| Gelöst | Als manuell geklärt markieren |
| Preview | Auswirkung vorab berechnen |

### 20.5 List-Spalten (Ziel)

| Spalte | Priorität Mobile |
|--------|------------------|
| Organisation | 1 |
| Attention | 1 |
| Vertrag (Domain) | 1 |
| Tarif | 2 |
| Zahlung | 2 |
| Nächste Abbuchung | 2 |
| Trial bis | 3 |
| Monatswert | 3 |
| Sync/Drift | 3 |

### 20.6 Reconciliation Panel (Ziel)

- Org-Name + Link zu Vertrag
- Parsed `detailJson`: field, localValue, stripeValue
- Severity + Detected At
- Actions: Preview Fix → Confirm → Resolve mit Reason

### 20.7 Cross-Links (UI-5 Integration)

- Org Detail Billing Tab → `domainStatus`, `billingHealth`, CTA „Im Abrechnungscenter öffnen“ (vorhanden)
- BCC Drawer → „Organisation anzeigen“ → Org Detail
- Invoice → Org + Subscription

### 20.8 Technische Zielarchitektur

| Thema | Ziel |
|-------|------|
| `useAdminBillingCore` | Server pagination + query params |
| Shared cache | Optional align mit `operational-cache` für Overview KPIs |
| Status utils | **Nur** `master-contract.utils` / `billing-domain.ts` — nicht rental utils |
| Drift endpoint | Erweitert um `organizationName`, parsed diff |
| Tests | 10-second test scenarios als Vitest + optional E2E |

---

## Anhang A — Datei-Inventar (Master Billing UI)

| Datei | Rolle |
|-------|-------|
| `BillingControlCenter.tsx` | Shell |
| `master-billing-navigation.ts` | URL state |
| `useAdminBillingCore.ts` | Overview + orgs load |
| `BillingOverviewTab.tsx` | KPIs + attention |
| `BillingOrganizationsTab.tsx` | Subscription list |
| `BillingOrgDetailDrawer.tsx` | Subscription detail + actions |
| `useMasterOrgContract.ts` | Contract mutations |
| `BillingPricingTab.tsx` | Plans/prices |
| `BillingInvoicesTab.tsx` | Invoice list |
| `BillingAdminInvoiceDrawer.tsx` | Invoice detail |
| `BillingReconciliationTab.tsx` | Reconciliation |
| `BillingStripeTab.tsx` | Stripe/webhooks |
| `admin-billing.types.ts` | DTOs |
| `master-contract.utils.ts` | Domain labels |
| `master-invoices.utils.ts` | Invoice display helpers |

---

## Anhang B — Bezug UI-1 bis UI-5

| Phase | Relevanz für Billing Audit |
|-------|----------------------------|
| UI-1 Navigation | Billing als Sidebar-Item; `billingAnomaly` badge |
| UI-2 Page Framework | BCC nutzt MasterPageHeader; wide tables ohne wide container |
| UI-3 Dashboard | Billing KPIs embedded; attention signals — **nicht in BCC List gespiegelt** |
| UI-4 App Shell | Permission denied pattern für Billing |
| UI-5 Organizations | Billing summary handoff; **Prisma status in Org Detail** — Duplicate Risk D3 |

---

**Changes / Architektur:** Nicht aktualisiert (read-only Audit, keine Implementierung).

**Nächster Schritt (nicht in diesem Prompt):** UI-6.2 Billing Remediation Blueprint + Implementierung gemäß Recommended Target State.
