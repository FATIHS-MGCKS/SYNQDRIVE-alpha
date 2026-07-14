# Invoice Detail Header (V4.9.458)

## Scope

Header-only redesign of the rental invoice detail page. Detail cards below the header are unchanged.

## DTO: `InvoiceDetailDto`

Built client-side via `buildInvoiceDetailDto(invoice, { canManageEmail })` from the org-scoped invoice GET payload. Single source for the header — no parallel field derivation in JSX.

| Section | Contents |
|---------|----------|
| `core` | Display number, type label, status label, dates (raw + formatted) |
| `amounts` | Total / paid / outstanding (cents + `de-DE` formatted) |
| `document` | PDF availability, `generatedDocumentId`, booking anchor for regen |
| `permissions` | Email admin gate, finance gate |
| `actions` | Full matrix with `allowed` + `reason` |
| `primary` | `viewPdf`, `generatePdf`, `sendEmail` gates |

## Header UI

- **Meta row**: invoice number, type chip, `StatusChip` (design-system tones)
- **Amount grid**: Gesamtbetrag, Bezahlt, Offen, Fälligkeit (2×2 mobile, 4-col sm+)
- **Date line**: Rechnungsdatum (localized)
- **Primary actions**: PDF ansehen | PDF erzeugen, E-Mail senden, Mehr (DropdownMenu)
- **More menu**: Ausstellen (draft), PDF neu erzeugen, externer Versand, Zahlung, Bearbeiten, Stornieren (disabled), interne ID kopieren

Disabled actions render a visible `reason` line under the button (not title-only).

## Removed

- `SupportContextButton` and all invoice support context wiring in the detail header

## Responsive

`resolveInvoiceHeaderLayoutMode(width)` — compact (&lt;375), comfortable (&lt;768), desktop. Tested at 320, 375, 390, 1280 in `invoiceDetail.mapper.test.ts`.

## PDF actions

- **View**: `api.documents.open` or attachment URL
- **Generate / regenerate**: `api.documents.regenerate(..., 'BOOKING_INVOICE')` when booking-linked outgoing invoice
