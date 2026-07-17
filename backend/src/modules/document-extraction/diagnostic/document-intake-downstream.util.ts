import type { PrismaService } from '@shared/database/prisma.service';
import type { DocumentExtractionType } from '@prisma/client';
import { DOCUMENT_EXECUTOR_ACTION_TYPES } from '../document-action.types';
import { isArchiveDocumentType } from '../document-archive-extraction.rules';
import { resolveEffectiveDocumentType } from '../document-extraction-lifecycle.util';

export type DownstreamProbeResult = {
  found: boolean;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey?: string | null;
};

type ExtractionRow = {
  id: string;
  organizationId: string | null;
  vehicleId: string | null;
  status: string;
  effectiveDocumentType?: DocumentExtractionType | null;
  documentType?: DocumentExtractionType | null;
};

const DOWNSTREAM_ACTIONS = new Set<string>([
  DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_FINE_DRAFT,
  DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_INVOICE_DRAFT,
  DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_CREDIT_NOTE_DRAFT,
  DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_SERVICE_EVENT,
  DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_COMPLIANCE_SERVICE_EVENT,
  DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_DRAFT,
  DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_RECORD,
  DOCUMENT_EXECUTOR_ACTION_TYPES.LINK_EXISTING_DAMAGE,
  DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_TIRE_MEASUREMENT,
  DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BRAKE_MEASUREMENT,
  DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BATTERY_MEASUREMENT,
]);

export function requiresDownstreamEntity(documentType: string | null | undefined): boolean {
  if (!documentType) return false;
  if (isArchiveDocumentType(documentType)) return false;
  return true;
}

export function isDownstreamTrackedAction(semanticAction: string): boolean {
  return DOWNSTREAM_ACTIONS.has(semanticAction);
}

export async function probeDownstreamForAction(
  prisma: PrismaService,
  record: ExtractionRow,
  semanticAction: string,
  idempotencyKey?: string | null,
): Promise<DownstreamProbeResult> {
  const organizationId = record.organizationId;
  const extractionId = record.id;

  switch (semanticAction) {
    case DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_FINE_DRAFT: {
      if (!organizationId) return { found: false, idempotencyKey };
      const fine = await prisma.fine.findUnique({
        where: {
          organizationId_documentExtractionId: { organizationId, documentExtractionId: extractionId },
        },
        select: { id: true },
      });
      return fine
        ? { found: true, entityType: 'fine', entityId: fine.id, idempotencyKey }
        : { found: false, idempotencyKey };
    }
    case DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_INVOICE_DRAFT:
    case DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_CREDIT_NOTE_DRAFT: {
      if (!organizationId) return { found: false, idempotencyKey };
      const invoice = await prisma.orgInvoice.findFirst({
        where: { organizationId, documentExtractionId: extractionId },
        select: { id: true },
      });
      return invoice
        ? { found: true, entityType: 'orgInvoice', entityId: invoice.id, idempotencyKey }
        : { found: false, idempotencyKey };
    }
    case DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_SERVICE_EVENT:
    case DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_COMPLIANCE_SERVICE_EVENT: {
      if (!organizationId) return { found: false, idempotencyKey };
      const event = await prisma.vehicleServiceEvent.findFirst({
        where: { organizationId, documentExtractionId: extractionId },
        select: { id: true },
      });
      return event
        ? { found: true, entityType: 'vehicleServiceEvent', entityId: event.id, idempotencyKey }
        : { found: false, idempotencyKey };
    }
    case DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_DRAFT:
    case DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_RECORD:
    case DOCUMENT_EXECUTOR_ACTION_TYPES.LINK_EXISTING_DAMAGE: {
      if (!organizationId) return { found: false, idempotencyKey };
      const damage = await prisma.vehicleDamage.findFirst({
        where: { organizationId, documentExtractionId: extractionId },
        select: { id: true },
      });
      return damage
        ? { found: true, entityType: 'vehicleDamage', entityId: damage.id, idempotencyKey }
        : { found: false, idempotencyKey };
    }
    case DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_TIRE_MEASUREMENT: {
      if (!record.vehicleId) return { found: false, idempotencyKey };
      const measurement = await prisma.vehicleTireTreadMeasurement.findFirst({
        where: { vehicleId: record.vehicleId, documentExtractionId: extractionId },
        select: { id: true },
      });
      return measurement
        ? {
            found: true,
            entityType: 'vehicleTireTreadMeasurement',
            entityId: measurement.id,
            idempotencyKey,
          }
        : { found: false, idempotencyKey };
    }
    case DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BRAKE_MEASUREMENT: {
      const evidence = await prisma.brakeEvidence.findFirst({
        where: { documentExtractionId: extractionId },
        select: { id: true },
      });
      return evidence
        ? { found: true, entityType: 'brakeEvidence', entityId: evidence.id, idempotencyKey }
        : { found: false, idempotencyKey };
    }
    case DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BATTERY_MEASUREMENT: {
      const evidence = await prisma.batteryEvidence.findFirst({
        where: { documentExtractionId: extractionId },
        select: { id: true },
      });
      return evidence
        ? { found: true, entityType: 'batteryEvidence', entityId: evidence.id, idempotencyKey }
        : { found: false, idempotencyKey };
    }
    case DOCUMENT_EXECUTOR_ACTION_TYPES.ARCHIVE_DOCUMENT:
      return {
        found: record.status === 'APPLIED' || record.status === 'PARTIALLY_APPLIED',
        entityType: 'vehicleDocumentExtraction',
        entityId: extractionId,
        idempotencyKey,
      };
    default:
      return { found: false, idempotencyKey };
  }
}

export async function probePrimaryDownstream(
  prisma: PrismaService,
  record: ExtractionRow,
): Promise<DownstreamProbeResult> {
  const documentType = resolveEffectiveDocumentType(record);
  if (!documentType || !requiresDownstreamEntity(documentType)) {
    return { found: true, entityType: null, entityId: null };
  }

  const actionByType: Record<string, string> = {
    FINE: DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_FINE_DRAFT,
    INVOICE: DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_INVOICE_DRAFT,
    SERVICE: DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_SERVICE_EVENT,
    OIL_CHANGE: DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_SERVICE_EVENT,
    TUV_REPORT: DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_COMPLIANCE_SERVICE_EVENT,
    BOKRAFT_REPORT: DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_COMPLIANCE_SERVICE_EVENT,
    DAMAGE: DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_RECORD,
    ACCIDENT: DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_DRAFT,
    TIRE: DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_TIRE_MEASUREMENT,
    BRAKE: DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BRAKE_MEASUREMENT,
    BATTERY: DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BATTERY_MEASUREMENT,
  };

  const semanticAction = actionByType[documentType];
  if (!semanticAction) {
    return { found: false };
  }
  return probeDownstreamForAction(prisma, record, semanticAction);
}
