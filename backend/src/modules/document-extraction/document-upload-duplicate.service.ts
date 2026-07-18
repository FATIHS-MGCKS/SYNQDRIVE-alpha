import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ACTIVE_UPLOAD_DUPLICATE_STATUSES,
  type AssessUploadDuplicateInput,
  type UploadDuplicateAssessment,
} from './document-upload-duplicate.types';
import {
  extractionMatchesBusinessHints,
  normalizeBusinessIdentifier,
  toUploadDuplicateExistingExtraction,
} from './document-upload-duplicate.util';

const DUPLICATE_INCLUDE = {
  fines: { select: { id: true } },
  orgInvoices: { select: { id: true } },
  damages: { select: { id: true } },
  serviceEvents: { select: { id: true } },
} satisfies Prisma.VehicleDocumentExtractionInclude;

@Injectable()
export class DocumentUploadDuplicateService {
  constructor(private readonly prisma: PrismaService) {}

  async assess(input: AssessUploadDuplicateInput): Promise<UploadDuplicateAssessment> {
    const reuploadReason = input.reuploadReason?.trim() ?? '';
    const exactExisting = await this.findExactContentDuplicate(input.organizationId, input.contentSha256);

    if (exactExisting) {
      const existingExtraction = toUploadDuplicateExistingExtraction(exactExisting);
      if (reuploadReason.length >= 3) {
        const relatedExtractionId = input.relatedExtractionId?.trim() || exactExisting.id;
        return {
          status: 'REUPLOAD_ALLOWED',
          blocked: false,
          relatedExtractionId,
          reuploadReason,
          existingExtraction,
        };
      }

      return {
        status: 'DUPLICATE_BLOCKED',
        blocked: true,
        relatedExtractionId: exactExisting.id,
        existingExtraction,
      };
    }

    const businessMatch = await this.findBusinessDuplicate(input);
    if (businessMatch) {
      const matched = await this.loadExtractionSummary(businessMatch.matchedExtractionId);
      return {
        status: 'POSSIBLE_BUSINESS_DUPLICATE',
        blocked: false,
        relatedExtractionId: businessMatch.matchedExtractionId,
        existingExtraction: matched,
        businessMatch,
      };
    }

    return {
      status: 'UNIQUE',
      blocked: false,
    };
  }

  async claimContentAnchor(input: {
    organizationId: string;
    contentSha256: string;
    extractionId: string;
  }): Promise<'claimed' | 'conflict'> {
    try {
      await this.prisma.documentExtractionContentAnchor.create({
        data: {
          organizationId: input.organizationId,
          contentSha256: input.contentSha256,
          canonicalExtractionId: input.extractionId,
        },
      });
      return 'claimed';
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'conflict';
      }
      throw error;
    }
  }

  async loadBlockedAssessmentFromAnchor(input: {
    organizationId: string;
    contentSha256: string;
  }): Promise<UploadDuplicateAssessment> {
    const anchor = await this.prisma.documentExtractionContentAnchor.findUnique({
      where: {
        organizationId_contentSha256: {
          organizationId: input.organizationId,
          contentSha256: input.contentSha256,
        },
      },
      include: {
        canonicalExtraction: {
          include: DUPLICATE_INCLUDE,
        },
      },
    });

    const existing = anchor?.canonicalExtraction
      ?? (await this.findExactContentDuplicate(input.organizationId, input.contentSha256));

    return {
      status: 'DUPLICATE_BLOCKED',
      blocked: true,
      relatedExtractionId: existing?.id ?? null,
      existingExtraction: existing ? toUploadDuplicateExistingExtraction(existing) : null,
    };
  }

  private async findExactContentDuplicate(organizationId: string, contentSha256: string) {
    const anchor = await this.prisma.documentExtractionContentAnchor.findUnique({
      where: {
        organizationId_contentSha256: {
          organizationId,
          contentSha256,
        },
      },
      include: {
        canonicalExtraction: {
          include: DUPLICATE_INCLUDE,
        },
      },
    });
    if (anchor?.canonicalExtraction) {
      return anchor.canonicalExtraction;
    }

    return this.prisma.vehicleDocumentExtraction.findFirst({
      where: {
        organizationId,
        contentSha256,
        status: { in: ACTIVE_UPLOAD_DUPLICATE_STATUSES },
      },
      orderBy: { createdAt: 'asc' },
      include: DUPLICATE_INCLUDE,
    });
  }

  private async findBusinessDuplicate(input: AssessUploadDuplicateInput) {
    const invoiceHint = normalizeBusinessIdentifier(input.invoiceNumberHint);
    const referenceHint = normalizeBusinessIdentifier(input.referenceNumberHint);
    if (!invoiceHint && !referenceHint) return null;

    const candidates = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        organizationId: input.organizationId,
        status: { in: ACTIVE_UPLOAD_DUPLICATE_STATUSES },
      },
      select: {
        id: true,
        confirmedData: true,
        extractedData: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });

    for (const row of candidates) {
      const match = extractionMatchesBusinessHints(row, {
        invoiceNumber: invoiceHint,
        referenceNumber: referenceHint,
      });
      if (!match) continue;
      return {
        matchedExtractionId: row.id,
        invoiceNumber: match.kind === 'invoice' ? match.value : undefined,
        referenceNumber: match.kind === 'reference' ? match.value : undefined,
      };
    }

    return null;
  }

  private async loadExtractionSummary(extractionId: string) {
    const row = await this.prisma.vehicleDocumentExtraction.findUnique({
      where: { id: extractionId },
      include: DUPLICATE_INCLUDE,
    });
    return row ? toUploadDuplicateExistingExtraction(row) : null;
  }
}
