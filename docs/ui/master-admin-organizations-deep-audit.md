# Master Admin — Organizations Deep Audit

**Datum:** 2026-08-18  
**Phase:** UI-5.1 (read-only — keine Implementierung)  
**Scope:**
- `OrganizationsView` — Listenansicht
- `OrganizationDetailView` — Detailansicht (Tabs: Overview, Users, Vehicles, Integrations, Billing, Products)
- Zugehörige Datenflüsse in `App.tsx`, APIs, Billing Control Center (Org-Kontext)

**Basis:**
- UI-1 bis UI-4 (Navigation, Page Framework, Dashboard Remediation)
- `docs/ui/master-admin-canonical-page-framework.md`
- `docs/ui/master-admin-canonical-navigation-blueprint.md`
- `docs/ui/master-admin-dashboard-post-remediation.md`
- Kanonische Billing-/Tenant-/DIMO-Remediation (Backend)

**Leitfrage:** Kann ein Master Admin innerhalb von **10 Sekunden** den Zustand einer Organisation erfassen und wissen, ob Handlungsbedarf besteht?

---

## 1. Executive Summary

Die Master-Admin-**Organizations**-Oberfläche ist technisch an echte APIs angebunden (`GET /admin/organizations`, CRUD, Billing Control Center), fachlich jedoch **keine enterprise-taugliche Tenant Control Plane**. Sie vermischt drei Wahrheitsebenen (Org-Status, Billing-Subscription, lokale UI-Mocks), zeigt **irreführende Billing-Signale** in der Liste (MRR, Plan), und die Detailansicht **erfindet Integrations-/Produkt-Zustände clientseitig**.

| Dimension | Ist-Zustand |
|-----------|-------------|
| **Listen-UX** | Solide `DataTable`-Basis, aber EN-UI, keine Server-Suche, kein Loading, Client-Filter auf max. 100 Orgs |
| **Org-Klarheit** | Name + Stadt sichtbar; keine Billing-Referenz, keine Attention-Signale, UUID versteckt (gut) aber Short Code nur im Modal |
| **Informationshierarchie** | Detail: 6 Tabs, aber Overview ohne operativen Fokus; Billing korrekt ausgelagert; Security/Audit fehlen |
| **Billing-Klarheit** | **Zweite Wahrheit** in Listenspalten MRR/Plan; kanonisch nur in Billing Control Center |
| **Operative Awareness** | Keine Incidents, keine Connectivity-/Payment-Warnings auf Org-Ebene |
| **Action Safety** | Delete ohne `reason` (Backend verlangt es); Integration/Product-Toggles ohne API; MFA-Gate auf Controller |
| **Datenvertrauen** | Mittel — stille API-Fehler beim Initial-Load; Detail nutzt List-Snapshot, nicht `GET :id` |
| **Responsive** | Filter stacken mobil; Detail-Tabellen horizontal scrollen; keine Card-Fallback-Liste |
| **Accessibility** | `DataTable` semantisch ok; Row-Actions ohne SR-Labels; gemischte EN/DE |
| **Technische Sauberkeit** | Globaler Bulk-Load aller Users/Vehicles; keine Org-scoped Detail-Fetches; tote Tab-Konstanten |

**Kritischste Befunde (P0):**

1. **MRR + Plan in Organizations List ≠ kanonisches Billing** — `mapOrganization()` berechnet MRR aus letzter Rechnung; Plan aus `organizationProducts`, nicht aus `GET /admin/billing/organizations`.
2. **Integration Connect/Disconnect + Product Enable/Disable sind UI-Mocks** — `toggleIntegration` / `toggleProduct` mutieren nur lokalen State, keine API, kein Audit.
3. **Org Delete ohne Pflicht-Reason** — Backend `MasterAdminPrivilegedAuditInterceptor` verlangt `reason` für `DELETE /admin/organizations/:id`; UI sendet keinen → Aktion schlägt fehl oder ist unvollständig abgesichert.
4. **Detailansicht ohne frischen Org-Fetch** — `selectedOrg` aus Listen-Snapshot; `api.organizations.get(id)` existiert, wird nicht genutzt; Tab-Wechsel verliert keinen URL-State (`orgTab` fehlt).
5. **Org Status „Trial“ = `PENDING`**, nicht Billing `TRIALING` — semantische Kollision mit Abo-Trial.

**Fazit:** Organizations erfüllt das Page Framework formal (Header, Tabs, `PageContainer`), aber **nicht** die Rolle als **Tenant Operations Hub**. Billing-, Integrations- und Security-Kontext sind fragmentiert; die kanonischen Remediation-Pfade (Billing Control Center, Dashboard Org Attention, `telemetry-freshness`) werden in der Org-UI kaum genutzt.

**Empfehlung:** UI-5 Organizations Remediation — „Tenant Health First“-Detail mit kanonischen Billing-/Connectivity-Signalen, Entfernung lokaler Mock-Aktionen, Server-seitige Liste mit Attention-Filtern.

---

## 2. Organizations List

**Primäre Datei:** `frontend/src/master/components/OrganizationsView.tsx`  
**Container:** `PageContainer variant="standard"`  
**Datenquelle:** `organizations` Prop aus `App.tsx` → `api.organizations.list({ limit: 100 })`

### 2.1 Vollständiges Inventar

| Element | Typ | Implementierung | Datenquelle |
|---------|-----|-----------------|-------------|
| **Page Header** | `MasterPageHeader` | Titel „Organizations“ (EN) | — |
| **Primary Action** | Button | „New Organization“ | Öffnet Wizard-Modal |
| **Search** | Text-Input | Client-seitig: `company_name`, `city` | In-Memory |
| **Filter Plan** | `<select>` | Client: Starter/Business/Enterprise/Custom | `org.plan` (aus `organizationProducts`) |
| **Filter Status** | `<select>` | Client: Active/Trial/Suspended/Churned | `org.status` (mapped OrgStatus) |
| **DataTable** | 7 Spalten | dense, card wrapper | Siehe unten |
| **Row Click** | Navigation | `onSelectOrg` → Detail | Setzt `selectedOrg` + `orgId` URL |
| **Row Actions** | Edit (MoreHorizontal), Delete (Trash) | Stop propagation fehlt bei Row-Click-Konflikt — Actions in eigener Spalte mit `stopPropagation` ✓ | — |
| **Bulk Actions** | — | **Nicht vorhanden** | — |
| **Pagination** | — | **Nicht vorhanden** (API paginiert, UI lädt `limit=100`) | Backend `meta.total` ignoriert |
| **Sortierung** | — | **Nicht vorhanden** (Backend: `createdAt desc`) | Fix |
| **Empty State** | DataTable string | „No organizations found…" | — |
| **Loading** | — | **Nicht vorhanden** (`dataLoading` in App blockiert nicht OrganizationsView) | — |
| **Errors** | — | **Nicht vorhanden** (`.catch(() => ({ data: [] }))` in App) | Stille leere Liste |

### 2.2 Spalten

| Spalte | Inhalt | Listenebene sinnvoll? | Anmerkung |
|--------|--------|----------------------|-----------|
| Organization | Name + City, Country | ✓ P0 | Kern-Identität |
| Plan | StatusChip | ⚠ P2 | **Nicht kanonisch** — aus Products, nicht Billing Contract |
| Status | StatusChip + Icon | ✓ P1 | Org-Status, nicht Subscription |
| Vehicles | `fleet_size` Zahl | ⚠ P2 | Count ok; keine Connected/Offline-Aufteilung |
| Users | `users` Zahl | ✓ P2 | Aktive Memberships |
| MRR | `€{mrr}` | ❌ Detail/Billing | **Irreführend** — letzte Rechnung, nicht Billing Overview |
| Last Active | `lastActive` ISO/string | ✓ P2 | Rohformat, nicht relativ lokalisiert |

### 2.3 Skalierung

- Hard-Limit **100 Organisationen** pro Request (`api.organizations.list` default).
- Keine Server-Search (`GET /admin/organizations?search=` existiert im Backend, Frontend nutzt es nicht).
- Client-Filter auf bereits geladener Teilmenge → bei >100 Orgs **unvollständig**.
- Kein Virtualisierung; bei 100 Zeilen noch akzeptabel.

### 2.4 Redundanz / Fehlende Listensignale

**Gehört in Liste (fehlt oder falsch):**
- Subscription-Status (kanonisch: `billing/organizations`)
- Billing-Warnings (PAST_DUE, PAYMENT_METHOD_MISSING) — existiert im Dashboard Attention, nicht hier
- Attention-Badge / „Handlungsbedarf"

**Gehört in Detail (fälschlich in Liste):**
- MRR, Plan (Billing Control Center)
- Volle Integrations-Health

---

## 3. Organization Identity

| Identifikator | Sichtbarkeit UI | Quelle | Bewertung |
|---------------|-----------------|--------|-----------|
| **Firmenname** | Liste + Detail Header | `companyName` | ✓ Primär |
| **Interne ID (UUID)** | Nicht in normaler UI | `org.id` | ✓ Korrekt versteckt |
| **Short Code** | Nur Create/Edit Modal | `shortCode` | ⚠ Sollte in Detail-Metadata (Support) |
| **Stripe Customer ID** | Nicht in Org-UI | Billing Drawer | ✓ Nur Billing-Kontext |
| **Subscription ID** | Nicht in Org-UI | Billing Drawer | ✓ |
| **Org-Status** | Liste + Header Chip | `OrganizationStatus` | ✓ |
| **Erstellungsdatum** | Detail Overview | `created_at` ISO | ⚠ Roh-ISO, EN-Format im Create |
| **Tenant-Identifier** | Kein separater Slug außer `shortCode` | Prisma | ⚠ Kein lesbarer Tenant-Code in Liste |
| **Kontakt-E-Mail** | Detail Overview | `email` | ✓ |
| **Standort** | Liste Subline + Detail | city, country | ✓ |

**UUID-Wand:** Nicht vorhanden — gut.

**Support/Debug:** ID, Stripe-Mapping, Short Code sollten in collapsible „Technische Details" im Detail (nicht in Liste).

---

## 4. Status Model

### 4.1 Inventar aller Statusfelder

| Domäne | Feld / UI-Label | Backend-Quelle | Wo sichtbar |
|--------|-----------------|----------------|-------------|
| **Organization** | Active / Trial / Suspended / Churned | `OrganizationStatus` → `ORG_STATUS_MAP` | Liste, Header, Edit-Form |
| **Organization (DB)** | ACTIVE / PENDING / SUSPENDED / ARCHIVED | Prisma enum | — |
| **Subscription** | ACTIVE / TRIALING / PAST_DUE / CANCELLED | `BillingStatus` | Nur Billing Control Center |
| **Product** | Active / Inactive | `organizationProducts.status` | Detail Products Tab |
| **Integration** | Connected / Disconnected / Error | `OrganizationIntegration.status` | Detail Integrations (teilweise mock) |
| **User Account** | Active / Inactive / Invited | User + Membership | Detail Users Tab |
| **Vehicle Fleet** | Available / Reserved / Active Rented / … | Rental status | Detail Vehicles Tab |
| **Vehicle Health** | Good / Warning / Critical | Health summary | Detail Vehicles Tab |
| **Telemetry Signal** | ONLINE / STANDBY / OFFLINE | `onlineStatus` + fallback `online` | Detail Vehicles Tab |
| **Payments Feature** | enabled/disabled | `Organization.paymentsEnabled` | **Nicht in Org-UI** (nur API `PATCH payments-enabled`) |

### 4.2 Doppelte Wahrheiten (Dokumentation — keine Neufdefinition)

| Konflikt | Manifestation |
|----------|---------------|
| **Trial** | UI „Trial" = Org `PENDING`; Billing „Testphase" = `TRIALING` — verschiedene Semantik |
| **Plan** | Liste „Business" aus `organizationProducts.plan`; Billing „Tarif" aus Contract/Price Version |
| **MRR** | Liste aus `mapOrganization` (letzte Rechnung); Billing aus `projectedMonthlyAmountCents` / Overview |
| **Churned vs Cancelled** | Org `ARCHIVED` → „Churned"; Subscription `CANCELLED` — nicht verknüpft in UI |
| **Connected Vehicles** | `fleet_size` = Fahrzeugcount; Billing `connectedVehicleCount` / Telemetry freshness — getrennt |
| **Integration Connected** | Backend `ACTIVE`; UI togglet lokal ohne Persistenz |
| **Product Active** | Backend `organizationProducts`; UI togglet lokal |

### 4.3 Lokale UI-Derivationen

- `orgStatusTone` / `planTone` — rein visuell, ok.
- `toggleIntegration` / `toggleProduct` — **falsche Wahrheit** (client-only).
- Vehicle `onlineStatus ?? (online ? 'ONLINE' : 'OFFLINE')` — Fallback ohne kanonischen Freshness-Resolver auf Org-Ebene.

---

## 5. Organization Detail IA

**Datei:** `frontend/src/master/components/OrganizationDetailView.tsx`  
**Header:** `MasterPageHeader variant="context"` — Titel, Eyebrow „Organization" (EN), Plan + Status Chips, Back DE

### 5.1 Tab-Inventar

| Tab | Inhalt | Priorität | Kanonisch? |
|-----|--------|-----------|------------|
| **Overview** | Details-Card (8 Felder) + Quick Stats 4-KPI | P1 | Teilweise — Stats aus List-Snapshot |
| **Users** | Custom `<table>`, read-only Liste | P1 | Daten aus globalem `users` Filter |
| **Vehicles** | Custom `<table>` | P1 | Global `registeredVehicles` Filter |
| **Integrations** | Cards pro Integration, Connect/Disconnect | P2 | **Mock-Toggles** |
| **Billing** | Link zu Billing Control Center | P1 | ✓ Kanonischer Verweis |
| **Products** | 3 Product Cards, Enable/Disable | P3 | **Mock-Toggles** |

### 5.2 Fehlende Sections (Blueprint / Ops-Bedarf)

| Erwartete Domäne | Status |
|------------------|--------|
| Security / MFA (Org-Admins) | ❌ Fehlt |
| Audit Log (org-scoped) | ❌ Fehlt (global Activity Log filterbar, kein Drilldown) |
| Support-Kontext | ❌ Fehlt |
| Usage / Monitoring | ❌ Fehlt |
| Settings / Tenant Profile | ❌ Fehlt (existiert tenant-scoped in Rental, nicht Master) |
| DIMO / Stripe / Voice / Email Integration Health | ❌ Fragmentiert (nur generische Integration-Cards) |
| Incidents / Attention | ❌ Fehlt (Dashboard hat Attention, nicht verknüpft) |

### 5.3 Reihenfolge & Kontextverlust

- Tab-Reihenfolge: Overview → Users → Vehicles → Integrations → Billing → Products — **Billing zu spät** für Ops (sollte nach Overview).
- `activeTab` nur `useState` — **kein `orgTab` URL-Param** (Page Framework §URL verlangt `?orgTab=users`).
- Browser Back aus Detail: `orgId` wird entfernt ✓; Tab-State nicht shareable.
- Beim Tab-Wechsel: keine neuen API-Calls — stale Snapshot.

### 5.4 Redundanz

- Quick Stats (Fleet, Users, MRR, Products) dupliziert Listen-Spalten.
- Users/Vehicles Tabs duplizieren globale Users/Vehicles Views (tenant-filtered) — **legitim**, aber ohne Deep-Link zu globalem Eintrag.

### 5.5 Tote Code-Artefakte

- `TAB_BAR`, `TAB_ACTIVE`, `TAB_IDLE` Konstanten (`sq-tab-bar`) — unbenutzt; Tabs laufen über `MasterPageHeader` → `MasterPageTabs` ✓.

---

## 6. 10-Second Organization Test

| # | Frage | ≤10s beantwortbar? | Wo heute? | Lücke |
|---|-------|-------------------|-----------|-------|
| 1 | Ist die Organisation aktiv? | ⚠ Teilweise | Header Status Chip | `PENDING` als „Trial" verwechselbar mit inaktiv |
| 2 | Ist Billing gesund? | ❌ Nein | Billing Tab → Redirect | Kein Signal in Header/Overview |
| 3 | Welches Abo? | ❌ Nein | Plan-Chip (falsch) | Nicht kanonischer Tarif |
| 4 | Zahlungsprobleme? | ❌ Nein | — | Kein Past Due / PM Missing |
| 5 | Wie viele Nutzer aktiv? | ✓ Ja | Overview / Users Tab | Ohne „invited vs active" in Overview |
| 6 | Wie viele Fahrzeuge verbunden? | ❌ Nein | `fleet_size` total only | Keine DIMO/Telemetry-Aufteilung |
| 7 | Integrationen OK? | ❌ Nein | Integrations Tab | Mock state, kein DIMO/Stripe |
| 8 | Kritische Incidents? | ❌ Nein | — | Nicht in Org-UI |
| 9 | Eingeschränkt/gesperrt? | ⚠ Teilweise | Suspended Chip | `paymentsEnabled`, Voice suspend nicht sichtbar |
| 10 | Handlungsbedarf? | ❌ Nein | — | Keine Attention-Zeile |

**Ergebnis:** **2/10** klar beantwortbar — **FAIL**.

---

## 7. Billing

### 7.1 Kanonische Quellen (existieren)

| Signal | API |
|--------|-----|
| Org Billing Rows | `GET /admin/billing/organizations` |
| Contract / Mutations | `GET/POST /admin/billing/organizations/:orgId/subscription/*` |
| Overview | `api.billing.masterSubscriptionOverview(orgId)` |
| Stripe Sync | `POST .../sync-stripe`, `sync-payment-methods` |
| Reconciliation | Billing System Sync Tab + `reconciliationDrifts` in Dashboard |

### 7.2 Org-UI vs Billing

| Aspekt | Organizations UI | Billing Control Center |
|--------|------------------|------------------------|
| Plan/Tarif | `org.plan` (Products) | `tariffLabel`, `priceVersionLabel` ✓ |
| MRR | Listenspalte berechnet | `projectedMonthlyAmountCents` ✓ |
| Subscription Status | Nicht sichtbar | `subscription.status` ✓ |
| Warnings | Nicht sichtbar | `warnings[]` ✓ |
| Stripe IDs | Nicht sichtbar | Drawer Detail Rows ✓ |
| Past Due / Reconciliation | Nicht sichtbar | Filter + Drawer ✓ |

**Org Detail Billing Tab:** Korrekt als **Deep Link** implementiert (`onOpenBillingCenter`) — keine zweite Billing-Verwaltung in der Tab-Fläche. ✓

**Problem:** List und Overview **umgehen** Billing Control Center und zeigen eigene MRR/Plan-Wahrheit. ❌

### 7.3 Create/Edit Wizard

- Formular zeigt **Plan**-Select — wird bei Create **nicht** an API gesendet (`create` sendet nur companyName, businessType, email, city, country, status).
- Plan-/Product-Zuweisung gehört in Billing Contract Flow — Wizard suggeriert falsche Kontrolle.

---

## 8. Users

**Detail Tab:** Read-only Tabelle (Name, Email, Role, Status, Last Login).

| Feld | Overview? | Users Tab? | Global Users View? |
|------|-----------|------------|------------------|
| Anzahl | Quick Stat | Tab-Count | Metric |
| Rollen | ❌ | ✓ | ✓ |
| Status | ❌ | ✓ | ✓ |
| MFA | ❌ | ❌ | ❌ (nicht in PlatformUsersView) |
| Letzte Aktivität | ❌ | Last Login | ✓ |
| Einladung | ❌ | Status „Invited" | ✓ |
| Gesperrt | ❌ | Inactive Chip | ✓ |
| Actions (Invite, Reset PW, Revoke) | ❌ | ❌ | ✓ (global) |

**Datenfluss:** `getOrgUsers(selectedOrg.id)` filtert `users` aus globalem `api.users.listAll()` — kein org-scoped Endpoint, keine Pagination.

**Empfehlung (Audit only):** Overview = Count + „X aktiv / Y eingeladen"; Users Tab = volle Tabelle + Actions; MFA nur wenn Backend liefert.

---

## 9. Vehicles

**Detail Tab:** VIN, Status, Health, Station, Signal (Dot + lastSignal).

| Signal | Implementierung | Kanonisch? |
|--------|-----------------|------------|
| Gesamtzahl | `fleet_size` / Tab count | Count ok |
| Verbunden / Offline | ❌ Nicht aggregiert | Sollte `telemetry-freshness` / Billing `connectedVehicleCount` |
| DIMO-Link | ❌ Nicht sichtbar | Fleet Connection / `dimoVehicle` |
| Telemetry State | `onlineStatus` + `online` fallback | Teilweise — nicht `live/standby/signal_delayed` Histogram |
| Health | `HealthStatusChip` | ✓ Backend health |
| Fleet Status | `fleetVehicleStatusTone` | ✓ |

**Ungenutzte API:** `api.vehicles.listByOrg(orgId)` existiert — Detail nutzt globalen Filter statt org-scoped Fetch.

**Keine neue Fahrzeugstatuslogik nötig** — bestehende Backend-Felder (`onlineStatus`, `signalAgeMs`, `isFresh`) sollten konsumiert werden.

---

## 10. Integrations

### 10.1 Backend (`IntegrationType`)

`DIMO`, `STRIPE`, `WOOCOMMERCE`, `SHOPIFY` — Org-scoped via `OrganizationIntegration`.

### 10.2 Org Detail Integrations Tab

- Rendert `org.integrations` aus List-Map (name, status, lastSync, apiKey, syncStatus).
- Frontend-Typ `OrgIntegration` kennt nur `woocommerce` | `shopify`.
- **Connect/Disconnect** togglet lokal — **kein API-Call**, keine Persistenz nach Reload.
- **Test**-Button ohne Handler.
- API Key angezeigt als Mock `••••` nach Connect.

### 10.3 Fehlende Integrations-Surfaces (existieren elsewhere)

| Integration | Kanonische Admin-Fläche |
|-------------|-------------------------|
| DIMO | Fleet Connection, Platform Health |
| Stripe | Billing Control Center |
| Voice | Voice Control Plane (inkl. suspend org) |
| Email | Settings → Email |
| WhatsApp | Nicht als Org-Integration modelliert |
| High Mobility | High Mobility View |

**Bewertung:** Org Integrations Tab sollte **Summary + Drilldown** sein, keine zweite Verwaltung — aktuell weder Summary noch echt.

---

## 11. Privileged Actions

| Aktion | UI-Ort | API | Permission | MFA / Step-up | Confirmation | Reason | Audit |
|--------|--------|-----|------------|---------------|--------------|--------|-------|
| **Org erstellen** | List Modal Wizard | `POST /admin/organizations` | MASTER_ADMIN | `MASTER_ORGANIZATION` | Wizard | ❌ | ✓ Interceptor |
| **Org bearbeiten** | List Modal / Detail state | `PATCH /admin/organizations/:id` | MASTER_ADMIN | MFA Controller | Modal | ❌ | ✓ |
| **Org löschen** | List Row Action | `DELETE /admin/organizations/:id` | MASTER_ADMIN | MFA | ConfirmDialog | **❌ Pflicht backend** | ✓ wenn erfolgreich |
| **Org-Admin erstellen** | Wizard Step 2 | `POST .../:id/admin` | MASTER_ADMIN | MFA | — | ❌ | ORG_ADMIN_CREATED |
| **Plan ändern** | Edit Form (UI only) | — | — | — | — | — | — |
| **Product toggle** | Detail Products | — (mock) | — | — | Button | — | — |
| **Integration toggle** | Detail Integrations | — (mock) | — | — | Button | — | — |
| **Payments enable** | ❌ Nicht in Org UI | `PATCH .../payments-enabled` | MASTER_ADMIN | ? | — | — | ORG_PAYMENTS_TOGGLED |
| **Subscription ändern** | Billing Drawer | Billing mutations | MASTER_BILLING | MasterBillingGuard | AlertDialog | teilweise | BILLING_MUTATION |
| **Trial verlängern** | Billing Drawer | contract mutations | MASTER_BILLING | ✓ | ✓ | — | ✓ |
| **User verwalten** | Global Users only | `/admin/users` | MASTER_ADMIN | varies | ConfirmDialog | Delete: required | ✓ |
| **Voice Org suspend** | Voice CP only | `suspendOrganization` | MASTER_ADMIN | reason+confirm | ✓ | ✓ | ✓ |

**Destructive Styling:** Delete nutzt `ConfirmDialog tone="critical"` ✓; Mock Disconnect nutzt critical styling ohne echte Wirkung — **irreführend**.

**Undo/Rollback:** Nicht vorhanden (Org Delete irreversibel — korrekt kommuniziert).

---

## 12. Support / Impersonation

### 12.1 Impersonation

**Ergebnis:** Keine Impersonation-, Act-As- oder Support-Access-Funktion im Master Admin Frontend oder Backend-Routen gefunden (Suche: impersonat, masquerade, actAs).

Membership switch (`/auth/switch-organization`) ist **User-eigener Tenant-Wechsel**, kein Master-Admin-Impersonation.

**Keine Neuerfindung nötig** — falls später: Banner, Session-Isolation, Audit, MFA, DSGVO.

### 12.2 Support-Kontext

- Support Tickets: `SupportView` global, kein Org-Detail-Tab.
- Dashboard verlinkt Org Attention → Billing, nicht Organizations Detail.

---

## 13. Search & Filter

### 13.1 Ist

| Mechanismus | Scope | Server? |
|-------------|-------|---------|
| Search | name, city | ❌ Client only |
| Filter Plan | plan label | ❌ Client |
| Filter Status | org status | ❌ Client |

### 13.2 Backend unterstützt

`GET /admin/organizations?search=&status=&page=&limit=` — **Frontend nutzt Search/Status nicht serverseitig**.

### 13.3 Sinnvolle Filter (Daten vorhanden)

| Filter | Quelle | In Org List? |
|--------|--------|--------------|
| Name | ✓ | ✓ (client) |
| Customer / Stripe ID | Billing rows | ❌ |
| Subscription Status | Billing | ❌ |
| Billing Health / Warnings | `billing/organizations.warnings` | ❌ (nur Dashboard) |
| Connectivity | Billing `connectedVehicleCount` | ❌ |
| Attention Required | Dashboard operational | ❌ |
| Org Status | ✓ | ✓ (client) |

**Nicht jeder DB-Wert** — korrekt vermieden, aber **operative Filter fehlen**.

---

## 14. Responsive

| Surface | Smartphone | Tablet | Desktop | Anmerkung |
|---------|------------|--------|---------|-----------|
| **List Filters** | `flex-col` stack | row | row | ✓ |
| **List Table** | Horizontal scroll via DataTable | ✓ | ✓ | Keine Card-Liste mobil |
| **List Columns** | 7 Spalten — überladen | eng | ok | MRR/Users/Vehicles schwer scannbar |
| **Detail Header** | Wrap Chips | ✓ | ✓ | Back + Tabs |
| **Detail Tabs** | `MasterPageTabs` overflow scroll | ✓ | ✓ | |
| **Users/Vehicles Tables** | `overflow-x-auto` | scroll | scroll | **Verkleinerte Desktop-Tabelle** |
| **Integration Cards** | 1 col | 2 col | 2 col | ✓ |
| **Create Wizard** | `max-h 92vh` scroll | ✓ | ✓ | |

**Mobile Priorität:** Nicht nach Ops-Relevanz — gleiche Tab-Reihenfolge wie Desktop; kein „Health Strip" above tabs.

---

## 15. Accessibility

| Check | Status | Anmerkung |
|-------|--------|-----------|
| Table semantics | ✓ | DataTable: `<th scope="col">` |
| Sticky header | ❌ | `stickyHeader` nicht gesetzt |
| Status nicht nur Farbe | ✓ | StatusChip + Text + Icons |
| Keyboard row click | ⚠ | Row `onClick` ohne `role="button"` / Enter |
| Row Actions SR | ⚠ | `title="Edit"` only, kein `aria-label` |
| Tabs ARIA | ✓ | `MasterPageTabs` tablist |
| Focus | ✓ | Native buttons |
| Confirm Delete | ✓ | `ConfirmDialog` |
| Destructive actions | ⚠ | Mock disconnect styled critical |
| Sprache | ❌ | EN/DE gemischt — Screenreader inconsistent |

---

## 16. Technical Architecture

### 16.1 Mount & Fetching (`App.tsx`)

```
Initial load (parallel):
  api.organizations.list(?limit=100)
  api.users.listAll()
  api.vehicles.listAll(?limit=200)
  api.dimo.nonRegistered()
  api.dimo.stats()
```

| Problem | Impact |
|---------|--------|
| **Kein Org-Detail-Fetch** | Detail stale vs `GET /admin/organizations/:id` |
| **Global Users/Vehicles für Org-Tabs** | Over-fetch, Limit 200 Vehicles |
| **Stille Fehler** | `.catch(() => [])` → leere UI ohne Error |
| **Kein Loading Gate** | `dataLoading` nicht an OrganizationsView |
| **Reload nach CRUD** | `reloadFromApi()` lädt alles neu — ok aber schwer |
| **Kein Caching-Layer** | Jeder Besuch = Full reload |
| **Billing nicht in Org List** | Separate Billing fetch nur in BillingControlCenter |

### 16.2 URL State

| Param | Unterstützt | Genutzt |
|-------|-------------|---------|
| `view=organizations` | ✓ | ✓ |
| `orgId` | ✓ | ✓ (Detail select) |
| `orgTab` | Spec | ❌ Nicht implementiert |

### 16.3 Permissions

- Controller: `@Roles('MASTER_ADMIN')` + `@RequireMasterAdminMfa(MASTER_ORGANIZATION)`.
- Frontend: Kein `MasterPermissionDenied` — MFA Gate global (`MasterMfaGate`).

### 16.4 N+1 / Duplikate

- Kein N+1 auf Org Detail (weil kein Fetch) — stattdessen **fehlende Frische**.
- Billing Org Drawer: separater kanonischer Pfad ✓.

---

## 17. Duplicate Truth Risks

| # | Risiko | Severity | Manifestation |
|---|--------|----------|---------------|
| 1 | MRR List vs Billing | P0 | `mapOrganization.mrr` vs `projectedMonthlyAmountCents` |
| 2 | Plan List vs Contract | P0 | `organizationProducts` vs Billing Tarif |
| 3 | Trial Org vs Trial Sub | P1 | PENDING vs TRIALING |
| 4 | Integration status mock | P0 | UI toggle vs DB |
| 5 | Product status mock | P0 | UI toggle vs DB |
| 6 | Vehicle count vs connected | P1 | fleet_size vs telemetry/billing |
| 7 | Dashboard Attention vs Org List | P1 | Attention nur Dashboard |
| 8 | Global vs Org Users/Vehicles | P2 | Filter auf stale bulk data |

---

## 18. Findings P0 / P1 / P2 / P3

### P0 — Blocker / Vertrauensbruch

| ID | Finding |
|----|---------|
| P0-1 | MRR + Plan in Organizations List nicht kanonisch (Billing-Remediation umgangen) |
| P0-2 | Integration Connect/Disconnect rein lokal — falsche Ops-Signale |
| P0-3 | Product Enable/Disable rein lokal |
| P0-4 | Org Delete ohne `reason` — Backend `PRIVILEGED_REASON_REQUIRED` |
| P0-5 | 10-Sekunden-Test FAIL — Billing/Connectivity/Incidents nicht erkennbar |
| P0-6 | Create-Wizard Plan-Feld ohne API-Wirkung — irreführend |

### P1 — Hohe Ops-Relevanz

| ID | Finding |
|----|---------|
| P1-1 | Org Status „Trial" = PENDING, kollidiert mit Billing TRIALING |
| P1-2 | Kein `orgTab` URL — kein shareable Detail-State |
| P1-3 | Detail nutzt List-Snapshot, nicht `GET /admin/organizations/:id` |
| P1-4 | Server-Search/Filter/Pagination nicht angebunden (>100 Orgs) |
| P1-5 | Keine Billing-Warnings in Liste (Dashboard Attention nicht verknüpft) |
| P1-6 | Vehicles Tab ohne kanonische Connectivity-Aggregation |
| P1-7 | `paymentsEnabled` nicht sichtbar — Payments-Feature-Flag versteckt |
| P1-8 | EN-UI auf kritischen Ops-Surfaces (Organizations, Tabs) |

### P2 — UX / Skalierung

| ID | Finding |
|----|---------|
| P2-1 | Kein Loading/Error auf Organizations List |
| P2-2 | Last Active als ISO-Rohstring |
| P2-3 | Users/Vehicles custom tables statt `DataTable` / `MasterTableShell` |
| P2-4 | Mobile: 7-Spalten-Tabelle ohne Priorisierung |
| P2-5 | Overview Quick Stats redundant zu Liste |
| P2-6 | Security/Audit/Support fehlen als Drilldowns |
| P2-7 | Short Code nur im Modal — nicht in Detail Metadata |

### P3 — Polish / Konsistenz

| ID | Finding |
|----|---------|
| P3-1 | Tote `sq-tab-bar` Konstanten in OrganizationDetailView |
| P3-2 | Logo-Upload Placeholder im Wizard ohne Funktion |
| P3-3 | Viele Wizard-Felder (Adresse, Steuer, Zeitzone) nicht persistiert |
| P3-4 | Churned label vs ARCHIVED — kein UX für Reaktivierung |
| P3-5 | Activity Log org-filter nicht von Org Detail verlinkt |

---

## 19. Recommended Target State

*(Spezifikation — keine Implementierung in dieser Phase)*

### 19.1 Organizations List — „Tenant Index"

**Above the fold:** Search + 2–3 operative Filter (Status, Subscription, Attention).

| Spalte | Quelle |
|--------|--------|
| Organisation | name, city, optional shortCode subline |
| Org-Status | `OrganizationStatus` |
| Subscription | `billing/organizations.subscription.status` |
| Attention | `warnings[]` kompakt |
| Users / Vehicles | counts |
| Last activity | relativ DE |

**Entfernen:** MRR, Plan (→ Billing Drilldown).

**Technik:** Server pagination/search; `MasterTableShell`; Loading/Error/Empty; Attention row highlight.

### 19.2 Organization Detail — „Tenant Control Strip"

**Header (context):** Name, Org-Status, **kanonischer Subscription-Status**, Attention-Badge, Primary: „Billing öffnen".

**Tabs (URL `orgTab`):**

1. **Übersicht** — Identity, operative KPIs (billing health, connectivity, users, open support), Attention reasons, keine Mock-Toggles  
2. **Nutzer** — Tabelle + Invite/Reset (von global pattern)  
3. **Fahrzeuge** — org-scoped fetch, freshness summary + table  
4. **Abrechnung** — embedded summary aus Billing Overview ODER strikter CTA (aktuell ok)  
5. **Integrationen** — read-only status chips + Drilldowns (Fleet, Billing, Voice, Settings)  
6. **Sicherheit & Audit** — org-filtered activity, MFA summary, payments flag  
7. **Produkte** — read-only entitlements (Billing/Contract), keine lokalen Toggles  

### 19.3 Single Source of Truth

| Domäne | Kanonische API |
|--------|----------------|
| Org identity | `GET /admin/organizations/:id` |
| Billing | `GET /admin/billing/organizations` + contract endpoints |
| Connectivity | Billing row `connectedVehicleCount` + optional freshness |
| Integrations | Read-only aggregate; mutations nur in Fach-Views |
| Attention | `operational.organizationsAttention` oder billing warnings |

### 19.4 Privileged Actions

- Delete/Suspend: Reason + MFA + Audit (bestehendes Backend nutzen).
- Entfernen aller Mock-Mutations aus Detail.
- Plan/Subscription nur über Billing Control Center.

---

## Scores (0–100)

| Dimension | Score | Begründung |
|-----------|-------|------------|
| **List UX** | 52 | DataTable ok; EN; keine server search; falsche Spalten; kein loading |
| **Organization Clarity** | 48 | Name gut; Status/Plan verwirrend; keine Billing-Identität |
| **Information Hierarchy** | 45 | Tabs ohne Ops-Priorität; Overview vanity; Billing zu tief |
| **Billing Clarity** | 35 | Zweite Wahrheit in Liste; Detail-Link korrekt |
| **Operational Awareness** | 28 | Keine warnings, incidents, connectivity auf Org-Ebene |
| **Action Safety** | 40 | Delete broken/incomplete; Mock destructive actions |
| **Data Trustworthiness** | 38 | Mock toggles; MRR/Plan; stale snapshot |
| **Responsive UX** | 55 | Filter stack; tables scroll; keine mobile priority |
| **Accessibility** | 58 | Table semantics ok; mixed language; row keyboard gaps |
| **Technical Cleanliness** | 42 | Bulk load; unused APIs; no orgTab; silent errors |

**Gewichteter Gesamtscore (ops-dominant):** ~**42/100**

**10-Sekunden-Test:** **FAIL** (2/10 Fragen klar beantwortbar)

---

## Quellenverzeichnis (Code)

| Bereich | Pfad |
|---------|------|
| List View | `frontend/src/master/components/OrganizationsView.tsx` |
| Detail View | `frontend/src/master/components/OrganizationDetailView.tsx` |
| Data / Routing | `frontend/src/master/App.tsx` |
| Types | `frontend/src/master/data/platform-data.ts` |
| Org API | `backend/src/modules/organizations/organizations.controller.ts` |
| Org Mapping | `backend/src/modules/organizations/organizations.service.ts` (`mapOrganization`) |
| Billing Orgs | `frontend/src/master/components/billing/BillingOrganizationsTab.tsx` |
| Billing Drawer | `frontend/src/master/components/billing/BillingOrgDetailDrawer.tsx` |
| Privileged Audit | `backend/src/shared/interceptors/master-admin-privileged-audit.interceptor.ts` |
| Page Framework Spec | `docs/ui/master-admin-canonical-page-framework.md` |

**Changes / Architektur:** In dieser Phase nicht aktualisiert (read-only Audit).
