import { Decimal } from '@prisma/client/runtime/library';
import {
  PublicActorDto,
  PublicDocumentExtractionAuditDto,
  PublicDocumentExtractionDto,
  PublicDocumentExtractionSummaryDto,
  PublicVehicleDisplayDto,
} from './dto/public-document-extraction.dto';
import {
  readPublicActionAudit,
  readPublicTypeAudit,
  stripPipelineFromPlausibility,
} from './document-content-cache.util';
import { getAllowedDocumentExtractionActions } from './document-extraction-actions.util';
import { resolveEffectiveDocumentType } from './document-extraction-lifecycle.util';

type VehicleJoin = {
  id: string;
  licensePlate?: string | null;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
};

type UserJoin = {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type ExtractionRecord = {
  id: string;
  vehicleId: string;
  organizationId?: string | null;
  status: PublicDocumentExtractionDto['status'];
  processingStage: PublicDocumentExtractionDto['processingStage'];
  sourceFileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  requestedDocumentType?: PublicDocumentExtractionDto['requestedDocumentType'];
  detectedDocumentType?: PublicDocumentExtractionDto['detectedDocumentType'];
  effectiveDocumentType?: PublicDocumentExtractionDto['effectiveDocumentType'];
  documentType?: PublicDocumentExtractionDto['documentType'];
  classificationMode: PublicDocumentExtractionDto['classificationMode'];
  classificationConfidence?: Decimal | number | null;
  errorPhase?: PublicDocumentExtractionDto['errorPhase'];
  errorCode?: string | null;
  errorMessage?: string | null;
  processingAttempts: number;
  ocrProvider?: string | null;
  ocrModel?: string | null;
  extractionProvider?: string | null;
  extractionModel?: string | null;
  ocrPageCount?: number | null;
  extractedData?: unknown;
  plausibility?: unknown;
  confirmedData?: unknown;
  queuedAt?: Date | null;
  processedAt?: Date | null;
  appliedAt?: Date | null;
  processingStartedAt?: Date | null;
  ocrCompletedAt?: Date | null;
  classificationCompletedAt?: Date | null;
  extractionCompletedAt?: Date | null;
  processingCompletedAt?: Date | null;
  nextRetryAt?: Date | null;
  cancelledAt?: Date | null;
  fileDeletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  serviceEventId?: string | null;
  objectKey?: string | null;
  sourceFileUrl?: string | null;
  storageProvider?: string | null;
  createdById?: string | null;
  confirmedById?: string | null;
  appliedById?: string | null;
  cancelledById?: string | null;
  fileDeletedById?: string | null;
  vehicle?: VehicleJoin | null;
  createdBy?: UserJoin | null;
  confirmedBy?: UserJoin | null;
  appliedBy?: UserJoin | null;
  cancelledBy?: UserJoin | null;
  fileDeletedBy?: UserJoin | null;
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toConfidenceNumber(value: Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return value.toNumber();
}

function toActor(user: UserJoin | null | undefined): PublicActorDto | null {
  if (!user) return null;
  const displayName =
    user.name?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    null;
  return { id: user.id, displayName };
}

function toVehicleDisplay(vehicle: VehicleJoin | null | undefined, vehicleId: string): PublicVehicleDisplayDto | null {
  if (!vehicle) return null;
  return {
    id: vehicle.id ?? vehicleId,
    licensePlate: vehicle.licensePlate ?? null,
    vin: vehicle.vin ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
  };
}

function buildAudit(record: ExtractionRecord): PublicDocumentExtractionAuditDto {
  return {
    createdBy: toActor(record.createdBy) ?? (record.createdById ? { id: record.createdById, displayName: null } : null),
    confirmedBy:
      toActor(record.confirmedBy) ??
      (record.confirmedById ? { id: record.confirmedById, displayName: null } : null),
    appliedBy:
      toActor(record.appliedBy) ?? (record.appliedById ? { id: record.appliedById, displayName: null } : null),
    cancelledBy:
      toActor(record.cancelledBy) ??
      (record.cancelledById ? { id: record.cancelledById, displayName: null } : null),
    fileDeletedBy:
      toActor(record.fileDeletedBy) ??
      (record.fileDeletedById ? { id: record.fileDeletedById, displayName: null } : null),
    fileDeletedAt: toIso(record.fileDeletedAt),
    typeChanges: readPublicTypeAudit(record.plausibility).map((entry) => ({
      from: entry.from,
      to: entry.to,
      at: entry.at,
      userId: entry.userId ?? null,
      reason: entry.reason,
    })),
    actions: readPublicActionAudit(record.plausibility).map((entry) => ({
      action: entry.action,
      at: entry.at,
      userId: entry.userId ?? null,
      details: entry.details,
    })),
  };
}

function mapBase(record: ExtractionRecord): PublicDocumentExtractionDto {
  const effective = resolveEffectiveDocumentType(record);
  const allowedActions = getAllowedDocumentExtractionActions(record);

  return {
    id: record.id,
    vehicleId: record.vehicleId,
    organizationId: record.organizationId ?? null,
    vehicle: toVehicleDisplay(record.vehicle, record.vehicleId),
    status: record.status,
    processingStage: record.processingStage,
    sourceFileName: record.sourceFileName ?? null,
    mimeType: record.mimeType ?? null,
    sizeBytes: record.sizeBytes ?? null,
    requestedDocumentType: record.requestedDocumentType ?? record.documentType ?? null,
    detectedDocumentType: record.detectedDocumentType ?? null,
    effectiveDocumentType: effective,
    documentType: effective,
    classificationMode: record.classificationMode,
    classificationConfidence: toConfidenceNumber(record.classificationConfidence),
    errorPhase: record.errorPhase ?? null,
    errorCode: record.errorCode ?? null,
    errorMessage: record.errorMessage ?? null,
    processingAttempts: record.processingAttempts,
    ocrProvider: record.ocrProvider ?? null,
    ocrModel: record.ocrModel ?? null,
    extractionProvider: record.extractionProvider ?? null,
    extractionModel: record.extractionModel ?? null,
    ocrPageCount: record.ocrPageCount ?? null,
    extractedData: record.extractedData ?? null,
    plausibility: stripPipelineFromPlausibility(record.plausibility) ?? null,
    confirmedData: record.confirmedData ?? null,
    queuedAt: toIso(record.queuedAt),
    processedAt: toIso(record.processedAt),
    appliedAt: toIso(record.appliedAt),
    processingStartedAt: toIso(record.processingStartedAt),
    ocrCompletedAt: toIso(record.ocrCompletedAt),
    classificationCompletedAt: toIso(record.classificationCompletedAt),
    extractionCompletedAt: toIso(record.extractionCompletedAt),
    processingCompletedAt: toIso(record.processingCompletedAt),
    nextRetryAt: toIso(record.nextRetryAt),
    cancelledAt: toIso(record.cancelledAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    serviceEventId: record.serviceEventId ?? null,
    hasStoredFile: Boolean(record.objectKey),
    allowedActions,
    audit: buildAudit(record),
  };
}

/** Maps a DB record to the public API contract — strips storage internals. */
export function toPublicDocumentExtraction(record: ExtractionRecord): PublicDocumentExtractionDto {
  return mapBase(record);
}

export function toPublicDocumentExtractionSummary(
  record: ExtractionRecord,
): PublicDocumentExtractionSummaryDto {
  const full = mapBase(record);
  return {
    ...full,
    extractedData: null,
    confirmedData: null,
    plausibility: null,
  };
}
