# Invoice Frontend E2E & Responsive Acceptance (V4.9.469)

## Scope

Vollständige Playwright-Abnahme für **Rechnungsübersicht** und **Rechnungsdetail** im bestehenden E2E-Framework (`frontend/e2e/playwright.config.ts`).

## Testdateien

| Datei | Inhalt |
|-------|--------|
| `frontend/e2e/invoice-fixtures.ts` | Stateful API-Mocks, Navigation, Assertions, Screenshot-Helper |
| `frontend/e2e/invoices-flow.spec.ts` | 24 funktionale Flows (Happy Path + Edge Cases) |
| `frontend/e2e/invoices-responsive.spec.ts` | Responsive Layout, Themes, A11y, Overflow |

## Abgedeckte Flows (1–24)

1. Rechnungsübersicht öffnen  
2. Suche Rechnungsnummer  
3. Suche Kunde  
4. Suche Kennzeichen  
5. Statusfilter  
6. Dokumentfilter  
7. Rechnung öffnen  
8. Kunde öffnen  
9. Buchung öffnen  
10. Fahrzeug öffnen  
11. PDF erzeugen  
12. PDF-Status (Polling GENERATING → ACTIVE)  
13. PDF-Vorschau (Popup)  
14. E-Mail senden  
15. Versandhistorie  
16. Fehlversand erneut senden  
17. Externen Versand erfassen  
18. Teilzahlung  
19. Restzahlung  
20. Status PAID  
21. Timeline (Herkunft & Audit)  
22. Rechnung ohne `bookingId` — Senden deaktiviert mit Begründung  
23. Fehlende Kunden-E-Mail — Dialog mit leerem Empfänger, Senden deaktiviert  
24. Dokumentfehler — Fehlermeldung + „Erneut versuchen“

## Responsive Projekte

Playwright-Projects: `mobile-320`, `mobile-375`, `mobile-390`, `mobile-430`, `tablet-768`, `desktop-1280`.

Prüfungen:

- Kein horizontaler Overflow (`assertNoHorizontalOverflow`)
- Keine sichtbaren UUIDs / technischen Enums
- Dark/Light Theme (Listenansicht)
- Tastaturfokus, `aria-label` auf Hauptaktionen
- Mobile Cards vs. Desktop-Tabelle

## Stabile Selektoren (UI)

| Selektor | Komponente |
|----------|------------|
| `data-testid="invoice-list"` | `InvoiceList` |
| `data-testid="invoice-list-item-{number}"` | `DataTable` / `InvoiceListMobileCards` |
| `data-testid="invoice-detail"` | `InvoiceDetail` |
| `data-testid="invoice-relations-primary"` | `InvoiceRelations` |
| `data-testid="invoice-documents-section"` | `InvoiceDocuments` |
| `data-testid="invoice-payments-section"` | `InvoicePayments` |
| `aria-label` auf Header-/Zahlungsaktionen | `InvoiceHeaderActionButton`, `InvoicePayments` |

## Mock-Architektur

- Org: `org-invoice-e2e`, User mit `fleet.read` + `ORG_ADMIN` für E-Mail-Berechtigung
- Stateful Store: Rechnungen, Dokument-Panels, Timeline, Generierungs-Polling (2× GET → ACTIVE)
- Catch-all `route.continue()` für nicht gemockte Endpunkte (Dashboard-Crash-Vermeidung)
- Edge-Invoice `2026-0150`: Panel `sendEmail` deaktiviert ohne Buchung

## Screenshots / Artefakte

Nach Lauf unter `frontend/e2e/artifacts/invoices/`:

- `invoices-list-mobile-375-light.png` / `-dark.png`
- `invoices-list-desktop-1280-light.png` / `-dark.png`
- `invoices-detail-mobile-375.png`
- `invoices-detail-desktop-1280.png`

Zusätzlich Playwright-Attachments pro Testlauf.

## Ausführung

```bash
cd frontend
npm run build                    # inkl. tsc
npm test -- src/rental/components/invoices
npx playwright test -c e2e/playwright.config.ts e2e/invoices-flow.spec.ts e2e/invoices-responsive.spec.ts
```
