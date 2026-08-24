# SynqDrive — Light Mode Text Color Neutralization Audit (V4.9.197)

> **Status:** Applied and deployed  
> **Release:** `20260824155357_v4994` (`940eddef`)  
> **Scope:** Light-mode typography tokens only — no surface, layout, dark-mode, or status-color changes  
> **Canonical tokens:** `frontend/src/styles/theme.css`  
> **Contract:** `frontend/src/styles/THEME_COLOR_CONTRACT.md`  
> **Date:** 2026-08-24

---

## Purpose

This document captures the full delivery report for the **Light Mode Text Color Neutralization Pass** (V4.9.197), with emphasis on:

1. Hardcoded text-color audit (§5)
2. Remaining inconsistencies and follow-up debt (§9)

It is intended for **external audit** and future agent work. It does not replace `THEME_COLOR_CONTRACT.md`; it records what was changed, what was deliberately left alone, and what still bypasses the token layer.

---

## 1. Geprüfte Dateien (Audit vor Umsetzung)

| Bereich | Datei / Pfad | Ergebnis |
|---------|--------------|----------|
| Zentrale Tokens | `frontend/src/styles/theme.css` (`:root`, `@theme inline`) | Light-Mode Foreground/Muted auf Slate/Graphite → Ziel neutral |
| Dokumentation | `frontend/src/styles/THEME_COLOR_CONTRACT.md` | Aktualisiert auf V4.9.197 |
| Tailwind Bridge | `@theme inline` in `theme.css` | Mappt `--color-foreground`, `--color-muted-foreground`, etc. — keine separaten Hardcodes |
| Patterns | `frontend/src/components/patterns/*` | Bereits semantisch (`text-foreground`, `text-muted-foreground`) |
| Shell / Sidebar | `app-shell.tsx`, Rental/Master `Sidebar.tsx` | Nutzen `bg-sidebar`, `text-sidebar-foreground`, `text-muted-foreground` |
| shadcn Input | `frontend/src/components/ui/input.tsx` | `placeholder:text-muted-foreground` |
| Cards / Tables | shadcn `Card`, `DataCard`, `DataTable` | Über Surface + Foreground-Tokens |
| Hardcode-Suche | Feature-Code (`text-gray-*`, `text-slate-*`, `#111827`, …) | Siehe §5 und Anhang A |

**Nicht geändert (bewusst):** Surfaces (`--background`, `--card`, `--sidebar`, L1 premium, body ambient), Dark Mode (`.dark`), Map Liquid Glass (`--map-glass-*`), Brand (`--brand`), alle `--status-*`.

---

## 2. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `frontend/src/styles/theme.css` | Light-Mode Text-Tokens V4.9.197 |
| `frontend/src/styles/THEME_COLOR_CONTRACT.md` | Dokumentation V4.9.197 |
| `frontend/src/rental/components/invoices/invoiceTheme.ts` | `text-gray-*` → semantische Klassen |
| `frontend/src/rental/components/handover/HandoverProtocolDialog.tsx` | `textPrimary` / `textMuted` auf Tokens |
| `frontend/src/rental/components/handover/SignaturePad.tsx` | Canvas-Ink + Label/Helper auf Tokens |
| `frontend/src/lib/vehicleMarker.ts` | Marker-Label Light `#171717` |
| `frontend/src/components/MapboxMap.tsx` | Map-Label `text-color` Light `#171717` |

**Git:** `feat(theme): neutralize light mode text colors (V4.9.197)` — rebased onto `main`, deployed as `940eddef`.

---

## 3. Token-Werte vorher → nachher (nur Light Mode)

| Token | Vorher | Nachher | Rolle |
|-------|--------|---------|-------|
| `--foreground` | `#111827` | `#171717` | Primary UI ink |
| `--card-foreground` | `#111827` | `#171717` | Card text |
| `--popover-foreground` | `#111827` | `#171717` | Popover text |
| `--secondary-foreground` | `#111827` | `#171717` | On secondary surfaces |
| `--accent-foreground` | `#111827` | `#171717` | On accent hover surfaces |
| `--sidebar-foreground` | `#111827` | `#171717` | Sidebar primary labels |
| `--sidebar-accent-foreground` | `#111827` | `#171717` | Sidebar hover/active label (non-brand) |
| `--muted-foreground` | `#7C8490` | `#737373` | Secondary / meta / captions |
| `--primary` | `#111827` | `#171717` | Ink for checked controls, tooltips, selection |

**Unverändert:** `--primary-foreground` (`#ffffff`), alle Surface-Tokens, Brand, Status, Map-Glass, Dark Mode.

---

## 4. Entscheidung zu `--primary`

**Geändert auf `#171717`.**

| Verwendung | Begründung |
|------------|------------|
| Tooltip-Hintergrund (`bg-primary`) | Dunkler Ink-Fill, nicht Brand |
| Switch / Checkbox checked | UI-Chrome, nicht CTA |
| Progress / Slider fill | Neutraler Fortschrittsbalken |
| Input `selection:bg-primary` | Textmarkierung |

**Brand Blue** bleibt über `--brand`, `sq-3d-btn--primary`, `text-brand`, `bg-brand` — nicht über `--primary`.

---

## 5. Hardcodes — Audit und Behandlung

### 5.1 Ziel der Suche

Aktive Light-Mode UI-Textfarben außerhalb des Token-Systems:

- Hex: `#111827`, `#1F2937`, `#374151`, `#4B5563`, `#6B7280`, `#7C8490`
- Tailwind: `text-slate-*`, `text-gray-*`, `text-zinc-*`, `text-neutral-*`

**Regel:** Allgemeine UI-Typografie → `text-foreground` / `text-muted-foreground`. Semantische/fachliche Farben → beibehalten. Keine pauschale Search-and-Replace-Aktion.

### 5.2 Migriert (in diesem Pass)

| Treffer | Datei | Vorher | Nachher | Begründung |
|---------|-------|--------|---------|------------|
| Invoice primary text | `invoiceTheme.ts` | `text-gray-900` | `text-foreground` | Zentraler Invoice-Theme-Helper |
| Invoice secondary text | `invoiceTheme.ts` | `text-gray-500` | `text-muted-foreground` | Meta/KPI-Begleittext |
| Handover primary | `HandoverProtocolDialog.tsx` | `text-gray-900` | `text-foreground` | Zentrale `textPrimary`-Variable |
| Handover muted | `HandoverProtocolDialog.tsx` | `text-gray-500` | `text-muted-foreground` | Zentrale `textMuted`-Variable |
| Signature canvas ink | `SignaturePad.tsx` | `#111827` | `#171717` | Canvas-Ink = Foreground |
| Signature label | `SignaturePad.tsx` | `text-gray-700` | `text-foreground` | Allgemeine Label-Typografie |
| Signature helper | `SignaturePad.tsx` | `text-gray-500` | `text-muted-foreground` | Helper/Caption |
| Map marker label | `vehicleMarker.ts` | `#111827` | `#171717` | Lesbarkeit auf weißem Marker-Cap |
| Mapbox label layer | `MapboxMap.tsx` | `#111827` | `#171717` | Karten-Overlay-Text (nicht L3 glass fill) |

### 5.3 Bewusst belassen — semantisch / fachlich

| Treffer | Ort | Begründung |
|---------|-----|------------|
| `--status-nodata: #7C8490` | `theme.css` | **Status-Token**, nicht allgemeiner Muted-Text |
| `--status-info: #5B6B7F` | `theme.css` | Semantische Info-Farbe — nicht geändert |
| Alle anderen `--status-*` | `theme.css` | SynqDrive Status-Semantik |
| `--brand`, `--brand-ink`, … | `theme.css` | Brand / Interactive |
| `rgba(17, 24, 39, …)` in Borders/Shadows | `theme.css` | Technische Mischfarben, keine Textrolle |
| Map L3 `--map-glass-*` | `theme.css` | Liquid Glass HUD — außerhalb Text-Pass |
| `text-slate-600` in `IamBadges.tsx` | `UNKNOWN` badge | Semantischer Badge-Ton (gestrichelter unknown state) |
| Purple focus in Voice Assistant | `VoiceOnboardingWizard.tsx`, `VoiceConversationsPanel.tsx` | Legacy Voice-UI-Akzent, nicht allgemeine Typografie |

### 5.4 Bewusst belassen — Legacy / niedrige Priorität (Follow-up)

Breite `isDarkMode ? … : 'text-gray-*'`-Patterns in Feature-Views. Token-Cutover deckt **tokenbasierte** UI ab; diese Dateien umgehen das System noch teilweise.

**Repo-Stand nach Deploy (2026-08-24):**

- **~45 Dateien** mit `text-gray-*` / `text-slate-*` / `text-zinc-*` / `text-neutral-*` (siehe Anhang A)
- **~33 Dateien** mit `text-gray-900|800|700` oder `#111827` in TSX (teilweise Überlappung)

| Cluster | Beispiel-Dateien | Warum nicht migriert |
|---------|------------------|----------------------|
| Changelog / Architektur | `ChangesView.tsx`, `ArchitekturView.tsx` | Historische UI + Doku-Strings |
| Voice Assistant | `VoiceConversationsPanel.tsx`, `VoiceOnboardingWizard.tsx` | Eigene Purple/Gray-Legacy-Palette |
| Document Intake | `DocumentArchivePanel.tsx`, `DocumentEntityReview.tsx`, … | Dichte Legacy `isDarkMode`-Ternaries |
| AI / Fleet Chat | `AIAssistantView.tsx`, `FleetChat*.tsx`, `safe-markdown.tsx` | Chat-spezifische Markdown/Table-Farben |
| Master Admin Tools | `HealthTrackingView.tsx`, `VehicleRegistrationModal.tsx`, … | Große Legacy-Views, hohes Diff-Risiko |
| Handover (Rest) | `HandoverProtocolDialog.tsx` (teilweise) | Zentrale Vars migriert; Inline `text-gray-*` in Buttons/Rows noch offen |
| SignaturePad (Rest) | `SignaturePad.tsx` (teilweise) | Button-Chrome `text-gray-400/500` noch Legacy |

**Empfohlene Follow-up-Migration (separater Pass):**

1. Pro Cluster eine Datei → `text-foreground` / `text-muted-foreground` statt `text-gray-*` im Light-Zweig
2. Keine neuen Hex-Hardcodes
3. Status-/Brand-/Map-Semantik pro Treffer prüfen

### 5.5 Verbleibende aktive Hex-Treffer (post-patch)

| Hex | Datei | Bewertung |
|-----|-------|-----------|
| `#171717` | `theme.css`, `vehicleMarker.ts`, `MapboxMap.tsx`, `SignaturePad.tsx` | **Erlaubt** — aligned mit `--foreground` |
| `#7C8490` | `theme.css` (`--status-nodata` only) | **Erlaubt** — Status-Semantik |
| `#111827` | `ArchitekturView.tsx` (Changelog-String) | **Erlaubt** — historische Referenz |

Keine aktiven Light-Mode Canvas/Card/Sidebar- oder Primary-Text-Umgehungen mehr über `#111827` in Feature-Styles.

---

## 6. Bewusst unveränderte semantische Farben

| Kategorie | Tokens / Elemente |
|-----------|-------------------|
| Brand | `--brand` `#4F86E8`, `--brand-hover`, `--brand-active`, `--brand-soft`, `--brand-glow`, `--brand-ink` |
| Status | `--status-positive`, `--status-attention`, `--status-watch`, `--status-warning`, `--status-critical`, `--status-info`, `--status-nodata`, `--status-ai` (+ soft variants) |
| Surfaces | `--background`, `--card`, `--sidebar`, L1 premium, body ambient |
| Map | `--map-glass-*`, `.surface-liquid`, Liquid Glass HUD |
| Dark Mode | Gesamter `.dark { … }` Block |
| Interactive Brand | Active nav, focus rings, links, selected tabs, CTA highlights |

---

## 7. Build / Test / Deploy

| Check | Ergebnis |
|-------|----------|
| `npm run build` | ✅ Erfolgreich |
| `npm run check:surface` | ✅ Erfolgreich |
| Push `origin/main` | ✅ `940eddef` |
| Production deploy | ✅ `20260824155357_v4994` |
| Health | ✅ `https://app.synqdrive.eu/api/v1/health` |

---

## 8. Visuell geprüfte Screens

| Screen / Route | Ergebnis |
|----------------|----------|
| `/login` (Light) | Primary `rgb(23,23,23)` = `#171717`, Muted `rgb(115,115,115)` = `#737373` |
| Dark Mode Toggle | ✅ Keine Regression |
| Rental Dashboard, Sidebar, Tables, Settings, Master Admin | Token-Vererbung — nicht einzeln manuell auditiert |

**Live-Test:** Hard-Refresh (`Ctrl+Shift+R`) empfohlen nach Deploy.

---

## 9. Verbleibende Inkonsistenzen

### 9.1 Legacy `text-gray-*` in Feature-Code

**~45 Dateien** nutzen noch Tailwind Gray/Slate/Neutral-Klassen in Light-Mode-Zweigen. Die zentrale Token-Schicht ist korrekt; einzelne Views können lokal noch leicht slate-wirken, bis sie migriert sind.

**Höchste Trefferzahl (Follow-up-Kandidaten):**

| Datei | `text-gray/slate/…` Treffer (rg count) |
|-------|----------------------------------------|
| `HealthTrackingView.tsx` | 86 |
| `PartsAccessoriesView.tsx` | 54 |
| `VehicleRegistrationModal.tsx` | 48 |
| `StatInlineDetail.tsx` | 37 |
| `TripDetectionLogicView.tsx` | 32 |
| `AIAssistantView.tsx` | 29 |
| `DocumentUploadView.tsx` | 26 |
| `PerformanceLogicView.tsx` | 22 |
| `BusinessInsightsBox.tsx` | 21 |
| `WorkflowAutomationView.tsx` | 19 |
| `DocumentArchivePanel.tsx` | 18 |
| `ChangesView.tsx` | 18 |

### 9.2 `--status-nodata` vs. `--muted-foreground`

| Token | Wert | Rolle |
|-------|------|-------|
| `--muted-foreground` | `#737373` | Allgemeiner Secondary-/Meta-Text |
| `--status-nodata` | `#7C8490` | Semantisch „keine Daten / disabled“ |

Visuell können NoData-Chips leicht bläulicher wirken als Meta-Text — **beabsichtigt** (Status ≠ Typography).

### 9.3 Teilweise migrierte Komponenten

| Komponente | Stand |
|------------|-------|
| `HandoverProtocolDialog.tsx` | `textPrimary`/`textMuted` migriert; einzelne Inline-Buttons/Rows noch `text-gray-*` |
| `SignaturePad.tsx` | Ink + Label/Helper migriert; Tool-Button-Chrome noch Legacy Gray |
| `invoiceTheme.ts` | Text migriert; `card` Light noch `bg-white border-gray-200` (Surface, nicht Text) |

### 9.4 Kein separater Subtle-Text-Token

Besonders dezente Rollen nutzen weiterhin Opacity/Mix auf `--muted-foreground` (z. B. Tab-Bar inactive, Placeholder via `placeholder:text-muted-foreground`). Kein neuer Token `#8A8A8A` / `#A3A3A3` eingeführt — bestehendes System reicht.

### 9.5 Authentifizierte Screens

Vollständige visuelle Abnahme aller 10 geforderten Rental/Master-Routes nicht einzeln dokumentiert. Token-basierte Shell, Sidebar, Cards, Inputs und Patterns erben zentral.

---

## 10. Acceptance Criteria — Erfüllung

| # | Kriterium | Status |
|---|-----------|--------|
| 1 | Light-Mode Primary Text zentral `#171717` | ✅ |
| 2 | Secondary/Muted zentral `#737373` | ✅ |
| 3 | Sidebar Foreground neutralisiert | ✅ |
| 4 | Cards, Headers, Tabellen über Tokens (wenn tokenbasiert) | ✅ |
| 5 | Keine unnötigen Hex-Hardcodes hinzugefügt | ✅ |
| 6 | Bestehende Hardcodes teilweise auf Tokens migriert | ⚠️ Teilweise — siehe §5.4 |
| 7 | Brand Blue unverändert | ✅ |
| 8 | Statusfarben unverändert | ✅ |
| 9 | Map/Telemetry-Semantik unverändert | ✅ |
| 10 | Dark Mode unverändert | ✅ |
| 11 | Theme-Dokumentation aktualisiert | ✅ |
| 12 | Build erfolgreich | ✅ |
| 13 | Keine offensichtlichen Kontrast-Regressionen (Login-Smoke) | ✅ |

---

## Anhang A — Dateien mit Legacy Text-Klassen (Follow-up)

Stand: `rg 'text-gray-|text-slate-|text-zinc-|text-neutral-' frontend/src --glob '*.{ts,tsx}'`

```
frontend/src/master/components/ChangesView.tsx
frontend/src/master/components/ExteriorImagesEditor.tsx
frontend/src/master/components/HealthTrackingView.tsx
frontend/src/master/components/HighMobilityCompatibilityView.tsx
frontend/src/master/components/HighMobilityDataView.tsx
frontend/src/master/components/InsurancesAdminView.tsx
frontend/src/master/components/PerformanceLogicView.tsx
frontend/src/master/components/PlatformEmailSettingsPanel.tsx
frontend/src/master/components/TripDetectionLogicView.tsx
frontend/src/master/components/VehicleLogbookView.tsx
frontend/src/master/components/VehicleRegistrationModal.tsx
frontend/src/rental/components/AIAssistantView.tsx
frontend/src/rental/components/BatteryConditionBars.tsx
frontend/src/rental/components/BookingDocumentsSection.tsx
frontend/src/rental/components/BusinessInsightsBox.tsx
frontend/src/rental/components/DocumentUploadView.tsx
frontend/src/rental/components/EntityTasksSection.tsx
frontend/src/rental/components/FinesView.tsx
frontend/src/rental/components/FleetConditionDetailView.tsx
frontend/src/rental/components/HelpCenterView.tsx
frontend/src/rental/components/HomeAwayBadge.tsx
frontend/src/rental/components/PartsAccessoriesView.tsx
frontend/src/rental/components/StatInlineDetail.tsx
frontend/src/rental/components/WorkflowAutomationView.tsx
frontend/src/rental/components/ai-chat/FleetChatCompactSummaryCard.tsx
frontend/src/rental/components/ai-chat/FleetChatResponseMetadata.tsx
frontend/src/rental/components/ai-chat/FleetChatStructuredContent.tsx
frontend/src/rental/components/ai-chat/FleetChatTechnicalErrorDetails.tsx
frontend/src/rental/components/documents/DocumentArchivePanel.tsx
frontend/src/rental/components/documents/DocumentClassificationResultPanel.tsx
frontend/src/rental/components/documents/DocumentEntityReview.tsx
frontend/src/rental/components/documents/DocumentExtractionFlowStatus.tsx
frontend/src/rental/components/documents/DocumentIntakeProcessingSteps.tsx
frontend/src/rental/components/documents/DocumentIntakeUploadZone.tsx
frontend/src/rental/components/documents/DocumentReviewInboxPanel.tsx
frontend/src/rental/components/handover/HandoverProtocolDialog.tsx
frontend/src/rental/components/handover/SignaturePad.tsx
frontend/src/rental/components/invoices/CreateInvoiceDialog.tsx
frontend/src/rental/components/invoices/InvoiceFilters.tsx
frontend/src/rental/components/price-tariffs/TariffGroupDrawer.tsx
frontend/src/rental/components/settings/email/EmailVersandTab.tsx
frontend/src/rental/components/users-roles/IamBadges.tsx
frontend/src/rental/components/voice-assistant/VoiceConversationsPanel.tsx
frontend/src/rental/components/voice-assistant/VoiceOnboardingWizard.tsx
frontend/src/rental/lib/ai-chat/safe-markdown.tsx
```

---

## Anhang B — Verwandte Releases

| Release | Commit | Inhalt |
|---------|--------|--------|
| V4.9.196 | `3964210b` | Surface cutover: `#F6F6F6` canvas, white cards/sidebar, flat L1 |
| V4.9.197 | `940eddef` | Text neutralization: `#171717` ink, `#737373` muted |

---

## Change policy

Bei Follow-up-Migrationen:

1. Nur **Text-Typografie** migrieren — keine Surface-/Layout-Passes mischen.
2. `text-foreground` / `text-muted-foreground` bevorzugen — keine neuen Hex-Werte in Feature-Code.
3. Status-, Brand- und Map-Semantik pro Treffer prüfen.
4. Dieses Dokument und `THEME_COLOR_CONTRACT.md` bei Abschluss eines Clusters aktualisieren.
