import type { OrganizationLegalDocument } from '@prisma/client';
import { toLegacyDocumentType } from './legal-document-type.compat';
import {
  scopeToDto,
  type LegalDocumentApplicationScopeDto,
  type LegalDocumentWithStations,
} from './legal-document-scope.util';

export type LegalDocumentScanStatus = 'NOT_SCANNED' | 'PENDING' | 'PASSED' | 'FAILED';
export type LegalDocumentIntegrityStatus = 'VERIFIED' | 'UNVERIFIED' | 'MISSING';

export interface LegalDocumentActorRef {
  id: string;
  displayName: string;
}

export interface LegalDocumentStationScopeDto {
  mode: string;
  stationIds: string[];
}

export interface LegalDocumentApiResponse {
  id: string;
  documentType: string;
  documentVariant: string | null;
  title: string;
  versionLabel: string;
  language: string;
  jurisdiction: string;
  customerSegment: string;
  channelScope: string;
  stationScope: LegalDocumentStationScopeDto;
  status: string;
  isMandatory: boolean;
  validFrom: string | null;
  validUntil: string | null;
  checksum: string | null;
  fileSize: number | null;
  pageCount: number | null;
  scanStatus: LegalDocumentScanStatus;
  integrityStatus: LegalDocumentIntegrityStatus;
  uploadedAt: string;
  uploadedBy: LegalDocumentActorRef | null;
  approvedAt: string | null;
  approvedBy: LegalDocumentActorRef | null;
  activatedAt: string | null;
  activatedBy: LegalDocumentActorRef | null;
  changeSummary: string | null;
  snapshotCount: number;
  createdAt: string;
  updatedAt: string;
  /** @deprecated Use documentVariant */
  legalVariant: string | null;
  /** @deprecated Use documentType + documentVariant */
  legacyDocumentType: string | null;
  /** @deprecated Prefer top-level scope fields */
  applicationScope: LegalDocumentApplicationScopeDto;
  /** Retained for download UX — not a storage path */
  fileName: string;
  /** @deprecated Use fileSize */
  sizeBytes: number | null;
  /** @deprecated Use activatedAt */
  activeFrom: string | null;
  statusReason: string | null;
  legalOwnerName: string | null;
}

export interface LegalDocumentApiMapperContext {
  snapshotCount?: number;
  usersById?: Map<string, LegalDocumentActorRef>;
}

export function deriveIntegrityStatus(
  checksum: string | null | undefined,
  sizeBytes: number | null | undefined,
): LegalDocumentIntegrityStatus {
  if (!checksum?.trim()) return 'MISSING';
  if (sizeBytes != null && sizeBytes > 0) return 'VERIFIED';
  return 'UNVERIFIED';
}

export function deriveScanStatus(): LegalDocumentScanStatus {
  return 'NOT_SCANNED';
}

export function resolveActorRef(
  userId: string | null | undefined,
  usersById?: Map<string, LegalDocumentActorRef>,
): LegalDocumentActorRef | null {
  if (!userId) return null;
  return usersById?.get(userId) ?? { id: userId, displayName: 'Unbekannter Benutzer' };
}

export function mapLegalDocumentToApiResponse(
  doc: LegalDocumentWithStations,
  context: LegalDocumentApiMapperContext = {},
): LegalDocumentApiResponse {
  const activatedAt = doc.activatedAt ? doc.activatedAt.toISOString() : null;
  const usersById = context.usersById;
  const stationIds = (doc.stations ?? []).map((s) => s.stationId);

  return {
    id: doc.id,
    documentType: doc.documentType,
    documentVariant: doc.legalVariant,
    title: doc.title,
    versionLabel: doc.versionLabel,
    language: doc.language,
    jurisdiction: doc.jurisdictionCountry,
    customerSegment: doc.customerSegment,
    channelScope: doc.bookingChannel,
    stationScope: {
      mode: doc.stationScopeMode,
      stationIds,
    },
    status: doc.status,
    isMandatory: doc.isMandatory,
    validFrom: doc.validFrom ? doc.validFrom.toISOString() : null,
    validUntil: doc.validUntil ? doc.validUntil.toISOString() : null,
    checksum: doc.checksum,
    fileSize: doc.sizeBytes,
    pageCount: null,
    scanStatus: deriveScanStatus(),
    integrityStatus: deriveIntegrityStatus(doc.checksum, doc.sizeBytes),
    uploadedAt: doc.createdAt.toISOString(),
    uploadedBy: resolveActorRef(doc.uploadedByUserId, usersById),
    approvedAt: doc.approvedAt ? doc.approvedAt.toISOString() : null,
    approvedBy: resolveActorRef(doc.approvedByUserId, usersById),
    activatedAt,
    activatedBy: resolveActorRef(doc.activatedByUserId, usersById),
    changeSummary: doc.changeSummary,
    snapshotCount: context.snapshotCount ?? 0,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    legalVariant: doc.legalVariant,
    legacyDocumentType: toLegacyDocumentType(doc.documentType, doc.legalVariant),
    applicationScope: scopeToDto(doc),
    fileName: doc.fileName,
    sizeBytes: doc.sizeBytes,
    activeFrom: activatedAt,
    statusReason: doc.statusReason,
    legalOwnerName: doc.legalOwnerName,
  };
}

export function collectLegalDocumentActorUserIds(
  docs: Array<Pick<OrganizationLegalDocument, 'uploadedByUserId' | 'approvedByUserId' | 'activatedByUserId'>>,
): string[] {
  const ids = new Set<string>();
  for (const doc of docs) {
    if (doc.uploadedByUserId) ids.add(doc.uploadedByUserId);
    if (doc.approvedByUserId) ids.add(doc.approvedByUserId);
    if (doc.activatedByUserId) ids.add(doc.activatedByUserId);
  }
  return [...ids];
}
