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

export interface RentalContractLegalRef {
  label: string;
  versionLabel: string;
  present: boolean;
}

export interface RentalContractContext {
  org: OrgInfo;
  customer: CustomerInfo;
  vehicle: VehicleInfo;
  booking: BookingInfo;
  documentNumber?: string | null;
  depositAmountCents?: number | null;
  extraKmPriceCents?: number | null;
  currency: string;
  legalRefs: RentalContractLegalRef[];
}

/**
 * Rental contract (Mietvertrag) rendered from the contract snapshot.
 *
 * NOTE: legally binding contract clauses are intentionally NOT hardcoded here.
 * Only neutral, configurable template sections are rendered, and the
 * organization-managed AGB / Widerrufsbelehrung versions are referenced.
 * TODO: make organization-specific contract clauses configurable in
 * Administration and render them here.
 */
export function buildRentalContractDocument(ctx: RentalContractContext): RenderableDocument {
  const cur = ctx.currency;
  const sections: RenderSection[] = [
    {
      kind: 'paragraph',
      heading: '1. Mietgegenstand',
      text: `Vermietet wird das Fahrzeug ${vehicleLabel(ctx.vehicle)}${
        ctx.vehicle.licensePlate ? ` (Kennzeichen: ${ctx.vehicle.licensePlate})` : ''
      }${ctx.vehicle.vin ? `, FIN: ${ctx.vehicle.vin}` : ''}.`,
    },
    {
      kind: 'keyValues',
      heading: '2. Mietzeitraum & Konditionen',
      rows: [
        { label: 'Mietbeginn', value: formatDate(ctx.booking.startDate) },
        { label: 'Mietende', value: formatDate(ctx.booking.endDate) },
        { label: 'Mietdauer', value: `${rentalDays(ctx.booking.startDate, ctx.booking.endDate)} Tag(e)` },
        { label: 'Tagespreis', value: ctx.booking.dailyRateCents != null ? formatMoneyCents(ctx.booking.dailyRateCents, cur) : '—' },
        { label: 'Gesamtpreis', value: ctx.booking.totalPriceCents != null ? formatMoneyCents(ctx.booking.totalPriceCents, cur) : '—' },
        { label: 'Inkludierte km', value: ctx.booking.kmIncluded != null ? `${ctx.booking.kmIncluded} km` : 'Unbegrenzt / n. V.' },
        { label: 'Mehrkilometer', value: ctx.extraKmPriceCents != null ? `${formatMoneyCents(ctx.extraKmPriceCents, cur)} / km` : 'n. V.' },
        { label: 'Kaution', value: ctx.depositAmountCents != null ? formatMoneyCents(ctx.depositAmountCents, cur) : '—' },
        ...(ctx.booking.pickupLocation ? [{ label: 'Abholort', value: ctx.booking.pickupLocation }] : []),
        ...(ctx.booking.returnLocation ? [{ label: 'Rückgabeort', value: ctx.booking.returnLocation }] : []),
      ],
    },
    {
      kind: 'paragraph',
      heading: '3. Pflichten des Mieters',
      text: 'Der Mieter verpflichtet sich, das Fahrzeug pfleglich zu behandeln, es nur bestimmungsgemäß und im Rahmen der gesetzlichen Vorschriften zu nutzen sowie zum vereinbarten Zeitpunkt im vertragsgemäßen Zustand zurückzugeben. Schäden und Mängel sind unverzüglich zu melden. (Die ausführlichen Bedingungen ergeben sich aus den beigefügten AGB.)',
    },
    {
      kind: 'legalRefs',
      heading: '4. Beigefügte rechtliche Dokumente',
      items: ctx.legalRefs.map((r) => ({
        label: r.label,
        value: r.present ? `Version ${r.versionLabel}` : 'FEHLT — in Administration hinterlegen',
      })),
    },
    {
      kind: 'note',
      text: 'Mit der Unterschrift bestätigt der Mieter, die beigefügten Allgemeinen Geschäftsbedingungen und die Widerrufsbelehrung erhalten und zur Kenntnis genommen zu haben. Die rechtsverbindlichen Vertragstexte werden vom Vermieter verwaltet.',
    },
    {
      kind: 'signatures',
      heading: '5. Unterschriften',
      signatures: [
        { label: 'Mieter', name: [ctx.customer.firstName, ctx.customer.lastName].filter(Boolean).join(' ') || null },
        { label: 'Vermieter', name: ctx.org.name },
      ],
    },
  ];

  return {
    documentTitle: 'Mietvertrag',
    documentNumber: ctx.documentNumber ?? null,
    documentDate: formatDate(new Date()),
    org: orgToRenderable(ctx.org),
    parties: [sellerParty(ctx.org, 'Vermieter'), customerParty(ctx.customer, 'Mieter')],
    meta: [{ label: 'Buchung', value: bookingRef(ctx.booking.id) }],
    sections,
    footerLines: defaultFooter(ctx.org),
  };
}
