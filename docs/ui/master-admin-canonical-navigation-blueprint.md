# Master Admin — Kanonischer Navigations-Blueprint

**Datum:** 2026-08-18  
**Phase:** UI-1.3 (Spezifikation — keine Implementierung)  
**Basis:**  
- `docs/ui/master-admin-information-architecture-audit.md`  
- `docs/ui/master-admin-sidebar-navigation-audit.md`  
**Ziel:** Verbindliche Zielstruktur für Sidebar & globale Navigation **vor** Code-Änderungen

---

## 1. Leitprinzipien

Die Master-Admin-Sidebar ist die **Control Plane** der SynqDrive-Plattform — keine Feature-Liste, keine Entwickler-Doku als Primärnavigation, keine doppelten Einstiege.

| Prinzip | Regel |
|---------|-------|
| **Domänenfirst** | Gruppierung folgt Mandanten → Flotte → Commerce → Konnektivität → Betrieb → Engineering |
| **Flach halten** | Max. **2 Ebenen** in der Sidebar (Gruppe → Item). Sub-IA nur **in der View** |
| **16 statt 25** | Top-Level-Items von 25 auf **16** reduzieren (+ Footer-Control-Zone) |
| **Immer sichtbar** | Ops-kritische Gruppen default **expanded**; Engineering default **collapsed** |
| **Permission-honest** | Nav-Einträge nur zeigen, wenn Zugang besteht — kein Page-Level „Kein Zugriff“ |
| **URL-kanonisch** | Jeder Nav-Klick schreibt einen shareable URL-State (Zielvertrag, siehe §3) |
| **DE kanonisch** | Deutsche Labels in der UI; i18n-Keys englisch für `master.nav.*` |
| **Rental-Parität** | Collapsed Rail, Auto-Expand, Footer, ARIA — gleiche Shell-Capabilities wie Rental |

---

## 2. Ziel-Gruppenstruktur

```
┌─ SIDEBAR PRODUKTNAVIGATION ─────────────────────────────────────┐
│ [Logo + Master Admin]                                            │
│                                                                  │
│ ÜBERSICHT                                                        │
│   Dashboard                                                      │
│                                                                  │
│ MANDANTEN & NUTZER                                               │
│   Organisationen · Interessenten · Benutzer                        │
│                                                                  │
│ FLOTTE                                                           │
│   Fahrzeuge · Fahrzeug-Logbuch                                   │
│                                                                  │
│ ABRECHNUNG                                                       │
│   Abrechnung & Verträge                                          │
│                                                                  │
│ KONNEKTIVITÄT                                                    │
│   Fahrzeug-Konnektivität · High Mobility                         │
│                                                                  │
│ PARTNER & SERVICES                                               │
│   Ersatzteile & Zubehör · Versicherungen · Sprachassistent       │
│                                                                  │
│ PLATTFORMBETRIEB                     [default: expanded]           │
│   Plattformstatus · Support · Aktivitätsprotokoll                │
│                                                                  │
│ ENTWICKLUNG & DOKUMENTATION          [default: collapsed]        │
│   Architektur · Änderungsprotokoll                               │
│                                                                  │
├─ CONTROL-FOOTER (getrennt) ────────────────────────────────────┤
│ [● Systemstatus]  Einstellungen  [Avatar] Abmelden               │
│ [Collapse-Toggle — Desktop only]                                 │
└──────────────────────────────────────────────────────────────────┘
```

**Nicht in der Sidebar:** Quick-Action-Grid, Settings-Untertabs als Nav-Items, technische Doku-Subseiten, TopBar-Settings-Doppelung.

---

## 3. URL-Vertrag (Zielzustand)

Basis-Route bleibt `/master`. Jede Navigation **schreibt** den URL-State.

| Pattern | Beispiel | Zweck |
|---------|----------|-------|
| Top-Level View | `/master?view=dashboard` | Primär-Navigation |
| Settings (Footer) | `/master?view=settings&settingsTab=email` | Plattform-Konfiguration |
| Org-Detail | `/master?view=organizations&orgId={uuid}` | Shareable Org-Kontext |
| Billing Control Center | `/master?view=billing&masterBilling=organizations&orgId={uuid}` | Bestehende Params beibehalten |
| Voice Control Plane | `/master?view=voice-assistant&voiceSection=provisioning` | Bestehende Params beibehalten |
| Architektur-Kategorie | `/master?view=architektur&archCategory=health` | Doku-Subnav (Ziel, neu) |
| High Mobility Tab | `/master?view=high-mobility&hmTab=eligibility` | Ersetzt `hm-compatibility` View |

**Redirect-Regeln (Implementierungsphase):**

| Legacy | Redirect |
|--------|----------|
| `?view=hm-compatibility` | `?view=high-mobility&hmTab=eligibility` |
| `?view=health-tracking` | `?view=architektur&archCategory=health` |
| `?view=trip-detection-logic` | `?view=architektur&archCategory=trips` |
| `?view=performance-logic` | `?view=architektur&archCategory=performance` |
| `?view=settings&settingsTab=monitoring` | `?view=platform-health&opsTab=workers` |

---

## 4. Navigations-Registry (vollständig)

### 4.1 Gruppe: Übersicht

| Pos | DE Name | i18n Key | Icon (Lucide) | Route | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|---------------|-------|------------|-------|---------|--------|-----------|
| 1 | Dashboard | `master.nav.dashboard` | `LayoutDashboard` | `/master?view=dashboard` | `MASTER_ADMIN` | — | Item, immer sichtbar | Primär-Shortcut (Pin 1) | Icon + Tooltip |

---

### 4.2 Gruppe: Mandanten & Nutzer

| Pos | DE Name | i18n Key | Icon | Route | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|------|-------|------------|-------|---------|--------|-----------|
| 1 | Organisationen | `master.nav.organizations` | `Building2` | `/master?view=organizations` | `MASTER_ADMIN` | — | Item | Gruppe „Mandanten“ | Icon + Tooltip |
| 2 | Interessenten | `master.nav.prospects` | `Target` | `/master?view=prospects` | `MASTER_ADMIN` | — | Item | Accordion Item | Icon + Tooltip |
| 3 | Benutzer | `master.nav.users` | `Users` | `/master?view=users` | `MASTER_ADMIN` | — | Item | Accordion Item | Icon + Tooltip |

**In-Page Subnav (nicht Sidebar):** Org-Detail Tabs (Übersicht, Benutzer, Fahrzeuge, Integrationen, Abrechnung, Produkte).

---

### 4.3 Gruppe: Flotte

| Pos | DE Name | i18n Key | Icon | Route | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|------|-------|------------|-------|---------|--------|-----------|
| 1 | Fahrzeuge | `master.nav.vehicles` | `Car` | `/master?view=vehicles` | `MASTER_ADMIN` | `connectivity-warning`¹ | Item | Primär-Shortcut (Pin 5) | Icon + Tooltip |
| 2 | Fahrzeug-Logbuch | `master.nav.vehicleLogbook` | `BookOpen` | `/master?view=vehicle-logbook` | `MASTER_ADMIN` | — | Item | Accordion Item | Icon + Tooltip |

¹ Nur wenn aggregierter Konnektivitätsstatus „degraded“ (siehe §8).

**In-Page Subnav:** Fahrzeuge → Registriert | DIMO | HM Telemetrie (bestehend).

---

### 4.4 Gruppe: Abrechnung

| Pos | DE Name | i18n Key | Icon | Route | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|------|-------|------------|-------|---------|--------|-----------|
| 1 | Abrechnung & Verträge | `master.nav.billing` | `CreditCard` | `/master?view=billing` | `MASTER_ADMIN` **oder** `master-billing` | `billing-anomaly`² | Item, Gruppe ohne Collapse | Accordion „Abrechnung“ | Icon + Tooltip |

² Nur bei handlungsrelevanten Billing-Anomalien (fehlgeschlagene Zahlungen / Sync-Fehler > Schwellwert).

**In-Page Subnav:** 6 Billing-Sections + Sub-Tabs (bestehend, URL-persistent).

---

### 4.5 Gruppe: Konnektivität

| Pos | DE Name | i18n Key | Icon | Route | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|------|-------|------------|-------|---------|--------|-----------|
| 1 | Fahrzeug-Konnektivität | `master.nav.vehicleConnectivity` | `Network` | `/master?view=fleet-connection` | `MASTER_ADMIN` | `integration-outage`³ | Item | Accordion „Konnektivität“ | Icon + Tooltip |
| 2 | High Mobility | `master.nav.highMobility` | `Radio` | `/master?view=high-mobility` | `MASTER_ADMIN` | `integration-outage`³ | Item | Accordion Item | Icon + Tooltip |

³ Nur bei DIMO/HM Disconnect oder kritischer MQTT/Stream-Störung (aggregiert pro Integration).

**MERGE in View:** `hm-compatibility` → Tab „Kompatibilitätsprüfung“ unter High Mobility (`hmTab=eligibility`).

---

### 4.6 Gruppe: Partner & Services

| Pos | DE Name | i18n Key | Icon | Route | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|------|-------|------------|-------|---------|--------|-----------|
| 1 | Ersatzteile & Zubehör | `master.nav.partsAccessories` | `Package` | `/master?view=parts-accessories` | `MASTER_ADMIN` | — | Item | Accordion „Partner“ | Icon + Tooltip |
| 2 | Versicherungen | `master.nav.insurances` | `Shield` | `/master?view=insurances` | `MASTER_ADMIN` | — | Item | Accordion Item | Icon + Tooltip |
| 3 | Sprachassistent | `master.nav.voiceAssistant` | `Phone` | `/master?view=voice-assistant` | `MASTER_ADMIN` | — | Item | Accordion Item | Icon + Tooltip |

**In-Page Subnav:** Parts/Insurances Tabs; Voice 8 Sections (URL-persistent).

---

### 4.7 Gruppe: Plattformbetrieb

**Gruppenverhalten:** `defaultExpanded: true`, `collapsible: true`, Auto-Expand bei aktivem Child.

| Pos | DE Name | i18n Key | Icon | Route | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|------|-------|------------|-------|---------|--------|-----------|
| 1 | Plattformstatus | `master.nav.platformHealth` | `HeartPulse` | `/master?view=platform-health` | `MASTER_ADMIN` | `platform-critical`⁴ | Item | Primär-Shortcut (Pin 4) | Icon + Tooltip + Status-Dot |
| 2 | Support | `master.nav.support` | `Headphones` | `/master?view=support` | `MASTER_ADMIN` | `support-count`⁵ | Item | Primär-Shortcut (Pin 3) | Icon + Tooltip + Counter |
| 3 | Aktivitätsprotokoll | `master.nav.activityLog` | `History` | `/master?view=activity-log` | `MASTER_ADMIN` | — | Item | Accordion Item | Icon + Tooltip |

⁴ Nur bei `degraded` oder `critical` Platform Health (nicht bei reinem „watch“).  
⁵ Offene Support-Tickets > 0 (Zahl, max „9+“).

**MERGE in View:** `SystemMonitoringView` (Workers/Jobs/Queues) → In-Page Tab **„Worker & Jobs“** unter Plattformstatus (`opsTab=workers`). Kein separater Sidebar-Eintrag.

---

### 4.8 Gruppe: Entwicklung & Dokumentation

**Gruppenverhalten:** `defaultExpanded: false`, `collapsible: true`, nur für Plattform-Engineering.

| Pos | DE Name | i18n Key | Icon | Route | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|------|-------|------------|-------|---------|--------|-----------|
| 1 | Architektur | `master.nav.architecture` | `Code2` | `/master?view=architektur` | `MASTER_ADMIN` | — | Item | Accordion „Entwicklung“ (zugeklappt) | Icon + Tooltip |
| 2 | Änderungsprotokoll | `master.nav.changes` | `FileText` | `/master?view=changes` | `MASTER_ADMIN` | — | Item | Accordion Item | Icon + Tooltip |

**MERGE in View (Architektur In-Page):** Kategorien aus bestehender `ArchitekturView` + aufgenommene Doku-Views:

| Ehem. Sidebar-Item | Neue Architektur-Kategorie (`archCategory`) |
|--------------------|---------------------------------------------|
| `health-tracking` | `health` (Health Calculations — erweitert) |
| `trip-detection-logic` | `trips` (Trips & Routes — erweitert) |
| `performance-logic` | `performance` (neu, unter Workers/Signals) |

---

### 4.9 Control-Footer (nicht Produktnavigation)

Getrennt durch `border-t`, visuell `sq-sidebar-footer`, **kein** `sq-section-label`.

| Pos | DE Name | i18n Key | Icon | Route / Aktion | Permission | Badge | Desktop | Mobile | Collapsed |
|-----|---------|----------|------|----------------|------------|-------|---------|--------|-----------|
| 1 | Systemstatus | `master.nav.systemStatus` | `Circle` (Status-Dot) | `/master?view=platform-health` | `MASTER_ADMIN` | `platform-critical`⁴ | Link-Zeile mit Dot + Label „Betriebsbereit“/„Eingeschränkt“ | Footer-Zeile im Drawer | Nur Dot + Tooltip |
| 2 | Einstellungen | `master.nav.settings` | `Settings` | `/master?view=settings&settingsTab=general` | `MASTER_ADMIN` | — | Footer-Button | Footer-Button | Icon + Tooltip |
| 3 | Konto | `master.nav.account` | Avatar-Initialen | Öffnet Account-Sheet (Profil, MFA, Sprache) | `MASTER_ADMIN` | `mfa-required`⁶ | Avatar + Name truncated | Avatar + Name im Drawer-Footer | Avatar + Tooltip |
| 4 | Abmelden | `master.nav.logout` | `LogOut` | `clearAuth()` → `/login` | `MASTER_ADMIN` | — | Footer-Button oder im Account-Sheet | Im Account-Sheet + Footer | Icon + Tooltip |
| 5 | Sidebar einklappen | `master.nav.collapseSidebar` | `PanelLeftClose` / `PanelLeftOpen` | Toggle `isCollapsed` | — | — | Footer-Toggle (Rental-Pattern) | Ausgeblendet | — |

⁶ Nur wenn MFA-Enrollment erforderlich und nicht abgeschlossen.

**Einstellungen In-Page Tabs (nicht Sidebar):**

| Tab | `settingsTab` | DE Label | i18n Key |
|-----|---------------|----------|----------|
| Allgemein | `general` | Allgemein | `master.settings.general` |
| E-Mail | `email` | E-Mail | `master.settings.email` |
| Plattform-Integrationen | `integrations` | Plattform-Integrationen | `master.settings.integrations` |

Tab **„API & Worker Monitoring“** entfällt als Settings-Tab → Inhalt unter Plattformstatus `opsTab=workers`.

---

## 5. Desktop — Expanded (260px)

| Aspekt | Spezifikation |
|--------|---------------|
| **Breite** | `w-[260px]` (unverändert, Rental-Parität) |
| **Höhe** | `h-screen`, `flex-col` |
| **Logo-Bereich** | Logo + Chip „Master Admin“ (`sq-chip-neutral`, **nicht** `critical`) |
| **Scroll** | Nav-Body `flex-1 overflow-y-auto`; Footer sticky `shrink-0` |
| **Gruppentitel** | `sq-section-label`, nicht kollabierbar bei 1-Item-Gruppen (Übersicht, Abrechnung) |
| **Kollabierbare Gruppen** | Chevron, `aria-expanded`, Auto-Expand bei aktivem Child |
| **Active Item** | `navItemClass(true)` + `aria-current="page"` |
| **Active Group** | `navSectionHeaderClass(isOpen, hasActiveChild)` |
| **Hover** | Bestehend `hover:bg-accent`, `translate-x-[1px]` |
| **Focus** | `focus-visible:ring-2 ring-ring ring-offset-2` (Ergänzung in `navItemClass`) |
| **Separatoren** | `h-px bg-border` zwischen Hauptblöcken optional; **nicht** zwischen jedem Item |
| **Informationsdichte** | 16 Items + 4 Footer = ~480–560px Scroll bei 1080p — akzeptabel |
| **Right Panel** | Bleibt optional; Sidebar-Systemstatus reduziert Abhängigkeit vom Right Panel |

---

## 6. Desktop — Collapsed (52px)

| Aspekt | Spezifikation |
|--------|---------------|
| **Breite** | `w-[52px]` (Rental-Parität) |
| **Items** | Icon-only `navItemClass(active, true)` |
| **Tooltips** | `CollapsedNavTooltip` bei Hover/Focus |
| **Gruppen** | Keine Labels; dünne `w-4 h-px` Separatoren zwischen Domänenblöcken |
| **Footer** | Collapse-Toggle, Systemstatus-Dot, Settings-Icon, Avatar, Logout-Icon |
| **Badge/Counter** | Support-Counter als Overlay auf Headphones-Icon; Status-Dots auf HeartPulse |
| **Keyboard** | Tab durch Icons; Enter aktiviert; Tooltip bei Focus sichtbar |

---

## 7. Mobile (< lg / 1024px)

Mobile ist **kein** 1:1 Desktop-Dropdown, sondern ein **priorisiertes Ops-Drawer-Pattern**.

### 7.1 Struktur

```
┌─ Mobile Header (h-14, safe-area-top) ─────────────┐
│ [☰]  SynqDrive Logo  [⌘/Suche wenn implementiert] │
└───────────────────────────────────────────────────┘
┌─ Drawer (bei Öffnen, max-h: calc(100dvh - 3.5rem)) ┐
│ PRIMÄR (immer oben, keine Accordion)               │
│   Dashboard · Organisationen · Support ·             │
│   Plattformstatus · Fahrzeuge                        │
│ ─────────────────────────────────────────────────  │
│ ACCORDION GRUPPEN (default zu, außer aktive)       │
│   Mandanten & Nutzer ▼                             │
│   Flotte ▼                                         │
│   Abrechnung ▼                                     │
│   Konnektivität ▼                                  │
│   Partner & Services ▼                             │
│   Entwicklung & Dokumentation ▼                    │
│ ─────────────────────────────────────────────────  │
│ FOOTER (sticky im Drawer)                          │
│   Systemstatus · Einstellungen · Konto · Abmelden  │
└───────────────────────────────────────────────────┘
[overlay-scrim + backdrop blur]
```

### 7.2 Interaktion

| Aspekt | Spezifikation |
|--------|---------------|
| **Öffnen** | Hamburger `Menu`, `aria-expanded`, `aria-controls="master-mobile-nav"` |
| **Schließen** | Backdrop-Tap, Nav-Auswahl, `Escape`, Resize ≥ `lg` |
| **Animation** | `max-h` + `opacity` 300ms `ease-in-out`; `prefers-reduced-motion` → instant |
| **Scroll** | Drawer-Body scroll; Footer sticky am Drawer-Ende |
| **Safe Areas** | `padding-top: env(safe-area-inset-top)`, Footer `safe-area-inset-bottom` |
| **Touch Targets** | Min. 44×44px für alle Items und Footer-Aktionen |
| **Focus** | Bei Öffnen Fokus auf erstes Primary-Item; Focus-Trap im Drawer |
| **Active State** | Gleiche `navItemClass` + linkes Rail wie Desktop |
| **Subnavigation** | Nur Accordion — **keine** dritte Ebene in Sidebar |

### 7.3 Entfernt auf Mobile

- Quick-Action-Grid (ersetzt durch Primary Shortcuts + kontextuelle Page-Actions)
- Right Panel (Inhalt über Dashboard / Plattformstatus erreichbar)

---

## 8. Status- & Badge-Policy (Navigation)

**Regel:** Max. **ein Badge-Typ pro Item**. Keine Badge-Flut. Nur **handlungsrelevante** Zustände.

| Badge-Typ | ID | Wo | Trigger | Darstellung | Nicht zeigen wenn |
|-----------|-----|-----|---------|-------------|-------------------|
| Platform Critical | `platform-critical` | Plattformstatus, Footer Systemstatus | Health API `severity >= critical` oder `degraded` mit aktiven Alerts | `sq-dot-critical` am Icon / Footer | `operational` |
| Support Count | `support-count` | Support | `openSupportTickets > 0` | Numerisch `1–9+` am Icon | 0 offene Tickets |
| Billing Anomaly | `billing-anomaly` | Abrechnung & Verträge | Failed payments / Stripe sync error in letzten 24h | `sq-dot-watch` | Keine Anomalie |
| Integration Outage | `integration-outage` | Fahrzeug-Konnektivität, High Mobility | DIMO/HM disconnected oder Stream down | `sq-dot-critical` | Connected |
| Connectivity Warning | `connectivity-warning` | Fahrzeuge | >5% Fleet offline oder stale signals | `sq-dot-watch` | Normal |
| MFA Required | `mfa-required` | Konto (Footer) | `enrollmentRequired && !enrolled` | `sq-dot-watch` am Avatar | MFA ok |
| Job Failure | — | **Nicht** in Sidebar | — | Stattdessen: Plattformstatus `opsTab=workers` | Zu granular für Nav |

**Explizit keine Nav-Badges für:** Prospects count, Changes count, Architektur, einzelne Org-Status, dekorativer Notification-Dot in TopBar.

**Polling:** Badge-Daten aus bestehenden APIs (`api.admin.dashboard()`, Support open count, Health alerts) — kein neuer Polling-Layer pro Item.

---

## 9. Globale Aktionen (außerhalb Sidebar-Produktnav)

| Aktion | Ort (Ziel) | Sidebar-Duplikat |
|--------|------------|------------------|
| Globale Suche / ⌘K | TopBar | Nein |
| Operator App | TopBar | Nein |
| Theme Toggle | TopBar oder Account-Sheet | Nein |
| Sprache | Account-Sheet | Nein |
| Neue Organisation | Page-Action auf Organisationen + ⌘K | **Entfernt** (war Quick Action) |
| Benutzer einladen | Page-Action auf Benutzer + ⌘K | **Entfernt** (war Quick Action) |
| Notifications | TopBar (wenn implementiert) oder Account | Nein — kein dekorativer Dot ohne Panel |

TopBar-Settings-Icon → **entfernen** oder an Footer „Einstellungen“ koppeln (ein Ziel).

---

## 10. Berechtigungsmatrix

| Permission / Role | Sichtbare Nav-Bereiche |
|-------------------|------------------------|
| `platformRole: MASTER_ADMIN` | Vollständige Produktnav + Footer |
| `platformPermissions` enthält `master-billing` (ohne MASTER_ADMIN) | Nur: Dashboard, Abrechnung & Verträge, Footer (Konto, Logout) — **eingeschränkter Rail-Modus** |
| Kein Master-Zugang | Keine `/master` Route (bestehend) |

**Voice Assistant:** Bleibt `MASTER_ADMIN`-only (bestehend `isMasterAdmin()`).

**Zukunftsfähig:** `master-ops`, `master-support` als optionale Permissions — Blueprint reserviert i18n-Keys, implementiert initial nur obige zwei Stufen.

---

## 11. i18n-Key-Konvention

```
master.nav.group.overview          → Übersicht
master.nav.group.tenants           → Mandanten & Nutzer
master.nav.group.fleet             → Flotte
master.nav.group.commerce          → Abrechnung
master.nav.group.connectivity      → Konnektivität
master.nav.group.partners          → Partner & Services
master.nav.group.operations        → Plattformbetrieb
master.nav.group.engineering       → Entwicklung & Dokumentation
master.nav.<itemId>                → Item-Labels (siehe Registry)
master.nav.systemStatus            → Systemstatus
master.nav.settings                → Einstellungen
master.nav.account                 → Konto
master.nav.logout                  → Abmelden
master.nav.collapseSidebar         → Sidebar einklappen
master.settings.<tab>              → Settings In-Page Tabs
```

---

## 12. Änderungsmatrix

### REMOVE — aus der Navigation entfernen

| Item (Ist) | Begründung | Zielzugriff |
|------------|------------|-------------|
| Quick Actions (New Org, Invite User, Support, Activity) | Redundant / falsche Semantik (kein Create) | Page-Actions + ⌘K |
| Configuration → General | Doppelte Settings-Ebene | Footer → Einstellungen |
| Configuration → E-Mail | Doppelte Settings-Ebene | Settings Tab |
| Configuration → Integrations | Doppelte Settings-Ebene + Namenskollision | Settings Tab „Plattform-Integrationen“ |
| Configuration → Monitoring | Monitoring gehört zu Plattformbetrieb | Plattformstatus → Worker & Jobs |
| HM Compatibility Check | Sub-Feature | High Mobility Tab |
| Health Tracking | Doku-Subseite | Architektur Kategorie |
| Trip Detection Logic | Doku-Subseite | Architektur Kategorie |
| Performance Logic | Doku-Subseite | Architektur Kategorie |
| TopBar Settings (tot) | Doppelung / broken | Footer Einstellungen |
| TopBar Notifications (dekorativ) | Kein Panel | Später: echtes Panel oder entfernen |
| „Master Admin“ Chip `sq-chip-critical` | Falsche Semantik (Alarm) | `sq-chip-neutral` |

### MOVE — verschoben

| Item | Von | Nach |
|------|-----|------|
| Fahrzeug-Logbuch | SynqDrive Code | Flotte |
| SystemMonitoringView | Settings → Monitoring | Plattformstatus In-Page Tab „Worker & Jobs“ |
| Einstellungen (gesamt) | Configuration-Gruppe (4 Items) | Control-Footer (1 Item) |
| Systemstatus | Right Panel only | Footer-Link + Plattformstatus |
| Logout / Konto | TopBar only | Footer (+ Account-Sheet) |
| Plattformbetrieb-Items | Operations (collapsed) | Eigene Gruppe, default expanded |

### RENAME — umbenannt (DE kanonisch)

| Ist | Kanonisch (DE) | i18n Key |
|-----|----------------|----------|
| Dashboard | Dashboard | `master.nav.dashboard` |
| Organizations | Organisationen | `master.nav.organizations` |
| Prospects | Interessenten | `master.nav.prospects` |
| Users | Benutzer | `master.nav.users` |
| Vehicles | Fahrzeuge | `master.nav.vehicles` |
| Vehicle Logbook | Fahrzeug-Logbuch | `master.nav.vehicleLogbook` |
| Abrechnung | Abrechnung & Verträge | `master.nav.billing` |
| Fleet Connection | Fahrzeug-Konnektivität | `master.nav.vehicleConnectivity` |
| High Mobility | High Mobility | `master.nav.highMobility` |
| Parts & Accessories | Ersatzteile & Zubehör | `master.nav.partsAccessories` |
| Insurances | Versicherungen | `master.nav.insurances` |
| Voice Assistant | Sprachassistent | `master.nav.voiceAssistant` |
| Platform Health | Plattformstatus | `master.nav.platformHealth` |
| Support Center | Support | `master.nav.support` |
| Activity Log | Aktivitätsprotokoll | `master.nav.activityLog` |
| Architektur | Architektur | `master.nav.architecture` |
| Changes | Änderungsprotokoll | `master.nav.changes` |
| Settings (tabs) | Einstellungen / Plattform-Integrationen | `master.nav.settings` / `master.settings.integrations` |
| Overview (group) | Übersicht | `master.nav.group.overview` |
| Management | Mandanten & Nutzer | `master.nav.group.tenants` |
| Operations | Plattformbetrieb | `master.nav.group.operations` |
| Integrations | → aufgeteilt in Konnektivität + Partner & Services | — |
| SynqDrive Code | Entwicklung & Dokumentation | `master.nav.group.engineering` |

### MERGE — zusammengeführt

| Ziel | Quellen | Mechanismus |
|------|---------|-------------|
| High Mobility (ein Nav-Item) | `high-mobility` + `hm-compatibility` | In-Page Tab + URL-Redirect |
| Plattformstatus (ein Nav-Item) | `platform-health` + Settings Monitoring | In-Page Tab `opsTab=workers` |
| Architektur (ein Nav-Item) | `architektur` + `health-tracking` + `trip-detection-logic` + `performance-logic` | In-Page Kategorien + URL `archCategory` |
| Einstellungen (ein Footer-Item) | Configuration-Gruppe (4 Sidebar-Items) | In-Page Tabs |
| Konnektivitäts-Domain (konzeptionell) | Fleet Connection + HM + Vehicles DIMO/HM Tabs | Sidebar: 2 Items; Fahrzeug-Registry bleibt unter Fahrzeuge |

### KEEP — unverändert (Funktion / View-ID)

| Item | View-ID | Anmerkung |
|------|---------|-----------|
| Dashboard | `dashboard` | Gruppe neu: Übersicht |
| Organisationen | `organizations` | + URL `orgId` Ziel |
| Interessenten | `prospects` | — |
| Benutzer | `users` | — |
| Fahrzeuge | `vehicles` | In-Page Tabs unverändert |
| Abrechnung | `billing` | Permission-Gate bleibt |
| Fahrzeug-Konnektivität | `fleet-connection` | Nur Label/Icon/Gruppe |
| High Mobility | `high-mobility` | + merged hm-compatibility |
| Ersatzteile & Zubehör | `parts-accessories` | — |
| Versicherungen | `insurances` | — |
| Sprachassistent | `voice-assistant` | — |
| Plattformstatus | `platform-health` | + Worker-Tab |
| Support | `support` | + Counter-Badge |
| Aktivitätsprotokoll | `activity-log` | — |
| Architektur | `architektur` | + Doku-Merge |
| Änderungsprotokoll | `changes` | — |
| Fahrzeug-Logbuch | `vehicle-logbook` | Nur Gruppe geändert |
| Billing/Voice URL-Params | `masterBilling*`, `voiceSection*` | Beibehalten |

---

## 13. Vollständige Referenztabelle

| Group (DE) | Item (DE) | Route | Icon | Permission | Badge | Desktop Expanded | Desktop Collapsed | Mobile |
|------------|-----------|-------|------|------------|-------|------------------|---------------------|--------|
| Übersicht | Dashboard | `/master?view=dashboard` | `LayoutDashboard` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Primary Pin |
| Mandanten & Nutzer | Organisationen | `/master?view=organizations` | `Building2` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Primary Pin |
| Mandanten & Nutzer | Interessenten | `/master?view=prospects` | `Target` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion |
| Mandanten & Nutzer | Benutzer | `/master?view=users` | `Users` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion |
| Flotte | Fahrzeuge | `/master?view=vehicles` | `Car` | `MASTER_ADMIN` | `connectivity-warning` | Item | Icon+Tooltip+Dot | Primary Pin |
| Flotte | Fahrzeug-Logbuch | `/master?view=vehicle-logbook` | `BookOpen` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion |
| Abrechnung | Abrechnung & Verträge | `/master?view=billing` | `CreditCard` | `MASTER_ADMIN` \| `master-billing` | `billing-anomaly` | Item | Icon+Tooltip+Dot | Accordion |
| Konnektivität | Fahrzeug-Konnektivität | `/master?view=fleet-connection` | `Network` | `MASTER_ADMIN` | `integration-outage` | Item | Icon+Tooltip+Dot | Accordion |
| Konnektivität | High Mobility | `/master?view=high-mobility` | `Radio` | `MASTER_ADMIN` | `integration-outage` | Item | Icon+Tooltip+Dot | Accordion |
| Partner & Services | Ersatzteile & Zubehör | `/master?view=parts-accessories` | `Package` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion |
| Partner & Services | Versicherungen | `/master?view=insurances` | `Shield` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion |
| Partner & Services | Sprachassistent | `/master?view=voice-assistant` | `Phone` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion |
| Plattformbetrieb | Plattformstatus | `/master?view=platform-health` | `HeartPulse` | `MASTER_ADMIN` | `platform-critical` | Item | Icon+Tooltip+Dot | Primary Pin |
| Plattformbetrieb | Support | `/master?view=support` | `Headphones` | `MASTER_ADMIN` | `support-count` | Item | Icon+Tooltip+Count | Primary Pin |
| Plattformbetrieb | Aktivitätsprotokoll | `/master?view=activity-log` | `History` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion |
| Entwicklung & Dokumentation | Architektur | `/master?view=architektur` | `Code2` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion (collapsed) |
| Entwicklung & Dokumentation | Änderungsprotokoll | `/master?view=changes` | `FileText` | `MASTER_ADMIN` | — | Item | Icon+Tooltip | Accordion (collapsed) |
| **Control-Footer** | Systemstatus | `/master?view=platform-health` | Status-Dot | `MASTER_ADMIN` | `platform-critical` | Footer-Link | Dot+Tooltip | Footer |
| **Control-Footer** | Einstellungen | `/master?view=settings&settingsTab=general` | `Settings` | `MASTER_ADMIN` | — | Footer-Button | Icon+Tooltip | Footer |
| **Control-Footer** | Konto | Account-Sheet | Avatar | `MASTER_ADMIN` | `mfa-required` | Avatar+Name | Avatar+Tooltip | Footer |
| **Control-Footer** | Abmelden | Action | `LogOut` | `MASTER_ADMIN` | — | Footer / Sheet | Icon+Tooltip | Footer |
| **Control-Footer** | Sidebar einklappen | Toggle | `PanelLeftClose` | — | — | Footer-Toggle | — | — |

**Gesamt Produktnav:** 16 Items in 8 Gruppen  
**Gesamt inkl. Footer:** 20 Einträge (4 Footer-Control + 1 Collapse)

---

## 14. Implementierungsreihenfolge (Hinweis, nicht Teil dieser Phase)

1. Nav-Registry als `master-nav.config.ts` extrahieren  
2. URL-Sync für alle `view`-Wechsel  
3. Footer + Collapsed Rail (Rental-Port)  
4. REMOVE/MERGE Redirects  
5. Badge-Polling an bestehende APIs  
6. Mobile Drawer mit Primary Pins  
7. ARIA + Focus-Visible  
8. i18n Keys verdrahten  

---

## 15. Abnahmekriterien (Blueprint)

- [ ] ≤ 16 Produktnav-Items in Sidebar  
- [ ] Kein Sidebar-Eintrag ohne Berechtigung  
- [ ] Kein toter Quick-Action-/Settings-Doppelweg  
- [ ] Plattformbetrieb default sichtbar  
- [ ] Engineering default eingeklappt  
- [ ] Collapsed Desktop Rail spezifiziert  
- [ ] Mobile mit Primary Pins + Accordion  
- [ ] Footer getrennt von Produktnav  
- [ ] Badge-Policy ≤ 6 Typen, handlungsrelevant  
- [ ] Vollständige DE + i18n-Key Registry  

---

*Phase UI-1.3 — Kanonischer Blueprint. Keine Code-Implementierung.*
