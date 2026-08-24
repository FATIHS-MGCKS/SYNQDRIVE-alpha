# SynqDrive — Light Mode Surface Color Cutover Audit (V4.9.196 + V4.9.199)

> **Status:** V4.9.196 + V4.9.199 deployed  
> **Release (V4.9.196):** `20260824151022_v4994` (includes `3964210b` surface cutover + deploy boot hotfix)  
> **Release (V4.9.199):** `20260824173547_v4994` (`ab2c3631`) — PR #1250    
> **Scope:** Light-mode surface/background tokens only — no layout, typography, dark mode, or map-glass redesign  
> **Canonical tokens:** `frontend/src/styles/theme.css`  
> **Contract:** `frontend/src/styles/THEME_COLOR_CONTRACT.md`  
> **Surface system:** `frontend/src/styles/LIQUID_GLASS_SYSTEM.md`  
> **Date:** 2026-08-24

---

## Purpose

This document captures the full delivery report for the **Light Mode Surface Color Cutover** (V4.9.196), oriented toward **Vero-style neutral surfaces**:

- Main canvas `#F6F6F6`
- Opaque white sidebar and cards `#FFFFFF`
- Flat L1 premium panels (no cool-white gradient)
- No light-mode body ambient gradients

It is intended for **external audit** and future agent work. It records what was changed, what was deliberately left alone, hardcode debt, L0/L1 architecture, and remaining risks.

**Related follow-up:** Typography neutralization is documented separately in `LIGHT_MODE_TEXT_NEUTRALIZATION_AUDIT.md` (V4.9.197).

---

## 1. Audit vor Änderung (Kurzfassung)

### 1.1 Zentrale Token-Quelle

`frontend/src/styles/theme.css` (`:root` / `.dark`)

| Bereich | Consumer | Light-Mode **vorher** |
|---------|----------|------------------------|
| Main Canvas | `AppShell` → `bg-background`, `body` | `#F2F3F5` + 3× `radial-gradient` ambient on `body` |
| Sidebar | Rental/Master `Sidebar.tsx`, `RightSidebar.tsx` → `bg-sidebar` | `rgba(255,255,255,0.92)` translucent |
| L0 Cards | `.surface-solid`, `.sq-card`, shadcn `Card` default | `var(--card)` = `rgba(255,255,255,0.86)` |
| L1 Premium | `.surface-premium`, `.sq-card-premium`, `DataCard`/`MetricCard` default | Cool-white gradient + inset highlight/shadow |
| L2 Frosted | `.surface-frosted`, `.sq-glass`, `--glass-*` | Unverändert gelassen |
| L3 Map Glass | `.surface-liquid`, `--map-glass-*` | Unverändert gelassen |

### 1.2 Geprüfte Dateien

| Datei / Bereich | Ergebnis |
|-----------------|----------|
| `frontend/src/styles/theme.css` | Single source of truth — alle Surface-Änderungen hier |
| `frontend/src/styles/THEME_COLOR_CONTRACT.md` | Normative Light-Mode-Beschreibung (V2 cool glass) |
| `frontend/src/styles/LIQUID_GLASS_SYSTEM.md` | L0/L1/L2/L3 Definitionen |
| `frontend/src/styles/SURFACE_INSPIRATION_AUDIT.md` | Keine normativen Konflikte zur neuen Palette |
| `frontend/src/components/shell/app-shell.tsx` | `bg-background` — korrekter Canvas-Consumer |
| `frontend/src/components/ui/card.tsx` | `resolveCardSurface()` → `.surface-solid` default |
| `frontend/src/components/patterns/surface.ts` | L0/L1 Resolver für Card/DataCard/MetricCard |
| Rental/Master `Sidebar.tsx` | `bg-sidebar` — kein paralleles translucent white |
| `DataCard` / `MetricCard` (`patterns/data-card.tsx`) | L1 default via `resolveDataCardSurface` |

### 1.3 Hardcode-Suche vor Umsetzung

Aktive Light-Mode Surface-Hardcodes außerhalb Tokens:

- `#F2F3F5`
- `rgba(255, 255, 255, 0.86)` / `0.92`
- `rgba(247, 249, 252, 0.96)`

**Ergebnis:** Keine aktiven Feature-Hardcodes für Canvas/Card/Sidebar außerhalb `theme.css`. Historische Strings in `ChangesView.tsx` / `ArchitekturView.tsx` nur als Changelog.

---

## 2. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `frontend/src/styles/theme.css` | Light-Mode Surface-Tokens, body ambient removal, L1 premium tuning |
| `frontend/src/styles/THEME_COLOR_CONTRACT.md` | V4.9.196 Dokumentation + Historie V4.9.192 |
| `frontend/src/styles/LIQUID_GLASS_SYSTEM.md` | L0/L1 Light-Mode Beschreibung (opaque white, flat premium) |

**Keine Feature-Komponenten geändert** — reiner token-driven Design-System-Cutover.

**Git:** `feat(theme): neutral Vero-style light mode surface cutover (V4.9.196)` — `3964210b`

---

## 3. Light-Mode Tokens — vorher → nachher

### 3.1 Core surfaces

| Token | Vorher | Nachher |
|-------|--------|---------|
| `--background` | `#F2F3F5` | `#F6F6F6` |
| `--card` | `rgba(255,255,255,0.86)` | `#FFFFFF` |
| `--sidebar` | `rgba(255,255,255,0.92)` | `#FFFFFF` |

### 3.2 L1 premium solid

| Token | Vorher | Nachher |
|-------|--------|---------|
| `--surface-premium-bg-start` | `rgba(255,255,255,0.98)` | `#FFFFFF` |
| `--surface-premium-bg-end` | `rgba(247,249,252,0.96)` | `#FFFFFF` |
| `--surface-premium-highlight` | `rgba(255,255,255,0.85)` | `rgba(255,255,255,0.42)` |
| `--surface-premium-catch` | `rgba(17,24,39,0.035)` | `rgba(17,24,39,0.025)` |
| `--surface-premium-shadow` | `0 8px 24px …` | `0 4px 16px …` (dezenter, weniger glossy) |

### 3.3 Body ambient (light only)

| Regel | Vorher | Nachher |
|-------|--------|---------|
| `body` `background-image` | 3× `radial-gradient` (white lift + blue hint + gray ambient) | `none` |
| `body` `background` | `var(--background)` | unverändert |
| `.dark body` | Graphite vignette gradients | **Unverändert** |

### 3.4 Bewusst nicht geändert (in diesem Pass)

| Token / Bereich | Wert / Status |
|-----------------|---------------|
| `--popover` | `rgba(255,255,255,0.92)` — Overlay-Semantik |
| `--input-background` | `rgba(255,255,255,0.72)` — transluzenter Input-Fill |
| `--brand` | `#4F86E8` |
| Alle `--status-*` | Unverändert |
| L2 `--glass-*` | Unverändert (frosted glass) |
| L3 `--map-glass-*` | Unverändert (liquid glass HUD) |
| Dark Mode `.dark { … }` | Komplett unangetastet |
| Typography (`--foreground`, etc.) | Später in V4.9.197 neutralisiert |

---

## 4. L0 vs. L1 — tatsächliche Nutzung

| Level | Klassen / Komponenten | Fill-Quelle nach Cutover |
|-------|----------------------|--------------------------|
| **L0** | `.surface-solid`, `.sq-card`, shadcn `Card` default (`surface: solid`) | `var(--card)` → `#FFFFFF` |
| **L1** | `.surface-premium`, `.sq-card-premium`, `DataCard` default, `MetricCard` default, Dashboard-KPI-Panels | `--surface-premium-bg-start/end` → flach `#FFFFFF` + Border/Shadow |
| **L1 interactive** | `.surface-elevated`, `.sq-card-elevated`, klickbare `DataCard`/`MetricCard` | Gleiche weiße Basis + Hover-Lift |
| **L2** | `.surface-frosted`, `.sq-glass` | `--glass-bg` transluzent — **nicht** Teil des Cutovers |
| **L3** | `.surface-liquid`, `.sq-map-liquid-*` | `--map-glass-*` — **nicht** Teil des Cutovers |

### Resolver-Logik (`frontend/src/components/patterns/surface.ts`)

```
DataCard:
  flush        → surface-solid      (L0)
  default      → surface-premium    (L1)
  interactive  → surface-elevated   (L1 interactive)

MetricCard:
  default      → surface-premium    (L1)
  interactive  → surface-elevated   (L1 interactive)

shadcn Card:
  default      → surface-solid      (L0)
  surface prop → explicit L0–L2
```

### Typische Consumer (tokenbasiert)

| UI-Bereich | Surface |
|------------|---------|
| App shell canvas | `bg-background` |
| Rental/Master sidebar | `bg-sidebar` |
| Dashboard KPI cards | `.surface-premium` / `.surface-elevated` |
| Table shells, settings forms | `.surface-solid` / `bg-card` |
| Login hero, sticky tabs | `.surface-frosted` (L2 — unverändert) |
| Map HUD pills, callouts | `.surface-liquid` / `--map-glass-*` (L3 — unverändert) |

---

## 5. Hardcode-Audit nach der Änderung

### 5.1 Suche

```
#F2F3F5
rgba(255, 255, 255, 0.86)
rgba(255, 255, 255, 0.92)
rgba(247, 249, 252, 0.96)
```

### 5.2 Bewertung (Repo-Stand nach Deploy)

| Treffer | Ort | Bewertung |
|---------|-----|-----------|
| `--popover: rgba(255,255,255,0.92)` | `theme.css` | **Erlaubt** — Overlay/Popover-Semantik, bewusst nicht pauschal auf Card umgestellt |
| `--map-glass-inner-shadow` mit `rgba(255,255,255,0.92)` | `theme.css` | **Erlaubt** — L3 Map Liquid Glass Technik |
| `#F2F3F5` in `THEME_COLOR_CONTRACT.md` | Historie V4.9.192 / V4.9.196 | **Erlaubt** — dokumentierte Migration |
| `ChangesView.tsx` Changelog-String | Historische Referenz V2 | **Erlaubt** |
| `ArchitekturView.tsx` | Historische Design-System-Beschreibung | **Erlaubt** |

**Keine aktiven Light-Mode Canvas/Card/Sidebar-Umgehungen** über die alten transluzenten Token-Werte in Feature-Styles.

### 5.3 ~~Paralleles `bg-white` in Feature-Code (Follow-up)~~ → Migriert in V4.9.199

**Vor V4.9.199:** ~44 Dateien mit `bg-white` / `bg-gray-*` Surface-Bypässen.

**Nach V4.9.199:** 49 Feature-Dateien migriert; verbleibende Treffer sind dokumentierte Ausnahmen (siehe §12 und Anhang A).

| Cluster | Surface-Level | Migration |
|---------|---------------|-----------|
| Document Intake / Archive | L0 `surface-solid`, nested `bg-muted` | Vollständig |
| Workflow Automation | L0 cards + `bg-background` inputs | Vollständig |
| Parts / Accessories | L0 `surface-solid`, L1 panels, `bg-background` inputs | Light structural surfaces migriert; dark `bg-white/[opacity]` chrome beibehalten |
| Master Admin Tools | L0 `surface-solid` | Health/Trip/Performance/Registration |
| Invoices (app UI) | L0 `surface-solid` / `surface-premium` | `invoiceTheme.ts` — App-Surface, kein Print-Canvas |
| ChangesView | L0 UI chrome | Changelog-Strings unverändert |

---

## 6. Bewusst nicht geändert

| Kategorie | Details |
|-----------|---------|
| **Brand** | `#4F86E8`, `--brand-hover`, `--brand-soft`, `--brand-ink`, CTAs, focus rings |
| **Typography** | `--foreground`, `--muted-foreground` (→ V4.9.197) |
| **Status colors** | `--status-positive` … `--status-ai` |
| **Dark Mode** | Gesamter `.dark` Block + `.dark body` ambient |
| **L2 Frosted Glass** | `.surface-frosted`, `.sq-glass`, `--glass-*` |
| **L3 Map Liquid Glass** | `.surface-liquid`, `.sq-map-liquid-*`, `--map-glass-*` |
| **Overlays** | `--popover` transluzent belassen |
| **Layout** | Spacing, radius, component sizes, navigation structure |
| **Feature hardcodes** | Kein komponentenweises Patchwork in diesem Pass |

---

## 7. Depth / Elevation — Anpassung ohne Glass-Look

Ziel: Weiße Cards auf `#F6F6F6` mit **subtiler** Trennung, nicht glossy/glassy.

**Beibehalten:**

- `--border` hairlines
- L1 inset highlight + catch (reduziert)
- L1 ambient shadow (reduziert)
- Radius-Logik unverändert

**Nicht angestrebt:**

- Milchiges Glas / starke 3D-Layer
- Cool-white Gradient auf L1
- Blau getönter Canvas-Glow (entfernt via `background-image: none`)

---

## 8. Build / Test / Deploy

| Check | Ergebnis |
|-------|----------|
| `npm run build` | ✅ Erfolgreich |
| `npm run check:surface` | ✅ Erfolgreich |
| `npm test` | ⚠️ Vorbestehende unrelated Failures (z. B. Voice knowledge links mock) |
| Push `origin/main` | ✅ `3964210b` |
| Production deploy | ✅ `20260824151022_v4994` |
| Deploy note | Erster Deploy-Versuch scheiterte an unrelated `CommunicationModule` circular dependency; behoben in `458314fa` vor erfolgreichem Redeploy |
| Health | ✅ `https://app.synqdrive.eu/api/v1/health` |

---

## 9. Visuell geprüfte Screens

| Screen / Route | Ergebnis |
|----------------|----------|
| `/login` (Light) | Canvas `rgb(246,246,246)` = `#F6F6F6`, keine ambient gradients, Card opaque white |
| Dark Mode Toggle | ✅ Keine Regression |
| Rental Dashboard, Vehicles, Sidebar active, Map, Master Admin | ⚠️ Nicht vollständig manuell auditiert (Login ohne Auth); tokenbasierte Shell/Sidebar/Cards erben zentral |

**Geforderte Abnahme-Routes (token-vererbt, nicht einzeln dokumentiert):**

1. Rental Dashboard  
2. Vehicles  
3. Vehicle Detail  
4. Customers  
5. Bookings  
6. Tasks / Notifications  
7. Documents  
8. Settings  
9. Master Admin Dashboard  
10. Sidebar Active State  
11. Map Screen (L3 glass unverändert)  
12. Dark Mode Smoke Test  

---

## 10. Verbleibende Inkonsistenzen / Risiken

### 10.1 `--popover` vs. `--card`

| Token | Light value | Wirkung |
|-------|-------------|---------|
| `--card` | `#FFFFFF` opaque | Panels, L0 |
| `--popover` | `rgba(255,255,255,0.92)` | Dropdowns, menus |

Popovers können minimal transluzenter wirken als Cards — **bewusst** (Overlay-Semantik).

### 10.2 `--input-background` transluzent

`rgba(255,255,255,0.72)` — Inputs sind nicht voll opaque white. Kann auf sehr hellem Monitor minimal durchscheinen; nicht Teil des Surface-Cutovers.

### 10.3 ~~Legacy `bg-white` in Feature-Views~~ → Resolved in V4.9.199

Strukturelle Light-Mode Card/Panel/Input-Surfaces nutzen jetzt `surface-solid`, `surface-premium`, `bg-muted`, `bg-background`, `border-border`.

**Verbleibende `bg-white` Treffer (bewusst):**

| Kategorie | Beispiel | Grund |
|-----------|----------|-------|
| Signature canvas | `SignaturePad.tsx` | Technisches Weiß für Unterschrift |
| Toggle knob | `ChangesView.tsx`, Operator handover | Physischer Switch-Thumb |
| PDF/iframe preview | `LegalDocumentVersionDetailDrawer.tsx` | Document rendering |
| Dark-mode overlay chrome | `PartsAccessoriesView.tsx` `bg-white/[0.0x]` | Dark glass chrome, nicht Light bypass |
| Status tinted panels | `VehicleRegistrationModal.tsx` `bg-white/60` auf purple/cyan | Semantische AI/status tint, nicht Card |
| Changelog strings | `ChangesView.tsx` | Historische Doku |
| Status dots/bars | `health-tab-summary-ui.ts`, `BatteryConditionBars.tsx` | Semantik, nicht Surface |

### 10.4 L1 Inset-Highlights

Nach Flat-White-L1 sind Highlights reduziert, aber nicht null. Auf sehr hellem Monitor evtl. minimal sichtbar — gewollt für dezente Depth.

### 10.5 Authentifizierte Vollabnahme

Alle 12 geforderten Screens nicht einzeln mit Screenshots dokumentiert. Zentraler Token-Cutover deckt `bg-background`, `bg-sidebar`, `bg-card`, `.surface-*` ab.

---

## 11. Acceptance Criteria — Erfüllung

| # | Kriterium | Status |
|---|-----------|--------|
| 1 | Light Mode global `#F6F6F6` Main Canvas | ✅ |
| 2 | Canvas flach, keine Light-Mode Ambient Gradients | ✅ |
| 3 | Sidebar `#FFFFFF` | ✅ |
| 4 | Normale Cards `#FFFFFF` | ✅ |
| 5 | Premium/KPI/Elevated Cards weiße Basissurface | ✅ |
| 6 | Subtiler Kontrast Canvas ↔ Cards | ✅ |
| 7 | Brand Blue unverändert | ✅ |
| 8 | Dark Mode unverändert | ✅ |
| 9 | Map Liquid Glass unverändert | ✅ |
| 10 | Keine komponentenweisen Farb-Hacks | ✅ V4.9.199 Feature cleanup |
| 11 | Theme Contract + Surface-Docs aktualisiert | ✅ |
| 12 | `npm run build` erfolgreich | ✅ |
| 13 | `npm run check:surface` erfolgreich | ✅ |
| 14 | Keine offensichtlichen Rental/Master-Regressionen (Smoke) | ✅ Login; Rest token-vererbt |

---

## Anhang A — Verbleibende Legacy Surface-Klassen (post V4.9.199)

**Migrierte Dateien (49):** siehe Git-Diff `feat/theme-v4999-surface-hardcode-cleanup` vs `main`.

**Bewusste verbleibende Treffer (~15 Dateien, nicht-strukturell):**

```
frontend/src/master/components/ChangesView.tsx              # changelog + toggle knob
frontend/src/rental/components/handover/SignaturePad.tsx  # canvas bg-white
frontend/src/rental/components/damages/DamageEvidenceCanvas.tsx
frontend/src/rental/components/legal-documents/LegalDocumentVersionDetailDrawer.tsx
frontend/src/rental/components/users-roles/IamBadges.tsx
frontend/src/rental/lib/health-tab-summary-ui.ts          # status dots
frontend/src/rental/components/BatteryConditionBars.tsx   # bar fill semantics
frontend/src/operator/handover/operatorHandoverUi.tsx     # toggle thumb
frontend/src/operator/handover/OperatorHandoverTechnicalObservationsSection.tsx
frontend/src/rental/components/workflow-automation/TaskAutomationRuleDrawer.tsx
frontend/src/components/figma/ImageWithFallback.tsx
frontend/src/rental/components/PartsAccessoriesView.tsx     # dark-mode bg-white/[opacity] only
frontend/src/master/components/VehicleRegistrationModal.tsx # status-tint overlays
frontend/src/rental/components/WorkflowAutomationView.tsx   # hover:bg-white/5 dark chrome
```

---

## 12. V4.9.199 — Feature Surface Hardcode Cleanup

### 12.1 Ziel

Migration der in §5.3 / Anhang A (V4.9.196) dokumentierten Legacy-Surface-Bypässe auf das SynqDrive Surface-System.

### 12.2 Ergebnis

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| Dateien mit `bg-white` Surface-Bypässen | ~44 | **~15** (Ausnahmen) |
| Migrierte Feature-Dateien | 0 | **49** |
| Entfernte `isDarkMode ? … : 'bg-white'` Card-Ternaries | viele | vereinfacht auf `surface-solid` / `bg-muted` |
| `border-gray-*` strukturell | viele | → `border-border` |
| Neue Hex-Hardcodes | — | **0** |

### 12.3 Invoice-Entscheidung (`invoiceTheme.ts`)

`card` nutzt jetzt `surface-solid border-border` — **App-UI-Surface**, kein Print/PDF-Rendering. Inputs bereits `bg-background`.

### 12.4 Build / Test

| Check | Ergebnis |
|-------|----------|
| Push `origin/main` | ✅ `ab2c3631` (PR #1250) |
| Production deploy | ✅ `20260824173547_v4994` |
| Health | ✅ `https://app.synqdrive.eu/api/v1/health` |

---

## Anhang A (V4.9.196) — Legacy `bg-white` vor Migration

Stand: `rg 'bg-white' frontend/src --glob '*.{ts,tsx}'`

```
frontend/src/master/components/ChangesView.tsx
frontend/src/master/components/ExteriorImagesEditor.tsx
frontend/src/master/components/HealthTrackingView.tsx
frontend/src/master/components/HighMobilityCompatibilityView.tsx
frontend/src/master/components/PerformanceLogicView.tsx
frontend/src/master/components/PlatformEmailSettingsPanel.tsx
frontend/src/master/components/TripDetectionLogicView.tsx
frontend/src/master/components/VehicleLogbookView.tsx
frontend/src/master/components/VehicleRegistrationModal.tsx
frontend/src/operator/handover/OperatorHandoverTechnicalObservationsSection.tsx
frontend/src/operator/handover/operatorHandoverUi.tsx
frontend/src/rental/components/AIAssistantView.tsx
frontend/src/rental/components/BookingDocumentsSection.tsx
frontend/src/rental/components/BusinessInsightsBox.tsx
frontend/src/rental/components/DocumentUploadView.tsx
frontend/src/rental/components/EntityTasksSection.tsx
frontend/src/rental/components/FinesView.tsx
frontend/src/rental/components/FleetConditionDetailView.tsx
frontend/src/rental/components/HelpCenterView.tsx
frontend/src/rental/components/InsurancesView.tsx
frontend/src/rental/components/PartsAccessoriesView.tsx
frontend/src/rental/components/StatInlineDetail.tsx
frontend/src/rental/components/VehicleInsightsCard.tsx
frontend/src/rental/components/WorkflowAutomationView.tsx
frontend/src/rental/components/damages/DamageEvidenceCanvas.tsx
frontend/src/rental/components/documents/DocumentArchivePanel.tsx
frontend/src/rental/components/documents/DocumentClassificationResultPanel.tsx
frontend/src/rental/components/documents/DocumentEntityReview.tsx
frontend/src/rental/components/documents/DocumentIntakeProcessingSteps.tsx
frontend/src/rental/components/documents/DocumentIntakeUploadZone.tsx
frontend/src/rental/components/documents/DocumentReviewInboxPanel.tsx
frontend/src/rental/components/handover/HandoverProtocolDialog.tsx
frontend/src/rental/components/handover/SignaturePad.tsx
frontend/src/rental/components/insights/InsightsCockpit.tsx
frontend/src/rental/components/invoices/InvoiceFilters.tsx
frontend/src/rental/components/invoices/invoiceTheme.ts
frontend/src/rental/components/legal-documents/LegalDocumentVersionDetailDrawer.tsx
frontend/src/rental/components/price-tariffs/TariffGroupDrawer.tsx
frontend/src/rental/components/settings/email/EmailVersandTab.tsx
frontend/src/rental/components/trips/TripTimelineExpanded.tsx
frontend/src/rental/components/voice-assistant/VoiceConversationsPanel.tsx
frontend/src/rental/components/whatsapp/WhatsAppSettingsPanel.tsx
frontend/src/rental/components/workflow-automation/TaskAutomationRuleDrawer.tsx
```

---

## Anhang B — Verwandte Releases

| Release | Commit | Inhalt |
|---------|--------|--------|
| V4.9.196 | `3964210b` | Surface cutover: `#F6F6F6` canvas, white cards/sidebar, flat L1, no light body ambient |
| V4.9.197 | `940eddef` | Text neutralization — siehe `LIGHT_MODE_TEXT_NEUTRALIZATION_AUDIT.md` |
| V4.9.198 | `9dec5ff9` | Feature text hardcode cleanup — siehe `LIGHT_MODE_TEXT_NEUTRALIZATION_AUDIT.md` §11 |
| V4.9.199 | `ab2c3631` | Feature surface hardcode cleanup — siehe §12 |

---

## Change policy

Bei Follow-up-Migrationen:

1. Nur **Surface-Fills** migrieren — keine Typography- oder Layout-Passes mischen.
2. `bg-background`, `bg-card`, `bg-sidebar`, `.surface-*` bevorzugen — keine neuen Canvas/Card-Hex-Werte in Feature-Code.
3. L2/L3 und Dark Mode pro Treffer prüfen.
4. Dieses Dokument und `THEME_COLOR_CONTRACT.md` bei Abschluss eines Clusters aktualisieren.
