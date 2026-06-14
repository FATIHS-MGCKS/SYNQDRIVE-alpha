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
  formatDateTime,
  formatMoneyCents,
  orgToRenderable,
  sellerParty,
  vehicleLabel,
} from './template-helpers';

const DEPOSIT_STATUS_DE: Record<string, string> = {
  REQUESTED: 'Angefordert',
  RECEIVED: 'Erhalten',
  PARTIALLY_USED: 'Teilweise verwendet',
  REFUNDED: 'Erstattet',
  PARTIALLY_REFUNDED: 'Teilweise erstattet',
  FORFEITED: 'Einbehalten',
};

export interface DepositReceiptContext {
  org: OrgInfo;
  customer: CustomerInfo;
  vehicle: VehicleInfo;
  booking: BookingInfo;
  documentNumber?: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paymentMethod?: string | null;
  receivedAt?: Date | string | null;
}

/** Security deposit receipt (Kautionsbeleg) — explicitly NOT a rental invoice. */
export function buildDepositReceiptDocument(ctx: DepositReceiptContext): RenderableDocument {
  const sections: RenderSection[] = [
    {
      kind: 'keyValues',
      heading: 'Kaution',
      rows: [
        { label: 'Kautionsbetrag', value: formatMoneyCents(ctx.amountCents, ctx.currency) },
        { label: 'Status', value: DEPOSIT_STATUS_DE[ctx.status] ?? ctx.status },
        { label: 'Zahlungsart', value: ctx.paymentMethod || '—' },
        { label: 'Erhalten am', value: ctx.receivedAt ? formatDateTime(ctx.receivedAt) : '—' },
      ],
    },
    {
      kind: 'note',
      text: 'Dies ist ein Beleg über eine Sicherheitsleistung (Kaution) und stellt KEINE umsatzsteuerpflichtige Mietrechnung dar. Die Kaution wird nach ordnungsgemäßer Rückgabe des Fahrzeugs und Abzug etwaiger berechtigter Forderungen erstattet.',
    },
  ];

  return {
    documentTitle: 'Kautionsbeleg',
    documentNumber: ctx.documentNumber ?? null,
    documentDate: formatDate(new Date()),
    org: orgToRenderable(ctx.org),
    parties: [sellerParty(ctx.org), customerParty(ctx.customer)],
    meta: [
      { label: 'Buchung', value: bookingRef(ctx.booking.id) },
      { label: 'Fahrzeug', value: `${vehicleLabel(ctx.vehicle)}${ctx.vehicle.licensePlate ? ` · ${ctx.vehicle.licensePlate}` : ''}` },
      { label: 'Mietzeitraum', value: `${formatDate(ctx.booking.startDate)} – ${formatDate(ctx.booking.endDate)}` },
    ],
    sections,
    footerLines: defaultFooter(ctx.org),
  };
}
