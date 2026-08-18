# Master Admin — App Shell & Page Framework Audit (Phase UI-2.1)

**Datum:** 2026-08-18  
**Scope:** Gemeinsame UI-Grundstruktur rechts neben der Navigation (read-only)  
**Basis:** Sidebar kanonisiert (UI-1.4); keine einzelnen Fachseiten redesignen  
**Quellen:** `frontend/src/master/**`, `frontend/src/components/shell/**`, `frontend/src/components/patterns/**`, bestehende UI-Audits UI-1.1–1.4

---

## 1. Executive Summary

Die Master-Admin-Control-Plane nutzt eine **gemeinsame `AppShell`** (`variant="master"`) mit kanonischer linker Sidebar (UI-1.4), zentralem Scroll-Container und optionalem **RightSidebar** (300px). Das Arbeitsfeld rechts neben der Navigation ist jedoch **kein einheitliches Page-Framework**, sondern ein **Sammelbecken aus drei Migrationswellen**:

| Welle | Charakter | Beispiele |
|-------|-----------|-----------|
| **A — Pattern Library** | `PageHeader`, `MetricCard`, `DataCard`, `DataTable`, `EmptyState`/`ErrorState`/`Skeleton*` | Dashboard, Users, Activity Log, Billing, Voice, Platform Health |
| **B — Teilweise migriert** | `PageHeader` + eigene Tabellen/Cards/States | Org Detail, Vehicles, Parts, Insurance, Prospects, Fleet Connection |
| **C — Legacy** | `isDarkMode`-Ternaries, lokale `h1`, Custom Cards, keine Pattern-States | Settings, Changes, Vehicle Logbook |

**Kernbefunde:**

- **Ein Shell-System**, aber **kein Page-Shell-Contract**: Views setzen eigene `max-w`, `space-y`, Padding und Scroll-Regeln.
- **PageHeader-Adoption ~70%**, aber **keine Breadcrumbs**, Back-Navigation inkonsistent, **5+ Tab-Implementierungen**.
- **RightSidebar** bleibt global gemountet und erzeugt eine **parallele Scroll-Spalte** mit Dashboard-Duplikaten.
- **Nested Scroll** in Dashboard-Aktivitätskarten, High Mobility, Support Ops und Modals.
- **State-Handling** stark polarisiert: Billing/Voice/Dashboard vorbildlich; Logbook/Settings/Parts schwach.
- **Accessibility**: Sidebar post-Remediation solide; **`<main>`-Landmark fehlt**, Tab-ARIA fragmentiert.

**Fazit:** Die Sidebar ist production-ready als Navigationsgrundlage. Das **Content-Framework rechts davon ist noch nicht production-ready** als gemeinsame Basis für alle Master-Admin-Pages — es braucht einen expliziten **Master Page Shell Contract** (Header, Spacing, Tabs, States, Tables) bevor Fachseiten-Redesigns sinnvoll skalieren.

---

## 2. Current Shell Architecture

### 2.1 Komponentenbaum

```
AppShell (variant="master")
├── Sidebar.tsx          ← kanonisch (UI-1.4)
├── Main column
│   └── flex-1 overflow-auto (shell scroll)
│       └── max-w-[1400px] mx-auto
│           ├── Toaster (sonner)
│           ├── MfaStepUpDialog
│           └── MasterMfaGate
│               ├── TopBar.tsx
│               └── {currentView → *View}
└── RightSidebar.tsx     ← hidden lg:flex, 300px, eigener overflow-y-auto
```

**Dateien:** `frontend/src/components/shell/app-shell.tsx`, `frontend/src/master/App.tsx`

### 2.2 Shell-Tokens (Master vs Rental)

| Token | Master | Rental |
|-------|--------|--------|
| Horizontal Padding | `px-4 sm:px-6 lg:px-8` | `px-5 sm:px-7 lg:px-[100px]` |
| Vertical Padding | `pt-3 lg:pt-4 pb-6` | `pt-4 lg:pt-6 pb-8` |
| Max Content Width | `max-w-[1400px]` | `max-w-[1440px]` |
| Mobile Top Offset | `pt-16` (fixed Sidebar header) | `pt-16` |
| Root Overflow | `h-screen overflow-hidden` | identisch |
| Main Scroll | `flex-1 overflow-auto overflow-x-clip` | identisch |

**Bewertung:** Strukturell korrekt und mit Rental geteilt. Master hat **schmalere Gutters** und **kleinere Max-Breite** — bewusst kompakter, aber Views ignorieren das teilweise (s.u.).

### 2.3 Konkurrierende Layout-Systeme?

| System | Rolle | Konflikt? |
|--------|-------|-----------|
| `AppShell` | Einziger Root-Layout-Wrapper | Nein — Single Source |
| `TopBar` | Globale Chrome-Zeile innerhalb Main | Kein zweites Layout, aber **kein Page-Kontext** (kein Titel/Breadcrumb) |
| `RightSidebar` | Kontext-Spalte außerhalb max-width Container | **Ja** — dritte Scroll-Achse, auf allen Views aktiv |
| `SupportView` `sop.shell` | `min-h-[calc(100vh-8rem)]` + 3-Spalten-Grid | **Ja** — viewport-locked Ops-Layout innerhalb Shell-Scroll |
| `HighMobilityDataView` | `flex flex-col h-full` + inner `overflow-y-auto` | **Ja** — nested scroll |
| `ArchitekturView` | `flex lg:flex-row` Side-Nav + Content | Eigenes 2-Spalten-Doc-Layout (akzeptabel für Typ) |
| View-level `max-w-[1600px]` | Dashboard, Billing, Voice | **Ja** — widerspricht Shell 1400px (wirkt nur als Dokumentations-Intent) |

**Fazit:** Kein zweites Root-Layout, aber **mindestens vier parallele Sub-Layout-Regimes** innerhalb des Main-Containers.

### 2.4 Scroll, Overflow, Layout Shift

| Risiko | Ort | Detail |
|--------|-----|--------|
| **Nested Scroll** | `MasterDashboardView` | `DataCard` body `max-h-[280px] overflow-y-auto` in bereits scrollendem Main |
| **Nested Scroll** | `HighMobilityDataView` | `flex-1 overflow-y-auto` + Shell-Scroll |
| **Nested Scroll** | `SupportOpsInbox` / Workspace | Panel-interne Scroll bei `min-h-[calc(100vh-8rem)]` |
| **Nested Scroll** | `RightSidebar` | `h-screen overflow-y-auto` parallel zu Main |
| **Nested Scroll** | Modals/Drawers | `max-h-[75–80vh] overflow-y-auto` (Org Wizard, Monitoring) — akzeptabel |
| **Horizontal Overflow** | `OrganizationDetailView` Tabs | `overflow-x-auto w-fit` — kontrolliert |
| **Horizontal Overflow** | `PlatformVehiclesView` | `relative` + breite Tabellen — `overflow-x-clip` am Shell schützt |
| **Layout Shift** | Mobile | `pt-16` + fixed Sidebar-Header — stabil (post-Remediation) |
| **Layout Shift** | `PlatformHealthView` Polling | Kein Skeleton — KPI-Werte springen bei Refresh |
| **Doppel-Padding** | `HighMobilityDataView` | Eigene `px-4 sm:px-6 py-5` **zusätzlich** zu Shell-Padding |

### 2.5 Globale Overlays & Portals

| Layer | Implementierung | Scope |
|-------|-----------------|-------|
| **Toasts** | `sonner` `<Toaster position="top-right">` | Global in `App.tsx` |
| **MFA Step-Up** | `MfaStepUpDialog` | Global, Event `synqdrive:step-up-required` |
| **MFA Gate** | `MasterMfaGate` — blockiert gesamten Content | Ersetzt Main bei Enrollment |
| **Account Sheet** | `MasterAccountSheet` | Sidebar Footer, `role="dialog"` |
| **Mobile Nav Drawer** | Sidebar fixed overlay + `overlay-scrim` | Sidebar-intern |
| **Modals/Drawers** | `AppDialog`, `ConfirmDialog`, `DetailDrawer`, Radix `Sheet` | Pro View |
| **TopBar Dropdowns** | Language-Popover `z-[9999]` | Dekorativ (kein i18n-Wiring) |

**Portal-Konsistenz:** Radix-basierte Dialoge/Sheets nutzen Portals korrekt. Kein zentrales Master-Overlay-Manager — jede View registriert eigene Modals.

### 2.6 Mobile Shell

| Aspekt | Ist |
|--------|-----|
| Sidebar | Fixed Header + Drawer (UI-1.4) |
| Main | Volle Breite, `pt-16`, Shell-Padding `px-4` |
| TopBar | Welcome-Text `hidden sm:block`; Search `hidden md:flex` |
| RightSidebar | `hidden lg:flex` — **ausgeblendet** auf Mobile/Tablet |
| Support | `Sheet` Full-Width Workspace ab `<1280px` |
| Tab Bars | Horizontal scroll (`overflow-x-auto`) auf mehreren Views |

---

## 3. Page Header Inventory

### 3.1 Übersicht aller Master-Views

| View | PageHeader | Variant | Eyebrow | Description | Status | Primary Action | Secondary | Back | Breadcrumb | Tabs im Header |
|------|------------|---------|---------|-------------|--------|----------------|-----------|------|------------|----------------|
| **MasterDashboardView** | ✓ | `page` | — | — | Chip (Live) | — | — | — | — | — |
| **OrganizationsView** | ✓ | `page` | — | — | — | New Organization | — | — | — | — |
| **OrganizationDetailView** | ✓ | `full` | „Organization" | Business/City/Since | Plan + Status chips | — | — | **Arrow in actions** | — | Separate row below |
| **PlatformUsersView** | ✓ | `page` | — | — | — | Invite User | — | — | — | — |
| **PlatformVehiclesView** | ✓ | `page` | — | — | — | Sync DIMO (tab-dep.) | — | — | — | Below: `sq-tab-bar` |
| **BillingControlCenter** | ✓ | `page` | — | — | — | Section CTAs | Refresh | — | — | `MasterBillingSectionTabBar` below |
| **ActivityLogView** | ✓ | `page` | — | — | — | Refresh | — | — | — | Meta: pagination |
| **PlatformHealthView** | ✓ | `full` | — | DE Beschreibung | Overall status | Refresh | External links | — | — | — |
| **SupportView** | ✓ | `page` | — | — | — | — | — | — | — | Queue tabs in body |
| **PlatformSettingsView** | ✗ | — | — | Custom subtitle | — | Save (in tab) | — | — | — | Custom pills below h1 |
| **ProspectsView** | ✓ | `page` | — | — | — | Import / Add / Export | — | — | — | Table/Map toggle below |
| **FleetConnectionView** | ✓ | `page` | — | — | — | Refresh | — | — | — | Filter pills below |
| **PartsAccessoriesAdminView** | ✓ | `page` | — | — | — | — | — | — | — | `sq-tab-bar` below |
| **InsurancesAdminView** | ✓ | `page` | — | — | — | — | — | — | — | `sq-tab-bar` below |
| **VoiceAssistantAdminView** | ✓ | `page` | — | — | — | Refresh | — | — | — | `SectionTabBar` below |
| **ArchitekturView** | ✓ | `page` | — | — | — | — | — | — | — | Side category nav |
| **ChangesView** | ✗ | — | — | Custom subtitle | Version badge | Filter/Refresh | — | — | — | — |
| **VehicleLogbookView** | ✗ | — | — | — | — | Enable/Disable | — | List→Detail implicit | — | 8 pill tabs (detail) |
| **HighMobilityDataView** | ✓ | `page` | — | — | HM status chips | Actions per tab | — | — | — | `sq-tab-bar` below |
| **SystemMonitoringView** | ✓ | `page` | — | — | Status + time range | Refresh / Auto-refresh | — | — | — | (unused TAB_BAR const) |

### 3.2 Header-Inkonsistenzen (Ist)

| Thema | Befund |
|-------|--------|
| **Höhe / Rhythmus** | `PageHeader` = `mb-4 sm:mb-5`; Legacy Views = `space-y-8` bis Titel; Settings `text-base mt-2` Subtitle |
| **Titelgröße** | Kanonisch: `--text-display-lg` via `PageHeader`; Legacy: identischer Token manuell oder `text-lg` Section-H2 |
| **Redundante Beschreibungen** | Platform Health `full` + SectionHeader darunter; Settings Monitoring = doppelter Header (Settings h1 + SystemMonitoring PageHeader) |
| **Button-Wildwuchs** | Gradient Save (Settings), `p-3 rounded-2xl` Back (Org Detail), `Button` vs raw `<button>` gemischt |
| **Action-Position** | Kanonisch rechts in `PageHeader.actions`; Org Detail Back **rechts** statt links; Billing CTAs teils unter Header in Section |
| **Breadcrumbs** | **Keine** Master-View nutzt Breadcrumbs; TopBar zeigt nur Welcome-Text (seit V4.9.71) |
| **Detail-Orientierung** | Org Detail: eyebrow „Organization" (EN) + Back rechts — schwache Hierarchie; Logbook: kein expliziter Back im Header |
| **Sprache** | DE: Billing, Health, Support KPIs, TopBar; EN: Organizations, Users, Vehicles, Prospects, Org Detail Tabs |

### 3.3 TopBar (globale Chrome-Zeile)

**Datei:** `frontend/src/master/components/TopBar.tsx`

| Element | Status |
|---------|--------|
| Welcome-Label | Funktional (`getStoredUser`) |
| Global Search + ⌘K | **Dekorativ** — kein Command-Palette-Wiring |
| Theme Toggle | Funktional |
| Settings | Verdrahtet → `view=settings` |
| Language Picker | **Dekorativ** — lokaler State only |
| Notifications Bell | **Dekorativ** — statischer roter Dot |
| Logout | Funktional |
| Avatar Button | **Dekorativ** — keine Aktion (Konto in Sidebar Footer) |

---

## 4. Page Type Inventory

### 4.1 Strukturelle Seitentypen

| Typ | Definition | Master Views | Struktur-Konsistenz |
|-----|------------|--------------|---------------------|
| **Overview** | KPI-Grid + Aktivitäts-/Alert-Panels | Dashboard | A-Welle; eigenes `max-w-[1600px]` |
| **List** | Header + Filter + Tabelle/Cards | Organizations, Users, Prospects, Activity Log | Users/Orgs: DataTable; Prospects: custom table |
| **Detail** | Full Header + Tabs + Sektionen | Organization Detail, Billing Org Drawer, Support Workspace | Org Detail: custom tables; Billing Drawer: Pattern Library |
| **Settings** | Titel + Tab-Nav + Form-Sections | Platform Settings (+ Email panel) | Legacy C-Welle; kein PageHeader |
| **Operational** | Echtzeit-Status, Queues, Aktionen | Platform Health, Support, Fleet Connection, Vehicle Logbook | Health: Pattern; Logbook: Legacy; Support: Custom Ops Grid |
| **Analytics** | Metriken + Zeitbereich + Drilldown | Activity Log, Dashboard Alerts, Architektur (docs) | Activity Log gut; Dashboard gut |
| **Configuration** | CRUD-Admin mit Tabs | Parts, Insurance, Voice, HM, Billing Pricing | Voice/Billing: chrome tabs + URL; Parts/Insurance: sq-tab-bar + custom tables |
| **Control Center** | Multi-Section mit URL-State | Billing, Voice | Referenz-Implementierungen für komplexe IA |

### 4.2 Typ → Framework-Mapping (Soll vs Ist)

```
Overview     → PageHeader + MetricCard grid + DataCard panels     [Dashboard: ✓]
List         → PageHeader + filter DataCard + DataTable             [~60% DataTable]
Detail       → PageHeader full + sq-tab-bar + SectionHeader       [Org Detail: partial]
Settings     → PageHeader + chrome SectionTabBar + DataCard forms [Settings: ✗]
Operational  → PageHeader full + live meta + refresh              [Health: ✓, Logbook: ✗]
Control Ctr  → PageHeader + chrome tabs + URL sync                [Billing/Voice: ✓]
```

---

## 5. Layout & Spacing Findings

### 5.1 Max-Width

| View | Root max-width | Konflikt mit Shell 1400px |
|------|----------------|---------------------------|
| Shell | `max-w-[1400px]` | — |
| MasterDashboardView | `max-w-[1600px] mx-auto` | Intent > Shell (effektiv 1400) |
| BillingControlCenter | `max-w-[1600px] mx-auto` | Intent > Shell |
| VoiceAssistantAdminView | `max-w-[1600px] mx-auto` | Intent > Shell |
| PlatformHealthView | `max-w-[1400px]` + `p-6` | Redundant mit Shell |
| Alle anderen | kein eigenes max-w | Nutzen Shell |

### 5.2 Vertical Spacing (Root `space-y-*`)

| Wert | Views |
|------|-------|
| `space-y-4` | Organizations, Vehicles, Prospects, Logbook, Changes, SystemMonitoring |
| `space-y-5` | Dashboard, Users, Billing, Activity, HM, Voice |
| `space-y-6` | Fleet Connection, Parts, Insurance, Health, Architektur |
| `space-y-8` | Platform Settings |

**Bottom Padding:** `pb-4`, `pb-6`, `pb-8` ohne erkennbares System.

### 5.3 Section / Card / Grid Gaps

| Kontext | Typische Werte | Magic Numbers |
|---------|----------------|---------------|
| KPI Grid | `gap-3`, `gap-4` | Dashboard 2×3 / 3×5 Grids ad hoc |
| Card Padding | `p-5`, `p-6`, `p-8` | Org Detail `p-8`; Settings `p-8` |
| Header → Content | `mb-4` (PageHeader) + `space-y-*` root | Doppelter Abstand bei `space-y-5` + `mb-5` |
| Filter Card → Table | `DataCard flush` oder eigener CARD wrapper | Inkonsistent |
| Grid responsive | `grid-cols-1 lg:grid-cols-2` häufig | Kein shared `master-page-grid` Token |

### 5.4 Padding by Breakpoint

| Breakpoint | Shell (Master) | View-Overrides |
|------------|----------------|----------------|
| Mobile 320–375 | `px-4`, `pt-16` shell | HM: extra `px-4 py-5` |
| sm | `px-6` | — |
| lg+ | `px-8`, `pt-4` | Rental-Vergleich: deutlich weniger Luft |
| Wide | capped 1400px | Voice/Dashboard intent 1600px |

**Empfehlung (nur dokumentiert, nicht implementiert):** Ein `masterPageShell` Token-Set analog `dashboardShell.tsx` — `MASTER_PAGE_SPACE_Y`, `MASTER_SECTION_GAP`, kein per-View `max-w`.

---

## 6. Tab Findings

### 6.1 Inventar

| Implementierung | Views | Styling | URL State | a11y |
|-----------------|-------|---------|-----------|------|
| **`chrome-tab-bar`** (`MasterBillingSectionTabBar`, `MasterBillingSubTabBar`, `MasterPricingSubTabBar`, Voice `SectionTabBar`) | Billing, Voice | `surface-frosted`, 11px semibold | ✓ `masterBilling`, `voiceSection`, popstate | `aria-selected`, `aria-label` |
| **`sq-tab-bar`** (L0 inset) | Vehicles, Parts, Insurance, HM | `sq-tab-active` / manual | HM: initial `hmTab` only; others: memory | Teilweise `aria-selected` |
| **Custom `bg-muted` pills** | Settings, Org Detail, Prospects, Logbook | `rounded-xl font-bold px-6` | Settings: ✓ `settingsTab`; others: memory | Meist **kein** `role="tablist"` |
| **Side category nav** | Architektur | `navItemClass` vertical/horizontal | `archCategory` initial; internal not synced | Buttons, kein tablist |
| **Queue tabs** | Support (`SupportOpsQueue`) | Custom sop tokens | Memory | Buttons |
| **Filter pills** | Fleet Connection, Activity filters | Chip-like | Memory | `aria-label` on Activity selects |

### 6.2 Tab-Inkonsistenzen

| Thema | Befund |
|-------|--------|
| **Höhe** | chrome ~32px; sq-tab-bar ~36–40px; Settings pills ~40px+ |
| **Active State** | `surface-premium` vs `sq-tab-active` vs `bg-neutral-700` (Settings dark) |
| **Mobile Scroll** | sq-tab-bar: `overflow-x-auto`; chrome: `CHROME_TAB_BAR_SCROLL_CLASS`; Settings: `w-fit` |
| **Badges/Counters** | Billing/Voice: testids; Vehicles: none; Parts: none |
| **Deep Link** | Billing/Voice/Settings: gut; Org/Vehicles/Parts/Logbook: fehlt |
| **Back/Forward** | Nur Views mit `pushState` + `popstate` listener (Billing, Voice, App-level view) |

---

## 7. Surface/Card Findings

### 7.1 Container-Inventar

| Primitive | Verwendung Master | Qualität |
|-----------|-------------------|----------|
| **`MetricCard`** | Dashboard, Users, Activity, Health, Voice, Prospects | Konsistent, token-basiert |
| **`DataCard`** | Dashboard, Users, Vehicles, Activity, Health, Billing children | `flush` variant für Tables |
| **`surface-premium`** | Org Detail CARD, Sidebar-adjacent, RightSidebar, Filter bars | De-facto Card-Standard |
| **Legacy `cardClass`** | Settings (`rounded-3xl`, gray/neutral ternaries) | **Zweite Designsprache** |
| **Legacy `card`/`CARD` helpers** | Logbook, Changes, Parts, Insurance | `isDarkMode ? bg-neutral-900 : bg-white` |
| **Custom KPI tiles** | Org Detail Quick Stats, Fleet Connection stats, Support KPI strip | Nicht `MetricCard` — andere Dichte |
| **Alert Panels** | Voice incident banner, Settings Stripe warning | Ad hoc amber borders |
| **Glass / Frosted** | chrome-tab-bar shells | Rental-Parität; wenig in Master Content |

### 7.2 Design-Dichte & Radius

| Aspekt | Pattern Library | Legacy (C-Welle) |
|--------|-----------------|------------------|
| Radius | `rounded-xl` / `--radius-md` | `rounded-2xl`, `rounded-3xl` |
| Border | `border-border` | `border-gray-200`, `border-neutral-800` |
| Shadow | `surface-premium` token | `shadow-sm`, `shadow-lg`, gradient buttons |
| Padding | MetricCard compact/dense props | `p-8` hero cards |
| Hover | `sq-press`, MetricCard clickable | Inkonsistent |

**Fazit:** Master Admin entwickelt **keine komplett separate Designsprache**, aber die **C-Welle (Settings, Logbook, Changes)** und **B-Welle-Reste (Org Detail KPI tiles, Parts tables)** erzeugen sichtbaren **Drift** neben der Pattern Library.

---

## 8. State Handling Findings

### 8.1 Inventar pro Zustand

| State | Pattern-Views | Legacy/Custom | Qualität |
|-------|---------------|---------------|----------|
| **Loading** | `SkeletonMetricGrid`, `SkeletonCard`, `SkeletonRows`, DataTable `loading` | Logbook: text spinner; Fleet: full-page spinner; Settings: none | Polarisiert |
| **Skeleton** | Dashboard, Billing, Activity, Voice (partial) | — | Gut wo vorhanden |
| **Empty** | `EmptyState` compact/default | Prospects: imported unused; Fleet: imported unused | Lücken |
| **Error** | `ErrorState` + retry | Logbook: silent catch; Fleet: custom error card | Technische Messages teils roh |
| **Partial Error** | Dashboard (alerts fetch catch) | — | Stille Degradation |
| **Permission Denied** | Billing `hasMasterBillingAccess` + EmptyState | Voice: section gates | Nav filtert; Page-Level noch möglich |
| **Offline** | — | — | **Nicht implementiert** |
| **Stale Data** | Health 60s poll; Support polling | Kein UI-Indikator „stale" außer Health meta | Schwach |
| **No Results** | DataTable empty; Activity filter empty | Custom table views: variabel | Inkonsistent |

### 8.2 MFA / Gate States

| Gate | Verhalten |
|------|-----------|
| `MasterMfaGate` | Ersetzt gesamten Content inkl. TopBar bei Enrollment — korrekt, aber **kein Shell-Branding** |
| Billing access | Inline `EmptyState` in BillingControlCenter |
| Billing-only user | Sidebar filtert; Dashboard sichtbar |

### 8.3 Recovery Actions

| View | Retry | Filter Reset | Navigation Hint |
|------|-------|--------------|-----------------|
| Dashboard | ✓ ErrorState | — | — |
| Activity Log | ✓ | ✓ implicit | — |
| Billing | ✓ | — | — |
| Fleet Connection | ✓ button | — | — |
| Logbook | ✗ silent | — | — |

---

## 9. Table Framework Findings

### 9.1 DataTable vs Custom

| View | DataTable | Custom `<table>` | Mobile Cards |
|------|-----------|------------------|--------------|
| Organizations | ✓ dense | — | — |
| Users | ✓ | — | — |
| Vehicles (registered) | ✓ | DIMO/HM tabs custom | — |
| Activity Log | — | Divided list | — |
| Prospects | — | ✓ | — |
| Org Detail | import unused | ✓ users/vehicles | — |
| Parts / Insurance | import unused | ✓ per tab | — |
| Billing (subtabs) | ✓ | — | Partial |
| Voice | ✓ | — | — |
| Platform Health | ✓ queues | — | — |
| Support | — | Custom inbox rows | ✓ |
| HM | import unused | ✓ | — |

### 9.2 Table Chrome (wo DataTable)

| Feature | Status |
|---------|--------|
| Container | `DataCard` flush oder `card={true}` |
| Toolbar | Pro View eigene Filter-Card — **kein shared MasterTableToolbar** |
| Search | Inkonsistent platziert (in Card header vs standalone) |
| Sort | DataTable columns ohne Sort-UI (manuell selten) |
| Pagination | Activity Log custom; Support API pagination; DataTable: keine built-in pagination |
| Row Actions | `rowActions` prop — genutzt in Users, Vehicles |
| Bulk Actions | **Nicht vorhanden** in Master |
| Empty/Loading | DataTable built-in ✓ |
| Mobile | Rental hat Card-Rows; Master **überwiegend Desktop-Tables** |

---

## 10. Responsive Findings

### 10.1 Breakpoint-Matrix

| Breakpoint | Content Width | Padding | Grids | Header Actions | Tabs | Tables |
|------------|---------------|---------|-------|----------------|------|--------|
| **320–375** | 100% − 32px | `px-4` | 1 col | TopBar icons only; PageHeader stacks | Horizontal scroll | Overflow risk on custom tables |
| **Large phone** |同上 | `px-4` | 1 col | Welcome visible sm+ | scroll | — |
| **Tablet Portrait** | max 1400 cap | `px-6` | 1–2 col | Search visible md+ | scroll | — |
| **Tablet Landscape** | cap | `px-6` | 2 col common | Full TopBar | scroll | — |
| **Notebook** | cap | `px-8` | 2–3 col | Full | sq-tab-bar | DataTable |
| **Desktop** | 1400 centered | `px-8` | Full grids | Full + RightSidebar appears lg+ | — | Full |
| **Wide** | 1400 centered (letterbox) | `px-8` | Extra margin | RightSidebar 300px reduces main | — | — |

### 10.2 Mobile-spezifische Patterns (nicht nur flex-column)

| View | Mobile-Ansatz | Qualität |
|------|---------------|----------|
| **Support** | 3-col → Sheet workspace; `SupportOpsQueueMobile` | **Hoch** — eigenständig designed |
| **Billing** | Drawer `BillingOrgDetailDrawer` | Gut |
| **Voice** | Responsive tables via DataTable | Mittel |
| **Vehicles** | DataTable horizontal scroll | Schwach |
| **Prospects** | Table only — no card fallback | Schwach |
| **Dashboard** | KPI 2-col; stacked cards | Akzeptabel |
| **Org Detail** | Tabs scroll; tables overflow | Schwach |

---

## 11. Accessibility Findings

### 11.1 Heading Hierarchy

| Issue | Detail |
|-------|--------|
| **Single h1** | PageHeader liefert h1 pro View — gut |
| **Legacy h1** | Settings, Changes, Logbook: manuelles h1 ohne Landmark-Kontext |
| **Skipped levels** | Org Detail: h1 → h3 in cards (kein h2) |
| **Double h1 risk** | Settings Monitoring embeds SystemMonitoringView mit eigenem PageHeader |

### 11.2 Landmarks

| Landmark | Status |
|----------|--------|
| `<nav>` | Sidebar: ✓ pro Gruppe |
| `<main>` | **Fehlt** — Content in generischem `div` |
| `role="dialog"` | AccountSheet, Modals ✓ |
| `aria-current="page"` | Sidebar ✓ |

### 11.3 Focus & Keyboard

| Bereich | Status |
|---------|--------|
| Sidebar | `focus-visible:ring-2` via nav-utils ✓ |
| TopBar | Teilweise `aria-label`; Avatar/Logout ohne sichtbaren Focus-Ring konsistent |
| PageHeader actions | Raw buttons teils ohne `type="button"` |
| Tabs | chrome-tab-bar: focus ring ✓; custom pills: oft ✗ |
| DataTable rows | `onRowClick` — keyboard? depends on implementation |
| Mobile Drawer | Escape ✓; Focus return ✗ (bekannt UI-1.4) |

### 11.4 Tabs Semantics

| Implementation | `role="tablist"` | `aria-selected` | `aria-controls` | Roving tabindex |
|----------------|------------------|-----------------|-----------------|-----------------|
| Billing chrome tabs | ✓ | ✓ | partial | ✗ |
| Voice SectionTabBar | ✓ | ✓ | ✗ | ✗ |
| sq-tab-bar views | ✗ | teils | ✗ | ✗ |
| Settings/Org pills | ✗ | ✗ | ✗ | ✗ |

### 11.5 Reduced Motion / Touch

| Kriterium | Status |
|-----------|--------|
| `animate-fade-up` on PageHeader | `prefers-reduced-motion` in theme.css — global |
| Touch targets | Sidebar 44px mobile ✓; TopBar icons ~32px — grenzwertig |
| `tabular-nums` | MetricCard/DataTable numeric ✓ |

---

## 12. Design-System Findings

### 12.1 Genutzte SynqDrive-Primitives

| Kategorie | Komponenten / Tokens |
|-----------|---------------------|
| **Layout** | `AppShell`, `nav-utils`, `page-header`, `SectionHeader` |
| **Data Display** | `MetricCard`, `DataCard`, `DataTable`, `StatusChip`, `PriorityBadge` |
| **Feedback** | `EmptyState`, `ErrorState`, `Skeleton*` |
| **Overlay** | `DetailDrawer`, `AppDialog`, `ConfirmDialog`, Radix `Sheet` |
| **Tabs** | `chrome-tab-bar.ts`, `sq-tab-bar` (CSS), billing/voice tab bars |
| **Surfaces** | `surface-premium`, `surface-frosted`, `sq-tone-*`, `sq-chip` |
| **Theme** | `AppThemeContext`, CSS variables in `theme.css` |

### 12.2 Hardcoded / Lokale Abweichungen

| Typ | Beispiele |
|-----|-----------|
| **Colors** | `text-purple-500`, `text-emerald-500`, `from-indigo-500` (Settings, Org Detail) |
| **Spacing** | `p-8`, `gap-5`, `space-y-8` ohne Token |
| **Radius** | `rounded-2xl`, `rounded-3xl` in Legacy cards |
| **Shadow** | `shadow-lg`, `shadow-2xl` in HM modals |
| **Typography** | `text-2xl font-extrabold` Org KPI; `text-base` Settings subtitle |
| **Buttons** | Gradient Save in Settings vs `Button` component |
| **isDarkMode props** | Noch in ~15 Master Views übergeben, oft **nur für Legacy-C-Welle** |

### 12.3 Doppelte UI-Primitives

| Duplikat | Pattern vs Legacy |
|----------|-------------------|
| KPI display | `MetricCard` vs custom 2×2 tiles |
| Card shell | `DataCard` vs `CARD`/`cardClass` helpers |
| Error UI | `ErrorState` vs `ErrorCard`/`ErrorBanner` |
| Loading | `Skeleton*` vs `Loader2` spinners |
| Tables | `DataTable` vs hand-rolled `<table>` |
| Tabs | chrome-tab-bar vs sq-tab-bar vs muted pills |

**Keine neue Design-Library nötig** — bestehende Pattern Library reicht, wenn **Master Page Shell Contract** sie durchsetzt.

---

## 13. Technical Duplication

| # | Duplikat | Ort | Impact |
|---|----------|-----|--------|
| 1 | Dashboard stats fetch | `MasterDashboardView` + `RightSidebar` | Doppelte API `api.admin.dashboard()` |
| 2 | Activity feed | Dashboard DataCard + RightSidebar | Gleiche Daten, zwei UI |
| 3 | Support tickets preview | Dashboard + RightSidebar | `api.support.open(5)` doppelt |
| 4 | Tab bar implementations | 5+ Varianten | Wartung, a11y, URL |
| 5 | Table markup | DataTable vs 6+ custom tables | Responsive, empty, loading |
| 6 | Card helpers | `CARD`, `cardClass`, `card()` local | Theme drift |
| 7 | Loading patterns | 4+ Varianten | UX inconsistency |
| 8 | `max-w-[1600px]` | 3 views | Dead intent vs shell 1400 |
| 9 | `isDarkMode` prop threading | App → Views | Obsolete nach ThemeContext |
| 10 | Settings vs Platform Health | Monitoring in beiden | IA confusion (post sidebar remediation) |
| 11 | Unused imports | Parts, Insurance, HM, Org Detail, Fleet | DataTable/EmptyState dead imports |
| 12 | SystemMonitoringView TAB_BAR | Defined unused | Dead code |

---

## 14. Priorisierte Findings

### P0 — Blockiert Master Page Framework als gemeinsame Basis

| ID | Finding |
|----|---------|
| P0-1 | **Kein `<main>` Landmark** und kein `MasterPageShell` Wrapper — Screenreader/SEO-Struktur fehlt |
| P0-2 | **Kein Page-Shell-Contract** — Views setzen eigenständig spacing, max-width, scroll |
| P0-3 | **RightSidebar global gemountet** — dritte Scroll-Spalte + API-Duplikation auf allen Views |
| P0-4 | **Tab-Systeme fragmentiert (5+)** ohne URL/a11y-Standard — Control Centers nicht replizierbar |
| P0-5 | **Legacy C-Welle** (Settings, Logbook, Changes) ohne Pattern Library — visueller Bruch |

### P1 — Hoher UX/Consistency-Impact

| ID | Finding |
|----|---------|
| P1-1 | PageHeader nicht universell; **keine Breadcrumbs**; Back-Navigation inkonsistent |
| P1-2 | **DataTable nicht durchgängig** — 6+ Views mit custom tables + unused imports |
| P1-3 | **Nested scroll** Dashboard/HM/Support — Scroll-Jank-Risiko |
| P1-4 | **Nested Header** Settings → SystemMonitoringView |
| P1-5 | **DE/EN-Mix** in Headers, Tabs, Empty States |
| P1-6 | State-Handling: silent errors (Logbook), no skeleton (Health poll) |
| P1-7 | Mobile: Listen ohne Card-Fallback (Prospects, Org tables, Parts) |
| P1-8 | TopBar Search/Notifications/Language **dekorativ** — falsche Affordance |

### P2 — Mittlerer Impact

| ID | Finding |
|----|---------|
| P2-1 | `max-w-[1600px]` auf 3 Views widerspricht Shell 1400 |
| P2-2 | `space-y-4/5/6/8` und `pb-4/6/8` ohne Token |
| P2-3 | Org Detail KPI tiles statt MetricCard |
| P2-4 | `isDarkMode` Props obsolet — entfernen bei Migration |
| P2-5 | Hardcoded colors (purple/emerald/indigo gradients) |
| P2-6 | High Mobility Doppel-Padding |
| P2-7 | Kein stale-data Indicator außer Health |
| P2-8 | Avatar in TopBar ohne Funktion (dupliziert Sidebar Konto) |

### P3 — Niedriger Impact / Cleanup

| ID | Finding |
|----|---------|
| P3-1 | Unused TAB_BAR in SystemMonitoringView |
| P3-2 | EmptyState imported but unused (Prospects, Fleet) |
| P3-3 | `animate-fade-up` auf jedem PageHeader — motion preference ok, aber repetitiv |
| P3-4 | Architektur internal nav nicht URL-synced nach initial load |
| P3-5 | ChangesView embedded FALLBACK_ENTRIES — massive file size |

---

## 15. Empfehlungen

> **Hinweis:** Nur strategische Empfehlungen für Folgephasen — **keine Implementierung in UI-2.1**.

### Phase UI-2.2 — Master Page Shell Contract (Foundation)

1. **`MasterPageShell` Komponente** — Wrapper für alle Views:
   - `<main id="master-main">` Landmark
   - Einheitliches `space-y-5` (oder Token)
   - **Kein** per-View `max-w` — nur Shell
   - Optional slots: `header`, `tabs`, `toolbar`, `children`
2. **`MasterPageHeader`** — dünner Alias über `PageHeader` mit Master-Defaults (DE labels, keine Icon-Pflicht)
3. **RightSidebar** — nur auf Dashboard rendern **oder** in Dashboard integrieren und globalen Mount entfernen
4. **`isDarkMode` prop** — aus Master Views entfernen (ThemeContext only)

### Phase UI-2.3 — Tab & URL Standard

1. **Ein Tab-Primitive für Master L1/L2:** `chrome-tab-bar` als Standard (Billing/Voice als Referenz)
2. **URL-Sync-Regel:** Jeder L1/L2 Tab schreibt `pushState` — Org Detail, Vehicles, Parts als nächste Kandidaten
3. **a11y:** `role="tablist"` / `aria-selected` / `aria-controls` Pflicht

### Phase UI-2.4 — Table & State Standard

1. **MasterTableToolbar** — Search + Filter + Refresh Slot über DataTable
2. **Migration custom tables → DataTable** (Parts, Insurance, Org Detail, Prospects, HM)
3. **State matrix** — jede View muss Skeleton + Empty + Error + Retry haben (kein silent catch)

### Phase UI-2.5 — Legacy Migration

1. **PlatformSettingsView** → PageHeader + chrome tabs + DataCard forms (Monitoring-Tab entfernen/redirect)
2. **VehicleLogbookView** → PageHeader + Pattern states + tab URL
3. **ChangesView** → PageHeader + DataCard timeline (FALLBACK_ENTRIES auslagern)

### Phase UI-2.6 — Responsive & Mobile

1. **DataTable mobile card rows** — Rental-Pattern übernehmen
2. **Support-Ops-Pattern** als Referenz für komplexe Mobile-Layouts
3. **Touch targets** TopBar auf min 44px

### Nicht empfohlen

- Neue Design Library — Pattern Library reicht
- Per-Page Magic-Pixel-Fixes — nur Token-basiert
- Breadcrumbs überall — nur Detail/Control-Center-Typen

---

## Scores (0–100)

| Metrik | Score | Begründung (Kurz) |
|--------|-------|-------------------|
| **App Shell** | **62** | Solide `AppShell`-Basis + Mobile Sidebar; aber RightSidebar, nested scroll, fehlendes `<main>` |
| **Page Hierarchy** | **54** | ~70% PageHeader; keine Breadcrumbs; Detail-Back schwach; TopBar ohne Kontext |
| **Layout Consistency** | **48** | Vier Sub-Layout-Regimes; max-w-Overrides; Support/HM Speziallayouts |
| **Spacing Consistency** | **45** | `space-y-4/5/6/8`, `pb-4/6/8`, `p-6/p-8` ohne Master-Tokens |
| **Responsive UX** | **58** | Support Ops stark; viele Tabellen desktop-only; RightSidebar nur lg+ |
| **State Handling** | **60** | A-Welle vorbildlich; Legacy silent fails; kein offline/stale UI |
| **Accessibility** | **52** | Sidebar gut; Tab-ARIA fragmentiert; kein main landmark |
| **Design-System Consistency** | **55** | Pattern Library vorhanden; C-Welle + hardcoded colors driften |

**Gesamt:** Das Content-Framework ist **funktional nutzbar**, aber mit **~54/100** noch **nicht** als einheitliche production-ready Grundlage für alle Master-Admin-Pages geeignet. Die kanonische Sidebar (UI-1.4) ist der stärkste Anker; **Billing** und **Voice** sind die besten Referenzen für den Ziel-Page-Framework-Contract.

---

## Anhang: Bezug zu UI-1.x Dokumentation

| Dokument | Relevanz für dieses Audit |
|----------|---------------------------|
| `master-admin-information-architecture-audit.md` | URL-Routing verbessert (UI-1.4); RightSidebar-Redundanz bestätigt |
| `master-admin-sidebar-navigation-audit.md` | Sidebar-Befunde adressiert; Content-Breite 1400px unverändert |
| `master-admin-canonical-navigation-blueprint.md` | In-Page Subnav (Org Tabs, Billing) als nicht-Sidebar dokumentiert — bestätigt Tab-Fragmentierung |
| `master-admin-sidebar-navigation-post-remediation.md` | TopBar Search weiterhin P2; MFA Gate bestätigt |

---

*Read-only Audit — keine Code- oder Architektur-Änderungen in UI-2.1.*
