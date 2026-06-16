import { RenderableDocument, RenderSection } from '../renderers/render-model';
import {
  BookingInfo,
  CustomerInfo,
  OrgInfo,
  VehicleInfo,
  bookingRef,
  customerDisplayName,
  defaultFooter,
  formatDate,
  formatDateTime,
  orgToRenderable,
  vehicleLabel,
} from './template-helpers';

export interface HandoverContext {
  org: OrgInfo;
  customer: CustomerInfo;
  vehicle: VehicleInfo;
  booking: BookingInfo;
  documentNumber?: string | null;
  performedAt?: Date | string | null;
  performedByName?: string | null;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  exteriorClean: boolean;
  interiorClean: boolean;
  tiresSeasonOk: boolean;
  warningLightsOn: boolean;
  warningLightsNotes?: string | null;
  notes?: string | null;
  damageCount?: number;
  documentsAcknowledged?: boolean;
  customerSignatureName?: string | null;
  customerSignatureDataUrl?: string | null;
  staffSignatureName?: string | null;
  staffSignatureDataUrl?: string | null;
}

function yesNo(v: boolean): string {
  return v ? 'Ja' : 'Nein';
}

function conditionRows(ctx: HandoverContext) {
  return [
    { label: 'Kilometerstand', value: `${ctx.odometerKm.toLocaleString('de-DE')} km` },
    { label: 'Kraftstoff / Ladung', value: ctx.fuelFull ? 'Voll' : `${ctx.fuelPercent}%` },
    { label: 'Außen sauber', value: yesNo(ctx.exteriorClean) },
    { label: 'Innen sauber', value: yesNo(ctx.interiorClean) },
    { label: 'Reifen / Saison i. O.', value: yesNo(ctx.tiresSeasonOk) },
    { label: 'Warnleuchten aktiv', value: yesNo(ctx.warningLightsOn) },
    { label: 'Erfasste Schäden', value: String(ctx.damageCount ?? 0) },
    { label: 'Dokumente bestätigt', value: yesNo(!!ctx.documentsAcknowledged) },
  ];
}

function buildSections(ctx: HandoverContext): RenderSection[] {
  const sections: RenderSection[] = [
    { kind: 'keyValues', heading: 'Fahrzeugzustand', rows: conditionRows(ctx) },
  ];
  if (ctx.warningLightsOn && ctx.warningLightsNotes) {
    sections.push({ kind: 'paragraph', heading: 'Warnleuchten', text: ctx.warningLightsNotes });
  }
  if (ctx.notes) {
    sections.push({ kind: 'paragraph', heading: 'Anmerkungen', text: ctx.notes });
  }
  sections.push({
    kind: 'signatures',
    heading: 'Unterschriften',
    signatures: [
      { label: 'Kunde', name: ctx.customerSignatureName || customerDisplayName(ctx.customer), dataUrl: ctx.customerSignatureDataUrl },
      { label: 'Mitarbeiter', name: ctx.staffSignatureName || ctx.performedByName || null, dataUrl: ctx.staffSignatureDataUrl },
    ],
  });
  return sections;
}

function meta(ctx: HandoverContext) {
  const rows = [
    { label: 'Buchung', value: bookingRef(ctx.booking.id) },
    { label: 'Kunde', value: customerDisplayName(ctx.customer) },
    { label: 'Fahrzeug', value: `${vehicleLabel(ctx.vehicle)}${ctx.vehicle.licensePlate ? ` · ${ctx.vehicle.licensePlate}` : ''}` },
    { label: 'Zeitpunkt', value: formatDateTime(ctx.performedAt ?? new Date()) },
    ...(ctx.performedByName ? [{ label: 'Durchgeführt von', value: ctx.performedByName }] : []),
  ];
  if (ctx.booking.pickupLocation) {
    rows.push({ label: 'Abholstation', value: ctx.booking.pickupLocation });
  }
  if (ctx.booking.pickupHandoverInstructions) {
    rows.push({ label: 'Übergabehinweise', value: ctx.booking.pickupHandoverInstructions });
  }
  return rows;
}

/** Pickup handover protocol (Übergabeprotokoll Abholung). */
export function buildPickupHandoverDocument(ctx: HandoverContext): RenderableDocument {
  return {
    documentTitle: 'Übergabeprotokoll — Abholung',
    documentNumber: ctx.documentNumber ?? null,
    documentDate: formatDate(ctx.performedAt ?? new Date()),
    org: orgToRenderable(ctx.org),
    meta: meta(ctx),
    sections: buildSections(ctx),
    footerLines: defaultFooter(ctx.org),
  };
}
