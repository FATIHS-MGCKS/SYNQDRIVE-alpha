# Master Admin — Sidebar & Global Navigation Audit

**Datum:** 2026-08-18  
**Phase:** UI-1.2 (read-only)  
**Scope:** Desktop Sidebar, Mobile Navigation, globale Navigations-Chrome (TopBar-Anbindung), Berechtigungen  
**Referenz-IA:** `docs/ui/master-admin-information-architecture-audit.md`  
**Primärquellen:** `frontend/src/master/components/Sidebar.tsx`, `TopBar.tsx`, `RightSidebar.tsx`, `frontend/src/components/shell/*`, `frontend/src/rental/components/Sidebar.tsx` (Vergleichsbaseline)

---

## 1. Current State

### 1.1 Architekturüberblick

Die Master-Admin-Navigation ist eine **monolithische React-Komponente** (`Sidebar.tsx`, ~330 Zeilen) ohne separates Navigations-Config-Objekt. View-Switching erfolgt per Callback `onViewChange` — nicht per Router.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MOBILE (lg:hidden)                                                       │
│  Fixed Top Bar (h-14) → Hamburger + Logo + Spacer                        │
│  Dropdown Panel (max-h calc) → identischer NavContent wie Desktop        │
│  Backdrop overlay-scrim (top: 3.5rem)                                    │
├──────────────┬───────────────────────────────────────┬───────────────────┤
│ DESKTOP      │ MAIN (TopBar + Views)                 │ RIGHT PANEL       │
│ w-[260px]    │ max-w 1400px                          │ w-[300px] lg+     │
│ fixed h-screen│ pt-16 mobile / pt-0 desktop          │ Platform Status   │
│ scroll nav   │                                       │ Stats, Activity   │
│ NO collapse  │                                       │ Tickets           │
│ NO footer    │                                       │                   │
└──────────────┴───────────────────────────────────────┴───────────────────┘
```

### 1.2 Abweichung von der Rental-Sidebar (Design-System-Baseline)

Die Rental-App nutzt dieselben Shell-Primitives (`navItemClass`, `navSectionHeaderClass`, `CollapsedNavTooltip`, `sq-sidebar-footer`), implementiert aber **deutlich mehr Production-Features**:

| Feature | Rental Sidebar | Master Sidebar |
|---------|----------------|----------------|
| Collapsed Rail (52px) | ✓ | ✗ |
| Collapse-Toggle Footer | ✓ | ✗ |
| Icon-Tooltips (collapsed) | ✓ | ✗ (kein collapsed mode) |
| Auto-Expand aktive Sektion | ✓ (`useEffect` auf `currentSection`) | ✗ |
| Section `isActive` Highlight | ✓ | ✗ (immer `false`) |
| Permission-gated Items | ✓ (`hasPermission`) | ✗ (nur Page-Level Gates) |
| Support Unread Badge | ✓ | ✗ |
| `aria-label` auf Controls | Teilweise | ✗ |
| Resize → Mobile schließen | ✓ | ✗ |
| `type="button"` | Teilweise | ✗ |
| i18n Labels | ✓ | Hardcoded EN/DE Mix |

**Fazit:** Master Admin nutzt das Design-System **oberflächlich** (Tokens/Klassen), nicht **funktional** auf Rental-Niveau.

### 1.3 Globale Navigation außerhalb der Sidebar

| Element | Ort | Verdrahtet |
|---------|-----|------------|
| Willkommen-Label | TopBar links | ✓ Anzeige |
| Globale Suche + ⌘K | TopBar Mitte | ✗ Dekorativ |
| Operator Entry | TopBar | ✓ (wenn `canAccessOperatorApp`) |
| Theme Toggle | TopBar | ✓ |
| Settings Icon | TopBar | ✗ Kein `onClick` |
| Sprache (DE/EN/…) | TopBar | ✗ Nur UI-State |
| Notifications | TopBar | ✗ Dekorativer Dot |
| Logout | TopBar | ✓ |
| User-Avatar | TopBar | ✗ Kein Menü |
| Platform Status | Right Panel | ✓ (nicht in Sidebar) |
| Quick Stats / Activity / Tickets | Right Panel | Teilweise (Support Link) |

**Account/Profil:** Vollständig in der TopBar — **nicht** in Sidebar oder Mobile-Drawer. Kein MFA/Profil-Zugang in der Navigation.

---

## 2. Navigation Inventory

### 2.1 Vollständiges Inventar (Sidebar)

| # | Gruppe | Item | View-ID | Icon | Badge/Counter | Subnav in Sidebar |
|---|--------|------|---------|------|---------------|-------------------|
| 1 | Overview | Dashboard | `dashboard` | LayoutDashboard | — | — |
| 2 | Management | Organizations | `organizations` | Building2 | — | — (Detail: In-Page Tabs) |
| 3 | Management | Users | `users` | Users | — | — |
| 4 | Management | Vehicles | `vehicles` | Car | — | — (In-Page: Registered/DIMO/HM) |
| 5 | Management | Prospects | `prospects` | Target | — | — |
| 6 | Operations ▼ | Activity Log | `activity-log` | Activity | — | — |
| 7 | Operations ▼ | Platform Health | `platform-health` | Gauge | — | — |
| 8 | Operations ▼ | Abrechnung | `billing` | CreditCard | — | — (In-Page: 6 Sections) |
| 9 | Operations ▼ | Support Center | `support` | Headphones | — | — (In-Page: Queue/Inbox) |
| 10 | Integrations ▼ | Fleet Connection | `fleet-connection` | Radio | — | — |
| 11 | Integrations ▼ | Parts & Accessories | `parts-accessories` | Package | — | In-Page Tabs |
| 12 | Integrations ▼ | Insurances | `insurances` | Shield | — | In-Page Tabs |
| 13 | Integrations ▼ | Voice Assistant | `voice-assistant` | Phone | — | In-Page Sections (URL) |
| 14 | Integrations ▼ | High Mobility | `high-mobility` | Radio | — | In-Page Tabs |
| 15 | Integrations ▼ | HM Compatibility Check | `hm-compatibility` | ShieldCheck | — | — |
| 16 | Configuration ▼ | General | `settings` + tab `general` | Settings | — | Settings In-Page Tabs |
| 17 | Configuration ▼ | E-Mail | `settings` + tab `email` | Mail | — | — |
| 18 | Configuration ▼ | Integrations | `settings` + tab `integrations` | Globe | — | — |
| 19 | Configuration ▼ | Monitoring | `settings` + tab `monitoring` | BarChart3 | — | embeds SystemMonitoringView |
| 20 | SynqDrive Code ▼ | Architektur | `architektur` | Code2 | — | In-Page 9 Kategorien |
| 21 | SynqDrive Code ▼ | Changes | `changes` | FileText | — | — |
| 22 | SynqDrive Code ▼ | Health Tracking | `health-tracking` | Activity | — | In-Page Sections |
| 23 | SynqDrive Code ▼ | Trip Detection Logic | `trip-detection-logic` | MapPin | — | — |
| 24 | SynqDrive Code ▼ | Performance Logic | `performance-logic` | Gauge | — | — |
| 25 | SynqDrive Code ▼ | Vehicle Logbook | `vehicle-logbook` | BookOpen | — | — |
| — | Quick Actions | New Org | → `organizations` | Plus | brand tone | — |
| — | Quick Actions | Invite User | → `users` | UserPlus | success tone | — |
| — | Quick Actions | Support | → `support` | Headphones | neutral | — |
| — | Quick Actions | Activity | → `activity-log` | Activity | neutral | — |

**Gesamt:** 25 Nav-Items + 4 Quick Actions in 7 logischen Blöcken.

### 2.2 Collapsible Groups — Default-State

```ts
const [expanded, setExpanded] = useState<Record<string, boolean>>({});
// → operations, integrations, configuration, synqdrive-code: alle false
```

| Gruppe | Items versteckt bei Default | Anteil der Gesamt-Nav |
|--------|----------------------------|------------------------|
| Operations | 4 | 16% |
| Integrations | 6 | 24% |
| Configuration | 4 | 16% |
| SynqDrive Code | 6 | 24% |
| **Summe versteckt** | **20 von 25** | **80%** |

### 2.3 Subnavigation — wo sie lebt

Die Sidebar hat **keine echte Subnavigation** (kein `subNavItemClass`). Sub-IA existiert ausschließlich **in den Views**:

| View | Subnav-Typ | URL-persistent |
|------|------------|----------------|
| Organizations (Detail) | Tab Bar | ✗ |
| Vehicles | Tab Bar | ✗ |
| Billing | Section + Sub-Tab Bars | ✓ |
| Voice Assistant | Section Rail | ✓ |
| Platform Settings | Tab Bar | ✗ |
| Parts / Insurances / HM | Tab Bars | ✗ |
| Architektur | Left Category Nav | ✗ |
| Support | Queue + Inbox | ✗ |

### 2.4 Interaktionszustände (Ist)

| Zustand | Implementierung | Bewertung |
|---------|-----------------|-----------|
| **Active (Item)** | `navItemClass(true)` → brand-soft bg, ring, shadow, `.active` rail | ✓ Gut sichtbar |
| **Active (Section Header)** | `navSectionHeaderClass(isOpen, false)` — **isActive nie true** | ✗ Kein Parent-Highlight |
| **Active (collapsed group child)** | Item aktiv, Gruppe zu → **unsichtbar in Sidebar** | ✗ Kritisch |
| **Hover** | `hover:bg-accent`, `hover:translate-x-[1px]` | ✓ Subtil, konsistent |
| **Focus** | Kein `focus-visible` in `navItemClass` | ✗ Tastatur schwer erkennbar |
| **Pressed** | Quick Actions: `active:scale-[0.97]` | ✓ |
| **Collapsed Sidebar** | Nicht implementiert | ✗ |
| **Tooltips** | `CollapsedNavTooltip` existiert, Master nutzt es nicht | ✗ |
| **Badges** | `NavComingSoonBadge` existiert, Master nutzt es nicht | — |
| **Counter** | Keine in Master Sidebar | ✗ (Support-Tickets nur Right Panel) |
| **Statusindikatoren** | „Master Admin“ Chip (`sq-chip-critical`) im Logo-Bereich | ✓ Rolle sichtbar |

---

## 3. IA-Abweichungen (Sidebar vs. kanonischer IA-Bericht)

Referenz: `master-admin-information-architecture-audit.md`

| IA-Befund (kanonisch) | Widerspiegelt Sidebar? | Abweichung |
|----------------------|------------------------|------------|
| Overview → Management → Operations → Integrations → Configuration | ✓ Strukturell ja | 80% Items in collapsed Groups |
| Billing als Operations-Item | ✓ | Label DE „Abrechnung“ in EN-Nav; kein Permission-Hide |
| Monitoring split (Health vs. Settings) | ✗ | Zwei Einstiege, keiner prominent |
| Telematik fragmentiert | ✗ | 3 Sidebar-Items + Vehicles-Tabs |
| SynqDrive Code am Ende | ✓ | Korrekt, aber 6 Top-Level-Items für Doku |
| Quick Actions | ✓ Vorhanden | Verhalten weicht ab (kein Create) |
| Redundanz Activity/Support | ✓ | Quick Actions duplizieren Sidebar |
| URL/View Desync | N/A Sidebar | Sidebar schreibt keine URL |
| Globale Suche tot | N/A | TopBar, nicht Sidebar |

### 3.1 Falsch gruppierte / fehlplatzierte Seiten

| Seite | Aktuelle Gruppe | Problem |
|-------|-------------------|---------|
| **HM Compatibility Check** | Integrations (eigenständig) | Gehört unter High Mobility (In-Page existiert bereits) |
| **Vehicle Logbook** | SynqDrive Code | Operatives Fleet-Tool, nicht Entwickler-Doku |
| **Health Tracking** | SynqDrive Code | Semantische Kollision mit „Platform Health“ |
| **Monitoring (Workers)** | Configuration | Jobs/Queues/Worker fehlen als Control-Plane-Konzept in Nav |
| **Prospects** | Management | Akzeptabel, aber prominent für Pre-Revenue-Pipeline |

### 3.2 Doppelte / redundante Navigationseinträge

| Redundanz | Wege |
|-----------|------|
| Support | Sidebar Operations, Quick Action, Right Panel „View All“, Dashboard Widget |
| Activity | Sidebar Operations, Quick Action, Right Panel Live Activity, Dashboard |
| Support + Activity Quick Actions | Spiegeln Sidebar Operations (2 von 4 Quick Actions) |
| Fleet / HM / Connectivity | Fleet Connection, High Mobility, HM Compatibility, Vehicles Tabs |
| Integrations (Begriff) | Sidebar-Gruppe + Configuration → Integrations Tab |
| Settings | Configuration-Sidebar (4 Items) = Settings-View-Tabs (1:1) — **doppelte Ebene** |

### 3.3 Unklare / technische Labels

| Label | Problem |
|-------|---------|
| **HM Compatibility Check** | Technisch, lang; HM-Abkürzung unklar für Ops |
| **SynqDrive Code** | Interner Dev-Begriff in Produktions-Control-Plane |
| **Trip Detection Logic / Performance Logic** | Implementierungs-Sprache, nicht Ops-Sprache |
| **Fleet Connection** | Unklar vs. „Connected Vehicles“ / DIMO / HM |
| **Abrechnung** | DE in EN-Sidebar; Page heißt „Master-Abrechnung“ |
| **Monitoring** (Sidebar) vs. **API & Worker Monitoring** (Settings Tab) | Label-Mismatch |

### 3.4 Versteckte wichtige Funktionen

| Funktion | Warum versteckt |
|----------|-----------------|
| Billing | Operations collapsed; kein Billing ohne `master-billing` Permission auf Page-Ebene, aber Nav immer sichtbar |
| Platform Health / Monitoring | Operations bzw. Configuration collapsed |
| Worker/Queue-Ops | Nur unter Settings → Monitoring, kein Sidebar-Kernbegriff |
| Audit (Billing/Voice) | Nur In-Page Sub-Sections |
| System Status | Right Panel, nicht Sidebar — auf schmalen Screens ohne Right Panel unsichtbar |
| Create Org / Invite User | Quick Actions suggerieren Aktion, liefern nur View-Wechsel |

### 3.5 Zu prominent / unwichtig für Control Plane

| Item | Problem |
|------|---------|
| **SynqDrive Code** (6 Items) | 24% der Nav bei Default-Expand; konkurriert mit Ops |
| **Prospects** | Gleiche Ebene wie Organizations — ok für GTM, aber nicht für alle Master-Admins prioritär |
| **Quick Actions Grid** | Fester Footer-Platz (~80px) für teils redundante Links |

---

## 4. Master-Admin Control-Plane — Kernbereichs-Mapping

Prüfung gegen bestehende SynqDrive-Struktur (nicht vorgegebene Namen):

| Control-Plane-Kernbedarf | SynqDrive-Zugang | Sidebar-Sichtbarkeit | Bewertung |
|--------------------------|------------------|----------------------|-----------|
| Plattformübersicht | Dashboard | ✓ Immer sichtbar | ✓ |
| Organisationen | Organizations (+ Detail) | ✓ Immer sichtbar | ✓ |
| Abonnements & Billing | Abrechnung | ⚠ Operations, collapsed | ⚠ |
| Fahrzeuge / Connected Vehicles | Vehicles (+ DIMO/HM Tabs) | ✓ Immer sichtbar | ✓ (Connectivity fragmentiert) |
| Integrationen | Integrations-Gruppe (6 Items) | ⚠ Collapsed | ⚠ |
| Plattformbetrieb | Activity Log, Support, Platform Health | ⚠ Collapsed | ⚠ |
| Monitoring | Platform Health + Settings/Monitoring | ⚠ Beide hidden / split | ✗ |
| Jobs / Queues / Worker | SystemMonitoringView only | ✗ Kein dedizierter Nav-Punkt | ✗ |
| Audit & Security | Activity Log; Billing/Voice Audit Sub-Sections | ⚠ Kein Top-Level „Audit“ | ⚠ |
| Systemkonfiguration | Configuration-Gruppe | ⚠ Collapsed | ⚠ |

**Ergebnis:** Ein Master Admin erreicht **5 von 10 Kernbereichen ohne Expand-Klick** (Dashboard, Orgs, Users, Vehicles, Prospects). Für Production-Ops (Billing, Health, Integrations, Monitoring) ist **mindestens ein manueller Expand nötig** — und der aktive Bereich bleibt nach Navigation **nicht automatisch in der Sidebar sichtbar**.

---

## 5. UX-Probleme

### 5.1 Scanbarkeit & visuelle Hierarchie

| Aspekt | Ist | Problem |
|--------|-----|---------|
| Gruppentitel | `sq-section-label` 10px uppercase | ✓ Konsistent |
| Item-Dichte | `py-[8px]`, 12px semibold | ✓ Angemessen |
| Collapsible vs. Static | 2 static + 4 collapsible | Ungleichgewicht — Auge stoppt bei Management |
| Rail-Indikator | `sq-nav-rail::before` 2px brand bar | ✓ Gut |
| Separator | Ein `h-px` vor Quick Actions | Keine Separatoren zwischen Hauptgruppen |
| Informationsdichte | 25 Items + 4 QA in 260px | Hoch bei expand; leer bei collapse |
| Wiedererkennung | Icon-Kollisionen (Radio×2, Activity×3, Gauge×2) | Verwechslungsgefahr |

### 5.2 Orientierung

- **Kein Breadcrumb** in Sidebar oder TopBar
- **Kein „You are here“** auf Section-Ebene wenn Group collapsed
- **Settings-Tabs** in Sidebar als vier gleichwertige Items — Nutzer sieht nicht, dass es eine Settings-Page ist
- **Org-Detail** hat keinen Sidebar-Bezug (Organizations bleibt active ✓)

### 5.3 Klickflächen & Abstände

| Element | Größe | WCAG 2.5.5 (44×44) |
|---------|-------|---------------------|
| Nav Item | ~full width × ~32px (py-8 + text) | ⚠ Unter 44px Höhe |
| Section Header | py-1.5 (~28px) | ✗ |
| Quick Action | h-[30px] | ✗ |
| Mobile Hamburger | p-2 + icon 20px → ~36px | ⚠ |
| Collapsed (Rental) | 32×32 | ⚠ — Master hat es nicht |

### 5.4 Scroll & Sticky

| Bereich | Verhalten |
|---------|-----------|
| Desktop Nav | `flex-1 overflow-y-auto` — Logo sticky oben ✓ |
| Quick Actions | Am Ende des scrollbaren Bereichs — **nicht sticky** → bei langem expand scrollen User weg |
| Mobile Panel | `max-h calc(100vh - 3.5rem)` scroll ✓ |
| Logo/Brand | `border-b`, fixed im Sidebar-Header ✓ |

### 5.5 Collapse-Verhalten (Section-Level)

- Toggle per `expanded` Record — **kein Persist** (Session/LocalStorage)
- **Kein Auto-Open** bei View-Wechsel (Rental macht das seit V4.7.31)
- Chevron `rotate-90` bei open — ✓ affordance ok
- Section Header `isActive` hardcoded `false` — verpasste Orientierung

---

## 6. Desktop-Probleme

| Thema | Detail |
|-------|--------|
| **Breite** | Fix `w-[260px]` — kein Collapse auf 52px (Rental-Standard) |
| **Visuelles Gewicht** | 260px Sidebar + 300px Right Panel = **560px Chrome** bei 1400px Content-Max → ~29% Bildschirm auf 1920px |
| **Content-Verhältnis** | Sidebar dominiert nicht einzeln, aber **Gesamt-Chrome** schon |
| **Fixed/Sticky** | `h-screen flex-col` — Sidebar fixed height ✓ |
| **Collapsed Width** | **Nicht vorhanden** — `navItemClass(_, true)` und `CollapsedNavTooltip` ungenutzt |
| **Logo/Brand** | Logo h-7 + „Master Admin“ critical chip — klar, aber chip könnte Alarm assoziieren |
| **Footer/Account** | **Fehlt komplett** — Rental hat `sq-sidebar-footer` mit Collapse-Toggle |
| **Keyboard** | Kein Fokus-Trap, keine Pfeiltasten-Navigation zwischen Items |

---

## 7. Mobile-Probleme

| Thema | Master | Rental (Baseline) | Problem |
|-------|--------|-------------------|---------|
| Header-Höhe | h-14 (3.5rem) | h-16 (4rem) | Inkonsistent zwischen Apps |
| Öffnung | Hamburger toggle | Gleich | ✓ |
| Overlay | `overlay-scrim`, top offset | Gleich | ✓ |
| Animation | `max-h` + opacity 300ms | Gleich | ✓ |
| Content-Push | `pt-16` auf Main | Ähnlich | ✓ |
| Safe Areas | Keine `env(safe-area-inset-*)` | Keine explizit | ⚠ iOS Notch |
| Schließen bei Resize | ✗ | ✓ | Mobile kann offen bleiben |
| Escape-Taste | ✗ | ✗ | Beide schwach |
| Aktiver Punkt bei collapsed Group | Unsichtbar | Rental auto-expands | ✗ |
| Subnavigation | Voller Desktop-Tree im Drawer | Gleich | **Kein mobiles IA-Redesign** |
| Account-Bereich | ✗ im Drawer | ✗ im Drawer | Logout nur TopBar — auf Mobile schwerer erreichbar? |
| Backdrop-Klick | ✓ schließt | ✓ | ✓ |

**Urteil:** Mobile ist eine **herunterklappbare Desktop-Sidebar**, kein eigenes Master-Admin-Mobile-Nav-Pattern (keine priorisierten Ops-Shortcuts, keine Bottom-Nav, keine gruppierte Sheet-Navigation).

---

## 8. Accessibility-Probleme

| Kriterium | Status | Detail |
|-----------|--------|--------|
| **Landmarks** | ✗ | Kein `<nav aria-label="Master Admin">` |
| **aria-current** | ✗ | Active state nur visuell |
| **aria-expanded** | ✗ | Collapsible sections ohne ARIA |
| **aria-controls** | ✗ | Section headers nicht mit Panel verknüpft |
| **Focus visible** | ✗ | Kein `focus-visible:ring` in nav classes |
| **Button type** | ✗ | Alle `<button>` ohne `type="button"` |
| **Keyboard: Collapse** | ✗ | Enter/Space auf Header ok (native button), aber kein Arrow-Key-Nav |
| **Keyboard: Mobile** | ✗ | Kein Fokus-Management beim Öffnen |
| **Screen Reader: Groups** | ✗ | Section labels sind `<div>`, nicht `<h2>`/`<legend>` |
| **Color contrast** | ✓ | Tokens `muted-foreground` / `brand-ink` — Design-System |
| **Motion** | ✓ | `prefers-reduced-motion` in theme.css für einige Animationen |
| **Tooltips** | ✗ | `CollapsedNavTooltip` nur hover — nicht keyboard-accessible |

**Schweregrad:** Für eine **Master Admin Control Plane** mit Sicherheits- und Billing-Relevanz ist die Sidebar **nicht WCAG-production-ready**.

---

## 9. Design-System-Inkonsistenzen

### 9.1 Genutzte Tokens/Patterns ✓

- `bg-sidebar`, `border-sidebar-border`
- `navItemClass`, `navSectionHeaderClass`, `navSectionLabelClass`
- `sq-nav-rail` active rail (::before)
- `sq-chip`, `sq-tone-brand/success/neutral` (Quick Actions)
- `overlay-scrim` (Mobile Backdrop)
- Lucide Icons 14px

### 9.2 Nicht genutzte / parallele Patterns ✗

| Pattern | Wo definiert | Master Gap |
|---------|--------------|------------|
| `subNavItemClass` | nav-utils.ts | Settings-Items sollten Subnav sein, sind aber Top-Level in Configuration |
| `CollapsedNavTooltip` | nav-primitives.tsx | Kein collapsed mode |
| `NavComingSoonBadge` | nav-primitives.tsx | Nicht verwendet |
| `sq-sidebar-footer` | theme.css | Fehlt |
| `sq-3d-btn` Quick Actions | Rental collapsed footer | Master nutzt eigene QuickAction-Komponente |
| Rental `sectionForView` auto-expand | rental/Sidebar.tsx | Fehlt |
| i18n | rental LanguageContext | Hardcoded strings |

### 9.3 Inkonsistenzen innerhalb Master

- **TopBar Settings** vs. **Configuration → General** — gleiche Intention, nur einer funktioniert
- **PlatformSettingsView** Tabs nutzen teils `isDarkMode`-Ternaries statt reiner Tokens (Legacy)
- **Quick Actions** `text-[11px]` vs. Nav `12px` — leichte Typo-Abweichung
- **Master Admin Chip** `sq-chip-critical` — „critical“ Semantik für Rolle, nicht für Status

---

## 10. Berechtigungsabhängigkeit

| Gate | Ebene | Sidebar-Verhalten |
|------|-------|-------------------|
| `platformRole === 'MASTER_ADMIN'` | App Route (`App.tsx`) | Gesamte App — Nav immer voll |
| `hasMasterBillingAccess()` | `BillingControlCenter` Page | **Abrechnung immer in Sidebar** → Page zeigt „Kein Zugriff“ |
| `isMasterAdmin()` | `VoiceAssistantAdminView` | **Voice immer in Sidebar** → Page blockiert |
| `MasterMfaGate` | Content wrapper | Nav sichtbar, Content ggf. MFA-Enrollment |
| `canAccessOperatorApp()` | TopBar Operator Button | Nicht Sidebar |

**Problem:** Navigation suggeriert Zugang zu Bereichen, die auf Page-Level verweigert werden — **kein Permission-aware Nav** (Rental-Vorbild: `hasPermission` filtert Items).

---

## 11. Konkrete Empfehlungen

### Struktur & IA

1. **Auto-Expand** der Parent-Group bei aktivem Child (Rental-Pattern portieren).
2. **Section `isActive`** wenn ein Child aktiv ist (`navSectionHeaderClass(isOpen, hasActiveChild)`).
3. **HM Compatibility** als Sub-Item/Tab unter High Mobility entfernen aus Top-Level.
4. **Vehicle Logbook** nach Management oder Operations verschieben.
5. **SynqDrive Code** auf 1–2 Sidebar-Items reduzieren (Architektur Hub + Changes); Rest In-Page.
6. **Configuration** vereinfachen: ein „Settings“-Item → In-Page Tabs (wie Rental Administration).
7. **Monitoring kanonisieren**: ein Sidebar-Eintrag „Platform Operations“ oder Health als Hub mit Links zu Workers.
8. **Permission-aware Nav**: Billing/Voice nur zeigen wenn berechtigt, oder mit Lock-Badge.

### Desktop UX

9. **Collapsed Rail** (52px) mit `isCollapsed` State + Footer-Toggle — Rental-Parität.
10. **Sticky Quick Actions** oder in TopBar/Global Command verschieben.
11. **Support Ticket Counter** auf Sidebar-Item (Rental-Pattern).
12. **Min. Touch Target 44px** auf Mobile / optional Desktop.

### Mobile UX

13. **Eigenes Mobile-IA**: priorisierte Ops-Liste (Dashboard, Orgs, Support, Health) + „More“ Sheet für Rest.
14. **Resize-Handler** zum Schließen (Rental hat es).
15. **Account/Logout** im Mobile-Drawer Footer.
16. **Safe-Area-Padding** für Header/Drawer.

### Accessibility

17. `<nav aria-label="Master administration">` pro `<nav>`-Block.
18. `aria-current="page"` auf active items.
19. `aria-expanded` + `aria-controls` auf collapsible headers.
20. `focus-visible:ring-2 ring-ring` in `navItemClass`.
21. `type="button"` überall.
22. Mobile: Fokus auf erstes Item beim Öffnen; Escape schließt.

### Global Chrome

23. TopBar Settings → `settings/general` oder entfernen.
24. Globale Suche implementieren oder entfernen (inkl. ⌘K).
25. Right Panel Platform Status → optionaler Sidebar-Footer-Link „System Status“.

---

## 12. Priorisierung

### P0 — Production Blockers

| # | Empfehlung | Begründung |
|---|------------|------------|
| P0-1 | Auto-Expand aktive Section + Section isActive | Aktiver Nav-Punkt oft unsichtbar |
| P0-2 | Default expanded für Operations + Integrations (oder persist) | 80% Nav versteckt |
| P0-3 | Permission-aware Sidebar (Billing, Voice) | Falsche Zugangsversprechen |
| P0-4 | `aria-label`, `aria-current`, `aria-expanded` Baseline | A11y Minimum für Admin Console |
| P0-5 | `focus-visible` auf alle Nav-Buttons | Tastatur-Bedienbarkeit |

### P1 — Hohe Priorität

| # | Empfehlung |
|---|------------|
| P1-1 | Collapsed Desktop Rail (52px) + Tooltips |
| P1-2 | Configuration → Single Settings Entry |
| P1-3 | HM / Connectivity Konsolidierung in Sidebar |
| P1-4 | Label-Harmonisierung (DE/EN, Monitoring) |
| P1-5 | Quick Actions: echte Create-Flows oder umbenennen zu „Go to…“ |
| P1-6 | Mobile: Resize close + Account footer |
| P1-7 | Support unread badge auf Nav item |

### P2 — Mittlere Priorität

| # | Empfehlung |
|---|------------|
| P2-1 | SynqDrive Code Items reduzieren |
| P2-2 | Icon-Deduplizierung |
| P2-3 | Sticky Quick Actions oder relocation |
| P2-4 | Safe-area mobile |
| P2-5 | TopBar/Sidebar Settings Konsolidierung |
| P2-6 | 44px min touch targets mobile |

### P3 — Nice-to-have

| # | Empfehlung |
|---|------------|
| P3-1 | Mobile-eigenes IA (Ops shortcuts + More) |
| P3-2 | Nav Config auslagern (JSON/TS registry) |
| P3-3 | Section expand persist (localStorage) |
| P3-4 | Keyboard arrow navigation |
| P3-5 | NavComingSoonBadge für Preview-Features |

---

## 13. Scores (0–100)

| Metrik | Score | Kurzbegründung |
|--------|-------|----------------|
| **Information Architecture** | **62** | Logische Gruppen laut IA-Bericht vorhanden; Sidebar verdeckt 80% der Items, fehlende Worker/Audit-Top-Level, Fragmentierung Connectivity |
| **Navigation Clarity** | **55** | DE/EN-Mix, technische Labels, Icon-Kollisionen, doppelte Settings-Pfade, tote Quick Actions |
| **Visual Hierarchy** | **64** | Gute Token-Nutzung, rail indicator, section labels; aber unbalanciert durch collapse + Quick-Action-Block |
| **Desktop UX** | **58** | Kein Collapse, kein Footer, schweres Gesamt-Chrome mit Right Panel, fehlende Orientierung bei collapsed groups |
| **Mobile UX** | **50** | Desktop-Dropdown-Pattern, kein Resize-Close, keine Safe Areas, kein Account im Drawer, kleine Touch Targets |
| **Accessibility** | **42** | Keine ARIA-Landmarks, kein focus-visible, keine keyboard mobile management — unter Admin-Console-Minimum |
| **Design Consistency** | **54** | Shared primitives genutzt, aber hinter Rental-Sidebar zurück; parallele Quick-Action-Styles; TopBar/Sidebar divergieren |

### Gesamtbild

Die Master-Admin-Sidebar ist **visuell im SynqDrive Design-System verankert**, aber **funktional und operativ nicht production-ready** im Vergleich zur Rental-Sidebar und zu Enterprise Control Planes. Das kritischste UX-Problem ist die Kombination aus **default-collapsed Groups ohne Auto-Expand**: Nutzer verlieren nach der Navigation den Sidebar-Kontext zum aktiven Bereich.

---

## 14. Anhang — Dateireferenzen

| Datei | Rolle |
|-------|-------|
| `frontend/src/master/components/Sidebar.tsx` | Master Sidebar (Desktop + Mobile) |
| `frontend/src/master/components/TopBar.tsx` | Globale Header-Aktionen |
| `frontend/src/master/components/RightSidebar.tsx` | Kontext-Panel (nicht Sidebar, aber Nav-redundant) |
| `frontend/src/master/App.tsx` | View State, Sidebar wiring |
| `frontend/src/components/shell/nav-utils.ts` | Nav CSS-Klassen |
| `frontend/src/components/shell/nav-primitives.tsx` | Tooltip, ComingSoon Badge |
| `frontend/src/components/shell/app-shell.tsx` | Layout, mobile pt-16 |
| `frontend/src/rental/components/Sidebar.tsx` | Referenz-Implementation (collapse, permissions, auto-expand) |
| `frontend/src/styles/theme.css` | sq-nav-rail, sq-sidebar-footer, sq-section-label |
| `frontend/src/lib/auth.ts` | hasMasterBillingAccess, isMasterAdmin |
| `docs/ui/master-admin-information-architecture-audit.md` | Kanonischer IA-Bericht |

---

*Phase UI-1.2 — Read-only Audit. Keine UI-Implementierung.*
