import type { Prisma } from '@prisma/client';
import type { InvoiceProvenanceWriteInput } from './invoice-provenance.util';

export type InvoiceProvenancePrismaFields = Pick<
  Prisma.OrgInvoiceCreateInput,
  | 'creationChannel'
  | 'sourceType'
  | 'sourceId'
  | 'createdByUserId'
  | 'triggeredByType'
  | 'automationId'
  | 'correlationId'
>;

export function provenanceToPrismaFields(
  provenance: InvoiceProvenanceWriteInput,
): InvoiceProvenancePrismaFields {
  return {
    creationChannel: provenance.creationChannel,
    sourceType: provenance.sourceType,
    sourceId: provenance.sourceId ?? null,
    createdByUserId: provenance.createdByUserId ?? null,
    triggeredByType: provenance.triggeredByType,
    automationId: provenance.automationId ?? null,
    correlationId: provenance.correlationId ?? null,
  };
}

/** User created booking via new booking form or booking wizard → booking invoice. */
export function provenanceForBookingWizardInvoice(args: {
  bookingId: string;
  userId?: string | null;
  correlationId?: string | null;
}): InvoiceProvenanceWriteInput {
  return {
    creationChannel: 'BOOKING_WIZARD',
    sourceType: 'BOOKING',
    sourceId: args.bookingId,
    createdByUserId: args.userId ?? null,
    triggeredByType: args.userId ? 'USER' : 'SYSTEM',
    correlationId: args.correlationId ?? args.bookingId,
  };
}

/** Manual invoice from rental UI. */
export function provenanceForManualUiInvoice(args: {
  userId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  correlationId?: string | null;
}): InvoiceProvenanceWriteInput {
  const sourceType = args.bookingId ? 'BOOKING' : args.vehicleId ? 'OTHER' : 'MANUAL';
  const sourceId = args.bookingId ?? args.vehicleId ?? null;
  return {
    creationChannel: 'MANUAL_UI',
    sourceType,
    sourceId,
    createdByUserId: args.userId ?? null,
    triggeredByType: args.userId ? 'USER' : 'SYSTEM',
    correlationId: args.correlationId ?? null,
  };
}

/** REST API invoice create (non-browser). */
export function provenanceForApiInvoice(args: {
  userId?: string | null;
  bookingId?: string | null;
  vehicleId?: string | null;
  correlationId?: string | null;
}): InvoiceProvenanceWriteInput {
  const manual = provenanceForManualUiInvoice(args);
  return {
    ...manual,
    creationChannel: 'API',
    triggeredByType: args.userId ? 'API_CLIENT' : 'SYSTEM',
  };
}

/** Confirmed document extraction → incoming invoice. */
export function provenanceForDocumentExtractionInvoice(args: {
  extractionId: string;
  userId?: string | null;
  correlationId?: string | null;
}): InvoiceProvenanceWriteInput {
  return {
    creationChannel: 'DOCUMENT_EXTRACTION',
    sourceType: 'DOCUMENT',
    sourceId: args.extractionId,
    createdByUserId: args.userId ?? null,
    triggeredByType: args.userId ? 'USER' : 'SYSTEM',
    correlationId: args.correlationId ?? args.extractionId,
  };
}

/** Document bundle / return handover pipeline creates invoice record. */
export function provenanceForBundlePipelineInvoice(args: {
  bookingId: string;
  userId?: string | null;
  correlationId?: string | null;
  /** Final settlement vs initial booking invoice PDF path */
  variant?: 'BOOKING_INVOICE' | 'FINAL_INVOICE';
}): InvoiceProvenanceWriteInput {
  return {
    creationChannel: 'AUTOMATION',
    sourceType: 'BOOKING',
    sourceId: args.bookingId,
    createdByUserId: args.userId ?? null,
    triggeredByType: args.userId ? 'USER' : 'SYSTEM',
    correlationId: args.correlationId ?? args.bookingId,
    automationId: args.variant === 'FINAL_INVOICE' ? 'booking-final-invoice' : 'booking-document-bundle',
  };
}

/** Ops migration / backfill scripts. */
export function provenanceForSystemMigration(args: {
  sourceType?: InvoiceProvenanceWriteInput['sourceType'];
  sourceId?: string | null;
  correlationId: string;
}): InvoiceProvenanceWriteInput {
  return {
    creationChannel: 'SYSTEM_MIGRATION',
    sourceType: args.sourceType ?? 'OTHER',
    sourceId: args.sourceId ?? null,
    createdByUserId: null,
    triggeredByType: 'MIGRATION',
    correlationId: args.correlationId,
  };
}

/** Workflow automation (reserved — no invoice creator wired yet). */
export function provenanceForWorkflowAutomation(args: {
  automationId: string;
  sourceType: InvoiceProvenanceWriteInput['sourceType'];
  sourceId: string;
  correlationId?: string | null;
}): InvoiceProvenanceWriteInput {
  return {
    creationChannel: 'AUTOMATION',
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    createdByUserId: null,
    triggeredByType: 'AUTOMATION',
    automationId: args.automationId,
    correlationId: args.correlationId ?? args.sourceId,
  };
}
