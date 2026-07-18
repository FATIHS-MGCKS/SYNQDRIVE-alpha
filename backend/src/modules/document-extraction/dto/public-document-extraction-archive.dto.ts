import type {
  DocumentExtractionStatus,
  DocumentExtractionType,
} from '@prisma/client';
import type { PublicActorDto, PublicVehicleDisplayDto } from './public-document-extraction.dto';
import type {
  PublicDocumentArchiveActionSummaryDto,
  PublicDocumentArchiveEntityLinkDto,
  PublicDocumentArchiveFollowUpSummaryDto,
} from '../document-extraction-archive-index.materializer';

export type PublicDocumentExtractionArchiveItemDto = {
  id: string;
  organizationId: string;
  vehicleId: string | null;
  vehicle: PublicVehicleDisplayDto | null;
  sourceFileName: string | null;
  mimeType: string | null;
  status: DocumentExtractionStatus;
  documentCategory: string | null;
  documentSubtype: string | null;
  effectiveDocumentType: DocumentExtractionType | null;
  acceptedEntityLinks: PublicDocumentArchiveEntityLinkDto[];
  actionSummary: PublicDocumentArchiveActionSummaryDto;
  followUpSummary: PublicDocumentArchiveFollowUpSummaryDto;
  uploader: PublicActorDto | null;
  invoiceNumber: string | null;
  caseReference: string | null;
  documentDate: string | null;
  uploadedAt: string;
  appliedAt: string | null;
  updatedAt: string;
  canDownload: boolean;
};

export type PublicDocumentExtractionArchiveListDto = {
  data: PublicDocumentExtractionArchiveItemDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
