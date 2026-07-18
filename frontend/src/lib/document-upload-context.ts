import type { PublicUploadContextDisplay } from '../rental/lib/document-extraction.types';

const ENTITY_LABELS: Record<string, string> = {
  VEHICLE: 'Fahrzeug',
  BOOKING: 'Buchung',
  CUSTOMER: 'Kunde',
  DRIVER: 'Fahrer',
  FINE: 'Bußgeld',
  INVOICE: 'Rechnung',
};

const SURFACE_LABELS: Record<string, string> = {
  rental_ui: 'Mietoberfläche',
  org_inbox: 'Organisations-Inbox',
  vehicle_detail: 'Fahrzeugdetail',
  operator_ai_upload: 'Operator AI Upload',
  api: 'API',
};

export function formatUploadContextBanner(
  uploadContext: PublicUploadContextDisplay | null | undefined,
): string | null {
  if (!uploadContext) return null;
  if (uploadContext.label) return uploadContext.label;
  const entity = ENTITY_LABELS[uploadContext.entityType] ?? uploadContext.entityType;
  const surface = SURFACE_LABELS[uploadContext.sourceSurface] ?? uploadContext.sourceSurface;
  return `Aufgerufen aus ${entity} (${surface}) – noch nicht bestätigt`;
}

export function hasUploadContextConflict(
  uploadContext: PublicUploadContextDisplay | null | undefined,
): boolean {
  return uploadContext?.resolverStatus === 'CONFLICT';
}

/** Static drawer/page hint before OCR — never presented as confirmed assignment. */
export function buildOriginContextHint(entityLabel: string, surfaceLabel: string): string {
  return `Aufgerufen aus ${entityLabel} (${surfaceLabel}) – noch nicht bestätigt`;
}
