# Master Admin — Kanonisches Billing Blueprint

**Datum:** 2026-08-18  
**Phase:** UI-6.2 (Spezifikation — keine Implementierung)  
**Basis:**
- `docs/ui/master-admin-billing-deep-audit.md` (UI-6.1)
- `docs/billing/billing-target-domain.md`
- `backend/src/modules/billing/domain/subscription-lifecycle.ts`
- `backend/src/modules/billing/domain/billing-reconciliation.ts`
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- `docs/ui/master-admin-canonical-organization-management-blueprint.md` (UI-5.2)

**Leitfrage:** *Funktioniert Plattform-Billing — und welcher Vertrag braucht jetzt meine Aufmerksamkeit?*

**Grundsatz:** Eine Wahrheit pro Domäne. Billing Control Center (BCC) ist die **einzige** Master-Admin-Oberfläche für SaaS-Verträge, Preiskatalog, Rechnungen und Stripe-Abgleich. Organisationen bleiben Tenant Control Plane — kein zweites Billing-Detail.

---

## 0. Produktrolle & Abgrenzung

| BCC **ist** | BCC **ist nicht** |
|-------------|-------------------|
| Vertrags- und Abrechnungs-Control-Plane | Tenant-Lifecycle (→ Organisationen) |
| Kanonische Subscription-/Invoice-/Pricing-Ops | Stripe Dashboard-Klon |
| Reconciliation & privileged Billing-Mutationen | Rental-Miet-Tarife (`modules/pricing/`) |
| Master-Preiskatalog & Versionierung | Voice-Billing-Modul (eigene Domäne) |

**10-Sekunden-Ziel (nach Umsetzung):** Master Admin erkennt in Subscription Detail: Organisation, Plan, Lifecycle-Status, Billing-Gesundheit (Zahlung + Abgleich), Trial/Renewal, Handlungsbedarf — ohne Tab-Wechsel.

---

## 1. Billing Information Architecture

### 1.1 Entscheidung: Fünf Primärbereiche + Audit

Nach fachlicher Prüfung (nicht 1:1 Ist-Navigation übernommen):

| # | Bereich | Behalten? | Begründung |
|---|---------|-----------|------------|
| 1 | **Übersicht** | **Ja** | Operative Einstiegsschicht — Gesundheit + Attention Queue |
| 2 | **Verträge** | **Ja** | Einzige Subscription List + Detail — keine Duplikate |
| 3 | **Rechnungen** | **Ja** | Cross-Org, paginiert, eigenes Aggregat — nicht in Vertragsliste duplizieren |
| 4 | **Tarife & Preise** | **Ja** | Katalog ≠ Vertrag — Versionierung erfordert eigene Fläche |
| 5 | **Abgleich** | **Ja** | Reconciliation + Sync/Webhook-Gesundheit — ops-kritisch, nicht verstecken |
| 6 | **Audit** | **Ja (sekundär)** | Nachvollziehbarkeit — kein täglicher Ops-Pfad |
| — | Zahlungsmethoden (eigener Tab) | **Nein** | → Billing Health in Verträgen + Invoice Detail |
| — | Zahlungsversuche / Refunds / Credit Notes (Top-Tabs) | **Nein** | → Invoice Detail Drilldown |
| — | Stripe API + Webhooks (eigene Top-Sektion) | **Nein** | → Panel in Abgleich |
| — | Resend / Outbox (Billing-Nav) | **Nein** | → Plattform-Ops / Link von Übersicht-KPI |
| — | MRR/ARR Hero | **Nein (sekundär)** | Nur wenn `mrrIncomplete=false`; nie ohne Attention |

### 1.2 Ziel-Navigationsbaum

```
Master-Abrechnung  (?view=billing)
├── Übersicht                    masterBilling=overview
├── Verträge                     masterBilling=subscriptions
│   └── Detail                   masterBilling=subscriptions&subscriptionId={orgId}
├── Rechnungen                   masterBilling=invoices
│   └── Detail (Drawer)          &invoiceId={id}
├── Tarife & Preise              masterBilling=pricing
│   └── Unter-Tabs               masterBillingTab=products|versions|tiers|simulation|stripe-map
├── Abgleich                     masterBilling=reconciliation
│   └── Unter-Tabs               masterBillingTab=drifts|platform-sync|webhooks
└── Audit                        masterBilling=audit
    └── Filter                     masterBillingTab=contracts|pricing|payments|system
```

**Keine Mikro-Pages:** Subscription Detail ist **Route/Drawer an Verträge gebunden**, keine eigene Sidebar-Root.

**Keine doppelten Tabellen:** Subscription-Fakten nur in Verträge List/Detail. Rechnungs-Fakten nur in Rechnungen. Abgleichs-Fakten nur in Abgleich.

### 1.3 Cross-Links (verbindlich)

| Von | Nach | Trigger |
|-----|------|---------|
| Organisationen → Abrechnung Tab | Verträge Detail | CTA „Im Abrechnungscenter öffnen“ |
| Verträge Detail | Organisationen Detail | Link „Organisation anzeigen“ |
| Rechnungen Detail | Verträge Detail | Org-Name klickbar |
| Abgleich Zeile | Verträge Detail | Org-Name klickbar |
| Dashboard Billing-Anomalie | Übersicht Attention | Sidebar Badge → `overview` mit Filter |
| Übersicht KPI | jeweiliger Bereich | Drifts → Abgleich; Past Due → Verträge gefiltert |

### 1.4 Page Shell (UI-2)

```
MasterAdminShell
└── PageContainer variant="wide"
    ├── MasterPageHeader
    │   title: „Master-Abrechnung"
    │   description: „Verträge, Rechnungen, Preise und Abgleich"
    │   actions: kontextabhängig (s. u.)
    ├── MasterPageTabs (6 Primärbereiche — URL-gebunden)
    └── Page Content (eine Scroll-Achse)
```

**Header-Actions (global):**

| Action | Label | Ziel |
|--------|-------|------|
| Daten neu laden | „Daten neu laden“ | Reload aktiver Bereich |
| Neuer Preisstand | „Neuer Preisstand“ | → Tarife & Preise (nur mit `master-billing` write) |

**Entfernt aus Header:** „Rechnungsexport“ (disabled), „Preisstaffel erstellen“ (irreführend).

---

## 2. Billing Overview

### 2.1 Zweck

Operative Antwort in **< 15 Sekunden**:

| Frage | UI-Element |
|-------|------------|
| Funktioniert Billing? | **Gesundheits-Chip** (aggregiert aus Backend) |
| Wie viele aktive Verträge? | KPI „Aktive Verträge“ (Domain ACTIVE) |
| Past Due? | KPI + Attention-Einträge |
| Offene Reconciliation Issues? | KPI „Offene Abweichungen“ |
| Webhook-Probleme? | KPI „Webhook-Fehler“ (letzte 24h / offen) |
| Trials mit baldiger Aktion? | KPI „Trials laufen aus“ (≤ 7 Tage) |

**Kein Revenue-Vanity-Dashboard:** MRR/ARR nur als **optionale Sekundärzeile**, wenn `overview.mrrIncomplete === false`. Bei incomplete: erklärender Banner, kein „—“ ohne Kontext.

### 2.2 Layout

```
┌─ Gesundheits-Header ─────────────────────────────────────┐
│ [Billing gesund | Aufmerksamkeit nötig | Kritisch]        │
│ Letzter Abgleich: {reconciliationLastRunAt}               │
│ Letzter Webhook: {lastSuccessfulWebhookAt}               │
└──────────────────────────────────────────────────────────┘

┌─ KPI Strip (max 6 sichtbar) ──────────────────────────────┐
│ Aktive Verträge | Past Due | Offene Abweichungen |       │
│ Fehlzahlungen | Trials ≤7d | Webhook-Fehler              │
└──────────────────────────────────────────────────────────┘

┌─ Attention Queue (primärer Inhalt) ──────────────────────┐
│ Sortiert: severity desc → detectedAt desc                │
│ Spalten: Aufmerksamkeit | Organisation | Vertrag | Aktion │
│ „Alle anzeigen“ → Verträge mit attention filter          │
└──────────────────────────────────────────────────────────┘

[Optional, eingeklappt] MRR / ARR — nur wenn vollständig berechenbar
```

### 2.3 Attention Queue (Overview)

- **Kein Limit 12** — paginiert (server), Default 25
- Jede Zeile: `attentionReasons[]` als Chips + Link zu Vertrag
- Sortierung default: **kritisch zuerst**

### 2.4 Entfernt von Overview

- Vollständige Org-Tabelle (Duplikat zu Verträge)
- Fehlgeschlagene E-Mails als gleichwertiger KPI (Link zu Plattform-Ops, nicht Billing-Kern)
- Rohe Stripe-Kundenzahl

---

## 3. Subscription List

### 3.1 Page Shell

```
MasterPageHeader (section context in tabs)
MasterTableShell
  ├── Toolbar: Search | Lifecycle | Billing Health | Plan | Trial | Attention | Refresh
  ├── Desktop: DataTable (max 8 Spalten)
  ├── Mobile: SubscriptionCardList
  └── Pagination (server-seitig, limit 25/50)
```

**Endpoint (Ziel):** `GET /admin/billing/subscriptions` mit Query-Parametern — erweitert gegenüber heutigem Voll-Load `organizations`.

Bis API existiert: `GET /admin/billing/organizations` mit **server-side** filter/pagination (ADD Backend).

### 3.2 Spalten (Desktop — kanonisch)

| # | Spalte | Inhalt | SoT | Mobile Prio |
|---|--------|--------|-----|-------------|
| 1 | **Aufmerksamkeit** | Icon + count oder „—“; höchste Severity | `attention.summary` (server) | **1** |
| 2 | **Organisation** | `companyName` (semibold) | `organization` | **2** |
| 3 | **Plan** | Rental / Fleet Label | `contract.productKey` / `tariffLabel` | **5** |
| 4 | **Vertragsstatus** | Domain Lifecycle Chip | `domainStatus` | **3** |
| 5 | **Abrechnung** | Billing Health Chip (composite) | `billingHealth` | **4** |
| 6 | **Testphase** | „bis {date}" oder „—“ | `trial.endsAt`, `trial.active` | **6** (wenn Trial) |
| 7 | **Verlängerung** | `nextChargeAt` relativ + Datum | `subscription.currentPeriodEnd` | **7** |
| 8 | **Actions** | Overflow: „Vertrag öffnen“, „Organisation“ | — | Kebab |

**Nicht als Primärspalten:**

| Entfernt aus Primäransicht | Wo stattdessen |
|----------------------------|----------------|
| Price Version Label | Subscription Detail → Commercial |
| Monatswert / MRR | Detail → Commercial |
| Rabatt | Detail → Commercial |
| Letzte Rechnung | Rechnungen (gefiltert) |
| Offener Betrag | Detail → Billing Health |
| Stripe Sync Badge allein | Detail → Reconciliation Health |
| Fahrzeuganzahl | Detail → Commercial (billable/connected) |
| Technische IDs | Detail → Technisch (eingeklappt) |

### 3.3 Filter (orthogonal — nicht Stripe-Rohzustände)

| Filter | Werte | Backend-Parameter |
|--------|-------|-------------------|
| Suche | Org-Name | `search` |
| Vertragsstatus | Domain: DRAFT, TRIALING, ACTIVE, PAUSED, PAST_DUE, CANCEL_SCHEDULED, CANCELLED, INCOMPLETE | `domainStatus` |
| Abrechnungsgesundheit | OK, Warnung, Kritisch | `billingHealth` |
| Plan | RENTAL, FLEET, NONE | `productKey` |
| Testphase | Aktiv, Läuft aus ≤7d, Keine | `trialState` |
| Aufmerksamkeit | Mit Aufmerksamkeit, Past Due, Abweichung, Zahlung, … | `attentionCode` |

### 3.4 Row-Verhalten

| Interaktion | Verhalten |
|-------------|-----------|
| Row click | → Verträge Detail (`subscriptionId` = `organizationId`) |
| Keyboard | Row focusable; Enter öffnet Detail |
| Highlight | `attentionSeverity >= warning` → linke Border |

### 3.5 Default-Sort

`attentionSeverity DESC`, `attentionDetectedAt DESC`, `companyName ASC`

---

## 4. Subscription Detail

### 4.1 Surface-Typ

**Primär:** Full-page Detail unter Verträge (Desktop)  
**Sekundär:** Drawer nur für Quick-Peek von Rechnungen/Abgleich — schließt zu Full Detail

URL: `?view=billing&masterBilling=subscriptions&subscriptionId={orgId}`

### 4.2 Informationshierarchie (top → bottom)

#### A. Identity

```
MasterPageHeader (detail)
  title: {companyName}
  description: Vertrag · {planLabel} · Org-ID nur in Technisch
  breadcrumb: Master-Abrechnung → Verträge → {companyName}
  actions: [Organisation anzeigen] [Daten neu laden]
  status row: 3 orthogonale StatusChips (s. §5)
```

#### B. Lifecycle

| Feld | Quelle |
|------|--------|
| Vertragsstatus | `domainStatus` |
| Testphase-Block | `trial` object (s. §7) — nur wenn relevant |
| Vertragsbeginn | `startedAt` |
| Aktuelle Periode | `currentPeriodStart` – `currentPeriodEnd` |
| Nächste Abbuchung | `nextChargeAt` |
| Kündigung | `cancelAtPeriodEnd`, `cancelAt`, `cancellationScheduledAt` |

#### C. Billing Health

| Feld | Quelle |
|------|--------|
| Zahlungsmethode | `paymentMethod.statusLabel`, brand/last4 |
| Offener Betrag | `openAmountCents` |
| Letzte fehlgeschlagene Zahlung | `lastFailedPayment` (ADD API) |
| Letzte Rechnung | Link → Rechnungen Detail |
| Rechnungsstatus-Zusammenfassung | `invoiceHealthSummary` (ADD oder aus letzter offener Invoice) |

#### D. Reconciliation Health

| Feld | Quelle |
|------|--------|
| Abgleichsstatus | `reconciliationHealth` (OK / Drift offen / Sync fehlt) |
| Offene Drifts | Count + Link → Abgleich gefiltert |
| Stripe-Mapping | Customer + Subscription vorhanden (ja/teil/nein) |
| Letzter Abgleich | `lastReconciliationAt` |
| Aktion | „Vertrag mit Stripe abgleichen“ (privileged) |

#### E. Commercial Configuration

| Feld | Quelle |
|------|--------|
| Gebundene Price Version | Label + Link → Tarife (read-only Kontext) |
| Fahrzeuge abrechenbar/verbunden | `billableVehicleCount` / `connectedVehicleCount` |
| Projizierter Periodenbetrag | `projectedMonthlyAmountCents` |
| Rabatte | Liste aus `pricing.discounts` |
| Add-ons | Tabelle (s. §9) |

**Visuelle Trennung:** Banner „Katalog-Preis ≠ Vertrags-Preis" wenn Simulation vom gebundenen Stand abweicht.

#### F. History

| Inhalt | Quelle |
|--------|--------|
| Vertragsänderungen | `GET …/subscription/history` → Audit-Einträge |
| Filter | Vertrag / Preis / Zahlung |
| Link | „Vollständiges Audit“ → Audit Tab gefiltert |

#### G. Technical Details (eingeklappt, default zu)

| Feld | Quelle |
|------|--------|
| Subscription ID | `subscription.id` |
| Stripe Customer ID | `stripeCustomerId` + Dashboard-Link (`runtimeStripeMode`) |
| Stripe Subscription ID | `stripeSubscriptionId` |
| Lock Version | `lockVersion` (nur für Support) |

### 4.3 Detail-Tabs (sekundär — nicht für 10-Sekunden-Test nötig)

| Tab | Inhalt |
|-----|--------|
| **Übersicht** | A–G oben — Default |
| **Aktionen** | Privileged Actions (s. §12) — gruppiert nach Risiko |
| **Historie** | Audit timeline |

**Entfernt:** Getrennte Tabs „Details / Aktionen / Historie" als gleichwertige Einstiegspunkte ohne Overview-Hero.

### 4.4 10-Sekunden-Test (Ziel)

| # | Frage | Sichtbar in Übersicht-Tab |
|---|-------|---------------------------|
| 1 | Organisation? | Header |
| 2 | Plan? | Header + Lifecycle |
| 3 | Subscription Status? | StatusChip Vertrag |
| 4 | Billing gesund? | StatusChip Abrechnung + Billing Health Block |
| 5 | Trial oder regulär? | Trial-Block + Chip |
| 6 | Nächste Verlängerung? | Lifecycle |
| 7 | Kündigung geplant? | Lifecycle |
| 8 | Reconciliation-Probleme? | StatusChip Abgleich |
| 9 | Offene/fehlgeschlagene Zahlungen? | Billing Health |
| 10 | Handeln? | Attention Banner + primäre CTA |

**Ziel-Score: ≥ 85/100**

---

## 5. Multi-Dimensional Status

### 5.1 Drei orthogonale Dimensionen

Diese **dürfen nie in einem einzigen Badge** zusammengelegt werden.

#### Dimension 1 — Vertragsstatus (Lifecycle)

| Domain `SubscriptionStatus` | StatusChip `tone` | Label (DE) |
|----------------------------|-------------------|------------|
| `DRAFT` | `neutral` | Entwurf |
| `TRIALING` | `info` | Testphase |
| `ACTIVE` | `success` | Aktiv |
| `PAUSED` | `neutral` | Pausiert |
| `PAST_DUE` | `warning` | Überfällig |
| `CANCEL_SCHEDULED` | `warning` | Kündigung geplant |
| `CANCELLED` | `neutral` | Gekündigt |
| `INCOMPLETE` | `warning` | Unvollständig |

**SoT:** `GET …/subscription/contract` → `contract.domainStatus`  
**Niemals:** Prisma `BillingStatus` direkt in UI

#### Dimension 2 — Abrechnungsgesundheit (Payment Health)

| Composite `billingHealth` | Bedingung (Backend) | StatusChip |
|---------------------------|---------------------|------------|
| `OK` | Keine payment warnings, open amount = 0 oder erwartet | `success` „In Ordnung" |
| `WARNING` | PM fehlt, REQUIRES_ACTION, Trial endet, Preis nicht konfiguriert | `warning` „Prüfen" |
| `CRITICAL` | PAST_DUE, FAILED payment, offener Betrag überfällig | `critical` „Handeln" |

**SoT:** Backend-computed `billingHealth` + `paymentMethodStatus` + `warnings[]` (payment-related only)

**Komponente:** `StatusChip` mit `tone` — wie Organisationen (UI-5.3)

#### Dimension 3 — Abgleich (Reconciliation Health)

| `reconciliationHealth` | Bedingung | StatusChip |
|------------------------|-----------|------------|
| `OK` | Keine offenen Drifts; Mapping vollständig | `success` „Abgeglichen" |
| `WARNING` | PARTIAL mapping oder low-severity drift | `warning` „Teilweise" |
| `CRITICAL` | Offene high-severity Drifts oder MISSING mapping | `critical` „Abweichung" |

**SoT:** `BillingReconciliationDrift` count + `syncStatus` — **Drift hat Vorrang** vor ID-basiertem `syncStatus`

### 5.2 Zusätzliche Chips (keine Dimensions-Ersatz)

| Chip | Verwendung |
|------|------------|
| `attentionReason` chips | Einzelgründe in Queue/List |
| Invoice `displayStatus` | Nur in Rechnungen |
| Price Version `DRAFT/ACTIVE/ARCHIVED` | Nur in Tarife & Preise |

### 5.3 Semantik-Regeln

1. Max **3 StatusChips** in Subscription Detail Header (Lifecycle + Abrechnung + Abgleich)
2. `PAST_DUE` erscheint in **Lifecycle**; Payment Health kann zusätzlich CRITICAL sein — erlaubt, nicht redundant wenn Labels klar
3. Frontend **keine** eigene State Machine — nur Labels/Tones aus `billing-domain.ts` / `master-contract.utils.ts`
4. Entfernen: Import von `rental/.../billing.utils.ts` für Master-Billing

---

## 6. Attention Model

### 6.1 Prinzip

Attention ist **reine Präsentationsschicht** — aggregiert aus kanonischen Backend-Signalen. Keine neue Billing-Wahrheit, kein Frontend-Invent.

### 6.2 Attention Codes (kanonisch)

| Code | Severity default | Quelle (Backend) | Ops-Aktion |
|------|------------------|------------------|------------|
| `PAST_DUE` | critical | Domain status / warnings | Vertrag öffnen → Zahlung |
| `PAYMENT_FAILED` | critical | Failed payment ledger | Rechnung öffnen |
| `PAYMENT_METHOD_MISSING` | warning | No default PM + active contract | PM hinzufügen (Tenant) / Support |
| `PAYMENT_METHOD_REQUIRES_ACTION` | warning | PM status | Tenant-Aktion |
| `RECONCILIATION_DRIFT` | critical/warning | Open `BillingReconciliationDrift` | Abgleich |
| `STRIPE_MAPPING_MISSING` | critical | Missing customer or subscription ID | Abgleich / Sync |
| `STRIPE_MAPPING_PARTIAL` | warning | Partial mapping | Abgleich |
| `WEBHOOK_FAILURE` | warning | Recent failed webhook for org | Abgleich → Webhooks |
| `PRICE_NOT_CONFIGURED` | warning | `PRICE_NOT_CONFIGURED` calculation | Tarife / Vertrag |
| `NO_ACTIVE_PRICE_VERSION` | warning | No ACTIVE version | Tarife |
| `TRIAL_EXPIRING` | warning | Trial ends ≤ 7 days | Vertrag → Trial |
| `CANCEL_SCHEDULED` | info | `CANCEL_SCHEDULED` lifecycle | Vertrag prüfen |
| `SUBSCRIPTION_MISSING` | critical | No subscription | Vertrag anlegen |

### 6.3 Aggregation (Server)

```typescript
// Ziel-DTO (ADD Backend)
interface BillingAttentionSummary {
  severity: 'none' | 'info' | 'warning' | 'critical';
  reasons: BillingAttentionCode[];
  primaryAction?: { label: string; target: 'subscription' | 'invoice' | 'reconciliation' };
  detectedAt: string; // max(reasons.updatedAt)
}
```

**Endpoint:** Teil von `GET /admin/billing/subscriptions` row + Overview aggregate.

### 6.4 UI-Darstellung

| Surface | Darstellung |
|---------|-------------|
| Overview Queue | Chips + Org + Plan + CTA |
| Subscription List | Attention-Spalte (Icon + count) |
| Subscription Detail | Banner wenn `severity >= warning` |
| Dashboard Nav Badge | `billingAnomaly` wenn any `critical` count > 0 |

---

## 7. Trials

### 7.1 Kanonische Trial-Typen

| Typ | `trial.source` | Bedeutung | Master-Admin setzbar? |
|-----|----------------|-----------|------------------------|
| **SynqDrive Trial** | `SYNQDRIVE` | Lokal via `configureTrial` + Domain TRIALING | **Ja** — Policy-gated |
| **Stripe Trial** | `STRIPE` | Stripe `trial_end` spiegelt Domain | **Nein** — nur Anzeige + Convert |
| **Kein Trial** | `NONE` | Regulärer Vertrag | — |

**ADD Backend:** `trial: { source, startedAt, endsAt, daysRemaining, conversionState }` auf contract/overview DTO.

`conversionState`: `ACTIVE` | `EXPIRING` | `EXPIRED` | `CONVERTED`

### 7.2 UI — Trial-Block (Subscription Detail)

Sichtbar wenn `domainStatus === TRIALING` oder `trial.endsAt` in Zukunft:

```
┌─ Testphase ──────────────────────────────────────────────┐
│ Typ: [SynqDrive | Stripe]                                │
│ Start: {startedAt} · Ende: {endsAt} · Noch {daysRemaining} Tage │
│ Umstellung: {conversionState Label}                      │
│ [Auswirkung berechnen] [Testphase verlängern*] [Jetzt aktivieren*] │
└──────────────────────────────────────────────────────────┘
* nur wenn Policy + MasterBilling erlaubt
```

### 7.3 Master-Admin Trial Actions (Policy)

| Action | Risiko | API | Voraussetzung |
|--------|--------|-----|---------------|
| Testphase starten/konfigurieren | Sensitive | `POST …/trial` | DRAFT/assign plan; Price Version **Picker**, nicht UUID |
| Testphase verlängern | Sensitive | `POST …/trial` (neues `trialEndAt`) | TRIALING + reason |
| In aktiven Vertrag umwandeln | High | `POST …/activate` | Preview + confirm |
| Stripe Trial beenden | — | **Nicht in Master UI** | Stripe/Tenant Portal |

### 7.4 Listenspalte Trial

- Aktiv: „bis {dd.MM.yyyy}"
- Expiring: „{n} Tage" mit `warning` tone
- Sonst: „—“

---

## 8. Plans & Pricing

### 8.1 Drei-Ebenen-Modell (visuell getrennt)

```
┌─ PLAN DEFINITION ─────────────────────────────────────────┐
│ Billing Products: RENTAL, FLEET, ADDON (VOICE, AI, WA)   │
│ Rolle: BASE_PLAN vs ADDON                                │
│ Kein Preis hier — nur Produktidentität                   │
└──────────────────────────────────────────────────────────┘
         ↓
┌─ PRICE DEFINITION ──────────────────────────────────────┐
│ Pricebook → Price Version (DRAFT|ACTIVE|ARCHIVED)        │
│ Tiers, Simulation, Stripe Catalog Mapping               │
│ Änderungen betreffen NUR neue Zuweisungen / Publish      │
└──────────────────────────────────────────────────────────┘
         ↓
┌─ EXISTING SUBSCRIPTION ────────────────────────────────┐
│ Gebunden: priceBookId, priceVersionId am Vertrag         │
│ Änderung nur via Vertrag-Aktionen — nie via Katalog-Edit│
└──────────────────────────────────────────────────────────┘
```

### 8.2 Tarife & Preise — Unter-Tabs (behalten, polish)

| Tab | Zweck | Safety |
|-----|-------|--------|
| Produkte | Katalogübersicht BASE/ADDON | Read-only + Link zu Pricebooks |
| Versionen | Version-Liste pro Pricebook | DRAFT editierbar |
| Staffeln | Tier-Editor | **Nur DRAFT** — Banner wenn ACTIVE selected |
| Simulation | Was-wäre-wenn Rechner | Keine Vertragswirkung |
| Stripe-Zuordnung | TEST/LIVE mapping | Getrennt von Vertrag |

### 8.3 Versionierung — Pflicht-UX

| Zustand | UI |
|---------|-----|
| DRAFT | „Entwurf — nicht für Verträge" Badge |
| ACTIVE | „Veröffentlicht {publishedAt} — unveränderlich" + `usageCount` Subscriptions |
| ARCHIVED | „Archiviert — nur historisch" |

**Publish Flow:** `BillingPublishModal` — Bestätigung mit Wirkungstext: „Betrifft **neue** Vertragszuweisungen. Bestehende Verträge behalten ihre gebundene Version."

**Archive Flow:** Blockieren wenn `usageCount > 0` ohne Override-Grund.

### 8.4 Verknüpfung zu Verträgen

- Price Version Zeile: „{n} Verträge" → Link Verträge Liste gefiltert
- Subscription Detail: Price Version → Link Tarife (read-only, scroll to version)

### 8.5 Entfernt / nicht einführen

- Globale Preis-Overrides ohne Org-Kontext
- Edit ACTIVE tiers
- Visueller Eindruck „ein Preis für alle Kunden"

---

## 9. Add-ons

### 9.1 Reale Add-ons (nur diese)

| `BillingAddonKey` | Anzeigename |
|-------------------|-------------|
| `VOICE_AGENT` | Voice Agent |
| `AI_PACKAGE` | AI-Paket |
| `WHATSAPP` | WhatsApp |

**SoT:** `BillingSubscriptionItem` mit `productKind=ADDON` + `entitlementResolver`

### 9.2 Darstellung (Subscription Detail → Commercial)

| Spalte | Inhalt |
|--------|--------|
| Add-on | Name |
| Status | Item-Status / Entitlement aktiv |
| Preis | Gebundene Version oder „nicht konfiguriert" |
| Abrechnungsbasis | z. B. „pro Vertrag" / quantity |
| Aktionen | Nur wenn Backend-Mutation existiert — sonst read-only |

**Keine neuen Produktmodelle.** Voice-Billing-Metriken bleiben in Voice Control Plane.

### 9.3 Katalog-Referenz

Tarife & Preise → Produkte Tab listet ADDONs mit `subscriptionItemCount` — Link zu betroffenen Verträgen.

---

## 10. Invoices

### 10.1 Invoice List

```
MasterTableShell
  Toolbar: Search | Status (displayStatus) | Payment Health | Refresh
  Pagination: server 25/page
```

| Spalte | Inhalt | Mobile Prio |
|--------|--------|-------------|
| Rechnungsnr. | `invoiceNumberDisplay` | 2 |
| Organisation | `companyName` | 1 |
| Zeitraum | `periodStart` – `periodEnd` | 4 |
| Betrag | Brutto `grossAmountCents` | 3 |
| Status | `displayStatus` **nur Backend** | 2 |
| Zahlung | `paymentSummary.paymentStatus` oder attempts | 3 |
| Datum | `invoiceDate` | 4 |

**Entfernt aus List:** Netto/Steuer/Offen als Standard-Spalten → Detail.

### 10.2 Invoice Detail (Drawer)

| Sektion | Inhalt |
|---------|--------|
| Header | Nummer, Org (link), StatusChip, Beträge |
| Zeilen | Line items mit Periode |
| Vertragskontext | Plan, Subscription-Link |
| Zahlungen | Attempts, refunds, credit notes — **hier statt Top-Tabs** |
| Dokumente | Hosted URL, PDF |
| Technisch (eingeklappt) | `stripeInvoiceId`, Dashboard-Link mit `runtimeStripeMode` |
| Aktionen | Manuelle Zahlung erfassen (High Risk) |

### 10.3 Payment Ledger Zugriff

| Daten | Zugang |
|-------|--------|
| Zahlungsversuche | Invoice Detail → Payments |
| Refunds | Invoice Detail → Payments |
| Credit Notes | Invoice Detail → Payments |
| Cross-Org Payment Search | Optional: Abgleich / Audit — **nicht** eigener Nav-Tab |

---

## 11. Reconciliation Center

### 11.1 Struktur

```
Abgleich
├── Abweichungen (default)     — Drift-Tabelle
├── Plattform-Sync             — Stripe status, letzter Run, Kunden-Mapping count
└── Webhooks                   — Failed events, retry (read + link)
```

**MERGE:** Heutige `system-sync` (reconciliation + stripe + webhooks) → **ein** Bereich „Abgleich".

### 11.2 Drift-Zeile (Pflichtfelder)

| Spalte | Inhalt |
|--------|--------|
| Organisation | `companyName` + Link |
| Vertrag | Subscription ref / Plan |
| Abweichung | `driftType` Label (DE) |
| Lokal | `localValue` aus `detailJson` |
| Stripe | `stripeValue` aus `detailJson` |
| Erkannt | `detectedAt` |
| Schwere | `severity` Chip |
| Status | Offen / Gelöst |
| Aktion | siehe §11.3 |

**ADD Backend:** Enriched drift DTO mit `organizationName`, parsed `field`, `localValue`, `stripeValue`.

### 11.3 Resolution Actions

| Action | Wann | UI |
|--------|------|-----|
| Auswirkung anzeigen | `autoFixable` | Preview-Panel (ADD wenn nicht vorhanden) |
| Automatisch korrigieren | Backend `autoFixable=true` + Policy | Confirm + Reason + MFA |
| Manuell geklärt markieren | Immer | Confirm + **Pflicht-Reason** |
| Vertrag öffnen | Immer | Navigation |

**Niemals:** „Auto-Fix" ohne Erklärung welche Seite (lokal/Stripe) geändert wird.

### 11.4 Drift-Typen (Labels DE — aus Reconciliation Engine)

| `BillingReconciliationDriftType` | Label |
|----------------------------------|-------|
| `STATUS_MISMATCH` | Status weicht ab |
| `QUANTITY_MISMATCH` | Menge weicht ab |
| `WRONG_PRICE_ID` | Falsche Stripe-Price-ID |
| `MISSING_ITEM` | Position fehlt |
| `EXTRA_ITEM` | Zusätzliche Position |
| `MISSING_DISCOUNT` | Rabatt fehlt |
| `BILLING_ANCHOR_MISMATCH` | Abrechnungsanker weicht ab |
| `MISSING_DEFAULT_PAYMENT_METHOD` | Keine Standard-Zahlungsmethode |
| `MISSING_LOCAL_INVOICE` | Rechnung lokal fehlt |
| `MISSING_LOCAL_PAYMENT` | Zahlung lokal fehlt |
| `LOCAL_SUBSCRIPTION_WITHOUT_STRIPE` | Vertrag ohne Stripe-Abo |
| `STRIPE_SUBSCRIPTION_WITHOUT_LOCAL` | Stripe-Abo ohne lokalen Vertrag |
| `STUCK_WEBHOOK` | Hängender Webhook |
| `TEST_LIVE_MODE_CONFLICT` | Test/Live-Konflikt |

### 11.5 Batch-Aktionen

| Action | Placement | Risiko |
|--------|-----------|--------|
| Abgleich-Lauf starten | Abgleich Toolbar | Sensitive — Confirm |
| Einzel-Drift resolve | Zeile | High |
| Auto-fix | Zeile | High |

---

## 12. Privileged Action Model

### 12.1 Risiko-Kategorien

| Kategorie | Beispiele | UI Placement |
|-----------|-----------|--------------|
| **Low** | Daten neu laden, Simulation, Audit lesen, Rechnung PDF | Header / Toolbar |
| **Sensitive** | Trial verlängern, Rabatt hinzufügen, Abgleich-Lauf | Detail → Aktionen / Abgleich Toolbar |
| **High** | Plan zuweisen, Price Version binden, Aktivieren, Tarifwechsel, Stripe abgleichen, Manuelle Zahlung | Detail → Aktionen (gruppiert) |
| **Destructive** | Kündigung planen, Pausieren, Rabatt beenden | Detail → Aktionen (rot/sekundär) |

### 12.2 Anforderungen pro Kategorie

| Anforderung | Low | Sensitive | High | Destructive |
|-------------|-----|-----------|------|-------------|
| Confirmation Dialog | — | Ja | Ja | Ja + destructive variant |
| Reason (min 10 Zeichen) | — | Ja | Ja | Ja |
| Step-up MFA Feedback | — | Ja | Ja | Ja |
| Preview vor Mutation | — | Empfohlen | **Pflicht** wenn API existiert | Empfohlen |
| Audit sichtbar | — | Ja | Ja | Ja |
| Idempotency-Key | — | Ja | Ja | Ja |
| Result Toast + Inline | Ja | Ja | Ja | Ja |
| Rollback-Hinweis | — | — | Text wenn irreversibel | **Pflicht** |

### 12.3 Action-Inventar (Mapping)

| Action | Kategorie | Copy (DE) |
|--------|-----------|-----------|
| Daten neu laden | Low | „Daten neu laden" |
| Auswirkung berechnen | Low | „Auswirkung berechnen" |
| Entwurf erstellen | High | „Vertragsentwurf anlegen" |
| Rental/Fleet zuweisen | High | „{Plan}-Tarif zuweisen" |
| Price Version binden | High | „Preisversion {label} zuweisen" |
| Testphase konfigurieren | Sensitive | „Testphase bis {datum} setzen" |
| Vertrag aktivieren | High | „Vertrag aktivieren und abrechnen" |
| Vertrag pausieren | Destructive | „Vertrag pausieren" |
| Kündigung planen | Destructive | „Kündigung zum Periodenende vormerken" |
| Kündigung widerrufen | High | „Geplante Kündigung widerrufen" |
| Tarifwechsel planen | High | „Tarifwechsel zum {datum} planen" |
| Rabatt hinzufügen | Sensitive | „Rabatt {percent} hinzufügen" |
| Vertrag mit Stripe abgleichen | High | „Vertrag mit Stripe abgleichen" |
| Manuelle Zahlung erfassen | High | „Manuelle Zahlung erfassen" |
| Abgleich-Lauf starten | Sensitive | „Abgleich für alle Verträge starten" |
| Abweichung korrigieren | High | „Abweichung automatisch korrigieren" |
| Als geklärt markieren | Sensitive | „Manuell als geklärt markieren" |
| Preisversion veröffentlichen | High | „Preisversion veröffentlichen" |

---

## 13. Mutation UX

### 13.1 Pflicht-Flow (alle Sensitive+)

```
1. User wählt Action
2. [Optional] Preview Panel — API preview response rendered
3. Confirm Dialog:
   - Titel: konkrete Action
   - Body: Auswirkungen (Bullet)
   - Zeitpunkt: sofort | zum {effectiveAt}
   - Kostenwirkung: wenn preview.grossAmount vorhanden
   - Reason Textarea (required)
4. Submit → loading state auf Button (disabled)
5. MFA challenge wenn Backend 403/step-up
6. Success: Toast + Detail reload + Audit-Eintrag highlight
7. Failure: Inline error (mapMasterContractError), kein silent fail
8. Idempotency: disable double-submit bis response
```

### 13.2 Keine optimistischen Updates

Subscription Status, Payment Status und Drift Count **erst nach** Backend-Confirm + Reload aktualisieren. Insbesondere wenn Stripe involviert.

### 13.3 Preview Panel (bestehend erweitern)

`MasterContractPreviewPanel` — Pflicht vor: Aktivieren, Tarifwechsel, Price Version binden, Rabatt.

---

## 14. Data Freshness

### 14.1 Freshness-Metadaten (pro Surface)

| Surface | Anzeige | SoT |
|---------|---------|-----|
| Overview Header | „Stand: {loadedAt}" | Client timestamp |
| Overview | `reconciliationLastRunAt` | `GET overview` (ADD) |
| Overview | `lastSuccessfulWebhookAt` | `stripe-status` |
| Subscription Detail | „Vertrag aktualisiert: {subscription.updatedAt}" | contract DTO |
| Subscription Detail | „Letzter Stripe-Abgleich: {lastStripeSyncAt}" | ADD |
| Abgleich | Run timestamp + „{n} offen" | reconciliation API |
| Rechnungen | `invoice.updatedAt` im Detail | invoice DTO |

### 14.2 Stale Handling

| Bedingung | UI |
|-----------|-----|
| Daten älter als 5 min + User auf Detail | Dezenter „Möglicherweise veraltet" Hinweis |
| Nach Mutation | Auto-reload — kein manuelles „Aktualisieren" nötig |
| Webhook-driven | Hinweis: „Aktualisiert via Webhook" wenn `lastWebhookAt` > `loadedAt` |
| Reconciliation älter als 24h | Warning in Overview |

### 14.3 Refresh-Strategie

| Bereich | Strategie |
|---------|-----------|
| Overview | On mount + manual + nach Mutation |
| Verträge List | On mount, filter change, pagination — **kein** Voll-Load |
| Vertrag Detail | On mount + post-mutation |
| Rechnungen | On mount, filter, pagination |
| Abgleich | On mount + post-run |
| Dashboard Badge | Bestehend `operational-cache` 30s — shared counts |

---

## 15. Mobile

### 15.1 Prioritätsregel (Subscription Card)

Reihenfolge top → bottom:

1. **Aufmerksamkeit** — Severity + Reason chips
2. **Organisation** — Name
3. **Vertragsstatus** — Lifecycle Chip
4. **Abrechnungsgesundheit** — Payment Health Chip
5. **Plan** — Rental/Fleet
6. **Nächste Aktion** — Primary CTA aus `attention.primaryAction`

### 15.2 Mobile Patterns

| Surface | Pattern |
|---------|---------|
| Verträge List | `SubscriptionCardList` — **keine** `min-w-[1280px]` Tabelle |
| Vertrag Detail | Full-page stack — Hero Chips vertical |
| Rechnungen | Card mit Nummer, Org, Betrag, Status |
| Abgleich | Card pro Drift — Local/Stripe als Key-Value |
| Tarife | Accordion pro Pricebook |

### 15.3 Breakpoints

| BP | Verhalten |
|----|-----------|
| `< sm` | Cards only |
| `sm–lg` | Reduced columns (4) |
| `≥ lg` | Full DataTable |

---

## 16. Data Contract

### 16.1 Overview

| UI Element | Canonical Source | Endpoint | Refresh | Mutation | Audit |
|------------|------------------|----------|---------|----------|-------|
| Gesundheits-Chip | `overview.billingHealth` (ADD aggregate) | `GET /admin/billing/overview` | mount, manual | — | — |
| KPI Aktive Verträge | Domain ACTIVE count | overview | mount | — | — |
| KPI Past Due | `pastDueSubscriptions` | overview | mount | — | — |
| KPI Drifts | `reconciliationDrifts` | overview | mount | — | — |
| KPI Webhook-Fehler | `failedWebhookCount` / stripe-status | overview + stripe-status | mount | — | — |
| KPI Trials ≤7d | `trialsExpiringCount` (ADD) | overview | mount | — | — |
| Attention Queue | `attention[]` per org | subscriptions operational (ADD) | mount, paginate | — | — |
| MRR (optional) | `mrr` if `!mrrIncomplete` | overview | mount | — | — |

### 16.2 Subscription List Row

| UI Element | Canonical Source | Endpoint | Refresh | Mutation | Audit |
|------------|------------------|----------|---------|----------|-------|
| Organisation | `organization.companyName` | subscriptions list | filter/page | — | — |
| Plan | `contract.productKey` / `tariffLabel` | list | filter/page | — | — |
| Vertragsstatus | `domainStatus` | list (enriched) | filter/page | — | — |
| Abrechnungsgesundheit | `billingHealth` | list computed | filter/page | — | — |
| Testphase | `trial.endsAt` | list enriched | filter/page | — | — |
| Verlängerung | `nextChargeAt` | list | filter/page | — | — |
| Aufmerksamkeit | `attention.summary` | list computed | filter/page | — | — |

### 16.3 Subscription Detail

| UI Element | Canonical Source | Endpoint | Refresh | Mutation | Audit |
|------------|------------------|----------|---------|----------|-------|
| domainStatus | `contract.domainStatus` | `GET …/subscription/contract` | open, post-mutation | lifecycle APIs | `BillingAuditLog` |
| trial block | `contract.trial` (ADD) | contract + overview | open | `POST …/trial` | Ja |
| payment health | `overview.paymentMethod` | `GET …/subscription/overview` | open | PM via tenant | Ja |
| open amount | aggregated invoices | list row / overview | open | — | — |
| reconciliation | drift count + sync | contract + drifts filter | open | sync, reconcile | Ja |
| price version | `contract.priceVersionId` | contract | open | `PATCH …/price-version` | Ja |
| add-ons | subscription items | contract items (ADD) | open | item APIs wenn exist | Ja |
| discounts | `pricing.discounts` | overview | open | discount APIs | Ja |
| history | audit entries | `GET …/subscription/history` | open | — | — |
| stripe IDs | subscription stripe fields | contract | open | sync | Ja |

### 16.4 Invoices

| UI Element | Canonical Source | Endpoint | Refresh | Mutation | Audit |
|------------|------------------|----------|---------|----------|-------|
| List row | `AdminBillingInvoiceDto` | `GET /admin/billing/invoices` | page/filter | — | — |
| displayStatus | `invoice.displayStatus` | resolver — **no client OVERDUE** | page | — | — |
| payment history | payment ledger | `GET …/invoices/:id/payments` | drawer open | manual payment | Ja |
| stripe link | `stripeInvoiceId` + `runtimeStripeMode` | stripe-status | drawer | — | — |

### 16.5 Pricing

| UI Element | Canonical Source | Endpoint | Refresh | Mutation | Audit |
|------------|------------------|----------|---------|----------|-------|
| Product catalog | `BillingProduct` | `GET …/catalog-products` | tab open | — | — |
| Version tiers | `BillingPriceTier` | pricebook versions | select version | `PUT …/tiers` (DRAFT) | Ja |
| Publish | version status | `POST …/publish` | post | publish | Ja |
| Simulation | preview engine | `POST …/simulate` | on demand | — | — |
| Stripe map | `StripeCatalogMapping` | mapping status | select version | mapping APIs | Ja |

### 16.6 Reconciliation

| UI Element | Canonical Source | Endpoint | Refresh | Mutation | Audit |
|------------|------------------|----------|---------|----------|-------|
| Drift row | `BillingReconciliationDrift` enriched | `GET …/reconciliation/drifts` | mount, post-run | resolve/auto-fix | Ja |
| Run batch | reconciliation job | `POST …/reconciliation/run` | manual | run | Ja |
| Webhook events | `StripeWebhookEvent` | `GET …/webhook-events` | filter | retry (platform) | Ja |

---

## 17. CHANGE MATRIX

### KEEP

| Element | Anmerkung |
|---------|------------|
| `BillingControlCenter` als Root | Refactor, nicht ersetzen |
| `MasterPageHeader` + Section Tabs | URL-gebunden per UI-2 |
| `BillingOverviewTab` Attention-Konzept | Erweitern zu voller Queue |
| `BillingPricingTab` Kern | Produkte/Versionen/Staffeln/Simulation/Stripe |
| `BillingPublishModal` | Publish safety |
| `BillingInvoicesTab` + Drawer | Pagination beibehalten |
| `useMasterOrgContract` + Idempotency | Mutation layer |
| `MasterContractPreviewPanel` | Pflicht für High-Risk |
| `BillingAuditSection` | Sekundärer Bereich |
| `GET /admin/billing/overview` | Overview KPIs |
| `MasterSubscriptionController` | Alle Vertragsmutationen |
| Reconciliation Engine Backend | UI anreichern, nicht ersetzen |
| Dashboard `billingAnomaly` badge | Link zu BCC Overview |
| Org → BCC Handoff | `onOpenBillingCenter` |

### REMOVE

| Element | Grund |
|---------|-------|
| `masterBilling=organizations` URL-Wert | → `subscriptions` |
| Prisma `subscription.status` in List/Org Billing Tab | Domain only |
| Client-side Org-Filter auf Voll-Load | Server pagination |
| `resolveInvoiceDisplayStatus` OVERDUE-Fallback | Backend-only displayStatus |
| Synthetic `missing-${orgId}` PM rows | Backend liefert vollständige Liste |
| Hardcoded Stripe `TEST` in Invoice Drawer | `runtimeStripeMode` |
| Header „Rechnungsexport" (disabled) | Irreführend |
| Header „Preisstaffel erstellen" | Irreführend |
| Top-Tab „Zahlungsmethoden" | → Subscription Health |
| Top-Tabs Zahlungsversuche / Refunds / Credit Notes | → Invoice Detail |
| Top-Sektion `system-sync` als eigene Root | → `reconciliation` |
| Resend + Outbox als Billing-Nav-Tabs | Plattform-Ops |
| `subscriptionStatusLabel` aus `rental/billing.utils` | Master-only utils |
| Drawer-only Subscription Detail (als einziger Modus) | Full page primary |
| EN-Labels Preview/Draft/Sync/Auto-Fix | DE Copy (§12.3) |
| MRR als primärer Overview-Hero | Sekundär optional |

### MOVE

| Von | Nach | Grund |
|-----|------|-------|
| `organizations` section | `subscriptions` | Fachliche Benennung |
| Reconciliation tab | `reconciliation` root section | Ops-Sichtbarkeit |
| Stripe API + Webhooks | `reconciliation` sub-tabs | Zusammengehörig |
| Payment attempts/refunds/credit notes | Invoice Detail | Drilldown statt Top-Nav |
| Payment method overview | Subscription Detail Billing Health | Kontext |
| Attention (cap 12) | Overview paginated queue | Vollständige Ops-Liste |
| Vertragsaktionen | Detail Tab „Aktionen" nach Overview | Hierarchie |
| Audit aus 4 gleichwertigen Einstiegen | Sekundärer 6. Tab | Selten genutzt |

### MERGE

| Quellen | Ziel | Ergebnis |
|---------|------|----------|
| `system-sync` + reconciliation KPI | `reconciliation` | Abgleich Center |
| `invoices-payments` (5 tabs) | `invoices` + Detail | Eine Rechnungsfläche |
| Overview attention + list warnings | `attention` model | Ein Attention-System |
| `syncStatus` + open drifts | `reconciliationHealth` | Eine Abgleich-Dimension |
| Stripe reconciliation button (2 Orte) | Abgleich Toolbar | Ein Entry Point |

### RENAME

| Alt | Neu |
|-----|-----|
| `masterBilling=organizations` | `masterBilling=subscriptions` |
| `orgId` (billing context) | `subscriptionId` (Wert = organizationId) |
| „Unternehmen & Verträge" | „Verträge" |
| „System & Synchronisation" | „Abgleich" |
| „Rechnungen & Zahlungen" | „Rechnungen" |
| „Aktualisieren" | „Daten neu laden" |
| „Stripe Sync starten" | „Vertrag mit Stripe abgleichen" |
| „Preview" | „Auswirkung berechnen" |
| „Auto-Fix" | „Abweichung automatisch korrigieren" |
| „Gelöst" | „Manuell als geklärt markieren" |
| „Draft erstellen" | „Vertragsentwurf anlegen" |

### ADD

| Element | Typ | Beschreibung |
|---------|-----|--------------|
| `GET /admin/billing/subscriptions` (operational) | API | Paginated, filterbar, enriched mit domainStatus, attention, billingHealth, trial |
| `BillingAttentionSummary` DTO | API | Server-aggregierte Attention |
| `trial: { source, startedAt, endsAt, daysRemaining, conversionState }` | API | Trial-Typ transparent |
| `billingHealth` composite | API | Payment dimension |
| `reconciliationHealth` composite | API | Drift-priorisiert |
| `reconciliationLastRunAt` on overview | API | Freshness |
| `trialsExpiringCount` on overview | API | Trial KPI |
| Enriched drift DTO | API | orgName, localValue, stripeValue |
| `SubscriptionCardList` | UI | Mobile list |
| Subscription Full Page Detail | UI | 10-second hero |
| `StatusChip` billing dimensions | UI | Orthogonal chips |
| Price Version **Picker** | UI | Statt UUID input |
| Confirm + Reason für alle Sensitive+ actions | UI | Action safety |
| Bidirektionaler Org ↔ BCC Link | UI | Navigation |
| `master-billing` utils only | UI | Kein rental import |
| Architecture record | Docs | `architecture/MASTER_ADMIN_BILLING_BLUEPRINT_2026-08-18.md` |

---

## 18. Implementierungsreihenfolge (Vorschlag — nicht Teil dieser Spec)

1. **API enrichment** — subscriptions operational, attention, trial, health composites  
2. **Status remediation** — Domain-only, StatusChip dimensions  
3. **Subscription List + Detail** — List rewrite, Detail hero page  
4. **IA navigation rename** — URL migration mit redirects  
5. **Reconciliation Center** — enriched drifts, merged tabs  
6. **Invoice cleanup** — displayStatus, payment drilldown  
7. **Action safety** — Reason, confirm, copy DE  
8. **Mobile cards**  
9. **Pricing polish** — version picker, usage links  

---

## 19. Akzeptanz (Ziel für UI-6.3)

| Kriterium | Messung |
|-----------|---------|
| 10-Sekunden-Test Subscription Detail | ≥ 85/100 |
| Source-of-Truth Integrity | Keine Prisma-Status in UI; kein client OVERDUE |
| Attention | Sortierbar, filterbar, server-paginated |
| Action Safety | 100% Sensitive+ mit Reason + Confirm |
| Mobile | Keine horizontal-scroll Pflicht auf Verträge/Rechnungen |
| Audit deep links | Vertrag → Audit → Invoice |

---

**Changes / Architektur:** Nicht aktualisiert (Spezifikation — keine Implementierung).

**Nächster Schritt:** UI-6.3 Implementierung gemäß diesem Blueprint und CHANGE MATRIX.
