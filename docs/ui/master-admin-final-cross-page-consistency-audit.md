# Master Admin — Final Cross-Page Consistency Audit

**Datum:** 2026-08-18  
**Phase:** UI-FINAL (read-only — keine Implementierung)  
**Branch:** `cursor/master-admin-ia-audit-6608`  
**Scope:** Gesamte SynqDrive Master-Admin-Control-Plane nach UI-1 … UI-10 Remediations

**Verbindliche Referenzen (alle Post-Remediation-Dokumente):**

| Phase | Audit | Blueprint | Post-Remediation |
|-------|-------|-----------|------------------|
| UI-1 | `master-admin-information-architecture-audit.md` | `master-admin-canonical-navigation-blueprint.md` | `master-admin-sidebar-navigation-post-remediation.md` |
| UI-2/3 | `master-admin-app-shell-framework-audit.md` | `master-admin-canonical-page-framework.md` | `master-admin-page-framework-post-remediation.md` |
| UI-4 | `master-admin-dashboard-deep-audit.md` | `master-admin-canonical-dashboard-blueprint.md` | `master-admin-dashboard-post-remediation.md` |
| UI-5 | `master-admin-organizations-deep-audit.md` | `master-admin-canonical-organization-management-blueprint.md` | `master-admin-organizations-post-remediation.md` |
| UI-6 | `master-admin-billing-deep-audit.md` | `master-admin-canonical-billing-blueprint.md` | `master-admin-billing-post-remediation.md` |
| UI-7 | `master-admin-connected-vehicles-dimo-deep-audit.md` | `master-admin-canonical-connected-vehicles-dimo-blueprint.md` | `master-admin-connected-vehicles-dimo-post-remediation.md` |
| UI-8 | `master-admin-platform-operations-deep-audit.md` | `master-admin-canonical-platform-operations-blueprint.md` | `master-admin-platform-operations-post-remediation.md` |
| UI-9 | `master-admin-security-audit-users-roles-deep-audit.md` | `master-admin-canonical-security-governance-blueprint.md` | `master-admin-security-governance-post-remediation.md` |
| UI-10 | `master-admin-integrations-system-config-deep-audit.md` | `master-admin-canonical-integrations-system-config-blueprint.md` | `master-admin-integrations-system-config-post-remediation.md` |

**Leitfrage:** Wirkt die Master-Admin-Control-Plane nach zehn Remediation-Phasen wie **eine kohärente Enterprise-Anwendung** — oder wie ein zusammengewachsenes Patchwork?

---

## 1. Executive Summary

Die UI-Phasen UI-1 bis UI-10 haben die Master-Admin-Control-Plane von einem fragmentierten Prototyp (~47–62/100) auf ein **durchgängiges Hub-Modell** (~79–88/100 pro Domäne) gehoben. Vier große Konsolidierungen prägen das Ergebnis:

1. **Navigation & URL** (UI-1/2): 16 kanonische Sidebar-Items, 8 Gruppen, `?view=`-Contract, Legacy-Redirects.
2. **Page Framework** (UI-3): `MasterAdminShell`, `PageContainer`, `MasterPageHeader`, `MasterPageTabs`, `MasterPageStates`.
3. **Domain Hubs** (UI-7–10): Vehicles, Platform Ops, Security & Access, Integrations & Plattform ersetzen verteilte Oberflächen.
4. **Server-Authoritative Attention** (UI-4–7, 9–10): Keine clientseitige Business-Logik für Billing/DIMO/Security/Integration-Status.

**Stärken (systemweit):**
- Hub-Pattern mit URL-Sync ist in den Kern-Domänen konsistent umgesetzt.
- Attention-/Incident-Modelle kommen überwiegend aus Backend-Aggregatoren.
- Secret-Safety und Environment-Trennung (Stripe TEST/LIVE) sind nach UI-6/10 deutlich verbessert.
- Partial-Failure-Pattern (`Promise.allSettled`, `moduleErrors`) in Dashboard, Ops, Integrations.
- Shared operational cache (60s) vermeidet Badge/Dashboard-Doppelabrufe.

**Schwächen (systemweit):**
- **Zwei Geschwindigkeiten:** Hub-Remediations (Dashboard, Orgs, Billing, Vehicles, Ops, Security, Integrations) vs. **Partner/Engineering-Views** (Prospects, Parts, Insurances, Voice, HM, Vehicle Logbook, Changes, Architektur) mit lokalen UI-Mustern.
- **Drilldown-Slug-Drift:** Dashboard und Backend-DTOs referenzieren teils noch `fleet-connection`, `activity-log`, `platform-health` — funktional durch Redirects abgefangen, semantisch inkonsistent.
- **Badge-Lücken:** `integration-outage` auf High Mobility deklariert, aber nie befüllt; `connectivity-warning` weiterhin DIMO-boolean-basiert statt kanonischer Vehicle-Attention.
- **Skalierungs-Schuld:** In-Memory-Filter nach Fetch in Orgs, Billing, Vehicles (P2 aus UI-5/6/7).
- **Dekorative Chrome-Elemente:** TopBar-Suche/⌘K/Notifications seit UI-1 unverdrahtet.
- **Toter Code:** `fleet-connection`-Render-Block in `App.tsx`, Orphan-Views (`PlatformSettingsView`, `PlatformHealthView`, `FleetConnectionView`, `PlatformVehiclesView`, `ActivityLogView`).

**Gesamtbewertung (Cross-Page):** Die Control Plane ist **betriebsfähig und enterprise-nah**, aber noch nicht **visuell und interaktiv vollständig homogen**. Verbleibende Arbeit ist überwiegend P2/P3 (Polish, E2E, Scale, Partner-Views-Migration).

### Scores (0–100)

| Dimension | Score | Kurzbegründung |
|-----------|-------|----------------|
| Navigation Consistency | **76** | Hub-IA stark; Legacy-Slugs in Drilldowns; tote `settings`-Active-Logik; HM-Badge unwired |
| Cross-Page Coherence | **78** | Drilldown-Mesh funktional; URL-Handling uneinheitlich (`replaceState` vs `pushState`) |
| Information Hierarchy | **82** | Hub-First klar; Partner-Views und Engineering-Docs brechen Hierarchie |
| Visual Consistency | **74** | Pattern Library in Hubs; Logbook/Changes/HM/Prospects mit lokalen Komponenten |
| Interaction Consistency | **77** | Save/Step-up in Security/Billing/Integrations; Partner-CRUD heterogen |
| State Consistency | **81** | Server-Attention dominant; einige lokale Loading-Spinner-Altlasten |
| Source-of-Truth Integrity | **86** | Billing/DIMO/Ops/Integrations kanonisch; dekorative TopBar-Elemente irrelevant |
| Responsive UX | **76** | Mobile Primary Pins gut; breite Tabellen in Voice/Billing/Logbook |
| Accessibility | **73** | Shell verbessert; Partner-Views und HM-Kompatibilität schwächer |
| Performance | **79** | Shared cache + lazy detail; In-Memory-Filter-Risiko; 14MB JS-Bundle |
| **Enterprise UX Quality** | **78** | Gewichteter Querschnitt |

**Trajectory:** UI-1 Baseline ~55–62 → Post-Remediation-Domänen ~79–88 → **Cross-Page ~78** (Abzug für Partner-Views, Drilldown-Drift, Polish-Schuld).

**Changes / Architektur:** Nicht aktualisiert (read-only Audit).

---

## 2. Route Inventory

### 2.1 Kanonische Sidebar-Routes (16 Items + Footer)

| Route (`?view=`) | Nav Group | Page Type | Permission | Parent | Primary Drilldown Source | Destination Drilldowns | Mobile | Status |
|------------------|-----------|-----------|------------|--------|--------------------------|------------------------|--------|--------|
| `dashboard` | Übersicht | Operational Hub | `MASTER_ADMIN` | — | `GET /admin/dashboard/operational` | billing, vehicles, platform-ops, organizations, support, security (audit) | Primary Pin | ✅ Kanonisch |
| `organizations` | Mandanten | List + Detail (7 Tabs) | `MASTER_ADMIN` | — | `GET /admin/organizations/operational` | billing, vehicles, security-access | Primary Pin | ✅ Kanonisch |
| `prospects` | Mandanten | CRUD List | `MASTER_ADMIN` | — | Prospects API | — | Accordion | ⚠️ Pre-Hub Pattern |
| `security-access` | Mandanten | Hub (7 Tabs) | `MASTER_ADMIN` | — | `/admin/security/*`, activity-log | organizations (user/org context) | Primary Pin | ✅ Kanonisch |
| `vehicles` | Flotte | Connected Vehicles Hub | `MASTER_ADMIN` | — | `GET /admin/vehicles/operational` | organizations, platform-ops | Primary Pin | ✅ Kanonisch |
| `vehicle-logbook` | Flotte | List + Detail | `MASTER_ADMIN` | — | Logbook API | — | Accordion | ⚠️ Legacy `isDarkMode` styling |
| `billing` | Abrechnung | Billing Control Center | `MASTER_ADMIN` \| `master-billing` | — | Billing operational APIs | organizations (optional, nicht immer verdrahtet) | Accordion | ✅ Kanonisch |
| `platform-integrations` | Konnektivität | Integrations Hub (5 Tabs) | `MASTER_ADMIN` | — | `/admin/platform-integrations/*` | billing, vehicles, voice-assistant, high-mobility | Primary Pin | ✅ Kanonisch (UI-10) |
| `high-mobility` | Konnektivität | Tabbed Data View | `MASTER_ADMIN` | — | HM APIs | — | Accordion | ⚠️ Lokale Badge/Pills |
| `parts-accessories` | Partner | Admin CRUD | `MASTER_ADMIN` | — | Parts API | — | Collapsed group | ⚠️ Pre-Hub Pattern |
| `insurances` | Partner | Admin CRUD | `MASTER_ADMIN` | — | Insurance API | — | Collapsed group | ⚠️ Lokale Badges |
| `voice-assistant` | Partner | Multi-Section Admin | `MASTER_ADMIN` | — | Voice Control Plane APIs | organizations (voiceOrgId) | Collapsed group | ⚠️ Breite Layouts |
| `platform-ops` | Plattformbetrieb | Ops Hub (7 Tabs) | `MASTER_ADMIN` | — | `/admin/ops/*` | organizations, billing, vehicles (via incidents) | Primary Pin | ✅ Kanonisch |
| `support` | Plattformbetrieb | Support Workspace | `MASTER_ADMIN` | — | Support API | organizations | Primary Pin | ✅ Kanonisch |
| `architektur` | Engineering | Doc Browser | `MASTER_ADMIN` | — | Static/markdown content | — | Collapsed | ℹ️ Engineering tool |
| `changes` | Engineering | Changelog Browser | `MASTER_ADMIN` | — | `/admin/changelogs` + FALLBACK | — | Collapsed | ⚠️ Custom dark styling |

**Footer (nicht `?view=`):** Systemstatus-Pill → `platform-ops`; Integrationen & Plattform → `platform-integrations`; Konto-Sheet; Abmelden.

### 2.2 Detail / Sub-Route Parameter (URL State)

| Parent View | URL Params | Zweck |
|-------------|------------|-------|
| `organizations` | `orgId`, `orgTab`, `orgSearch`, `orgPage`, `orgStatus`, `orgAttention` | Detail + List-Filter |
| `vehicles` | `cvSection`, `vehicleId`, `cvSearch`, `cvPage`, filter params | Hub-Sections + Drawer |
| `billing` | `masterBilling`, `masterBillingTab`, `subscriptionId`, `billingSearch`, `billingAttention` | BCC Sections + Detail |
| `platform-ops` | `platformOps`, `platformOpsTab`, `incidentId`, `serviceId` | Ops Hub Navigation |
| `security-access` | `securityAccess`, `userId`, `roleId`, `auditId`, `ownSecurityTab` | Security Hub |
| `platform-integrations` | `platformIntegrations`, `integrationId`, `settingsCategory`, `attentionOnly` | Integrations Hub |
| `architektur` | `archCategory` | Doc category |
| `high-mobility` | `hmTab` | HM sub-tabs |
| `voice-assistant` | `voiceSection`, `voiceOrgId` | Voice sections |

### 2.3 Legacy Redirect Routes (kein Sidebar-Eintrag)

| Legacy Route | Ziel | Status |
|--------------|------|--------|
| `users` | `security-access` + `securityAccess=users` | ✅ Redirect |
| `activity-log` | `security-access` + `securityAccess=audit` | ✅ Redirect |
| `platform-health` | `platform-ops` | ✅ Redirect |
| `fleet-connection` | `vehicles` + `cvSection=overview` | ✅ Redirect (Slug veraltet) |
| `settings` | `platform-integrations` | ✅ Redirect |
| `settings` + `settingsTab=monitoring` | `platform-ops` | ✅ Redirect |
| `hm-compatibility` | `high-mobility` + `hmTab=eligibility` | ✅ Redirect |
| `health-tracking` | `architektur` + `archCategory=health` | ✅ Redirect |
| `trip-detection-logic` | `architektur` + `archCategory=trips` | ✅ Redirect |
| `performance-logic` | `architektur` + `archCategory=workers` | ✅ Redirect |

### 2.4 Verwaiste / Ungenutzte Pages (Code existiert, nicht gemountet)

| Datei | Ehemalige Route | Status |
|-------|-----------------|--------|
| `PlatformSettingsView.tsx` | `settings` | 🔴 Orphan — durch UI-10 ersetzt |
| `PlatformHealthView.tsx` | `platform-health` | 🔴 Orphan — durch Platform Ops ersetzt |
| `FleetConnectionView.tsx` | `fleet-connection` | 🔴 Orphan — durch Connected Vehicles Hub |
| `PlatformVehiclesView.tsx` | (embedded) | 🔴 Orphan |
| `PlatformUsersView.tsx` | `users` | 🔴 Orphan — durch Security Hub |
| `ActivityLogView.tsx` | `activity-log` | 🔴 Orphan — durch Security Audit Tab |
| `HealthTrackingView.tsx` etc. | Legacy arch redirects | 🟡 Redirect-only |

### 2.5 Doppelte / Inkonsistente Routes

| Problem | Details | Severity |
|---------|---------|----------|
| `fleet-connection` vs `vehicles` | Dashboard/Backend-DTOs nutzen `fleet-connection`; Nav und Kanon ist `vehicles` | P2 |
| `activity-log` vs `security-access` | Dashboard Activity-Link nutzt Legacy-Slug | P2 |
| `platform-health` vs `platform-ops` | Dashboard `navigate()` mappt intern, DTOs teils alt | P2 |
| `settings` vs `platform-integrations` | Footer/Active-State-Code referenziert noch `settings` | P2 |
| `fleet-connection` Render-Block | `App.tsx` rendert noch `fleet-connection`, URL normalisiert aber zu `vehicles` vor Render | P3 (dead branch) |

### 2.6 Deep-Link Integrität

| Deep Link | Erwartung | Ist |
|-----------|-----------|-----|
| `?view=organizations&orgId=X&orgTab=billing` | Org Billing Tab | ✅ |
| `?view=billing&subscriptionId=X` | Subscription Detail | ✅ |
| `?view=vehicles&vehicleId=X` | Vehicle Drawer | ✅ |
| `?view=platform-ops&incidentId=X` | Incident Drawer | ✅ |
| `?view=security-access&securityAccess=audit&auditId=X` | Audit Detail | ✅ |
| `?view=platform-integrations&integrationId=stripe` | Integration Drawer | ✅ |
| `?view=users` | Security Users | ✅ (Redirect) |
| Browser Back nach Dashboard-Drilldown | Kontext erhalten | ⚠️ Teilweise — `replaceState` in Dashboard `navigate()` überschreibt History |

---

## 3. Navigation

### 3.1 Sidebar vs. Reale Pages

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Jede relevante Page erreichbar | ✅ 16 Items + Footer |
| Keine Legacy-Page prominent | ✅ `users`, `activity-log`, `platform-health`, `settings` entfernt |
| Keine relevante Page versteckt | ⚠️ Partner-Views in collapsed Groups; Engineering absichtlich tief |
| Active State | ✅ Org-Detail markiert `organizations`; Security-Legacy markiert `security-access` |
| Parent/Group State | ✅ `isMasterNavGroupActive` |
| Detail markiert Bereich | ✅ Org-Detail → Organisationen; Hub-Tabs → Parent-Item |
| Mobile = Desktop IA | ✅ `MASTER_MOBILE_PRIMARY_VIEWS` (8 Pins) + Accordions |
| Billing-only User | ✅ Nur Dashboard + Billing sichtbar |

### 3.2 Abweichungen

| Finding | Severity |
|---------|----------|
| `isMasterNavItemActive` enthält `settings`-Branch, aber kein Nav-Item `settings` mehr | P3 |
| `high-mobility` deklariert `badge: 'integration-outage'`, Badge wird nie gesetzt | P2 |
| `vehicles` nutzt `connectivity-warning` (DIMO-Boolean), nicht Vehicle-Attention-Summary | P2 |
| TopBar: Suche, ⌘K, Notifications dekorativ (seit UI-1) | P2 |
| Keine Breadcrumbs systemweit (bewusst in UI-3 entfernt; Hubs nutzen Back-Props) | P3 (Designentscheidung) |

### 3.3 Zweite Navigationshierarchie innerhalb Pages

| View | Innere Nav | Bewertung |
|------|------------|-----------|
| Billing BCC | `MasterBillingSectionTabBar` + SubTabs | ✅ Hub-Pattern |
| Platform Ops | `MasterPageTabs` via Hub | ✅ |
| Security Access | `MasterPageTabs` via Hub | ✅ |
| Platform Integrations | `MasterPageHeader` tabs | ✅ |
| Connected Vehicles | Section nav + URL | ✅ |
| Voice Assistant | Eigene Section-Nav + viele Panels | ⚠️ Hohe Komplexität |
| High Mobility | `hmTab` + interne Tabs | ⚠️ Akzeptabel |
| Organization Detail | 7 Tabs | ✅ |
| Architektur / Changes | Eigene Filter/Category-Nav | ℹ️ Engineering |

**Fazit:** Keine kritische zweite Sidebar-Hierarchie; Voice Assistant ist der komplexeste Innenbereich.

---

## 4. Drilldowns

### 4.1 Matrix (fachlich wichtige Pfade)

| Quelle | Ziel | Kontext erhalten | Back | Status |
|--------|------|------------------|------|--------|
| Dashboard → Incident | billing / vehicles / platform-ops | ✅ URL params | ⚠️ replaceState | ✅ Funktional |
| Dashboard → Organization | organizations + orgId | ✅ | ⚠️ replaceState | ✅ |
| Dashboard → Billing Issue | billing + attention params | ✅ | ⚠️ | ✅ |
| Dashboard → DIMO/Vehicle | `fleet-connection` → vehicles | ✅ nach Redirect | ⚠️ | ⚠️ Legacy Slug |
| Dashboard → Queue/Worker | platform-ops processing/workers | ✅ | ⚠️ | ✅ |
| Organization → Billing | billing + subscriptionId | ✅ | pushState | ✅ |
| Organization → Vehicle | vehicles + vehicleId | ✅ | pushState | ✅ |
| Organization → Integration | integrations tab (read-only) | ✅ | — | ✅ |
| Billing → Organization | `onOpenOrganization` optional | ⚠️ Nicht immer verdrahtet | — | P2 |
| Vehicle → Organization | onOpenOrganization | ✅ | — | ✅ |
| Vehicle → DIMO/Integration | Detail diagnostics | ✅ | — | ✅ |
| Operations → Organization | Incident/Service drawers | ✅ | — | ✅ |
| Operations → Vehicle | Via incident drilldown | ✅ | — | ✅ |
| Security Event → Actor/Target | Audit/User drawers | ✅ | — | ✅ |
| Integration → Operations/Resources | onNavigateView drilldowns | ✅ | — | ✅ |
| Support → Organization | onNavigateToOrg | ✅ | — | ✅ |
| Dashboard → Activity | `activity-log` → security audit | ✅ Redirect | — | ⚠️ Legacy Slug |

### 4.2 Probleme

- **History-Semantik:** Dashboard `navigate()` nutzt häufig `window.history.replaceState` statt `pushState` — Browser Back springt nicht immer zum vorherigen Dashboard-Zustand.
- **Tote Cards:** Keine kritischen toten Drilldown-Cards in Hub-Views gefunden; Orphan-Views (`PlatformHealthView`) wären tot wenn direkt verlinkt (werden redirectet).
- **Redundante Zwischenpages:** `fleet-connection` als Zwischen-Slug eliminierbar (direkt `vehicles`).

---

## 5. Page Headers

### 5.1 Kanonisches Pattern

`MasterPageHeader` → `PageHeader` aus `components/patterns/page-header`.

**Varianten:** `page` (Standard), `context` (Detail mit Back).

### 5.2 Adoption

| Kategorie | Views | MasterPageHeader |
|-----------|-------|------------------|
| Hub-Remediated | Dashboard, Orgs, Billing, Vehicles, Ops, Security, Integrations | ✅ |
| Partner/Admin | Prospects, Parts, Insurances, Voice, HM, Support | ✅ (meist) |
| Engineering | Architektur, Changes, Vehicle Logbook | ✅ / ⚠️ |
| Orphan/Legacy | PlatformSettingsView, FleetConnectionView, HealthTrackingView | ❌ Custom h1 |

### 5.3 Abweichungen

| Element | Hub-Views | Abweichungen |
|---------|-----------|--------------|
| Titel | `MasterPageHeader` title | Voice: sehr lange Meta-Zeilen |
| Description | Optional meta | Dashboard: Hero-Section statt Header-Description |
| Eyebrow | Entfernt (UI-3) | — |
| Status | StatusChip in Hero/Tabs | Konsistent in Hubs |
| Primary Action | Header actions slot | Integrations: Refresh; Orgs: Create |
| Back Navigation | `variant="context"` + back | Org Detail, Logbook Detail |
| Tabs | `MasterPageHeader` tabs oder `MasterPageTabs` | Billing: eigene Tab Bars (wrapper um Pattern) |

**Finding P2:** `MasterBillingSectionTabBar` / `MasterBillingSubTabBar` sind dünne Wrapper — akzeptabel, aber visuell leicht abweichend von `MasterPageTabs`.

---

## 6. Content Layout

### 6.1 PageContainer Varianten (App.tsx)

| Variant | Views |
|---------|-------|
| `wide` | dashboard, security-access, vehicles, billing, platform-ops, platform-integrations, voice-assistant |
| `standard` | organizations, prospects, parts, insurances, architektur, changes, vehicle-logbook, high-mobility |
| `full` | support |

**Konsistenz:** ✅ Domänen-logisch (Ops/Billing/Vehicles breit; CRUD-Listen standard).

### 6.2 Spacing Tokens

- `--master-page-stack`, `--master-section-gap` in Shell (UI-3).
- Hubs nutzen `space-y-5` / `gap-3` konsistent.
- **Abweichungen:** `ChangesView` und `VehicleLogbookView` mit `isDarkMode`-bedingten lokalen Klassen; `ProspectsView` mit `sq-cta` statt Pattern-Buttons.

### 6.3 Magic Numbers

| Bereich | Befund |
|---------|--------|
| Hub-Views | Überwiegend Token-basiert (`surface-premium`, `rounded-2xl`) |
| Partner-Views | Lokale `CARD` const strings — semantisch gleich, nicht zentral importiert |
| HM Compatibility (legacy redirect) | Eigene Pill-Komponenten |

---

## 7. Typography

| Semantischer Level | Kanonisch (Pattern) | Abweichungen |
|--------------------|---------------------|--------------|
| Page Title | `MasterPageHeader` / `text-xl–2xl font-semibold` | Legacy h1 in redirect-only views |
| Section Title | `text-sm font-semibold uppercase tracking-wider` | HM/Insurances teils `text-lg` |
| Card Title | `font-semibold` in DataCard | Logbook `StatusBadge` eigene Größen |
| Metadata | `text-xs text-muted-foreground` | Konsistent in Hubs |
| Table Headers | DataTable default | Konsistent |
| Helper Text | `text-sm text-muted-foreground` | Voice: technische Labels |
| Error Text | `MasterErrorState` / toast | Konsistent |
| Status Text | StatusChip labels | Englische Enum-Labels teils in Ops-Diagnostics |

**Finding P2:** Englische technische Labels in `SystemMonitoringView` / Ops Diagnostics (Poll Logs, Token Health) — funktional ok, Copy-Inkonsistenz.

---

## 8. Surfaces / Card System

### 8.1 Kanonisch

- `surface-premium`, `DataCard`, `MetricCard`, `DetailDrawer`, Pattern `EmptyState`/`ErrorState`.

### 8.2 Abweichungen

| Pattern | Vorkommen | Severity |
|---------|-----------|----------|
| Card-in-Card | Selten in Hubs; Voice Analytics nested | P3 |
| Lokale `CARD(d)` / `BADGE()` | HealthTracking, PerformanceLogic (redirect-only) | P3 |
| `Chip()` in IntegrationStatusChips | Wrapper um StatusChip-Logik | P3 (akzeptabel) |
| `InsurancesAdminView` lokale `Badge()` | Duplikat | P2 |
| `VehicleLogbookView` `StatusBadge` | Duplikat | P2 |
| Glass-Einsatz | `surface-premium` konsistent | ✅ |
| Shadow-Ebenen | `shadow-[var(--shadow-1)]` in Hubs | ✅ |

**Fazit:** Hub-Bereiche wirken einheitlich; Partner/Logbook/Changes brechen das Surface-System.

---

## 9. Buttons & Actions

### 9.1 Inventar

| Typ | Kanonisch | Abweichungen |
|-----|-----------|--------------|
| Primary | `Button` / `sq-btn-primary` | Prospects, Parts: `sq-cta` raw |
| Secondary | `Button variant="outline"` / `sq-btn-secondary` | Konsistent in Hubs |
| Ghost | `Button variant="ghost"` | ✅ |
| Icon | `Button size="icon"` + aria-label | ✅ in Hubs |
| Destructive | `variant="destructive"` + Dialog | Security delete, Org suspend |
| High-Risk | ChangePreviewDialog, MfaStepUp | Billing, Security, Integrations Email |
| Overflow | Dropdown menus | Billing invoice actions |

### 9.2 Findings

- **P1:** Keine — destructive/high-risk sind in Kern-Hubs getrennt.
- **P2:** Partner-Views nutzen teils rohe `sq-cta` ohne einheitliche Höhe.
- **P2:** Dashboard Quick-Links sind text-links, nicht Buttons — bewusst ruhig.

---

## 10. Status Semantics

### 10.1 Domänen-Mapping

| Domäne | Kanonische Quelle | UI-Komponente | Konsistenz |
|--------|-------------------|---------------|------------|
| Organization | `organization-attention.util` | Attention chips | ✅ |
| Subscription/Billing | `resolveSubscriptionDomainStatus` | `BillingStatusChips` | ✅ |
| Payment | Billing operational | Billing chips | ✅ |
| DIMO | `telemetry-freshness.resolver` | `ConnectedVehicleStatusChips` | ✅ |
| Telemetry freshness | Shared resolver UI-4/UI-7 | Stale hints | ✅ |
| Integrations | 4 Dimensionen (UI-10) | `IntegrationStatusChips` | ✅ |
| Platform Health | Ops/Dashboard operational | StatusChip overall | ✅ |
| Incident | `buildDashboardIncidents` | Severity labels | ✅ |
| Queue/Worker | Ops processing tab | `workerMonitoringTone` | ✅ |
| Backup | Ops resilience (unknown ≠ OK) | ✅ UI-8 |
| Account/MFA | Security governance | MFA chips | ✅ |
| Security | Attention summary | Security chips | ✅ |

### 10.2 Widersprüche

| Problem | Severity |
|---------|----------|
| Nav `connectivity-warning` ≠ Vehicle Attention API | P2 |
| HM `integration-outage` Badge nie befüllt | P2 |
| High Mobility lokale `EligibilityBadge` vs globale Chips | P3 |
| Englische Severity in Incidents (`critical`/`warning`) vs deutsche Labels elsewhere | P3 |

**Regel eingehalten:** Keine lokale Badge-Wahrheit in Billing/DIMO/Ops/Integrations nach Remediation.

---

## 11. Attention Model

### 11.1 Ebenen

| Level | Darstellung | Quelle |
|-------|-------------|--------|
| Information | Neutrale Chips, keine Dot | Default healthy |
| Attention | `integration-attention`, `security-attention` count pills | Backend summaries |
| Warning | `sq-dot-watch`, amber borders | Dashboard warning status |
| Critical | `sq-dot-critical`, `platform-critical` | Ops/Dashboard critical |
| Action Required | Attention lists + CTA | Org/Billing/Vehicle attention boards |

### 11.2 Findings

- ✅ Gesunder Zustand visuell ruhig (Dashboard Hero, Integration Directory).
- ⚠️ `connectivity-warning` auf Vehicles-Nav kann bei transientem DIMO-Stats-Fail false positive sein.
- ⚠️ Zu viele Dot-Badge-Typen (6 Typen) — Semantik in `Sidebar.tsx` `NavBadge` dokumentiert, aber nicht in UI erklärt.

---

## 12. Loading States

| Pattern | Hub-Views | Abweichungen |
|---------|-----------|--------------|
| `MasterLoadingState` skeleton | Dashboard, Ops, Integrations, Security | ✅ |
| Section partial load | Ops `moduleErrors`, Integrations partial | ✅ |
| Full-page spinner | Selten | Vehicle Logbook teils Loader2 inline |
| Delayed loading | 60s refresh intervals | ✅ Stale hints |

**Finding P2:** `MasterTableShell` in Blueprint UI-3 spezifiziert, aber List-Views nutzen direkt `DataTable` + eigene Skeleton-Zeilen — funktional ok, nicht einheitlich.

---

## 13. Error States

| Typ | Implementierung | Konsistenz |
|-----|-----------------|------------|
| Full Page | `MasterErrorState` | ✅ Hubs |
| Section | Tab-level error + retry | ✅ Ops, Integrations |
| Partial | `moduleErrors` banner | ✅ |
| Mutation | toast + inline | ✅ |
| Permission | `MasterMfaGate`, 403 toasts | ✅ |
| Provider Error | Integration detail `lastErrorSummary` | ✅ UI-10 |
| Stale | `MasterStaleDataHint` | ✅ Dashboard, Ops |

Keine Stacktraces in normaler UI gefunden.

---

## 14. Empty States

| Zustand | Pattern | Unterscheidung |
|---------|---------|----------------|
| Truly empty | `EmptyState` | ✅ |
| No search results | Filter-aware copy | ✅ Orgs, Vehicles, Billing |
| Not configured | Integrations incomplete chips | ✅ UI-10 |
| No incidents | Dashboard Hero copy | ✅ |
| No vehicles | CV Hub empty | ✅ |
| No billing issues | Reconciliation empty | ✅ |
| No audit events | Security audit empty | ✅ |

**Finding P3:** Prospects/Parts generic empty — weniger kontextspezifisch als Hubs.

---

## 15. Stale / Freshness

| Page | Mechanismus | `generatedAt` / Last Check |
|------|-------------|---------------------------|
| Dashboard | `OPERATIONAL_REFRESH_MS` 60s + stale hint | ✅ |
| Vehicles | Operational endpoint + telemetry resolver | ✅ |
| Platform Ops | 60s + `PLATFORM_OPS_STALE_MS` | ✅ |
| Integrations | 60s + `lastHealthCheckAt` | ✅ |
| Billing | Operational refresh | ✅ |
| Nav Badges | Shared operational cache | ✅ |

**Regel eingehalten:** Veraltete Daten werden nicht als aktuell dargestellt (UI-4/UI-8 explizit gefixt).

---

## 16. Table Consistency

| Aspekt | Hub Tables | Abweichungen |
|--------|------------|--------------|
| Component | `DataTable` from patterns | ✅ dominant |
| Density | `text-sm`, compact rows | Voice tables breiter |
| Sorting | Column sort wo nötig | ✅ |
| Filter | URL-synced in Orgs/Billing/Vehicles | ✅ |
| Pagination | Server or client page params | ⚠️ In-memory after fetch |
| Row Actions | Overflow / inline | ✅ |
| Mobile | Horizontal scroll / card fallback | Orgs mobile cards ✅ |
| Status alignment | Left | ✅ |
| Numeric alignment | `tabular-nums` teils | Billing ✅ |
| Dates | `formatRelativeDe` in Hubs | Logbook eigene Formatter |

---

## 17. Filter Consistency

| Feature | Orgs | Billing | Vehicles | Security |
|---------|------|---------|----------|----------|
| URL State | ✅ | ✅ | ✅ | ✅ |
| Reset | ✅ | ✅ | ✅ | ✅ |
| Attention filter | ✅ | ✅ | ✅ | ✅ |
| Date range | Audit tab | Audit tab | — | ✅ |
| Mobile drawer | List cards | — | — | — |

**Finding P2 (systemweit):** Enriched filters laden bis 500 Rows, filtern im Client — gleiches Anti-Pattern in UI-5/6/7.

---

## 18. Date / Time

| Formatter | Verwendung |
|-----------|------------|
| `formatRelativeDe` | Security, Integrations, Ops (teils) |
| `formatGeneratedAt` | Dashboard |
| `toLocaleString('de-DE')` | Billing, Logbook |
| `Intl.RelativeTimeFormat` | ChangesView internal |

**Finding P2:** Drei relative-Zeit-Implementierungen (`formatRelativeDe`, Dashboard helper, ChangesView local) — semantisch ähnlich, nicht zentralisiert.

Technische UTC-Zeit in Details: Audit Drawer zeigt ISO in expandable sections — akzeptabel.

---

## 19. Number / Currency

| Bereich | Format | Konsistenz |
|---------|--------|------------|
| Billing MRR/Revenue | EUR cents formatters | ✅ |
| Invoice amounts | Billing formatters | ✅ |
| Percent | `tabular-nums` | ✅ |
| Counts | Integer display | ✅ |
| Byte/MB | Ops infrastructure | ✅ |
| Duration | Ops processing | ✅ |

Billing ist die stärkste Domäne; Prospects/Insurances teils rohe Zahlen.

---

## 20. Iconography

| Konzept | Icon | Konsistenz |
|---------|------|------------|
| Dashboard | LayoutDashboard | ✅ |
| Organizations | Building2 | ✅ |
| Vehicles | Car | ✅ |
| Integrations | Plug | ✅ |
| Ops | HeartPulse | ✅ |
| Security | ShieldCheck | ✅ |
| Settings (Footer) | Settings → platform-integrations | ⚠️ Settings-Icon für Integrations |

**Finding P3:** Footer nutzt `Settings`-Icon für „Integrationen & Plattform" — semantisch leicht irreführend.

Lucide durchgängig; keine Icon-Set-Mischung.

---

## 21. Copy Consistency

### 21.1 Kanonische DE-Begriffe (master-nav-i18n)

| Begriff | Nav Label | Abweichungen |
|---------|-----------|--------------|
| Organisation | Organisationen | ✅ |
| Abrechnung | Abrechnung & Verträge | ✅ |
| Integration | Integrationen & Plattform | ✅ |
| Verbindung | Verbundene Fahrzeuge | ✅ |
| Incident | „Vorfälle" in Ops | Dashboard: „Probleme" |
| Audit | Audit-Protokoll | ✅ |

### 21.2 EN/Technisch

- Ops Diagnostics: EN labels (Poll Logs, Token Health)
- Voice Assistant: gemischt EN/DE
- Architektur/Changes: technisch DE/EN gemischt (Engineering-Audience)

**Finding P2:** Kein durchgängiges i18n-System; `master-nav-i18n.ts` nur für Nav.

---

## 22. Responsive Cross-Page Review

| Breakpoint | Sidebar | Hubs | Schwachstellen |
|------------|---------|------|----------------|
| 320–375px | Collapsed rail + mobile drawer | Primary pins | Voice tables horizontal scroll heavy |
| 390–430px | ✅ | ✅ | Billing reconciliation wide |
| Tablet Portrait | Accordions | Tabs scroll | ✅ |
| Tablet Landscape | Expanded sidebar | ✅ | ✅ |
| Notebook | ✅ | ✅ | ✅ |
| Desktop | ✅ | ✅ | ✅ |
| Wide Desktop | max-width via PageContainer | ✅ | ✅ |

**Schwächste Mobile-Pages:** Voice Assistant, Vehicle Logbook (8 tabs detail), Billing Reconciliation.

---

## 23. Accessibility

| Prüfpunkt | Status |
|-----------|--------|
| Heading order | ✅ Hubs; ⚠️ Logbook/Changes |
| Landmarks | Sidebar `nav`, main content | ✅ |
| Focus visible | `nav-utils` focus-visible | ✅ |
| Keyboard | Tabs, drawers | ✅ |
| Skip navigation | Nicht implementiert | P2 |
| Dialogs/Drawers | `role="dialog"`, aria-label | ✅ Hubs |
| Forms | Labels in Integrations Email | ✅ |
| Tables | DataTable headers | ✅ |
| Status semantics | Chips mit Text | ✅ |
| Touch targets | min 36–40px nav | ✅ |
| Reduced motion | Kein globaler Check | P3 |

---

## 24. Permissions

| Mechanismus | UI | Backend |
|-------------|-----|---------|
| Sidebar visibility | `canAccessMasterNavItem` | — |
| Billing-only rail | `isBillingOnlyMasterUser` | ✅ |
| Page mount | Alle Views in App ohne Guard | ⚠️ Page-level checks variieren |
| Actions | MFA Step-up events | `MasterAdminMfaGuard` |
| Tabs | Keine Tab-level permission splits | ✅ |
| Deep links | Billing-only kann nur dashboard+billing URL nutzen | ✅ |

**Finding P2:** Direkte URL zu `view=organizations` bei Billing-only User — Nav versteckt, aber Route nicht hart geblockt im Frontend (Backend 403 erwartet).

---

## 25. Performance

| Aspekt | Befund |
|--------|--------|
| Duplicate requests | ✅ Operational cache shared (Dashboard + Badges) |
| N+1 | ✅ Vehicle detail lazy diagnostics |
| Polling | 60s: Dashboard, Ops, Integrations, Security, Badges |
| Caching | `operational-cache.ts` module-level |
| Large payloads | Vehicle operational list capped; org list enriched |
| Waterfall | Hub tabs load on section (gut) |
| Route transitions | React state + URL sync — kein Router code-split per view |
| Bundle | ~14.7MB JS (Vite build warning) — Master ist Teil des Gesamt-SPA |
| Unnecessary renders | `isDarkMode` in Changes/Logbook triggert breite Re-renders |

**Finding P2:** Kein Route-level Code Splitting für Master Views; akzeptabel für Admin-Oberfläche, aber Bundle-Wachstum beobachten.

---

## 26. Design-System Duplication

| Duplikat | Ort | Empfehlung |
|----------|-----|------------|
| `IntegrationStatusChips.Chip` | platform-integrations | Zu `StatusChip` migrieren |
| `InsurancesAdminView.Badge` | insurances | `StatusChip` |
| `VehicleLogbookView.StatusBadge` | logbook | `StatusChip` |
| HM Pills/Badges | HighMobility* | Domain-Chips wie Billing |
| `MasterBilling*TabBar` | billing | `MasterPageTabs` vereinheitlichen |
| `formatRelativeDe` × 3 | security, integrations, changes | Zentral in `patterns` |
| `CARD` const | mehrere Partner-Views | `DataCard` import |
| Orphan Views | 6 Dateien | Entfernen (P2 cleanup) |

**Positiv:** UI-Phasen haben **keine** parallelen Hub-Frameworks erzeugt — ein Shell, ein Header, ein Tab-System.

---

## 27. Regressions from UI Remediations

| Bereich | Regression? | Details |
|---------|-------------|---------|
| Dashboard | ❌ Nein | Operational API ersetzt legacy |
| Organizations | ❌ Nein | Products tab entfernt (bewusst) |
| Billing | ⚠️ Minor | Resend/Outbox tabs nicht verdrahtet (pre-existing) |
| Vehicles/DIMO | ❌ Nein | HM telemetry bleibt in HM view (by design) |
| Platform Ops | ❌ Nein | Monitoring redirect loop gefixt |
| Security | ❌ Nein | Users+Activity consolidated |
| Integrations | ❌ Nein | Mock General Settings entfernt |
| Settings Company Info | ⚠️ | Fake form weg — kein Ersatz (korrekt: kein Backend) |
| Mobile | ❌ Nein significant | |
| Permissions | ❌ Nein | |
| Daten | ❌ Nein | |

**Funktionen verloren:** Nur Mock/Fake-Funktionen (General Settings Save, Fake DIMO toggle, Fake credentials).

---

## 28. Findings P0 / P1 / P2 / P3

### P0 — Blocker
*Keine.* Alle dokumentierten P0 aus UI-1–10 wurden in den jeweiligen Phasen adressiert.

### P1 — Hoch
*Keine systemweiten P1 Blocker.* Einzelne Domänen haben keine P1 in Post-Remediation.

### P2 — Mittel (Cross-Page)

| ID | Finding | Bereiche |
|----|---------|----------|
| CP-P2-01 | Drilldown-Slugs `fleet-connection`, `activity-log`, `platform-health` in Dashboard/API statt kanonische Views | Dashboard, Backend DTOs |
| CP-P2-02 | Dashboard `replaceState` bricht Browser-Back-Erwartung | Dashboard drilldowns |
| CP-P2-03 | `integration-outage` Badge auf HM nie befüllt | Nav badges |
| CP-P2-04 | `connectivity-warning` DIMO-Boolean ≠ Vehicle Attention | Nav, Vehicles |
| CP-P2-05 | In-Memory enriched filter nach Fetch (Orgs, Billing, Vehicles) | Scale >500 |
| CP-P2-06 | Partner-Views (Prospects, Parts, Insurances, Logbook) nicht Pattern-migriert | Visual/Interaction |
| CP-P2-07 | TopBar Suche/⌘K/Notifications dekorativ | Global chrome |
| CP-P2-08 | `BillingResendTab`/`BillingOutboxTab` orphan | Billing, Integrations |
| CP-P2-09 | Billing → Org drilldown nicht überall verdrahtet | Billing detail |
| CP-P2-10 | Drei `formatRelativeDe` Implementierungen | Date/time |
| CP-P2-11 | Kein Skip-Link / Focus management global | A11y |
| CP-P2-12 | Billing-only User: Deep-Link zu fremden Views nicht Frontend-geblockt | Permissions |

### P3 — Niedrig

| ID | Finding |
|----|---------|
| CP-P3-01 | 6 Orphan View-Dateien + `fleet-connection` dead branch in App.tsx |
| CP-P3-02 | `isMasterNavItemActive` `settings` branch obsolet |
| CP-P3-03 | Footer Settings-Icon für Integrations |
| CP-P3-04 | `MasterTableShell` nicht adoptiert |
| CP-P3-05 | Webhook event detail drawer (UI-10) offen |
| CP-P3-06 | Legacy `GET /admin/integrations` ungenutzt |
| CP-P3-07 | EN labels in Ops Diagnostics |
| CP-P3-08 | Kein Playwright E2E cross-page |
| CP-P3-09 | `isDarkMode` dead props in Dashboard/Billing/Sidebar |

---

## 29. Final Recommendations

### Phase A — Cross-Page Hygiene (1 Sprint)
1. **Slug-Kanonisierung:** Dashboard DTOs und `navigate()` auf `vehicles`, `platform-ops`, `security-access` umstellen.
2. **History:** Dashboard-Drilldowns auf `pushState` + Hub-URL-Helper vereinheitlichen.
3. **Badge-Wiring:** HM Attention → `integration-outage` oder Badge-Typ entfernen; Vehicles → Vehicle Attention API.
4. **Dead Code:** Orphan Views löschen; `fleet-connection` App-Block entfernen.

### Phase B — Partner-View Alignment (1–2 Sprints)
5. Prospects, Parts, Insurances, Vehicle Logbook auf `StatusChip`, `MetricCard`, `DataCard` migrieren.
6. `formatRelativeDe` zentralisieren in `components/patterns`.
7. Voice Assistant: responsive table/card breakpoints prüfen.

### Phase C — Scale & E2E (ongoing)
8. Server-side enriched filters für Orgs/Billing/Vehicles.
9. Playwright cross-page drilldown matrix (17+ Szenarien aus UI-4–10).
10. Route-level lazy imports für Master Hubs (Bundle).

### Phase D — Polish
11. TopBar: Suche/Notifications implementieren oder entfernen.
12. Skip navigation link.
13. Billing Resend/Outbox in Integrations Email oder Billing verdrahten.

---

## Anhang: Score Trajectory (Domänen vs. Cross-Page)

```
UI-1 Baseline          ████████░░░░░░░░░░░░  ~58
UI-4 Dashboard         █████████████████░░░  ~88
UI-5 Organizations     █████████████████░░░  ~88
UI-6 Billing           ████████████████░░░░  ~81
UI-7 Vehicles/DIMO     ████████████████░░░░  ~81
UI-8 Platform Ops      ███████████████░░░░░  ~79
UI-9 Security          ████████████████░░░░  ~82
UI-10 Integrations     ████████████████░░░░  ~82
─────────────────────────────────────────────
Cross-Page Final       ███████████████░░░░░  ~78
```

Die Cross-Page-Bewertung liegt **unter** den Einzel-Domänen, weil Partner-Views, Drilldown-Drift und globale Chrome-Schuld den Gesamteindruck mindern — nicht weil die Hub-Remediations selbst fehlgeschlagen wären.

---

**Audit abgeschlossen. Keine Code-Änderungen vorgenommen.**

**Changes / Architektur:** Nicht aktualisiert (read-only Audit).
