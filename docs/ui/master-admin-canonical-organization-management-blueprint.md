# Master Admin — Kanonisches Organization Management Blueprint

**Datum:** 2026-08-18  
**Phase:** UI-5.2 (Spezifikation — keine Implementierung)  
**Basis:**
- `docs/ui/master-admin-organizations-deep-audit.md` (UI-5.1)
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- `docs/ui/master-admin-canonical-dashboard-blueprint.md` (UI-4.2)
- `docs/ui/master-admin-dashboard-post-remediation.md` (UI-4.4)
- Kanonische Billing-/Tenant-/DIMO-Architektur (Backend)

**Leitfrage:** *Ist diese Organisation gesund — und wenn nicht, was erfordert meine Aufmerksamkeit?*

**Grundsatz:** Eine Wahrheit pro Domäne. Keine Frontend-Ableitung von Billing, Connectivity oder Integrationsstatus. Keine Mock-Toggles. Keine UUID-Wand.

---

## 0. Produktrolle & Abgrenzung

| Organisationen **sind** | Organisationen **sind nicht** |
|---------------------------|-------------------------------|
| Tenant Control Plane für Master Admins | Ersatz für Billing Control Center |
| Index + Detail für Mandanten-Ops | Vollständige Fleet Connection Console |
| Kanonische Signale + Drilldowns | Org-Admin Settings (Rental Company Profile) |
| Privilegierte Lifecycle-Aktionen (mit Guardrails) | Impersonation / Act-As (nicht vorhanden) |

**10-Sekunden-Ziel (nach Umsetzung):** Master Admin erkennt in Overview: Org-Status, Subscription-Status, Billing-Gesundheit, Nutzer-/Fahrzeug-Kontext, Integrationsprobleme, aktive Issues — mit klarem nächsten Schritt.

---

## 1. Organizations List — Target State

### 1.1 Page Shell

```
MasterPageHeader (page)
  title: „Organisationen"
  description: „Mandanten-Index — Status, Abrechnung und Handlungsbedarf"
  primaryAction: „Organisation anlegen"

MasterTableShell
  ├── Toolbar: Search | Primary Filters | „Weitere Filter" | Refresh
  ├── Desktop: DataTable (max 6 sichtbare Spalten + Actions)
  ├── Mobile: MobileOrgCardList (keine Desktop-Tabelle)
  └── Pagination (server-seitig)
```

**Container:** `PageContainer variant="standard"`  
**Sprache:** DE kanonisch (`master.org.*`)

### 1.2 Spalten (exakt — Desktop)

| # | Spalte | Inhalt | Priorität | Breite |
|---|--------|--------|-----------|--------|
| **1** | **Organisation** (primär) | `companyName` (semibold) | P0 | flex, min 200px |
| | *Sekundäre Identität* (subline) | `city, country` · optional `shortCode` wenn gesetzt | P1 | unter Name |
| **2** | **Status** | Org-Status Chip (ACTIVE/PENDING/SUSPENDED/ARCHIVED) | P0 | compact |
| **3** | **Abo** | Subscription-Status Chip (`ACTIVE`/`TRIALING`/`PAST_DUE`/`CANCELLED`/`NONE`) | P0 | compact |
| **4** | **Abrechnung** | Billing Health: `OK` / `Warnung` / `Kritisch` aus `warnings[]` + `syncStatus` | P0 | compact |
| **5** | **Fahrzeuge** | `billableVehicleCount` / `connectedVehicleCount` tabular | P1 | numeric, ~80px |
| **6** | **Aufmerksamkeit** | Attention Indicator (Icon + count oder „—") | P0 | ~48px |
| **7** | **Zuletzt aktiv** | `lastActiveAt` relativ (DE) | P2 | ~100px |
| **8** | **Actions** | Overflow-Menü (nicht inline Delete) | P1 | sticky right |

**Nicht in der Liste:**
- MRR, ARR, projected amounts
- Plan/Tarif-Label (Detail + Billing)
- Stripe IDs
- UUID
- Volle Integrationsliste
- Einzelne Fahrzeugzustände

### 1.3 Row-Verhalten

| Interaktion | Verhalten |
|-------------|-----------|
| Row click | → `?view=organizations&orgId={id}` |
| Attention click | → Detail Overview mit Issues fokussiert |
| Keyboard | Row focusable; Enter öffnet Detail |
| Highlight | Zeile mit `attentionSeverity >= warning` dezente linke Border |

### 1.4 Mobile Row/Card

```
┌─────────────────────────────────────────┐
│ ● Acme Mobility GmbH          [Kritisch]│
│   Berlin · Abo: Überfällig              │
│   Abrechnung: Warnung · 12/14 Fzg.      │
│   2 Aufmerksamkeiten · vor 2 Std.       │
└─────────────────────────────────────────┘
```

Reihenfolge: Name → Attention → Subscription → Billing → Vehicles → Last active.  
Kein horizontales Scrollen.

### 1.5 Empty / Loading / Error

| State | UI |
|-------|-----|
| Loading | `MasterTableShell` + `DataTable loading` / Card skeletons |
| Empty (keine Orgs) | `MasterEmptyState` + CTA „Organisation anlegen" |
| Empty (Filter) | „Keine Treffer" + Filter zurücksetzen |
| Error | `MasterErrorState` + Retry (kein stilles `[]`) |

---

## 2. Attention Model

### 2.1 Prinzip

**„Needs Attention"** ist ein **serverseitig berechneter, kanonischer Aggregat-Status** pro Organisation. Das Frontend mappt nur Codes auf Labels, Severity und Drilldown — **keine neue Business-Logik**.

### 2.2 Kanonische Reason-Codes

| Code | Severity | Quelle (bestehend) | DE Label | Drilldown |
|------|----------|-------------------|----------|-----------|
| `PAST_DUE` | warning | `billingSubscription.status` / `warnings[]` | Überfällig | Billing Tab / BCC |
| `PAYMENT_METHOD_MISSING` | warning | `billingPaymentMethods` + active sub | Keine Zahlungsmethode | Billing |
| `RECONCILIATION_DRIFT` | critical | `billingReconciliationDrift` unresolved | Abgleichsabweichung | Billing → System Sync |
| `PRICE_NOT_CONFIGURED` | warning | `preview.calculationStatus` | Preis nicht konfiguriert | Billing |
| `NO_ACTIVE_PRICE_VERSION` | warning | `preview.calculationStatus` | Keine aktive Preisversion | Billing |
| `STRIPE_SYNC_PARTIAL` | warning | `syncStatus === 'PARTIAL'` | Stripe teilweise | Billing |
| `STRIPE_SYNC_MISSING` | critical | `syncStatus === 'MISSING'` + active sub | Stripe nicht verknüpft | Billing |
| `ORG_SUSPENDED` | critical | `OrganizationStatus.SUSPENDED` | Organisation gesperrt | Einstellungen |
| `ORG_ARCHIVED` | warning | `OrganizationStatus.ARCHIVED` | Archiviert / Churned | Einstellungen |
| `INTEGRATION_ERROR` | critical | `OrganizationIntegration.status === ERROR` | Integrationsfehler | Integrationen |
| `CONNECTIVITY_DEGRADED` | warning | Org connectivity summary (s.u.) | Konnektivität eingeschränkt | Fahrzeuge / Fleet Connection |
| `CONNECTIVITY_CRITICAL` | critical | Org connectivity summary | Viele Fahrzeuge offline | Fahrzeuge |
| `OPEN_SUPPORT_CRITICAL` | warning | Support stats org-scoped (Phase 2) | Kritische Support-Tickets | Support |

**Nicht als Attention (nur informativ):**
- `NO_BILLABLE_VEHICLES` — Billing-Hinweis, kein Ops-Alarm (außer bei aktivem Paid-Sub)
- `live` / `standby` Telemetrie — normal

### 2.3 Aggregat-Felder (DTO)

```typescript
interface OrganizationAttentionDto {
  organizationId: string;
  severity: 'none' | 'warning' | 'critical';  // höchste aus reasons
  reasons: string[];                           // kanonische Codes
  primaryReason: string | null;                // für Listen-Subline
  reasonCount: number;
}
```

**Berechnung:** Serverseitig in List/Detail-Aggregat (gleiche Logik wie Dashboard `loadOrganizationsAttention` + Billing `warnings[]` + Integration ERROR + Connectivity-Schwellwert).

### 2.4 Connectivity-Schwellwert (kanonisch)

Nutzt **`telemetry-freshness.resolver`** — identisch zu Dashboard/Fleet:

| Bedingung | Attention |
|-----------|-----------|
| `offline + no_signal` > 25% der DIMO-verknüpften Fahrzeuge | `CONNECTIVITY_DEGRADED` |
| `offline + no_signal` > 50% oder 0 connected bei `dimoTotal > 0` | `CONNECTIVITY_CRITICAL` |

**Quelle:** `GET /admin/connectivity/organizations/:orgId/summary` (**neu**, Backend-Prerequisite — Histogram pro Org, kein Frontend-Resolver).

### 2.5 Listen-Darstellung

| `severity` | UI |
|------------|-----|
| `none` | Em-dash „—" (ruhig) |
| `warning` | `StatusDot` warning + Zahl oder Tooltip |
| `critical` | `StatusChip` critical + Zahl |

---

## 3. Filters

### 3.1 Primäre Filter (Toolbar, immer sichtbar)

| Filter | Werte | Quelle |
|--------|-------|--------|
| **Suche** | Freitext | `companyName`, `email`, `city`, `shortCode` (server) |
| **Org-Status** | Alle · Aktiv · Einrichtung · Gesperrt · Archiviert | `OrganizationStatus` |
| **Abo-Status** | Alle · Aktiv · Testphase · Überfällig · Gekündigt · Kein Abo | `subscription.status` |
| **Handlungsbedarf** | Alle · Ja · Kritisch · Warnung | `attention.severity` |

### 3.2 „Weitere Filter" (Dropdown / Sheet)

| Filter | Werte | Begründung |
|--------|-------|------------|
| **Abrechnung** | OK · Warnung · Kritisch | `billingHealth` aggregiert |
| **Stripe-Sync** | Synced · Partial · Missing · None | `syncStatus` |
| **Konnektivität** | OK · Eingeschränkt · Kritisch | connectivity summary |
| **Branche** | RENTAL, FLEET, … | `businessType` |
| **Zahlungsmethode** | Vorhanden · Fehlt | `paymentMethodStatus` |

**Nicht als Filter:** Einzelne DB-Enums ohne Ops-Nutzen, MRR-Bereiche, Trial-Org-Status (verwirrend mit Billing TRIALING).

### 3.3 Server-Vertrag

```
GET /admin/organizations/operational?
  search=&page=&limit=
  &orgStatus=&subscriptionStatus=
  &attention=&billingHealth=
  &connectivity=&syncStatus=
  &businessType=&paymentMethod=
```

Alle Filter serverseitig — **kein Client-Filter** auf Teilmengen.

---

## 4. Organization Detail Header

### 4.1 Context Header (`MasterPageHeader variant="context"`)

```
[← Organisationen]

Acme Mobility GmbH                    [Org: Aktiv] [Abo: Überfällig] [⚠ 2]
Car Rental · Berlin, DE · Kunde seit 12.03.2024

[Abrechnung öffnen]  [⋯ Mehr]
```

| Zone | Inhalt |
|------|--------|
| **Back** | `Zurück zu Organisationen` → entfernt `orgId` |
| **Title** | `companyName` |
| **Status Chips** | Org-Status + Subscription-Status + Attention (wenn > none) |
| **Meta-Zeile** | `businessType` · `city, country` · `Kunde seit {createdAt}` |
| **Primary Action** | „Abrechnung öffnen" → Billing BCC mit `orgId` |
| **Secondary** | Overflow: Metadaten bearbeiten, Aktualisieren |

**Keine UUID**, kein Stripe-ID im Header.

### 4.2 Technical Details (collapsible, Overview oder Einstellungen)

| Feld | Sichtbarkeit |
|------|--------------|
| Organisation-ID | Copy-Button, monospace klein |
| Short Code | wenn gesetzt |
| Stripe Customer ID | maskiert, nur mit Billing-Zugriff |
| Stripe Subscription ID | maskiert |
| Erstellt / Aktualisiert | ISO → DE formatiert |

### 4.3 URL-State

```
/master?view=organizations&orgId={uuid}&orgTab=overview
```

`orgTab` Pflicht für shareable Detail — `useMasterPageUrl` / `MasterPageTabs` synced.

---

## 5. Organization Overview

### 5.1 Zweck

Innerhalb von **5 Sekunden** beantworten (ohne Scroll auf Desktop):

1. Ist die Organisation operativ aktiv/gesperrt?
2. Wie steht das Abo?
3. Ist die Abrechnung gesund?
4. Gibt es aktive Issues?
5. Wie viele Nutzer / Fahrzeuge (mit Konnektivitäts-Kontext)?

**Keine Detailtabellen** — nur Signale + Drilldown-Links zu Tabs.

### 5.2 Section-Reihenfolge (fix)

| # | Section | Priorität |
|---|---------|-----------|
| 1 | **Active Issues** (nur wenn `attention.reasons.length > 0`) | P0 |
| 2 | **Status Strip** (4 Domain-Chips) | P0 |
| 3 | **Key Metrics** (2×2 Grid) | P1 |
| 4 | **Integration Health** (kompakt) | P1 |
| 5 | **Technical Details** (collapsed) | P3 |

### 5.3 Active Issues

```
┌─ Handlungsbedarf ─────────────────────────────────────┐
│ ● Kritisch · Abgleichsabweichung offen    [Öffnen]   │
│ ● Warnung · Keine Zahlungsmethode         [Öffnen]   │
└──────────────────────────────────────────────────────┘
```

- Max 5 sichtbar; „Alle anzeigen" wenn mehr
- Jede Zeile: Severity, Label, Drilldown (Tab oder BCC)
- Empty: Section **ausblenden** (nicht „Alles OK" Banner)

### 5.4 Status Strip (Domain Chips)

| Chip | Quelle | OK / Warning / Critical |
|------|--------|-------------------------|
| **Organisation** | `OrganizationStatus` | ACTIVE=ok, PENDING=neutral, SUSPENDED=critical, ARCHIVED=warning |
| **Abrechnung** | `warnings[]` + `syncStatus` | siehe Attention |
| **Konnektivität** | org connectivity summary | degraded/critical thresholds |
| **Integrationen** | worst of org integrations | ERROR=critical, INACTIVE=neutral |

### 5.5 Key Metrics (keine Vanity)

| Metric | Wert | Drilldown |
|--------|------|-----------|
| Aktive Nutzer | `activeMembershipCount` | Tab Benutzer |
| Fahrzeuge | `connected / billable` oder `total` | Tab Fahrzeuge |
| Tarif | `tariffLabel` (Billing) | Tab Abrechnung |
| Nächste Abbuchung | `nextChargeAt` oder „—" | Tab Abrechnung |

**Entfernt aus Overview:** MRR-Kachel, Product-Count-Vanity, duplicate Quick Stats.

### 5.6 Integration Health (kompakt)

Eine Zeile pro Integration **Typ** (nicht jede Instanz):

```
DIMO · Verbunden · Stripe · Sync OK · WooCommerce · Getrennt
```

Max 4 Zeilen + „Alle Integrationen" → Tab.

---

## 6. Tabs — Endgültige IA

### 6.1 Entscheidungsmatrix

| Tab | Behalten? | Begründung |
|-----|-----------|------------|
| **Übersicht** | ✓ ADD (ersetzt „Overview") | Ops-Einstieg — immer |
| **Benutzer** | ✓ KEEP | Ausreichend Inhalt, org-scoped |
| **Fahrzeuge** | ✓ KEEP | Connectivity + Fleet-Ops |
| **Abrechnung** | ✓ KEEP | Summary + BCC-Drilldown |
| **Integrationen** | ✓ KEEP | Read-only Status + Drilldowns |
| **Aktivität** | ✓ ADD | Activity Log org-filtered |
| **Einstellungen** | ✓ ADD | Metadata, payments flag, Danger Zone |
| ~~Products~~ | ✗ REMOVE | → Billing Entitlements |
| ~~Billing (nur Link)~~ | MERGE | Summary im Tab, volle Macht in BCC |

### 6.2 Tab-Reihenfolge (URL `orgTab`)

| `orgTab` | Label DE | Page Type |
|----------|----------|-----------|
| `overview` | Übersicht | Detail §5 |
| `users` | Benutzer | List (scoped) |
| `vehicles` | Fahrzeuge | List (scoped) |
| `billing` | Abrechnung | Summary + CTA |
| `integrations` | Integrationen | Card grid |
| `activity` | Aktivität | Timeline/Table |
| `settings` | Einstellungen | Form + Danger Zone |

**Mobile:** `MasterPageTabs` horizontal scroll; Overview-Inhalt priorisiert Issues vor Metrics.

---

## 7. Billing Tab

### 7.1 Rolle

**Summary + Handoff** — keine zweite Billing Control Center Oberfläche. Alle Mutationen in BCC / `BillingOrgDetailDrawer`.

### 7.2 Sections

| Section | Felder | Quelle |
|---------|--------|--------|
| **Vertrag** | Tarif, Price Version, Status, Trial bis, Beginn, Kündigung | `billing/organizations` row + `masterSubscriptionOverview` |
| **Zahlung** | Zahlungsmethode Status, letzte/fehlgeschlagene Zahlung | overview + `paymentMethodStatus` |
| **Nutzung** | Abrechenbare / verbundene Fahrzeuge | `billableVehicleCount`, `connectedVehicleCount` |
| **Rechnungen** | Letzte Rechnung, offener Betrag, nächste Vorschau | row `lastInvoice`, `openAmountCents`, `nextInvoicePreview` |
| **Abgleich** | `syncStatus`, Reconciliation-Hinweis wenn drift | `syncStatus` + drift count |
| **Stripe** (Technical, collapsed) | Customer ID, Subscription ID (maskiert) | subscription fields |

### 7.3 Primary CTA

```
[Abrechnung im Control Center öffnen]
→ ?view=billing&masterBilling=organizations&orgId=
```

### 7.4 Keine lokalen Toggles

Kein Plan-Select, kein Subscription-Status-Edit in Org-Tab — nur in BCC mit `MASTER_BILLING` / `MASTER_SUBSCRIPTION` Step-up.

---

## 8. Users Tab

### 8.1 Rolle

Master-Admin **Überblick + eingeschränkte Eingriffe** — kein Ersatz für Org-Admin User Management.

### 8.2 Tabelle

| Spalte | Inhalt |
|--------|--------|
| Nutzer | Name + Email |
| Rolle | Membership role Chip |
| Status | ACTIVE / INVITED / SUSPENDED |
| Sicherheit | MFA enrolled (wenn API liefert) · „Passwort-Reset ausstehend" |
| Zuletzt aktiv | `lastLoginAt` relativ |
| Actions | Overflow nur MA-relevant |

### 8.3 MA-erlaubte Actions

| Action | Kategorie | Hinweis |
|--------|-----------|---------|
| Nutzer anlegen (Org Admin) | Sensitive | Wizard / Modal |
| Passwort zurücksetzen | Sensitive | `MASTER_USER_MANAGEMENT` |
| Sessions widerrufen | High Risk | Step-up |
| Rolle ändern | Sensitive | Nur wenn MA-Policy erlaubt |
| Nutzer löschen | Destructive | Reason + Confirm |

**Nicht im Org-Tab:** Tägliche Org-Admin-Workflows (Einladungs-E-Mails bearbeiten, Permissions-Matrix) → Hinweis „Im Mandanten-Admin verwalten".

### 8.4 Datenquelle

```
GET /admin/users?organizationId={orgId}   (ADD query param — heute: client filter)
```

Pagination serverseitig. Kein `listAll()` + Filter.

---

## 9. Vehicles Tab

### 9.1 Rolle

Organisationsperspektive auf die Flotte — **kein** Vehicle Detail Duplicate.

### 9.2 Summary-Zeile (über Tabelle)

```
14 Fahrzeuge · 12 verbunden · Live 8 · Standby 2 · Offline 2
```

Quelle: org connectivity summary + vehicle count.

### 9.3 Tabelle

| Spalte | Inhalt |
|--------|--------|
| Fahrzeug | Name + Kennzeichen |
| Identität | VIN (truncated, monospace) |
| Konnektivität | Freshness Chip (`live`/`standby`/`signal_delayed`/`offline`/`no_signal`) |
| Telemetrie | `lastSignal` relativ |
| Betrieb | Fleet status Chip |
| Gesundheit | `HealthStatusChip` |
| Actions | „Öffnen" → Platform Vehicles oder Fleet Connection gefiltert |

### 9.4 Datenquellen

```
GET /organizations/{orgId}/vehicles?page=&limit=     (scoped list)
GET /admin/connectivity/organizations/{orgId}/summary   (ADD — freshness histogram)
```

**Keine** lokale `online`/`offline`-Ableitung. Kanonisch: `telemetry-freshness.resolver` im Backend.

### 9.5 Drilldown

Row click → `?view=vehicles` mit Fahrzeug-Fokus **oder** Fleet Connection org-filter (wenn vorhanden). Kein eigener Vehicle-Detail-Tab.

---

## 10. Integrations Tab

### 10.1 Rolle

**Status-Übersicht + Drilldown** — keine Secrets, keine Connect/Disconnect-Mocks.

### 10.2 Karten pro Integration

| Feld | Inhalt |
|------|--------|
| Name | DIMO · Stripe · WooCommerce · Shopify · Voice · … |
| State | Connected / Degraded / Error / Inactive |
| Last Sync | `lastSyncAt` relativ oder „—" |
| Error | Kurztext wenn `status === ERROR` |
| Action Required | Badge wenn Attention-Code |
| CTA | „Verwalten" → Fach-View |

### 10.3 Drilldown-Matrix

| Integration | Deep Dive View |
|-------------|----------------|
| DIMO | `fleet-connection` (org filter) |
| Stripe | Billing BCC |
| WooCommerce / Shopify | Settings → Integrations (org) oder dedizierte Admin |
| Voice | Voice Control Plane Org Workspace |
| Email | Settings → Email |

### 10.4 Verboten

- API Keys / Secrets anzeigen
- Lokale Connect/Disconnect-Toggles ohne Backend
- Test-Button ohne Handler

Disconnect nur in Fach-View mit `MASTER_INTEGRATIONS` + Reason + Audit.

---

## 11. Activity / Audit Tab

### 11.1 Zwei Schichten (klar getrennt)

| Schicht | Beschreibung | Filter |
|---------|--------------|--------|
| **Operative Aktivität** | Business events (USER, VEHICLE, BOOKING, …) | `entity != ADMIN_OPERATION` |
| **Privilegiertes Audit** | Master-Admin-Mutationen mit Envelope | `entity === ADMIN_OPERATION` + `metaJson.auditDomain` |

Toggle oder Sub-Tabs: „Aktivität" | „Master-Audit".

### 11.2 Zeilen-Schema

| Spalte | Operativ | Audit |
|--------|----------|-------|
| Zeit | `createdAt` | `createdAt` |
| Akteur | `userName` | `actor` + platform role |
| Aktion | `action` | `auditAction` code |
| Ziel | `entity` + `description` | `target` + `entityId` |
| Grund | — | `reasonCode` aus Envelope |
| Ergebnis | — | `httpStatus` / success |

### 11.3 Datenquelle

```
GET /admin/activity-log?organizationId={orgId}&page=&limit=
```

**ADD:** `organizationId` Query-Param im Admin-Controller exponieren (Service unterstützt bereits).

Export: bestehend `GET /admin/activity-log/export?organizationId=` mit `MASTER_AUDIT_EXPORT` Step-up.

---

## 12. Privileged Actions

### 12.1 Kategorien

| Kategorie | Beispiele | UI-Regel |
|-----------|-----------|----------|
| **Normal** | Metadaten bearbeiten, Liste aktualisieren | Standard Buttons |
| **Sensitive** | Org-Admin anlegen, User-PW-Reset, Metadata kritisch | Confirm Dialog |
| **High Risk** | Status SUSPENDED, payments toggle, Integration disconnect, Subscription pause | Eigene Section + Step-up MFA |
| **Destructive** | Org löschen, irreversible Datenaktion | Danger Zone only |

### 12.2 Action-Matrix

| Action | Kategorie | Placement | Confirm | MFA Step-up | Reason | Audit |
|--------|-----------|-----------|---------|-------------|--------|-------|
| Org anlegen | Sensitive | List Header | Wizard | `MASTER_ORGANIZATION` | — | ✓ |
| Metadaten bearbeiten | Normal | Settings Tab | Save | `MASTER_ORGANIZATION` | — | ✓ |
| Org-Admin anlegen | Sensitive | Settings / Wizard | ✓ | `MASTER_ORGANIZATION` | — | ✓ |
| Org suspendieren | High Risk | Settings | ✓ + typed confirm | `MASTER_ORGANIZATION` | **Pflicht** | ✓ |
| Payments enable/disable | High Risk | Settings | ✓ | `MASTER_ORGANIZATION` | Empfohlen | ✓ |
| Subscription ändern | High Risk | Billing BCC only | AlertDialog | `MASTER_BILLING` / `MASTER_SUBSCRIPTION` | bei pause/cancel | ✓ |
| Integration disconnect | High Risk | Fach-View only | ✓ | `MASTER_INTEGRATIONS` | **Pflicht** | ✓ |
| User löschen | Destructive | Users overflow | ConfirmDialog | `MASTER_USER_MANAGEMENT` | **Pflicht** | ✓ |
| **Org löschen** | **Destructive** | **Danger Zone** | Typed name + reason | `MASTER_ORGANIZATION` | **Pflicht** | ✓ |

### 12.3 Reason-Vertrag

Backend: `body.reason` | `body.auditReason` | `x-privileged-reason` Header.  
UI: `PrivilegedActionDialog` mit Pflichtfeld „Begründung" für High Risk + Destructive.

### 12.4 Keine Vermischung

High-Risk- und Destructive-Actions **nie** in Header-Button-Reihe oder Tabellen-Row-Icons. Nur Settings/Danger Zone oder BCC.

---

## 13. Danger Zone

### 13.1 Placement

Tab **Einstellungen** → untere Section, visuell isoliert (`border-critical`, Abstand).

### 13.2 Enthaltene Aktionen (nur wenn Backend existiert)

| Action | Existiert heute |
|--------|-----------------|
| Organisation endgültig löschen | ✓ `DELETE /admin/organizations/:id` |
| Irreversible Integration trennen | In Fach-View, nicht in Danger Zone |
| Datenlöschung DSGVO | ✓ `PRIVACY_DATA_DELETION` (global IAM, nicht Org-scoped) |

### 13.3 UX

```
┌─ Gefahrenzone ────────────────────────────────────────┐
│ Organisation löschen                                   │
│ Entfernt den Mandanten und alle zugehörigen Daten.     │
│ Diese Aktion kann nicht rückgängig gemacht werden.    │
│                                                        │
│ [Organisation löschen…]  (destructive, outline)        │
└────────────────────────────────────────────────────────┘
```

Dialog: Org-Name eintippen + Reason + MFA bereits aktiv via Gate.

---

## 14. Responsive

### 14.1 Organizations List

| Breakpoint | Layout |
|------------|--------|
| `< md` | `MobileOrgCardList` — keine Tabelle |
| `≥ md` | `DataTable` max 6 Spalten; „Zuletzt aktiv" optional hidden `< lg` |
| Filter | Stack vertical; Primary 2×2 grid auf Tablet |

### 14.2 Organization Detail

| Breakpoint | Verhalten |
|------------|-----------|
| Mobile | Header stack; Issues vor Metrics; Tabs scroll |
| Tablet | 2-col Metrics; Tables horizontal scroll ok |
| Desktop | Overview 2-col wo sinnvoll |

### 14.3 Actions

Overflow-Menü statt mehrerer Icon-Buttons auf `< md`.

---

## 15. Data Contracts

### 15.1 Aggregat-Endpoint (empfohlen)

```
GET /admin/organizations/operational
```

Single Source für List + Detail-Header-Snapshot. Alternativ: List nutzt `billing/organizations` joined mit Org-Metadaten — **ein** gewählter Pfad in Implementierung.

| Information | Source of Truth | Endpoint | Refresh | Stale | Action |
|-------------|-----------------|----------|---------|-------|--------|
| **Org Identity** | `Organization` | `GET /admin/organizations/:id` | on detail mount | 5 min hint | Edit settings |
| **Org Status** | `Organization.status` | operational DTO | 60s list / on mount detail | Stale chip | Suspend in settings |
| **Subscription Status** | `BillingSubscription.status` | `GET /admin/billing/organizations` | 60s | 5 min | Billing tab |
| **Tarif / Plan** | Contract `priceVersion` | billing row + `masterSubscriptionOverview` | on billing tab | — | BCC |
| **Billing Warnings** | `billing-admin` warnings[] | billing row | 60s | partial error per org | Drilldown |
| **Stripe Sync** | `syncStatus` computed | billing row | 60s | — | BCC sync |
| **Reconciliation** | `billingReconciliationDrift` | billing overview / drift API | 120s | — | BCC system sync |
| **Attention** | Server aggregate | operational DTO | 60s | — | Issue rows |
| **User Count** | Active memberships | `GET /admin/organizations/:id` or stats | on users tab | — | Users tab |
| **Vehicle Counts** | billable + connected | billing row + org stats | 60s | — | Vehicles tab |
| **Telemetry Freshness** | `telemetry-freshness.resolver` | `GET /admin/connectivity/organizations/:orgId/summary` (**ADD**) | 120s | — | Vehicles / Fleet |
| **Integration Health** | `OrganizationIntegration` | `GET /admin/organizations/:id` include | on integrations tab | — | Fach-View |
| **Last Active** | `Organization.lastActiveAt` | org DTO | 60s | — | — |
| **Activity** | `ActivityLog` | `GET /admin/activity-log?organizationId=` | on tab | — | — |
| **Privileged Audit** | `ActivityLog` ADMIN_OPERATION | same + envelope filter | on tab | — | Export (step-up) |
| **paymentsEnabled** | `Organization.paymentsEnabled` | org DTO / PATCH | on settings | — | Toggle (high risk) |

### 15.2 Label-Mapping (Org Status DE)

| DB | UI Label | Hinweis |
|----|----------|---------|
| ACTIVE | Aktiv | |
| PENDING | **Einrichtung** | **RENAME** — nicht „Trial" |
| SUSPENDED | Gesperrt | |
| ARCHIVED | Archiviert | |

Billing `TRIALING` bleibt **„Testphase"** — nur im Abo-Kontext.

---

## 16. Change Matrix

### REMOVE

| Element | Grund |
|---------|-------|
| Spalte **MRR** in Organizations List | Nicht kanonisch; Billing only |
| Spalte **Plan** in Organizations List | Contract/Tarif gehört Billing |
| Filter **Plan** (Starter/Business/…) | Ersetzt durch Abo-Status + Tarif in Detail |
| Tab **Products** mit Enable/Disable | Mock; Entitlements in Billing |
| **toggleIntegration** / **toggleProduct** | Lokale Mock-Mutation |
| **Logo-Upload Placeholder** ohne API im Wizard | Toter UI |
| **Quick Stats** MRR/Products in Overview | Vanity duplicate |
| Inline **Delete** Icon in List Row | → Danger Zone + Overflow |
| EN-Labels „Organizations", „Overview", … | DE kanonisch |

### KEEP

| Element | Anpassung |
|---------|-----------|
| `MasterPageHeader` + `PageContainer` | DE Titel |
| `DataTable` / `MasterTableShell` Pattern | + server pagination |
| `MasterPageTabs` in Detail | + URL `orgTab` |
| Billing Tab → BCC Handoff | + Summary-Inhalt |
| Org Create Wizard (2-step) | Felder an API anbinden |
| `ConfirmDialog` für Destructive | + Reason field |
| Back navigation + `orgId` URL | ✓ |
| `HealthStatusChip`, `StatusChip`, Freshness labels | Kanonisch |

### MOVE

| Von | Nach |
|-----|------|
| Plan/Tarif/MRR | List → Billing Tab + BCC |
| Org Delete | List Row → Settings Danger Zone |
| Product entitlements | Products Tab → Billing Tab |
| Stripe References | Überall → Billing Technical (collapsed) |
| Short Code | Modal only → Technical Details |
| Attention (Dashboard only) | Dashboard → List + Detail Overview |

### MERGE

| A | B | Ergebnis |
|---|---|----------|
| Overview + Quick Stats | Status Strip + Key Metrics | **Übersicht** Tab |
| Billing (link only) | Billing summary fields | **Abrechnung** Tab mit Summary + CTA |
| Dashboard Org Attention | List Attention column | Ein Attention-Modell |
| Activity Log global filter | Org Activity Tab | `organizationId` param |
| Operative + Admin logs | Activity Tab sub-views | Zwei Filter, eine Tabelle |

### RENAME

| Alt | Neu |
|-----|-----|
| Organizations | **Organisationen** |
| Overview | **Übersicht** |
| Trial (Org PENDING) | **Einrichtung** |
| Trial (Billing TRIALING) | **Testphase** |
| Connected (integration) | **Verbunden** |
| Churned | **Archiviert** |

### ADD

| Element | Typ |
|---------|-----|
| `GET /admin/organizations/operational` | Backend aggregiert List + Attention |
| `GET /admin/connectivity/organizations/:orgId/summary` | Org freshness histogram |
| `organizationId` auf `GET /admin/users` | Server-scoped user list |
| `organizationId` auf `GET /admin/activity-log` Controller | Org Activity Tab |
| **Attention** Spalte + Filter | List |
| **Active Issues** Section | Overview |
| Tab **Aktivität** | Detail |
| Tab **Einstellungen** + Danger Zone | Detail |
| `orgTab` URL param | Detail deep links |
| `PrivilegedActionDialog` mit Reason | High risk / destructive |
| `MobileOrgCardList` | Responsive list |
| Loading/Error states | List + Detail |
| Technical Details collapsible | Header/Overview/Settings |

---

## 17. Implementierungs-Reihenfolge (Hinweis)

1. Backend: `operational` DTO + org connectivity summary + query params  
2. List: neue Spalten, Server-Filter, Mobile cards, Attention  
3. Detail: frischer fetch, `orgTab` URL, Overview remediation  
4. Tabs: Billing summary, Users/Vehicles scoped APIs, Activity, Settings  
5. Privileged actions: Reason dialogs, Danger Zone, Mock-Entfernung  
6. i18n DE + Regression (Sidebar, BCC, Dashboard Attention links)

---

## 18. Akzeptanz (10-Sekunden-Test — Ziel)

| # | Frage | Ziel-Antwortort |
|---|-------|-----------------|
| 1 | Ist die Organisation aktiv? | Header Org-Chip |
| 2 | Billing gesund? | Overview Status Strip + Issues |
| 3 | Welches Abo? | Header Abo-Chip + Overview Tarif |
| 4 | Zahlungsprobleme? | Issues + Billing Tab |
| 5 | Aktive Nutzer? | Overview Metric → Users Tab |
| 6 | Fahrzeuge verbunden? | Overview + Vehicles summary |
| 7 | Integrationen OK? | Overview Integration line |
| 8 | Kritische Incidents? | Issues Section |
| 9 | Gesperrt/eingeschränkt? | Org-Chip + Issues |
| 10 | Handlungsbedarf? | Issues + Attention |

**Ziel-Score (ops-gewichtet):** ≥ **85/100** (Ist: ~42/100 per Audit UI-5.1).

---

## Quellen

| Dokument / Modul | Pfad |
|------------------|------|
| Deep Audit | `docs/ui/master-admin-organizations-deep-audit.md` |
| Page Framework | `docs/ui/master-admin-canonical-page-framework.md` |
| Billing Orgs | `billing-admin.service.ts` → `listOrganizationsBilling()` |
| Dashboard Attention | `platform-dashboard.service.ts` → `loadOrganizationsAttention()` |
| Telemetry | `telemetry-freshness.resolver.ts` |
| Privileged Audit | `master-admin-privileged-audit.interceptor.ts` |
| MFA Policy | `iam-mfa.policy.ts` → `STEP_UP_ACTION` |

**Keine Implementierung in Phase UI-5.2.**
