# Invoice Detail — Information Hierarchy (V4.9.464)

## Scope

Restructure invoice detail secondary content grouping. No removal of business data.

## Primary order (top → bottom)

1. Header — status, sums, main actions
2. Zuordnung — customer, booking, vehicle, vendor (entity links only)
3. Positionen & Summen
4. Zahlungen
5. Dokumente & Versand

## Secondary (`InvoiceDetailSecondary` accordion)

1. **Weitere Informationen** — Rechnungsbeschreibung (customer-visible hint) + interne Notizen (edit gated by `detail.actions.edit`)
2. **Aufgaben** — compact list; done tasks visually secondary; titles sanitized (no UUID)
3. **Herkunft & Audit** — provenance, copy internal ID (deliberate action), embedded timeline

## Empty-surface reduction

| Before (standalone full cards) | After |
|-------------------------------|--------|
| Zuordnung + Herkunft inline | Zuordnung only |
| Verknüpfte Aufgabe | Accordion „Aufgaben“ |
| Notizen (incl. empty) | Accordion „Weitere Informationen“ |
| Beschreibung | Same accordion |
| Verlauf (2-col with docs) | Embedded in Audit |

**Metric:** 5 standalone secondary surfaces → 1 accordion card (+ slim Zuordnung). **4 large empty/card surfaces removed** on typical invoices; mobile defaults accordion collapsed except desktop auto-open when description/notes exist.

## UX rules

- Internal ID removed from header „Mehr“ menu → only Audit section
- „Bearbeiten“ opens accordion + scrolls to notes when `edit` gate allows
- No oversized „Keine Notizen vorhanden“ block — compact hint or hidden when read-only empty

## Tests

- `invoiceDetailSecondary.mapper.test.ts`
- `InvoiceDetailSecondary.test.tsx`
- `InvoiceRelations.test.tsx` (updated — no provenance in primary card)
