# Legal Documents — Accessibility Audit (Prompt 27/32)

**Date:** 2026-07-22

## Scope

WCAG-oriented accessibility for **Verwaltung → Administration tab bar** and **Kunden-Rechtstexte** (upload wizard, lifecycle dialogs, version history, detail drawer).

## Gefundene Probleme (vor Fix)

| Bereich | Problem |
|---------|---------|
| Administration tabs | Kein `aria-controls`, kein `role="tabpanel"`, keine Pfeiltasten-/Home/End-Navigation, kein roving `tabIndex` |
| Kategorie-Karten | `div`-Klick ohne Tastatur-Fokus |
| Versionshistorie | Icon-Buttons nur mit `title`, kein `aria-label`; Custom-Dropdown ohne Escape/Focus-Trap |
| Upload-Wizard | Feldfehler ohne `aria-describedby`; keine Error Summary |
| Lifecycle-Dialoge | Feldfehler ohne `aria-describedby`; keine Error Summary |
| PDF-Vorschau | iframe nicht per Tastatur fokussierbar |
| Dialog-Schließen | Englisches `aria-label="Close"` |

## Behobene Probleme

### Tabnavigation (Administration)
- `useRovingTablist` — Pfeiltasten, Home, End, Enter/Leertaste (manuelle Aktivierung), roving `tabIndex`
- `AdministrationTabBar` — `aria-controls`, stabile Tab-IDs, `min-h-11`, `focus-visible`, `motion-reduce`
- `AdministrationTabPanel` — `role="tabpanel"`, `aria-labelledby`, fokussierbares Panel
- `SettingsView` — alle Admin-Inhalte in Tabpanels gewrappt

### Kunden-Rechtstexte
- `LegalDocumentsTab` — `<section aria-labelledby>` + Hauptüberschrift-ID
- `DataCard` — interaktive Karten als `role="button"` mit Enter/Space
- `DataTable` — optional `ariaSort` auf `<th scope="col">` für sortierbare Spalten
- `LegalDocumentTypeVersionHistory` — Radix `DropdownMenu`, `aria-label` auf Icon-Buttons, `aria-sort` auf Spaltenköpfen, `aria-busy` beim Laden
- `legal-form-a11y` — `FormErrorSummary`, `aria-describedby` auf Feldern, `LiveStatusMessage` für Upload
- Lifecycle-Dialog — Error Summary + Feld-Aria
- Detail-Drawer — PDF-iframe `tabIndex={0}`, beschreibender `title`

## Verbleibende Einschränkungen

| Thema | Einschränkung |
|-------|----------------|
| PDF-Inhalt | Eingebettete PDF-Reader-Barrierefreiheit hängt vom Browser-Plugin ab; nur Container ist fokussierbar |
| Vollständige i18n | Einige SR-only-Strings noch Deutsch-hardcoded (Administrationskontext DE) |
| Axe E2E | Mock-API-Setup deckt nicht alle Unterdialoge ab; manuelle Prüfung für komplexe Lifecycle-Flows empfohlen |

## Automatisierte Tests

### Vitest (statisch + Hook)

```
src/hooks/useRovingTablist.test.ts
src/rental/components/settings/administration-a11y.ui.test.tsx
src/rental/lib/legal-documents-a11y.ui.test.ts
```

### Playwright + Axe

```
e2e/legal-documents-a11y.spec.ts
e2e/legal-documents-a11y-fixtures.ts
```

Abdeckung: Tablist/Tabpanel, Axe (critical/serious), Escape im Wizard, Overflow 320px, Mobile-Listen-Markup.

```bash
cd frontend && npm test -- useRovingTablist administration-a11y legal-documents-a11y
cd frontend && npx playwright test -c e2e/playwright.config.ts legal-documents-a11y.spec.ts --project=desktop-1280
```

## Manuelle Tastaturnavigation (2026-07-22)

| Schritt | Erwartung | Ergebnis |
|---------|-----------|----------|
| Tab → Administration Tableiste | Fokus sichtbar auf erstem Tab (`tabIndex=0` nur aktiv) | OK |
| Pfeil links/rechts | Fokus wandert, Panel wechselt erst bei Enter/Space | OK |
| Home / End | Erster / letzter Tab fokussiert | OK |
| Enter auf „Kunden-Rechtstexte“ | Panel `#admin-panel-legal-documents` sichtbar | OK |
| Tab durch Seite | Kategorie-Karte per Enter aktivierbar | OK |
| „Neue Version“ → Wizard | Fokus im Dialog gefangen, Escape schließt | OK |
| Validierung „Weiter“ ohne Pflichtfelder | Error Summary + `role="alert"` an Feldern | OK |
| Versionshistorie → Aktionen | Dropdown per Tastatur, Escape schließt | OK |
| Detail-Drawer → PDF | iframe per Tab erreichbar | OK |

## Testergebnisse

```
frontend: useRovingTablist.test.ts — 2 passed
frontend: administration-a11y.ui.test.tsx — 2 passed
frontend: legal-documents-a11y.ui.test.ts — 6 passed (inkl. aria-sort, aria-busy)
```

Playwright/Axe: `e2e/legal-documents-a11y.spec.ts` (requires dev server on :5173).
