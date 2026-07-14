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
  /** Human-readable channel label (de). */
  channelLabel: string;
  /** Human-readable source label (de). */
  sourceLabel: string;
  /** Human-readable trigger label (de). */
  triggerLabel: string;
  /** One-line summary for detail UI. */
  summary: string;
  /** @deprecated Prefer summary + canonical fields — retained for UI migration */
  kind: InvoiceProvenanceLegacyKind;
  /** @deprecated Prefer summary */
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

function channelLabel(channel: InvoiceCreationChannel): string {
  const labels: Record<InvoiceCreationChannel, string> = {
    MANUAL_UI: 'Manuell (UI)',
    BOOKING_WIZARD: 'Buchungsassistent',
    API: 'API',
    IMPORT: 'Import',
    DOCUMENT_EXTRACTION: 'Document Extraction',
    AUTOMATION: 'Systemprozess',
    SYSTEM_MIGRATION: 'System-Migration',
  };
  return labels[channel];
}

function sourceLabel(sourceType: InvoiceSourceType): string {
  const labels: Record<InvoiceSourceType, string> = {
    BOOKING: 'Buchung',
    DAMAGE: 'Schaden',
    SERVICE: 'Service',
    MANUAL: 'Manuell',
    DOCUMENT: 'Dokument',
    SUBSCRIPTION: 'Abo',
    OTHER: 'Sonstiges',
  };
  return labels[sourceType];
}

function triggerLabel(triggeredBy: InvoiceTriggeredByType): string {
  const labels: Record<InvoiceTriggeredByType, string> = {
    USER: 'Benutzer',
    SYSTEM: 'System',
    AUTOMATION: 'Automatisierung',
    API_CLIENT: 'API-Client',
    MIGRATION: 'Migration',
  };
  return labels[triggeredBy];
}

function buildProvenanceSummary(args: {
  creationChannel: InvoiceCreationChannel;
  sourceType: InvoiceSourceType;
  triggeredByType: InvoiceTriggeredByType;
  actorDisplayName?: string | null;
}): string {
  const { creationChannel, sourceType, triggeredByType, actorDisplayName } = args;

  if (creationChannel === 'BOOKING_WIZARD' && triggeredByType === 'USER') {
    if (actorDisplayName) {
      return `Erstellt von ${actorDisplayName} über den Buchungsassistent · Quelle: Buchung`;
    }
    return 'Erstellt über den Buchungsassistent · Quelle: Buchung';
  }

  if (creationChannel === 'AUTOMATION' && triggeredByType === 'USER') {
    const actor = actorDisplayName ? `von ${actorDisplayName} ` : '';
    return `Ausgelöst ${actor}· erzeugt durch Systemprozess · Quelle: ${sourceLabel(sourceType)}`;
  }

  if (triggeredByType === 'USER' && actorDisplayName) {
    return `Erstellt von ${actorDisplayName} über ${channelLabel(creationChannel)} · Quelle: ${sourceLabel(sourceType)}`;
  }

  return `${channelLabel(creationChannel)} · Quelle: ${sourceLabel(sourceType)} · Auslöser: ${triggerLabel(triggeredByType)}`;
}

function labelFromRecordedProvenance(args: {
  creationChannel: InvoiceCreationChannel;
  sourceType: InvoiceSourceType;
  triggeredByType: InvoiceTriggeredByType;
  actorDisplayName?: string | null;
}): string {
  return buildProvenanceSummary(args);
}

function kindFromRecordedProvenance(args: {
  creationChannel: InvoiceCreationChannel;
  sourceType: InvoiceSourceType;
  triggeredByType: InvoiceTriggeredByType;
}): InvoiceProvenanceLegacyKind {
  if (args.sourceType === 'BOOKING') {
    if (args.creationChannel === 'AUTOMATION' && args.triggeredByType !== 'USER') {
      return 'BOOKING_AUTOMATIC';
    }
    if (args.creationChannel === 'BOOKING_WIZARD') {
      return 'MANUAL';
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
  const actorDisplayName = actor ? formatProvenanceActorDisplay(actor) : null;
  const base = {
    documentExtractionId: row.documentExtractionId,
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    createdByUserDisplayName: actorDisplayName,
    automationId: row.automationId,
    correlationId: row.correlationId,
  };

  if (hasRecordedInvoiceProvenance(row)) {
    const creationChannel = row.creationChannel!;
    const sourceType = row.sourceType!;
    const triggeredByType = row.triggeredByType!;
    const summary = buildProvenanceSummary({
      creationChannel,
      sourceType,
      triggeredByType,
      actorDisplayName,
    });
    const kind = kindFromRecordedProvenance({ creationChannel, sourceType, triggeredByType });
    return {
      classification: 'RECORDED',
      creationChannel,
      sourceType,
      sourceId: row.sourceId,
      triggeredByType,
      channelLabel: channelLabel(creationChannel),
      sourceLabel: sourceLabel(sourceType),
      triggerLabel: triggerLabel(triggeredByType),
      summary,
      kind,
      label: summary,
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
    channelLabel: 'Legacy',
    sourceLabel:
      legacySource.sourceType === 'UNKNOWN'
        ? 'Unbekannt'
        : sourceLabel(legacySource.sourceType as InvoiceSourceType),
    triggerLabel: 'Unbekannt',
    summary: label,
    kind,
    label,
    ...base,
  };
}
