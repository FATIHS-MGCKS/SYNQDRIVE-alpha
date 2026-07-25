# Operator App — Accessibility Audit (Prompt 33)

**Date:** 2026-07-25

## Scope

WCAG-oriented accessibility for the **Operator WebApp** (`/operator/*`): shell, navigation, connectivity/sync status, full-screen sheets/dialogs (booking, tasks, handover, damage, tire measure, AI upload, pickup verification), signature capture, scan/search, and form fields.

## Gefundene Probleme (vor Fix)

| Bereich | Problem |
|---------|---------|
| Shell | Kein Skip-Link; `<main>` ohne stabile ID/Fokusziel |
| Navigation | Bottom-Nav ohne `aria-label` / `aria-current`; fehlende sichtbare Fokus-Ringe |
| Dialoge/Sheets | `role="dialog"` ohne Fokusfalle, Escape oder Fokus-Rückgabe |
| Dialoge/Sheets | `aria-labelledby` nicht mit sichtbarer Überschrift verknüpft |
| Handover/Damage/Tire | Fortschrittsbalken ohne `role="progressbar"` / `aria-valuenow` |
| Formulare | Pflichtfelder/Fehler ohne `aria-describedby` / `aria-invalid` |
| Toggle-Zeilen | Klickbare Zeilen ohne `aria-pressed` |
| GlassCard | Klickbare Karten als `div role="button"` statt `<button>` |
| Connectivity | Offline-Banner ohne Live-Region |
| Sync-Header | Sync-Status nur visuell, kein SR-Update |
| Fehler/Upload | Fehlermeldungen ohne `role="alert"`; Upload-Busy ohne `aria-live` |
| Signaturfeld | Canvas ohne Label/`aria-describedby`; Modus-Umschalter ohne `aria-pressed` |
| Suche | Scan-/Fahrzeug-Suche teils ohne Label |
| Fokus | Inkonsistente `focus-visible`-Ringe auf Icon-Buttons |

## Behobene Probleme

### Shell & Navigation
- Skip-Link „Zum Inhalt springen“ → `#operator-main-content`
- `OperatorHeader`: beschreibendes `aria-label` auf Refresh, `aria-live` für Sync-Text
- `OperatorBottomNav`: `aria-label` pro Tab, `aria-current="page"`, Touch Targets ≥52px, `motion-reduce`
- `OperatorConnectivityBanner`: `role="status"` + `aria-live="polite"`

### Dialog-Infrastruktur
- `operatorA11y.ts` — Fokus-Utilities (`getFocusableElements`, `trapTabKey`, `focusFirstElement`)
- `useOperatorDialogA11y` — Escape, Tab-Falle, Fokus-Rückgabe, `aria-modal`
- `OperatorFullScreenDialog` — gemeinsame Fullscreen-Dialog-Hülle mit Title-Context
- Alle Operator-Fullscreen-Flows angebunden: Handover, Damage, Tire, AI Upload, Booking/Task/Detail/Pickup-Sheets

### Formulare & Inhalte
- `OperatorHandoverField` — `aria-describedby`, `aria-invalid`, Fehler als `role="alert"`
- `OperatorToggleRow` — `aria-pressed` + beschreibendes `aria-label`
- `OperatorGlassCard` — interaktive Karten als `<button>`
- `OperatorScanView` / `OperatorVehiclesView` — beschriftete Suchfelder
- `SignaturePad` — Canvas-Label, Modus `aria-pressed`, Löschen-Button `aria-label`, Hilfetext per `aria-describedby`
- Handover-Signaturen — Tablist `role="tab"` / `aria-selected`

### Status & Fehler
- Schritt-/Submit-Fehler in Wizard-Flows als `role="alert"`
- AI-Upload Busy-State: `role="status"`, `aria-live="polite"`, `aria-busy`
- Booking-Detail-Laden: `role="status"` + SR-only Text

## Verbleibende Einschränkungen

| Thema | Einschränkung |
|-------|----------------|
| Farbkontrast | StatusChips/Badges über Design-Tokens — vollständiger Kontrast-Scan in Axe deaktiviert (wie andere Module) |
| Signatur-Canvas | Gezeichnete Pixel nicht als Text lesbar; Label + Hilfetext + Name-Fallback vorhanden |
| Kamera-Dialoge | Native `<input capture>` — OS-UI außerhalb Web-A11y-Kontrolle |
| TalkBack / VoiceOver | Vollständige Gesten-/Rotor-Prüfung nur manuell (siehe unten) |
| Axe E2E | Mock-Setup deckt Shell/Heute/Scan ab; komplexe Sheets nur teilweise automatisiert |

## Automatisierte Tests

### Vitest

```
src/operator/lib/operatorA11y.test.ts
src/operator/operator-a11y.ui.test.tsx
```

### Playwright + Axe

```
e2e/operator-a11y.spec.ts
e2e/operator-a11y-fixtures.ts
```

Ausführen:

```bash
cd frontend && npm test -- operatorA11y operator-a11y
cd frontend && npx playwright test -c e2e/playwright.config.ts operator-a11y.spec.ts --project=desktop-1280
```

## Manuelle Testfälle

### iOS VoiceOver

1. **Skip-Link:** Rotor „Links“ → „Zum Inhalt springen“ aktivieren → Fokus landet im Hauptinhalt.
2. **Bottom-Nav:** Jeder Tab wird mit Label vorgelesen; aktiver Tab als „ausgewählt“/current page.
3. **Handover-Wizard:** Fortschritt wird als „Fortschritt Schritt X von Y“ angekündigt; Schrittfehler als Alert.
4. **Signatur:** Modus „Zeichnen/Tippen“ per `aria-pressed`; Canvas mit Label; Löschen-Button beschriftet.
5. **Offline-Banner:** Bei Flugmodus erscheint Statusmeldung ohne Fokus zu stehlen.
6. **Dialog schließen:** Escape oder Schließen-Button → Fokus kehrt zum Auslöser zurück.

### Android TalkBack

1. **Scan-Suche:** Suchfeld mit sichtbarem Label (SR-only) fokussierbar; Ergebnisliste navigierbar.
2. **Booking-Detail-Sheet:** Dialog-Titel = Fahrzeug · Kennzeichen; Schließen-Button erreichbar.
3. **AI Upload:** Status-Chip-Text wird bei Flow-Wechsel vorgelesen (`aria-live`).
4. **Pickup-Prüfung:** Checkboxen mit zugehörigem Label; Notizen-Feld beschriftet.
5. **Touch Targets:** Bottom-Nav und primäre CTAs ≥44px — keine überlappenden Hit-Areas.

### Tastatur (Desktop-Notfallzugriff)

1. Tab-Reihenfolge: Header → Inhalt → Bottom-Nav (Skip-Link zuerst bei Shift+Tab vom Inhalt).
2. Vollbild-Sheet: Tab bleibt im Dialog; Shift+Tab am Anfang springt zum Ende.
3. Escape schließt Sheets/Handover und stellt Fokus wieder her.
4. Sichtbarer Fokusring auf allen interaktiven Elementen (`focus-visible`).

### Reduzierte Bewegung / Große Schrift

1. Mit `prefers-reduced-motion`: keine Spinner-Animation (`motion-safe:animate-spin`).
2. Mit erhöhter Systemschrift: Layout bricht nicht (320px E2E-Overflow-Test).

## Architektur-Bezug

- Shared utilities: `frontend/src/operator/lib/operatorA11y.ts`
- Dialog hook: `frontend/src/operator/hooks/useOperatorDialogA11y.ts`
- Shell entry: `OperatorShell.tsx`
