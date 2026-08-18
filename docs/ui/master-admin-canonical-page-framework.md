# Master Admin — Kanonisches Page Framework

**Datum:** 2026-08-18  
**Phase:** UI-2.2 (Spezifikation — keine Implementierung)  
**Basis:**
- `docs/ui/master-admin-information-architecture-audit.md`
- `docs/ui/master-admin-canonical-navigation-blueprint.md`
- `docs/ui/master-admin-app-shell-framework-audit.md`  
**Ziel:** **Ein** verbindliches Page Framework für sämtliche Master-Admin-Seiten — Grundlage für alle folgenden UI-Phasen

---

## 0. Leitprinzipien

| Prinzip | Regel |
|---------|-------|
| **Eine Shell** | `MasterAdminShell` ist die einzige Root-Chrome; keine View baut eigene Layout-Hülle |
| **Eine Scroll-Achse** | Main Region scrollt; keine verschachtelten Scroll-Flächen außer fachlich begründet |
| **Eine Header-Sprache** | `MasterPageHeader` (Erweiterung von `PageHeader`) — kein lokales `h1` |
| **Ein Tab-System** | `MasterPageTabs` (chrome-tab-bar + URL) — keine `sq-tab-bar`-Pills, keine `bg-muted`-Buttons |
| **Parent via Sidebar** | Flache IA → Seitentitel reicht; Breadcrumbs nur bei echtem Drilldown |
| **Pattern Library first** | `MetricCard`, `DataCard`, `DataTable`, `EmptyState`, `ErrorState`, `Skeleton*` — keine Parallel-Primitives |
| **DE kanonisch** | UI-Texte Deutsch; i18n-Keys `master.page.*`, `master.section.*` |
| **Tokens, keine Magic Numbers** | Spacing/Width über zentrale Master-Page-Tokens — nicht `space-y-6` pro View |

---

## 1. Komponentenmodell — `MasterAdminShell`

### 1.1 Struktur

```
MasterAdminShell
├── Sidebar Region          ← bestehende kanonische Sidebar (UI-1.4)
├── Main Region             ← einzige vertikale Scroll-Fläche (document flow)
│   ├── Global Chrome Row   ← MasterGlobalChrome (TopBar)
│   └── <main id="master-main">
│       └── PageContainer   ← pro View (variant: standard | wide | full)
│           ├── Page Header Region   ← MasterPageHeader (+ optional Tabs)
│           └── Page Content Region  ← Sections, Tables, States
├── Overlay Layer           ← Portals: Dialog, Sheet, Drawer, MFA, Account
└── Toast Layer             ← sonner Toaster (global, außerhalb scroll)
```

**Implementierungsziel:** `MasterAdminShell` erweitet/refactored `AppShell variant="master"` — kein zweites Shell-System.

### 1.2 Regionen im Detail

| Region | Verantwortung | Scroll? |
|--------|---------------|---------|
| **Sidebar** | Primärnavigation, Footer-Control, Mobile Drawer | Eigene interne Scroll nur in Nav-Liste (`overflow-y-auto` innerhalb fixed height) — akzeptiert |
| **Main Region** | Global Chrome + `<main>` + gesamter Seiteninhalt | **Ja — kanonische Scroll-Achse** |
| **Page Header Region** | Titel, Kontext, Actions, Tabs — sticky optional (s.u.) | Nein — scrollt mit Main |
| **Page Content Region** | Sections, KPIs, Tables | Nein — scrollt mit Main |
| **Overlay Layer** | Modals, Drawers, MFA Gate (fullscreen substitute), Mobile Nav Scrim | Eigenes Scroll nur in Dialog-Body (`max-h-[80vh]`) — akzeptiert |
| **Toast Layer** | Feedback, keine Navigation | Fixed viewport |

### 1.3 Höhen & Layout

| Element | Regel |
|---------|-------|
| Root | `h-screen w-full flex overflow-hidden` (bestehend) |
| Sidebar Desktop | Expanded `w-[260px]` / Collapsed `w-[52px]` (bestehend) |
| Main column | `flex-1 flex flex-col overflow-hidden min-w-0` |
| Mobile offset | `pt-16 lg:pt-0` für fixed Sidebar-Header |
| Main scroll container | `flex-1 overflow-auto overflow-x-clip` |
| **RightSidebar** | **Entfernen aus globalem Mount** — Inhalt in Dashboard-Widgets integrieren (s.u.) |

### 1.4 Scroll-Verantwortung (verbindlich)

| Erlaubt | Verboten (Default) |
|---------|-------------------|
| Main Region `overflow-auto` | View-root `overflow-y-auto` / `h-full min-h-0` + inner scroll |
| Modal/Drawer body scroll | `max-h-[280px]` Activity-Listen in Cards auf Dashboard → `showAll` Link oder Section ohne Cap |
| Sidebar nav list scroll | Support 3-column: **eine** inner scroll pro Panel, nicht zusätzlich View-root scroll |
| Architektur doc: side nav sticky, content scrollt in Main | Doppel-Padding + inner scroll (HM anti-pattern) |

**Ausnahme-Registry (fachlich begründet):**

| View | Ausnahme | Begründung |
|------|----------|------------|
| Support Ops | Panel-interne Scroll in Inbox/Workspace | Persistente 3-Spalten-Ops-UI; Mobile → Sheet |
| Modals/Wizards | Body scroll | Org Create Wizard, lange Forms |
| Architektur | Sticky category nav | Doku-Layout — kein zweites page scroll |

### 1.5 RightSidebar — Zielzustand

| Ist | Soll |
|-----|------|
| Global `rightPanel` auf allen Views, 300px, eigener `h-screen overflow-y-auto` | **Nur Dashboard** oder vollständig in Dashboard-Sections aufgelöst |
| Dupliziert Stats/Activity/Tickets API | Ein Datenpfad pro Widget |

---

## 2. Page Container System

### 2.1 Varianten (zentral — nie pro View)

| Variante | Max-Width | Horizontal Padding | Wann |
|----------|-----------|------------------|------|
| **`standard`** | `max-w-[1400px] mx-auto` | Shell-Gutter (s.u.) | Default — 95% aller Views |
| **`wide`** | `max-w-[1600px] mx-auto` | Shell-Gutter | Control Centers mit vielen Spalten: Billing, Voice, Dashboard |
| **`full`** | Kein max-width (100% der Main-Spalte) | Shell-Gutter | Support Ops, Full-bleed Tables innerhalb Padding |

**Regel:** Views wählen **nur** `variant` — setzen **nie** eigene `max-w-*` oder `mx-auto`.

### 2.2 Responsive Horizontal Padding (Shell-Gutter)

Übernommen und als Token fixiert (`--master-shell-gutter-*`):

| Breakpoint | Padding | Tailwind-Äquivalent |
|------------|---------|---------------------|
| Mobile `<640px` | 16px | `px-4` |
| Tablet `≥640px` | 24px | `sm:px-6` |
| Notebook/Desktop `≥1024px` | 32px | `lg:px-8` |

Vertical Shell Padding:

| Breakpoint | Top | Bottom |
|------------|-----|--------|
| Mobile | `pt-3` (nach global chrome) | `pb-6` |
| Desktop `≥1024px` | `lg:pt-4` | `pb-6` |

### 2.3 Page Content Vertical Rhythm

Zentraler Token `--master-page-stack` = **20px** (`space-y-5`):

```
PageContainer
  space-y: var(--master-page-stack)   /* 20px zwischen Header, Tabs, Sections */
```

| Abstand | Token | Wert |
|---------|-------|------|
| Page Header → Tabs | `--master-header-tabs-gap` | 12px (`gap-3`) |
| Tabs → erster Section | `--master-page-stack` | 20px |
| Section → Section | `--master-section-gap` | 24px (`space-y-6`) |
| Section Header → Content | `--master-section-header-gap` | 12px (`mb-3`, bestehend SectionHeader) |
| Card Grid gap | `--master-card-gap` | 12px (`gap-3`) KPI / 16px (`gap-4`) Content |

**Verboten:** `space-y-4`, `space-y-8`, `pb-8` als View-root ohne Varianten-Grund.

---

## 3. Canonical Page Header — `MasterPageHeader`

### 3.1 Basis

Erweitert bestehendes `PageHeader` (`frontend/src/components/patterns/page-header.tsx`) — **kein Parallel-Header**.

```tsx
MasterPageHeader
├── leading?: BackButton | null
├── eyebrow?: ReactNode        // nur variant="context"
├── icon?: ReactNode           // optional, default off für List Pages
├── title: ReactNode           // h1, --text-display-lg
├── status?: ReactNode         // StatusChip(s)
├── description?: ReactNode    // nur variant="context"
├── meta?: ReactNode           // Zeile unter Titel (Zeit, Count, Live)
├── actions?: MasterPageActions
└── tabs?: MasterPageTabs      // optional, direkt unter Header-Block
```

### 3.2 Varianten

| Variante | Entspricht | Nutzung |
|----------|------------|---------|
| **`page`** (default) | `PageHeader variant="page"` | List, Overview, Settings (Top-Level) |
| **`context`** | `PageHeader variant="full"` | Detail, Operational mit Live-Status |

### 3.3 Element-Regeln

| Element | Wann | Wann nicht |
|---------|------|------------|
| **Back** | Detail-Drilldown (Org Detail, Logbook Detail, HM Sub-Flow) | Top-Level Sidebar-Views |
| **Eyebrow** | Detail: Entitätstyp („Organisation“, „Ticket #…“) | List/Overview — Sidebar ist Parent |
| **Titel** | Immer — ein `h1` pro View | — |
| **Icon** | Optional bei schwer erkennbaren Domänen | Nicht Default auf jeder List Page |
| **Description** | Kontext- oder Ops-Pages mit Erklärungsbedarf | List Pages — Hilfetext in Section |
| **Status** | Live/Ops (Health, HM, Detail-Status) | Statische List Pages |
| **Meta** | Pagination, Last updated, Scope | Nicht für lange Fließtexte |
| **Primary Action** | Max. 1 — siehe §4 | — |
| **Secondary Actions** | Refresh, Export, Filter toggle | Nicht >2 sichtbar Desktop |
| **Overflow Menu** | >3 Aktionen oder seltene/destruktive | — |
| **Tabs** | L1-Subnav der View — URL-synced | Nicht für Filter (→ Toolbar) |
| **Breadcrumbs** | **Nur** bei 3+ Ebenen ohne Sidebar-Äquivalent | Nie parallel zu Sidebar + Titel |

### 3.4 Back Navigation (statt Breadcrumbs)

```
[← Zurück]  Organisationen          ← Eyebrow (optional)
            Acme Fleet GmbH         ← h1
            [Plan] [Active]           ← status
```

- Back **links** vor Titel-Block (nicht in `actions` rechts)
- Label: „Zurück“ oder Parent-Name („Organisationen“)
- `onBack` → URL-State (`orgId` entfernen, `view=organizations`)

### 3.5 Global Chrome — `MasterGlobalChrome`

Bestehende `TopBar` — Rolle präzisiert:

| Enthält | Enthält nicht |
|---------|---------------|
| Welcome-Label | Seitentitel (→ Page Header) |
| Theme, Operator Entry | Breadcrumbs |
| Settings Shortcut (Footer-Duplikat ok) | Dekorative Suche (bis ⌘K implementiert: **ausblenden** oder disabled mit Tooltip) |
| Logout | Funktionsloser Avatar (→ entfernen oder an Account Sheet) |

**Höhe:** ~48px kompakt; `mb-4` Abstand zum Page Header.

---

## 4. Action Hierarchy — `MasterPageActions`

### 4.1 Regeln

| Typ | Max | Komponente | Visuell |
|-----|-----|------------|---------|
| **Primary** | 1 | `Button variant="primary"` | Dominant |
| **Secondary** | 2 | `Button variant="outline"` oder `ghost` + Icon | Zurückhaltend |
| **Destructive** | — | Nie als Primary; ConfirmDialog Pflicht | `variant="destructive"` oder Overflow |
| **Overflow** | Rest | `DropdownMenu` mit `⋯` Icon | Seltene Aktionen |

### 4.2 Layout

```
Desktop:  [Secondary] [Secondary] [Primary]
Mobile:   [Primary full width row]
          [Secondary icon row] [Overflow]
```

- Keine `gradient`-Buttons (Settings-Legacy entfernen)
- Icon-only Secondary: `aria-label` Pflicht, min 36×36px (`nav-utils` Touch Target)
- Destructive nie neben Primary ohne visuelle Trennung

### 4.3 Anti-Patterns (verboten)

- Mehrere Primary-styled Buttons
- Back-Button in `actions` rechts
- Save + Create + Export alle als große Buttons
- Tab-spezifische Actions im globalen Header ohne Tab-Kontext-Anzeige

---

## 5. Page Types — Kanonische Templates

Templates definieren **Hierarchie**, nicht Inhalt. Views composen Sections — kein starrer Baukasten.

### A. Overview Page

**Beispiele:** Dashboard, Platform Health (Summary)

```
MasterPageHeader (page)
└── Section: KPI Strip          → MetricCard grid (2×2 mobile, 4 col desktop)
└── Section: Primary Content    → DataCard / Split grid
└── Section: Secondary          → Activity, Alerts (kein capped scroll — Link „Alle anzeigen“)
```

### B. List Page

**Beispiele:** Organisationen, Benutzer, Interessenten, Aktivitätsprotokoll

```
MasterPageHeader (page) + Primary „Neu/Einladen“
└── MasterTableShell
    ├── Toolbar (Search, Filters, Refresh)
    ├── DataTable | MobileCardList
    └── Pagination
```

### C. Detail Page

**Beispiele:** Organisation Detail, Billing Org Drawer

```
MasterPageHeader (context) + Back
└── MasterPageTabs (URL-synced)
└── Section(s) per Tab
    └── DataCard | MetricCard | custom read-only rows
```

### D. Settings Page

**Beispiele:** Plattform-Einstellungen

```
MasterPageHeader (page) — Titel „Einstellungen“
└── MasterPageTabs (general | email | integrations) — **kein** monitoring (→ platform-health)
└── Section: Form Fields in DataCard
└── Sticky Footer Action Bar (optional): [Speichern] — nur bei dirty state
```

**Save-Semantik:** Explizit pro Section oder Tab; kein globales Save ohne Kontext; Toast bei Erfolg.

### E. Operational Page

**Beispiele:** Support, Fleet Connection, Vehicle Logbook

```
MasterPageHeader (context) + Status/Live meta
└── Section: Active Problems / Queue KPIs
└── Section: Live Metrics
└── Section: Work Surface (Table, Inbox, or Split Pane)
└── Section: Historical (collapsible)
```

**Support-spezifisch:** `full` PageContainer + registrierte Split-Pane-Ausnahme (§1.4).

### F. Analytics Page

**Beispiele:** Activity Log, Architektur (read-only docs)

```
MasterPageHeader (page) + Meta (Zeitraum, Count)
└── Section: Controls (Date range, Entity filter)
└── Section: KPI Summary
└── Section: Visualization | Timeline | Table
└── Section: Detail drill-down (optional)
```

### View → Type Mapping

| View | Page Type | Container |
|------|-----------|-----------|
| Dashboard | Overview | wide |
| Organizations | List | standard |
| Organization Detail | Detail | standard |
| Users, Prospects | List | standard |
| Vehicles | List + Tabs | standard |
| Billing | Operational + Control | wide |
| Activity Log | Analytics | standard |
| Platform Health | Operational/Overview | standard |
| Support | Operational | full |
| Settings | Settings | standard |
| Fleet Connection, HM, Logbook | Operational | standard |
| Parts, Insurance, Voice | Configuration | standard / wide (Voice) |
| Architektur, Changes | Analytics/Docs | standard |

---

## 6. Section Framework — `MasterPageSection`

### 6.1 Struktur

Erweitert `SectionHeader` + Content-Wrapper:

```
MasterPageSection
├── title: ReactNode
├── description?: ReactNode
├── actions?: ReactNode
├── variant?: 'plain' | 'card' | 'status'  (s.u. Surface)
└── children
```

### 6.2 Abstände (verbindlich)

| Von | Nach | Gap |
|-----|------|-----|
| Page Header | Tabs | 12px |
| Tabs | Section 1 | 20px |
| Section N | Section N+1 | 24px |
| Section title | Section content | 12px |
| Cards in grid | — | 12–16px |
| Subsection (h3) | Content | 8px |

### 6.3 Heading Hierarchy

| Ebene | Element | Beispiel |
|-------|---------|----------|
| Page | `h1` | „Organisationen“ |
| Section | `h2` | „Letzte Aktivität“ |
| Subsection | `h3` | „Rechnungsadresse“ |
| Card title | `h3` oder label | MetricCard label |

**Regel:** Nie `h1` → `h3` ohne `h2`.

---

## 7. Surface System

### 7.1 Surface-Typen

| Typ | Token/Komponente | Wann |
|-----|------------------|------|
| **Plain** | Kein Wrapper — direkt auf `bg-background` | Dichte Tabellenzeilen, Inline-Form-Gruppen |
| **Card** | `DataCard` / `surface-premium` | Standard-Container für listen, forms, grouped content |
| **Elevated Panel** | `surface-elevated` | Hover/selected, interaktive Tiles |
| **Status Panel** | `DataCard` + `sq-tone-*` border tint | Health summary, Incident banner |
| **Interactive Card** | `MetricCard` clickable | KPI drill-down |
| **Critical Alert** | Border `var(--status-critical-soft)` + Icon | P0 Incidents, MFA required — max 1 pro View sichtbar |

### 7.2 Regeln

| Regel | Detail |
|-------|--------|
| Keine Card-Inception | Max. **2 Ebenen**: Section Card → Row. Kein `DataCard` > `DataCard` > Table |
| KPI | Immer `MetricCard` — keine custom 2×2 Icon-Tiles |
| Glass/Frosted | Nur **Chrome**: Tab bars (`surface-frosted`), nicht jede Content-Card |
| Legacy `cardClass` | Migrieren zu `DataCard` |
| Padding | Card body: `p-4` dense / `p-5` default — nicht `p-8` ohne Grund |

---

## 8. Tabs — `MasterPageTabs`

### 8.1 Kanonische Implementierung

**Basis:** `chrome-tab-bar.ts` + Billing/Voice Tab Bars — **ein** Master-Primitive.

```
MasterPageTabs
├── tabs: { id, label, badge?, disabled? }[]
├── activeId: string
├── onChange: (id) => void + URL pushState
├── level: 'primary' | 'secondary'   // L1 section vs L2 sub-tab
├── urlParam: string                 // z.B. 'orgTab', 'hmTab', 'masterBilling'
└── ariaLabel: string
```

### 8.2 Styling

| Aspekt | Wert |
|--------|------|
| Container | `CHROME_TAB_BAR_CLASS` + horizontal scroll mobile |
| Trigger | `chromeTabTriggerClass(active)` |
| Höhe | ~32px trigger |
| Badge | Optional — nur operative Counts, keine Dekoration |

### 8.3 URL-Vertrag (erweitert Navigation Blueprint)

| View | URL Param | Beispiel |
|------|-----------|----------|
| Settings | `settingsTab` | `?view=settings&settingsTab=email` |
| Billing L1 | `masterBilling` | `?view=billing&masterBilling=pricing` |
| Billing L2 | `masterBillingTab` | `?view=billing&masterBilling=invoices&masterBillingTab=payments` |
| Voice | `voiceSection` | bestehend |
| HM | `hmTab` | bestehend |
| Architektur | `archCategory` | bidirektional sync |
| Org Detail | `orgTab` | **neu:** `?view=organizations&orgId=x&orgTab=users` |
| Vehicles | `vehicleTab` | **neu** |
| Parts / Insurance | `partsTab` / `insuranceTab` | **neu** |
| Logbook | `logbookTab` | **neu** |

**Regeln:**
- Jeder Tab-Wechsel → `pushState` (Back/Forward)
- Initial load → `read` + `replace` wenn Legacy
- Filter-Pills **sind keine Tabs** — bleiben in Table Toolbar

### 8.4 Accessibility

- `role="tablist"` auf Container
- `role="tab"` + `aria-selected` + `aria-controls` auf Trigger
- `role="tabpanel"` + `id` auf Panel
- Pfeiltasten/Home/End (Roving tabindex — `useRovingTablist` aus Rental wiederverwenden)
- Mobile: horizontal scroll, Focus sichtbar

### 8.5 Verbotene Tab-Systeme (Migration)

| Ist | Soll |
|-----|------|
| `sq-tab-bar` + manual active | `MasterPageTabs` |
| `bg-muted` rounded pills | `MasterPageTabs` |
| Custom `TAB_ACTIVE` constants | `MasterPageTabs` |
| Filter chips als Tabs | `MasterTableToolbar` chips |

**Ausnahme:** Architektur **Side Category Nav** — vertikale `navItemClass` Buttons, gleicher URL-Contract, kein horizontales Tablist-UI.

---

## 9. Standard States

### 9.1 Pflicht-Matrix pro View

Jede View **muss** implementieren:

| State | Komponente | Pflicht |
|-------|------------|---------|
| Loading | `SkeletonMetricGrid` / `SkeletonCard` / `SkeletonRows` / DataTable `loading` | Ja |
| Empty | `EmptyState` | Ja — wenn Liste/Section leer sein kann |
| Search Empty | `EmptyState` variant compact + „Filter zurücksetzen“ | Wenn Search/Filter |
| Error | `ErrorState` + `onRetry` | Ja — bei API-Fetch |
| Partial Error | Inline `StatusChip` warning + retry auf Section | Wenn Multi-Source |
| Permission Denied | `EmptyState` + erklärender Text | Wenn Gate (Billing) |
| Offline | `ErrorState` „Keine Verbindung“ | Phase 2 — global hook |
| Stale Data | Meta-Zeile „Stand: …“ + subtle Refresh | Ops/Analytics Pages |

### 9.2 Semantik

| State | Titel-Ton | Actions |
|-------|-----------|---------|
| Empty | Neutral, hilfreich | Primary CTA wenn Create möglich |
| Error | Kein roher API-Stacktrace | Retry + Support-Link bei wiederholtem Fehler |
| Permission | Sachlich | Link zu Kontakt / Doc |
| Stale | Informativ | Refresh Icon in Header |

**Verboten:** `catch {}` silent; Spinner-Text ohne Skeleton; leere `div` bei loading.

### 9.3 Komponenten — Reuse

| Neu | Basis |
|-----|-------|
| `MasterLoadingState` | Thin wrapper: wählt Skeleton-Typ nach `pageType` |
| `MasterEmptyState` | Alias `EmptyState` + DE defaults |
| `MasterErrorState` | Alias `ErrorState` + `onRetry` convention |
| — | Keine dritte Error-Card-Implementierung |

---

## 10. Table Shell — `MasterTableShell`

### 10.1 Struktur

```
MasterTableShell
├── MasterTableToolbar (optional)
│   ├── Search (debounced)
│   ├── Filter chips / Selects
│   ├── Active filter summary + Clear
│   └── Toolbar actions (Refresh, Export, Create)
├── DataTable | MobileCardList
└── MasterPagination (optional)
```

### 10.2 Feature-Matrix (optional pro View)

| Feature | Default List | Heavy Ops |
|---------|--------------|-----------|
| Search | ✓ | ✓ |
| Filters | ✓ | ✓ |
| Sort | Column header | ✓ |
| Pagination | API-driven | ✓ |
| Column visibility | — | Optional |
| Row actions | ✓ | ✓ |
| Bulk actions | — | Optional (Users, Orgs) |
| Empty/Loading/Error | ✓ | ✓ |
| Mobile cards | ✓ Pflicht | ✓ |

### 10.3 Mobile

- `<lg`: `DataTable` hidden → `MobileCardList` (Rental-Pattern)
- Row actions → Overflow menu auf Card
- Horizontal table scroll **nur** als Fallback mit Hint

### 10.4 Basis

- `DataTable` aus `components/patterns`
- Toolbar **neu** — aber compositional, kein Monolith
- Custom `<table>` **verboten** für neue Arbeit; Migration für Ist

---

## 11. Responsive Rules

### 11.1 Breakpoints (SynqDrive Standard)

| Name | Range | Master-Priorität |
|------|-------|------------------|
| Mobile S | 320–375 | Touch first |
| Mobile L | 376–639 | Touch first |
| Tablet | 640–1023 | Hybrid |
| Notebook | 1024–1279 | Desktop compact |
| Desktop | 1280–1535 | Full layout |
| Wide | ≥1536 | `wide` container sinnvoll |

### 11.2 Regeln pro Element

| Element | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| **Header** | Title stack, Actions below | Row ab `sm` | Row |
| **Actions** | Primary full-width; max 2 icons | Wrap | Inline rechts |
| **KPI Grid** | 2 col | 2–3 col | 4–5 col |
| **Cards** | 1 col | 2 col | 2–3 col |
| **Tabs** | Scroll horizontal, sticky optional | Scroll | No scroll |
| **Tables** | Cards | Cards or scroll | DataTable |
| **Forms** | 1 col | 1 col | 2 col max |
| **Drawers** | Full screen Sheet | `sm:max-w-lg` | `max-w-xl` |
| **Modals** | Full screen <480 | Centered | Centered |

### 11.3 Mobile Priorität

1. Status / kritische KPIs
2. Primary Action
3. Hauptliste oder Work Surface
4. Sekundäre Metriken
5. Historisch / Debug

**Keine** Desktop-3-Spalten als `flex-col` ohne Redesign (Support ausgenommen — eigene Mobile Sheet-Strategie).

---

## 12. Motion

### 12.1 Erlaubt

| Kontext | Motion | Token |
|---------|--------|-------|
| Page enter | Einmal `animate-fade-up` auf PageContainer | `--dur-base`, `prefers-reduced-motion: none` |
| Sidebar collapse | Width transition 200ms | `--ease-out-soft` |
| Drawer/Sheet | Slide | Radix default |
| Tab panel | Opacity crossfade optional — **kein** height animate | 150ms |
| Accordion | `height` wenn `prefers-reduced-motion` → instant | — |
| Loading | Skeleton pulse | bestehend |
| Hover | `sq-press`, MetricCard lift | subtle |

### 12.2 Verboten

- Dekorative looping animations auf Page Header
- `animate-fade-up` auf jeder Section
- Parallax, bounce, aggressive scale

---

## 13. Design Tokens

### 13.1 Neue Master-Page-Tokens (in `theme.css` — ein Block)

```css
:root {
  --master-shell-max-standard: 1400px;
  --master-shell-max-wide: 1600px;
  --master-page-stack: 1.25rem;      /* 20px */
  --master-section-gap: 1.5rem;      /* 24px */
  --master-header-tabs-gap: 0.75rem; /* 12px */
  --master-card-gap: 0.75rem;        /* 12px */
  --master-card-gap-lg: 1rem;        /* 16px */
}
```

### 13.2 Wiederverwendete bestehende Tokens

| Kategorie | Token |
|-----------|-------|
| Typography | `--text-display-lg`, `--tracking-display`, `font-display` |
| Surfaces | `surface-premium`, `surface-frosted`, `surface-elevated` |
| Status | `--status-*`, `sq-tone-*`, `StatusChip` tones |
| Radius | `--radius-md`, `--radius-lg` |
| Shadow | `--shadow-sm`, `--shadow-2` |
| Motion | `--dur-fast`, `--dur-base`, `--ease-out-soft` |
| Chrome | `CHROME_TAB_*` aus `chrome-tab-bar.ts` |
| Focus | `--ring`, `focus-visible:ring-2` |

### 13.3 Konsolidierung Magic Numbers

| Ist (verboten) | Kanonisch |
|----------------|-----------|
| `max-w-[1600px]` in View | `PageContainer variant="wide"` |
| `space-y-4/6/8` root | `--master-page-stack` / `--master-section-gap` |
| `p-8` cards | `p-5` DataCard default |
| `text-purple-500`, `from-indigo-500` | `sq-tone-*`, `Button variant="primary"` |
| `isDarkMode ? …` | CSS variables / `dark` class only |

---

## 14. Komponentenarchitektur

### 14.1 Ziel-Komponentenbaum (`frontend/src/master/shell/`)

| Komponente | Status | Basis |
|------------|--------|-------|
| `MasterAdminShell` | **Neu** | Refactor `AppShell` master variant |
| `MasterGlobalChrome` | **Refactor** | `TopBar.tsx` |
| `PageContainer` | **Neu** | Shell max-width + stack spacing |
| `MasterPageHeader` | **Neu** | extends `PageHeader` |
| `MasterPageActions` | **Neu** | composes `Button`, `DropdownMenu` |
| `MasterPageTabs` | **Neu** | `chrome-tab-bar.ts` + URL hook |
| `MasterPageSection` | **Neu** | extends `SectionHeader` + surface wrapper |
| `MasterTableShell` | **Neu** | composes `DataTable` |
| `MasterTableToolbar` | **Neu** | — |
| `MasterPagination` | **Neu** | extract from Activity/Support patterns |
| `MasterLoadingState` | **Neu** | thin wrapper over `Skeleton*` |
| `MasterEmptyState` | **Alias** | `EmptyState` |
| `MasterErrorState` | **Alias** | `ErrorState` |
| `useMasterPageUrl` | **Neu** | generic tab/param read/write |

### 14.2 Beibehalten unverändert (Reuse)

| Komponente | Rolle |
|------------|-------|
| `Sidebar` | Navigation (UI-1.4) |
| `MasterAccountSheet` | Account overlay |
| `MetricCard`, `DataCard`, `DataTable` | Content primitives |
| `DetailDrawer`, `AppDialog`, `ConfirmDialog` | Overlays |
| `StatusChip`, `PriorityBadge` | Status display |
| `MasterMfaGate` | Security gate — rendert **innerhalb** Main oder ersetzt Main |

### 14.3 Entfernen / Deprecate

| Komponente | Aktion |
|------------|--------|
| `RightSidebar` (global) | Remove global mount → Dashboard widgets |
| View-local `CARD`, `cardClass` | Remove on migration |
| `isDarkMode` prop on Views | Remove |
| `SystemMonitoringView` embedded in Settings | Redirect only — single Platform Health |
| Unused `TAB_BAR` constants | Remove |

---

## 15. Accessibility

| Anforderung | Umsetzung |
|-------------|-----------|
| Landmark | `<main id="master-main" aria-label="Master Admin">` |
| Skip link | Optional Phase 2: „Zum Inhalt springen“ |
| Heading hierarchy | §6.3 |
| Tabs | §8.4 |
| Focus | `focus-visible` auf allen interaktiven Elementen |
| Dialogs | Radix focus trap + Escape |
| Live regions | Ops refresh: `aria-live="polite"` auf meta |
| Touch | Min 44px mobile actions; 36px desktop |
| Reduced motion | `prefers-reduced-motion` — keine fade-up |
| Language | `lang="de"` auf Shell; i18n-ready keys |

---

## 16. Migration Matrix

| Current Pattern | Canonical Pattern | Action |
|-----------------|-------------------|--------|
| `AppShell` + loose children | `MasterAdminShell` | **Refactor** |
| `TopBar` decorative search/bell/avatar | `MasterGlobalChrome` minimal | **Refactor** |
| No `<main>` landmark | `PageContainer` inside `<main>` | **Refactor** |
| Per-view `max-w-[1600px]` | `PageContainer variant="wide"` | **Refactor** |
| Per-view `max-w-[1400px] p-6` | `PageContainer variant="standard"` | **Refactor** |
| Per-view `space-y-4/6/8` | `--master-page-stack` / `--master-section-gap` | **Refactor** |
| `PageHeader` direct | `MasterPageHeader` | **Refactor** (thin wrap) |
| Custom `h1` + subtitle (Settings, Changes, Logbook) | `MasterPageHeader` | **Refactor** |
| Back button in `actions` right (Org Detail) | `MasterPageHeader` leading Back | **Refactor** |
| `sq-tab-bar` pills (Vehicles, Parts, Insurance, HM) | `MasterPageTabs` | **Refactor** |
| `bg-muted` pill tabs (Settings, Org Detail, Logbook) | `MasterPageTabs` | **Refactor** |
| `MasterBillingSectionTabBar` | `MasterPageTabs level="primary"` | **Reuse** (rename/align) |
| `MasterBillingSubTabBar` | `MasterPageTabs level="secondary"` | **Reuse** |
| Voice `SectionTabBar` | `MasterPageTabs` | **Refactor** |
| Architektur side nav | `MasterPageTabs` vertical variant **or** keep `navItemClass` + URL hook | **Reuse** + URL |
| Custom `<table>` (Parts, Insurance, Org, Prospects, HM) | `MasterTableShell` + `DataTable` | **Refactor** |
| `DataTable` direct without toolbar | `MasterTableShell` | **Refactor** |
| Custom KPI tiles (Org Detail, Fleet) | `MetricCard` grid | **Refactor** |
| Legacy `cardClass` / `isDarkMode` cards | `DataCard` | **Refactor** |
| `Loader2` spinner-only loading | `Skeleton*` / `MasterLoadingState` | **Refactor** |
| Silent `catch {}` (Logbook) | `MasterErrorState` | **Refactor** |
| `EmptyState` imported unused | Wire or remove import | **Remove** dead |
| `RightSidebar` all views | Dashboard sections only | **Remove** global |
| `RightSidebar` API duplicate | Single dashboard data hook | **Refactor** |
| Nested scroll Dashboard cards | Section link „Alle anzeigen“ | **Refactor** |
| Nested scroll HM view root | Single main scroll | **Refactor** |
| `SupportView` sop.shell viewport lock | `PageContainer full` + registered exception | **Reuse** pattern |
| `PlatformSettingsView` + embedded Monitoring | Settings tabs without monitoring; link to Health | **Refactor** |
| Gradient Save button | `Button variant="primary"` | **Remove** |
| `isDarkMode` prop threading | ThemeContext only | **Remove** |
| Activity Log custom list | `MasterTableShell` or keep timeline **if** not tabular — document as Analytics exception | **Reuse** list |
| `ChangesView` FALLBACK in file | Extract + `MasterPageSection` timeline | **Refactor** (later) |

### 16.1 Migrations-Reihenfolge (empfohlen)

| Phase | Scope |
|-------|-------|
| **UI-2.3** | `MasterAdminShell`, `PageContainer`, `<main>`, RightSidebar removal, tokens |
| **UI-2.4** | `MasterPageHeader`, `MasterPageActions`, `MasterGlobalChrome` cleanup |
| **UI-2.5** | `MasterPageTabs` + URL params (Org, Vehicles, Parts, …) |
| **UI-2.6** | `MasterTableShell`, `MasterPageSection`, States |
| **UI-2.7** | Legacy view migration (Settings, Logbook, Changes) |
| **UI-2.8** | Per-page visual polish (out of scope for framework) |

---

## 17. Akzeptanzkriterien (Framework-Phase)

Die Page-Framework-Phase gilt als abgeschlossen, wenn:

1. **100%** der Master Views in `MasterAdminShell` → `PageContainer` → `MasterPageHeader` gerendert werden
2. **Kein** View-set `max-w-*`, `space-y-*` root außerhalb Tokens
3. **Ein** Tab-System (`MasterPageTabs`) — keine `sq-tab-bar` in Master Views
4. **Ein** Table-Pfad für tabellarische Daten (`MasterTableShell`)
5. Jede View hat **Loading + Empty + Error** States
6. `<main>` Landmark vorhanden; Tab-ARIA auf allen L1/L2 Navs
7. RightSidebar nicht global gemountet
8. URL-Tab-Params für alle Views mit Subnav dokumentiert und implementiert

---

## Anhang A — URL-Parameter Gesamtvertrag

Erweitert Navigation Blueprint §3:

| Param | Views | Beispiel |
|-------|-------|----------|
| `view` | Alle | `?view=dashboard` |
| `orgId` | Organizations, Billing | `&orgId=uuid` |
| `settingsTab` | Settings | `&settingsTab=email` |
| `masterBilling` | Billing L1 | `&masterBilling=pricing` |
| `masterBillingTab` | Billing L2 | `&masterBillingTab=stripe` |
| `voiceSection` | Voice | `&voiceSection=provisioning` |
| `hmTab` | High Mobility | `&hmTab=eligibility` |
| `archCategory` | Architektur | `&archCategory=health` |
| `orgTab` | Org Detail | `&orgTab=users` |
| `vehicleTab` | Vehicles | `&vehicleTab=registered` |
| `partsTab` | Parts | `&partsTab=catalog` |
| `insuranceTab` | Insurance | `&insuranceTab=policies` |
| `logbookTab` | Logbook | `&logbookTab=signals` |
| `supportQueue` | Support | `&supportQueue=all_open` |

---

## Anhang B — Referenz-Implementierungen (Ist → Ziel)

| View | Als Referenz für |
|------|------------------|
| **Billing Control Center** | `MasterPageTabs` L1/L2, URL sync, wide container, States |
| **Voice Assistant Admin** | `MasterPageTabs`, `DataTable`, `ErrorState` |
| **Master Dashboard** | Overview template, MetricCard — nach RightSidebar merge |
| **Support View** | Operational `full` container, Mobile Sheet |
| **Activity Log** | Analytics, Meta in Header, Pagination |

---

*Spezifikation UI-2.2 — keine Implementierung. Changes und Architektur werden erst in der Implementierungsphase aktualisiert.*
