# SynqDrive — Light Mode Text Color Neutralization Audit (V4.9.197 + V4.9.198)

> **Status:** V4.9.197 + V4.9.198 deployed  
> **Release (V4.9.197):** `20260824155357_v4994` (`940eddef`)  
> **Release (V4.9.198):** `20260824163904_v4994` (`9dec5ff9`)  
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

### 5.4 ~~Bewusst belassen — Legacy / niedrige Priorität (Follow-up)~~ → Migriert in V4.9.198

Breite `isDarkMode ? … : 'text-gray-*'`-Patterns in Feature-Views wurden in **V4.9.198** systematisch auf `text-foreground` / `text-muted-foreground` migriert (siehe §11).

**Repo-Stand nach V4.9.198 (2026-08-24):**

- **2 Dateien** mit `text-gray-*` / `text-slate-*` / `text-zinc-*` / `text-neutral-*` (siehe Anhang A) — beide bewusst ausgenommen
- **0 aktive** `#111827` / `#1F2937` / `#374151` / `#4B5563` / `#6B7280` / `#7C8490` Hex-Treffer in Feature-TSX (außer erlaubte Ausnahmen, siehe §5.5)

| Cluster | Beispiel-Dateien | V4.9.198 Ergebnis |
|---------|------------------|-------------------|
| Changelog / Architektur | `ChangesView.tsx`, `ArchitekturView.tsx` | UI-Chrome migriert; historische Changelog-Strings unverändert |
| Voice Assistant | `VoiceConversationsPanel.tsx`, `VoiceOnboardingWizard.tsx` | Neutral text → Tokens; Purple-Akzente beibehalten |
| Document Intake | `DocumentArchivePanel.tsx`, `DocumentEntityReview.tsx`, … | Vollständig migriert |
| AI / Fleet Chat | `AIAssistantView.tsx`, `FleetChat*.tsx`, `safe-markdown.tsx` | Migriert; Purple Bullet-Akzent in Markdown beibehalten |
| Master Admin Tools | `HealthTrackingView.tsx`, `VehicleRegistrationModal.tsx`, … | Migriert |
| Handover (Rest) | `HandoverProtocolDialog.tsx`, `SignaturePad.tsx` | Text-Tokens; Surface-Chrome unverändert |

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

### 9.1 ~~Legacy `text-gray-*` in Feature-Code~~ → Resolved in V4.9.198

**Vor V4.9.198:** ~45 Dateien mit Legacy Text-Klassen.

**Nach V4.9.198:** Nur noch **2 bewusste Ausnahmen** (siehe Anhang A):

| Datei | Treffer | Grund |
|-------|---------|-------|
| `ChangesView.tsx` | 2 | Historische Changelog-Strings (`text-gray-*` in Doku-Text, nicht UI) |
| `IamBadges.tsx` | 1 | Semantischer `text-slate-600` für UNKNOWN-Badge |

Alle übrigen Feature-Views nutzen `text-foreground` / `text-muted-foreground` für neutrale Typografie.

### 9.2 `--status-nodata` vs. `--muted-foreground`

| Token | Wert | Rolle |
|-------|------|-------|
| `--muted-foreground` | `#737373` | Allgemeiner Secondary-/Meta-Text |
| `--status-nodata` | `#7C8490` | Semantisch „keine Daten / disabled“ |

Visuell können NoData-Chips leicht bläulicher wirken als Meta-Text — **beabsichtigt** (Status ≠ Typography).

### 9.3 Teilweise migrierte Komponenten

| Komponente | Stand (V4.9.198) |
|------------|------------------|
| `HandoverProtocolDialog.tsx` | ✅ Text-Tokens vollständig; Surface-Chrome (`bg-gray-*`) unverändert (out of scope) |
| `SignaturePad.tsx` | ✅ Ink + Label/Helper + Button-Text auf Tokens |
| `invoiceTheme.ts` | ✅ Text migriert; `card` Light noch `bg-white border-gray-200` (Surface, nicht Text) |

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
| 6 | Bestehende Hardcodes teilweise auf Tokens migriert | ✅ V4.9.198 — 43/45 Dateien migriert |
| 7 | Brand Blue unverändert | ✅ |
| 8 | Statusfarben unverändert | ✅ |
| 9 | Map/Telemetry-Semantik unverändert | ✅ |
| 10 | Dark Mode unverändert | ✅ |
| 11 | Theme-Dokumentation aktualisiert | ✅ |
| 12 | Build erfolgreich | ✅ |
| 13 | Keine offensichtlichen Kontrast-Regressionen (Login-Smoke) | ✅ |

---

## Anhang A — Verbleibende Legacy Text-Klassen (post V4.9.198)

Stand: `rg 'text-gray-|text-slate-|text-zinc-|text-neutral-' frontend/src --glob '*.{ts,tsx}'`

```
frontend/src/master/components/ChangesView.tsx          # 2× historische Changelog-Strings only
frontend/src/rental/components/users-roles/IamBadges.tsx # 1× semantischer UNKNOWN badge
```

**V4.9.198 migrierte Dateien (43):**

```
frontend/src/master/components/ChangesView.tsx                    # UI chrome only
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
frontend/src/rental/components/invoices/invoiceTheme.ts
frontend/src/rental/components/price-tariffs/TariffGroupDrawer.tsx
frontend/src/rental/components/settings/email/EmailVersandTab.tsx
frontend/src/rental/components/voice-assistant/VoiceOnboardingWizard.tsx
frontend/src/rental/lib/ai-chat/safe-markdown.tsx
```

> **Note:** `VoiceConversationsPanel.tsx` was deleted upstream in `5b3c598a` (C13.4 legacy UI removal) before this pass landed — no migration needed.

---

## Anhang B — Verwandte Releases

| Release | Commit | Inhalt |
|---------|--------|--------|
| V4.9.196 | `3964210b` | Surface cutover: `#F6F6F6` canvas, white cards/sidebar, flat L1 — siehe `LIGHT_MODE_SURFACE_CUTOVER_AUDIT.md` |
| V4.9.197 | `940eddef` | Text neutralization: `#171717` ink, `#737373` muted — siehe `LIGHT_MODE_TEXT_NEUTRALIZATION_AUDIT.md` |
| V4.9.198 | `9dec5ff9` | Feature hardcode cleanup: 42 files `text-gray-*` → semantic tokens — siehe §11 |

---

## 11. V4.9.198 — Feature Hardcode Cleanup

### 11.1 Ziel

Systematische Migration der in §5.4 / Anhang A (V4.9.197) dokumentierten Legacy-`text-gray-*` / `text-slate-*` / `text-neutral-*` Klassen in Feature-Code auf semantische Tokens:

- `text-foreground` — Primary UI text
- `text-muted-foreground` — Secondary / meta / captions

**Nicht geändert:** Surfaces, Brand, Status, Map/Telemetry, Dark-Mode-Tokens, historische Changelog-Strings.

### 11.2 Vorgehen

| Schritt | Beschreibung |
|---------|--------------|
| 1 | Bulk-Migration via `frontend/scripts/migrate-text-tokens.py` (44 Dateien) |
| 2 | Ternary-Vereinfachung via `frontend/scripts/simplify-text-ternaries.py` + manuelle Fixes |
| 3 | Build-Fix: unquoted `text-foreground` / `text-muted-foreground` aus fehlerhafter Perl-Pass korrigiert |
| 4 | Manuelle Review: `IamBadges.tsx` (UNKNOWN badge), `ChangesView.tsx` (Changelog-Strings), `safe-markdown.tsx` (Purple accent) |

### 11.3 Ergebnis

| Metrik | Vorher (V4.9.197) | Nachher (V4.9.198) |
|--------|-------------------|---------------------|
| Dateien mit `text-gray/slate/zinc/neutral` | ~45 | **2** (bewusst) |
| Migrierte Feature-Dateien | 6 (V4.9.197) | **+43** |
| Aktive Hex-Hardcodes (`#111827` etc.) in TSX | ~33 Dateien | **0** (außer erlaubte) |
| Redundante `isDarkMode ? 'text-gray-*' : 'text-gray-*'` Ternaries | viele | entfernt / vereinfacht |

### 11.4 Bewusste Ausnahmen (unverändert)

| Item | Datei | Grund |
|------|-------|-------|
| `text-slate-600` UNKNOWN badge | `IamBadges.tsx` | Semantischer Badge-Ton |
| `text-gray-*` in Changelog-Strings | `ChangesView.tsx` | Historische Dokumentation |
| Purple Voice-AI Akzente | `VoiceOnboardingWizard.tsx`, etc. | Domain accent |
| Status colors (`text-red-*`, `text-green-*`, …) | diverse | Semantisch |
| Canvas ink `#171717` | `SignaturePad.tsx` | Canvas API |
| Map label `#171717` | `MapboxMap.tsx`, `vehicleMarker.ts` | Map style spec |
| `--status-nodata` `#7C8490` | `theme.css` | Status token |

### 11.5 Build / Test

| Check | Ergebnis |
|-------|----------|
| `npm run build` | ✅ Erfolgreich |
| `npm run check:surface` | ✅ Erfolgreich |
| Push `origin/main` | ✅ `9dec5ff9` |
| Production deploy | ✅ `20260824163904_v4994` |
| Health | ✅ `https://app.synqdrive.eu/api/v1/health` |
| `npm test -- --run` | ⚠️ 6 pre-existing failures (unrelated to text migration) |

---

## Change policy

Bei Follow-up-Migrationen:

1. Nur **Text-Typografie** migrieren — keine Surface-/Layout-Passes mischen.
2. `text-foreground` / `text-muted-foreground` bevorzugen — keine neuen Hex-Werte in Feature-Code.
3. Status-, Brand- und Map-Semantik pro Treffer prüfen.
4. Dieses Dokument und `THEME_COLOR_CONTRACT.md` bei Abschluss eines Clusters aktualisieren.
