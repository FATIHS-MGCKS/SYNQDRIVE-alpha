# Invoice Detail Timeline (V4.9.461)

## Scope

Rechnungsdetail — kompakter fachlicher Verlauf aus realen Backend-Quellen (kein zweites Auditmodell).

## Datenquellen (bestehend)

| Quelle | Ereignisse |
|--------|------------|
| `OrgInvoice` | erstellt, ausgestellt, extern gesendet, überfällig, storniert, gutgeschrieben, ungültig |
| `OrgInvoicePayment` | Teilzahlung, vollständig bezahlt |
| `GeneratedDocument` (`invoiceId`) | PDF erzeugt, Version ersetzt, Erzeugung fehlgeschlagen |
| `OutboundEmail` + `OutboundEmailEvent` (`invoiceId`) | vorbereitet, SynqDrive-Versand, zugestellt, fehlgeschlagen, Retry nach Fehler |
| `ActivityLog` (`entity=INVOICE` + `metaJson.invoiceId`) | Actor-Anreicherung, Zahlungs-Rückbuchung |

Kein `CustomerTimelineEvent`-Parallelmodell.

## Backend

- **`GET /organizations/:orgId/invoices/:id/timeline`**
- **`InvoiceTimelineService`** lädt Quellen parallel, Org-`timezone` (Fallback `Europe/Berlin`).
- **`invoice-timeline.builder.ts`** — Mapping, Deduplizierung (E-Mail-Flow, Ausstellen+Nummer), Sortierung **neueste zuerst** (`desc`).
- Legacy: `isLegacyReduced=true` wenn keine strukturierten Zahlungen/Dokumente/E-Mails/Activity-Metadaten.

## Frontend

- **`useInvoiceTimeline`** + **`InvoiceTimeline`** (mobil kompakt, einklappbare Details, nicht editierbar).
- **`invoiceTimeline.mapper.ts`** — Zeitformatierung in Org-Zeitzone, keine Roh-Enums/UUIDs in der UI.

## Tests

- `invoice-timeline.builder.spec.ts` — Reihenfolge, Legacy, fehlende Actors, gemischte Events
- `invoiceTimeline.mapper.test.ts`, `InvoiceTimeline.test.tsx`, `useInvoiceTimeline.integration.test.ts`
