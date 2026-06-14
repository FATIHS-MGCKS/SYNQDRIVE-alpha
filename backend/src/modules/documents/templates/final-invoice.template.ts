import { RenderableDocument, RenderSection, RenderTotalRow } from '../renderers/render-model';
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
  sellerParty,
  vehicleLabel,
} from './template-helpers';

export interface FinalInvoiceLineItem {
  description: string;
  totalCents: number;
}

export interface FinalInvoiceContext {
  org: OrgInfo;
  customer: CustomerInfo;
  vehicle: VehicleInfo;
  booking: BookingInfo;
  documentNumber?: string | null;
  originalInvoiceRef?: string | null;
  currency: string;
  pickupOdometerKm?: number | null;
  returnOdometerKm?: number | null;
  kmIncluded?: number | null;
  kmDriven?: number | null;
  extraKm?: number | null;
  lineItems: FinalInvoiceLineItem[];
  chargesTotalCents: number;
  depositReceivedCents: number;
  retainedCents: number;
  refundCents: number;
  /** Positive = customer still owes; negative = amount to refund to customer. */
  balanceCents: number;
}

/** Final invoice / Schlussrechnung after return. */
export function buildFinalInvoiceDocument(ctx: FinalInvoiceContext): RenderableDocument {
  const cur = ctx.currency;

  const chargeRows = ctx.lineItems.length
    ? ctx.lineItems.map((li) => [li.description, formatMoneyCents(li.totalCents, cur)])
    : [['Keine zusätzlichen Forderungen nach Rückgabe', formatMoneyCents(0, cur)]];

  const totals: RenderTotalRow[] = [
    { label: 'Zusätzliche Forderungen', value: formatMoneyCents(ctx.chargesTotalCents, cur) },
    { label: 'Erhaltene Kaution', value: formatMoneyCents(ctx.depositReceivedCents, cur) },
    { label: 'Einbehaltene Kaution', value: formatMoneyCents(ctx.retainedCents, cur) },
    { label: 'Erstattung Kaution', value: formatMoneyCents(ctx.refundCents, cur) },
  ];
  if (ctx.balanceCents >= 0) {
    totals.push({ label: 'Noch zu zahlen', value: formatMoneyCents(ctx.balanceCents, cur), emphasize: true });
  } else {
    totals.push({ label: 'Zu erstatten', value: formatMoneyCents(Math.abs(ctx.balanceCents), cur), emphasize: true });
  }

  const sections: RenderSection[] = [
    {
      kind: 'table',
      heading: 'Abrechnung nach Rückgabe',
      columns: [
        { header: 'Position', width: 4 },
        { header: 'Betrag', width: 1.4, align: 'right' },
      ],
      rows: chargeRows,
    },
    { kind: 'totals', rows: totals },
    {
      kind: 'note',
      text:
        'Endabrechnung auf Basis der zum Zeitpunkt der Rückgabe verfügbaren Daten. Nicht modellierte Positionen (z. B. Kraftstoff-/Ladeausgleich, Reinigungs- oder Schadenspauschalen) werden mit 0 ausgewiesen, sofern nicht erfasst.',
    },
  ];

  return {
    documentTitle: 'Schlussrechnung',
    documentNumber: ctx.documentNumber ?? null,
    documentDate: formatDate(new Date()),
    org: orgToRenderable(ctx.org),
    parties: [sellerParty(ctx.org), customerParty(ctx.customer, 'Rechnungsempfänger')],
    meta: [
      { label: 'Buchung', value: bookingRef(ctx.booking.id) },
      ...(ctx.originalInvoiceRef ? [{ label: 'Buchungsrechnung', value: ctx.originalInvoiceRef }] : []),
      { label: 'Fahrzeug', value: `${vehicleLabel(ctx.vehicle)}${ctx.vehicle.licensePlate ? ` · ${ctx.vehicle.licensePlate}` : ''}` },
      { label: 'Mietzeitraum', value: `${formatDate(ctx.booking.startDate)} – ${formatDate(ctx.booking.endDate)}` },
      { label: 'km (Abholung → Rückgabe)', value: `${ctx.pickupOdometerKm ?? '—'} → ${ctx.returnOdometerKm ?? '—'}` },
      { label: 'Inkl. / gefahren / mehr', value: `${ctx.kmIncluded ?? '—'} / ${ctx.kmDriven ?? '—'} / ${ctx.extraKm ?? 0} km` },
    ],
    sections,
    footerLines: defaultFooter(ctx.org),
  };
}
