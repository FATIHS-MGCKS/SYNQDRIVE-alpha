import { RenderableDocument, RenderSection } from '../renderers/render-model';
import { HandoverContext } from './pickup-handover.template';
import {
  bookingRef,
  customerDisplayName,
  defaultFooter,
  formatDate,
  formatDateTime,
  orgToRenderable,
  vehicleLabel,
} from './template-helpers';

export interface ReturnHandoverContext extends HandoverContext {
  /** Kilometers driven during the rental, if known (return odometer − pickup odometer). */
  kmDriven?: number | null;
  pickupOdometerKm?: number | null;
}

function yesNo(v: boolean): string {
  return v ? 'Ja' : 'Nein';
}

/** Return handover protocol (Übergabeprotokoll Rückgabe). */
export function buildReturnHandoverDocument(ctx: ReturnHandoverContext): RenderableDocument {
  const conditionRows = [
    { label: 'Kilometerstand (Rückgabe)', value: `${ctx.odometerKm.toLocaleString('de-DE')} km` },
    ...(ctx.pickupOdometerKm != null
      ? [{ label: 'Kilometerstand (Abholung)', value: `${ctx.pickupOdometerKm.toLocaleString('de-DE')} km` }]
      : []),
    ...(ctx.kmDriven != null ? [{ label: 'Gefahrene Kilometer', value: `${ctx.kmDriven.toLocaleString('de-DE')} km` }] : []),
    { label: 'Kraftstoff / Ladung', value: ctx.fuelFull ? 'Voll' : `${ctx.fuelPercent}%` },
    { label: 'Außen sauber', value: yesNo(ctx.exteriorClean) },
    { label: 'Innen sauber', value: yesNo(ctx.interiorClean) },
    { label: 'Reifen / Saison i. O.', value: yesNo(ctx.tiresSeasonOk) },
    { label: 'Warnleuchten aktiv', value: yesNo(ctx.warningLightsOn) },
    { label: 'Erfasste Schäden', value: String(ctx.damageCount ?? 0) },
  ];

  const sections: RenderSection[] = [
    { kind: 'keyValues', heading: 'Fahrzeugzustand bei Rückgabe', rows: conditionRows },
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

  return {
    documentTitle: 'Übergabeprotokoll — Rückgabe',
    documentNumber: ctx.documentNumber ?? null,
    documentDate: formatDate(ctx.performedAt ?? new Date()),
    org: orgToRenderable(ctx.org),
    meta: [
      { label: 'Buchung', value: bookingRef(ctx.booking.id) },
      { label: 'Kunde', value: customerDisplayName(ctx.customer) },
      { label: 'Fahrzeug', value: `${vehicleLabel(ctx.vehicle)}${ctx.vehicle.licensePlate ? ` · ${ctx.vehicle.licensePlate}` : ''}` },
      { label: 'Zeitpunkt', value: formatDateTime(ctx.performedAt ?? new Date()) },
      ...(ctx.performedByName ? [{ label: 'Durchgeführt von', value: ctx.performedByName }] : []),
    ],
    sections,
    footerLines: defaultFooter(ctx.org),
  };
}
