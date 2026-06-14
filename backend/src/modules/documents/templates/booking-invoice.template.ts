import { RenderableDocument, RenderSection } from '../renderers/render-model';
import {
  BookingInfo,
  CustomerInfo,
  OrgInfo,
  VehicleInfo,
  bookingRef,
  customerParty,
  defaultFooter,
  formatDate,
  formatMoneyCents,
  orgToRenderable,
  rentalDays,
  sellerParty,
  vehicleLabel,
} from './template-helpers';

export interface InvoiceLineItem {
  description: string;
  quantity?: number;
  unitPriceCents?: number;
  totalCents: number;
}

export interface BookingInvoiceContext {
  org: OrgInfo;
  customer: CustomerInfo;
  vehicle: VehicleInfo;
  booking: BookingInfo;
  documentNumber?: string | null;
  invoiceNumberLabel?: string | null;
  invoiceDate?: Date | string | null;
  dueDate?: Date | string | null;
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
}

/** Booking invoice (Buchungsrechnung) rendered from the existing OrgInvoice. */
export function buildBookingInvoiceDocument(ctx: BookingInvoiceContext): RenderableDocument {
  const cur = ctx.currency;
  const tableRows = ctx.lineItems.map((li) => [
    li.description,
    String(li.quantity ?? 1),
    formatMoneyCents(li.unitPriceCents ?? li.totalCents, cur),
    formatMoneyCents(li.totalCents, cur),
  ]);

  const sections: RenderSection[] = [
    {
      kind: 'table',
      heading: 'Positionen',
      columns: [
        { header: 'Beschreibung', width: 3 },
        { header: 'Menge', width: 0.8, align: 'right' },
        { header: 'Einzelpreis', width: 1.2, align: 'right' },
        { header: 'Betrag', width: 1.2, align: 'right' },
      ],
      rows: tableRows.length
        ? tableRows
        : [['Mietleistung', '1', formatMoneyCents(ctx.totalCents, cur), formatMoneyCents(ctx.totalCents, cur)]],
    },
    {
      kind: 'totals',
      rows: [
        { label: 'Zwischensumme (netto)', value: formatMoneyCents(ctx.subtotalCents, cur) },
        { label: 'USt. (19%)', value: formatMoneyCents(ctx.taxCents, cur) },
        { label: 'Gesamtbetrag', value: formatMoneyCents(ctx.totalCents, cur), emphasize: true },
      ],
    },
    {
      kind: 'note',
      text: 'Zahlbar gemäß den Zahlungsbedingungen der Buchung. Bitte geben Sie bei Ihrer Zahlung die Rechnungs- bzw. Buchungsnummer an.',
    },
  ];

  return {
    documentTitle: 'Rechnung',
    documentNumber: ctx.documentNumber ?? ctx.invoiceNumberLabel ?? null,
    documentDate: formatDate(ctx.invoiceDate ?? new Date()),
    org: orgToRenderable(ctx.org),
    parties: [sellerParty(ctx.org), customerParty(ctx.customer, 'Rechnungsempfänger')],
    meta: [
      { label: 'Buchung', value: bookingRef(ctx.booking.id) },
      { label: 'Fahrzeug', value: `${vehicleLabel(ctx.vehicle)}${ctx.vehicle.licensePlate ? ` · ${ctx.vehicle.licensePlate}` : ''}` },
      { label: 'Mietzeitraum', value: `${formatDate(ctx.booking.startDate)} – ${formatDate(ctx.booking.endDate)}` },
      { label: 'Mietdauer', value: `${rentalDays(ctx.booking.startDate, ctx.booking.endDate)} Tag(e)` },
      ...(ctx.dueDate ? [{ label: 'Fällig am', value: formatDate(ctx.dueDate) }] : []),
    ],
    sections,
    footerLines: defaultFooter(ctx.org),
  };
}
