import type {
  InvoiceCreationChannel,
  InvoiceSourceType,
  InvoiceTriggeredByType,
  OrgInvoice,
} from '@prisma/client';

export type InvoiceProvenanceClassification = 'RECORDED' | 'LEGACY';

export type InvoiceProvenanceChannelValue = InvoiceCreationChannel | 'UNKNOWN' | 'LEGACY';

export type InvoiceProvenanceTriggeredByValue = InvoiceTriggeredByType | 'UNKNOWN';

export type InvoiceProvenanceSourceTypeValue = InvoiceSourceType | 'UNKNOWN';

export type InvoiceProvenanceLegacyKind =
  | 'BOOKING_AUTOMATIC'
  | 'BOOKING_FINAL'
  | 'MANUAL'
  | 'DOCUMENT_EXTRACTION'
  | 'VENDOR'
  | 'LEGACY'
  | 'UNKNOWN';

export interface InvoiceProvenanceRow {
  type: OrgInvoice['type'];
  bookingId: string | null;
  documentExtractionId: string | null;
  vendorId: string | null;
  createdAt: Date;
  creationChannel: InvoiceCreationChannel | null;
  sourceType: InvoiceSourceType | null;
  sourceId: string | null;
  createdByUserId: string | null;
  triggeredByType: InvoiceTriggeredByType | null;
  automationId: string | null;
  correlationId: string | null;
}

export interface InvoiceProvenanceActorRow {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export interface InvoiceProvenanceDto {
  classification: InvoiceProvenanceClassification;
  creationChannel: InvoiceProvenanceChannelValue;
  sourceType: InvoiceProvenanceSourceTypeValue;
  sourceId: string | null;
  createdByUserId: string | null;
  createdByUserDisplayName: string | null;
  triggeredByType: InvoiceProvenanceTriggeredByValue;
  automationId: string | null;
  correlationId: string | null;
  createdAt: string;
  /** @deprecated Prefer creationChannel + sourceType — retained for UI migration */
  kind: InvoiceProvenanceLegacyKind;
  /** @deprecated Prefer canonical provenance fields */
  label: string;
  documentExtractionId: string | null;
  bookingId: string | null;
}

/** Input for future write paths — not wired on all creators yet. */
export interface InvoiceProvenanceWriteInput {
  creationChannel: InvoiceCreationChannel;
  sourceType: InvoiceSourceType;
  sourceId?: string | null;
  createdByUserId?: string | null;
  triggeredByType: InvoiceTriggeredByType;
  automationId?: string | null;
  correlationId?: string | null;
}

export function hasRecordedInvoiceProvenance(row: InvoiceProvenanceRow): boolean {
  return row.creationChannel != null && row.sourceType != null && row.triggeredByType != null;
}

/**
 * Factual source inference from existing FK columns only — never invents channel or actor.
 */
export function inferLegacySourceFromLinks(
  row: Pick<InvoiceProvenanceRow, 'bookingId' | 'documentExtractionId' | 'vendorId'>,
): { sourceType: InvoiceProvenanceSourceTypeValue; sourceId: string | null } {
  if (row.bookingId) {
    return { sourceType: 'BOOKING', sourceId: row.bookingId };
  }
  if (row.documentExtractionId) {
    return { sourceType: 'DOCUMENT', sourceId: row.documentExtractionId };
  }
  if (row.vendorId) {
    return { sourceType: 'OTHER', sourceId: row.vendorId };
  }
  return { sourceType: 'MANUAL', sourceId: null };
}

export function formatProvenanceActorDisplay(user: InvoiceProvenanceActorRow): string {
  const person = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (person) return person;
  if (user.name?.trim()) return user.name.trim();
  return user.email;
}

function legacyKindAndLabel(
  row: Pick<InvoiceProvenanceRow, 'type' | 'documentExtractionId'>,
): { kind: InvoiceProvenanceLegacyKind; label: string } {
  if (row.type === 'OUTGOING_BOOKING') {
    return { kind: 'BOOKING_AUTOMATIC', label: 'Automatisch (Buchung)' };
  }
  if (row.type === 'OUTGOING_FINAL') {
    return { kind: 'BOOKING_FINAL', label: 'Automatisch (Schlussrechnung)' };
  }
  if (row.type === 'INCOMING_UPLOADED' || row.documentExtractionId) {
    return { kind: 'DOCUMENT_EXTRACTION', label: 'Document Extraction' };
  }
  if (row.type === 'INCOMING_VENDOR') {
    return { kind: 'VENDOR', label: 'Lieferant / Eingangsrechnung' };
  }
  if (row.type === 'OUTGOING_MANUAL') {
    return { kind: 'MANUAL', label: 'Manuell' };
  }
  return { kind: 'LEGACY', label: 'Legacy (unbekannte Herkunft)' };
}

function labelFromRecordedProvenance(args: {
  creationChannel: InvoiceCreationChannel;
  sourceType: InvoiceSourceType;
  triggeredByType: InvoiceTriggeredByType;
}): string {
  const channelLabels: Record<InvoiceCreationChannel, string> = {
    MANUAL_UI: 'Manuell (UI)',
    BOOKING_WIZARD: 'Buchungs-Wizard',
    API: 'API',
    IMPORT: 'Import',
    DOCUMENT_EXTRACTION: 'Document Extraction',
    AUTOMATION: 'Automatisierung',
    SYSTEM_MIGRATION: 'System-Migration',
  };
  const sourceLabels: Record<InvoiceSourceType, string> = {
    BOOKING: 'Buchung',
    DAMAGE: 'Schaden',
    SERVICE: 'Service',
    MANUAL: 'Manuell',
    DOCUMENT: 'Dokument',
    SUBSCRIPTION: 'Abo',
    OTHER: 'Sonstiges',
  };
  return `${channelLabels[args.creationChannel]} · ${sourceLabels[args.sourceType]}`;
}

function kindFromRecordedProvenance(args: {
  creationChannel: InvoiceCreationChannel;
  sourceType: InvoiceSourceType;
}): InvoiceProvenanceLegacyKind {
  if (args.sourceType === 'BOOKING') {
    if (
      args.creationChannel === 'AUTOMATION' ||
      args.creationChannel === 'BOOKING_WIZARD'
    ) {
      return 'BOOKING_AUTOMATIC';
    }
    return 'BOOKING_FINAL';
  }
  if (args.creationChannel === 'DOCUMENT_EXTRACTION' || args.sourceType === 'DOCUMENT') {
    return 'DOCUMENT_EXTRACTION';
  }
  if (args.sourceType === 'MANUAL') return 'MANUAL';
  return 'UNKNOWN';
}

export function mapInvoiceProvenance(
  row: InvoiceProvenanceRow,
  actor?: InvoiceProvenanceActorRow | null,
): InvoiceProvenanceDto {
  const base = {
    documentExtractionId: row.documentExtractionId,
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByUserDisplayName: actor ? formatProvenanceActorDisplay(actor) : null,
    automationId: row.automationId,
    correlationId: row.correlationId,
  };

  if (hasRecordedInvoiceProvenance(row)) {
    const creationChannel = row.creationChannel!;
    const sourceType = row.sourceType!;
    const triggeredByType = row.triggeredByType!;
    const { kind, label } = {
      kind: kindFromRecordedProvenance({ creationChannel, sourceType }),
      label: labelFromRecordedProvenance({ creationChannel, sourceType, triggeredByType }),
    };
    return {
      classification: 'RECORDED',
      creationChannel,
      sourceType,
      sourceId: row.sourceId,
      triggeredByType,
      kind,
      label,
      ...base,
    };
  }

  const legacySource = inferLegacySourceFromLinks(row);
  const { kind, label } = legacyKindAndLabel(row);

  return {
    classification: 'LEGACY',
    creationChannel: 'LEGACY',
    sourceType: legacySource.sourceType,
    sourceId: legacySource.sourceId,
    triggeredByType: 'UNKNOWN',
    kind,
    label,
    ...base,
  };
}
