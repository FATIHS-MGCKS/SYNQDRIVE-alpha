export interface LegalDocumentUsageSummaryDto {
  snapshotCount: number;
  bookingCount: number;
  contractCount: number;
  deliveryEvidenceCount: number;
  deliveryByStatus: Record<string, number>;
}

export interface LegalDocumentUsageReferenceDto {
  generatedDocumentId: string;
  bookingId: string | null;
  bookingLabel: string | null;
  contractNumber: string | null;
  generatedAt: string | null;
  documentType: string;
}

export interface LegalDocumentUsageResponseDto {
  legalDocumentId: string;
  summary: LegalDocumentUsageSummaryDto;
  references: {
    data: LegalDocumentUsageReferenceDto[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}
