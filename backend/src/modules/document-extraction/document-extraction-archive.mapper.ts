import { getAllowedDocumentExtractionActions } from './document-extraction-actions.util';
import { isMalwareScanDownloadAllowed } from './document-malware-scan.util';
import {
  buildArchiveActionSummary,
  buildArchiveFollowUpSummary,
  toPublicArchiveEntityLinks,
} from './document-extraction-archive-index.materializer';
import type { PublicDocumentExtractionArchiveItemDto } from './dto/public-document-extraction-archive.dto';
import type { PublicActorDto, PublicVehicleDisplayDto } from './dto/public-document-extraction.dto';

type ArchiveIndexJoin = {
  extractionId: string;
  organizationId: string;
  status: PublicDocumentExtractionArchiveItemDto['status'];
  documentCategory: string | null;
  documentSubtype: string | null;
  effectiveDocumentType: PublicDocumentExtractionArchiveItemDto['effectiveDocumentType'];
  vehicleId: string | null;
  invoiceNumber: string | null;
  caseReference: string | null;
  documentDate: Date | null;
  uploadedAt: Date;
  appliedAt: Date | null;
  updatedAt: Date;
  extraction: {
    id: string;
    sourceFileName: string | null;
    mimeType: string | null;
    objectKey: string | null;
    sourceFileUrl: string | null;
    fileDeletedAt: Date | null;
    confirmedData: unknown;
    plausibility: unknown;
    status: PublicDocumentExtractionArchiveItemDto['status'];
    createdBy?: {
      id: string;
      name?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    } | null;
    vehicle?: {
      id: string;
      licensePlate?: string | null;
      vin?: string | null;
      make?: string | null;
      model?: string | null;
    } | null;
  };
};

function toActor(user: ArchiveIndexJoin['extraction']['createdBy']): PublicActorDto | null {
  if (!user) return null;
  const displayName =
    user.name?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    null;
  return { id: user.id, displayName };
}

function toVehicleDisplay(
  vehicle: ArchiveIndexJoin['extraction']['vehicle'],
  vehicleId: string | null,
): PublicVehicleDisplayDto | null {
  if (!vehicle || !vehicleId) return null;
  return {
    id: vehicle.id,
    licensePlate: vehicle.licensePlate ?? null,
    vin: vehicle.vin ?? null,
    make: vehicle.make ?? null,
    model: vehicle.model ?? null,
  };
}

function canDownload(record: ArchiveIndexJoin['extraction']): boolean {
  const hasFile = Boolean(record.objectKey || record.sourceFileUrl);
  if (!hasFile || record.fileDeletedAt) return false;
  if (!isMalwareScanDownloadAllowed(record.plausibility)) return false;
  const allowed = getAllowedDocumentExtractionActions({
    status: record.status,
    plausibility: record.plausibility,
    objectKey: record.objectKey,
  });
  return allowed.includes('download');
}

export function toPublicDocumentExtractionArchiveItem(
  row: ArchiveIndexJoin,
): PublicDocumentExtractionArchiveItemDto {
  const extraction = row.extraction;
  return {
    id: row.extractionId,
    organizationId: row.organizationId,
    vehicleId: row.vehicleId,
    vehicle: toVehicleDisplay(extraction.vehicle ?? null, row.vehicleId),
    sourceFileName: extraction.sourceFileName,
    mimeType: extraction.mimeType,
    status: row.status,
    documentCategory: row.documentCategory,
    documentSubtype: row.documentSubtype,
    effectiveDocumentType: row.effectiveDocumentType,
    acceptedEntityLinks: toPublicArchiveEntityLinks(extraction.confirmedData),
    actionSummary: buildArchiveActionSummary(extraction),
    followUpSummary: buildArchiveFollowUpSummary(extraction.plausibility),
    uploader: toActor(extraction.createdBy ?? null),
    invoiceNumber: row.invoiceNumber,
    caseReference: row.caseReference,
    documentDate: row.documentDate ? row.documentDate.toISOString() : null,
    uploadedAt: row.uploadedAt.toISOString(),
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    canDownload: canDownload(extraction),
  };
}
