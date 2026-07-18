import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DocumentExtractionType } from '@prisma/client';
import { ConfirmedExtractionData } from './document-extraction.types';
import {
  assessArchiveApplyGate,
  buildArchiveApplyPayload,
  isArchiveDocumentType,
  type ArchiveDocumentType,
} from './document-archive-extraction.rules';

export interface ApplyInput {
  extractionId: string;
  vehicleId: string;
  documentType: DocumentExtractionType;
  sourceFileUrl: string | null;
  confirmedData: ConfirmedExtractionData;
}

export interface ApplyResult {
  serviceEventId?: string | null;
  detail?: unknown;
}

/**
 * Applies HUMAN-CONFIRMED document data to the correct vehicle domain modules.
 *
 * Most document types route through DocumentActionOrchestratorService. This
 * service remains for archive-only paths and legacy entry points that must
 * hard-fail when executor routing is required.
 */
@Injectable()
export class DocumentExtractionApplyService {
  private readonly logger = new Logger(DocumentExtractionApplyService.name);

  async apply(input: ApplyInput): Promise<ApplyResult> {
    const { documentType: docType } = input;
    const d = input.confirmedData ?? {};

    if (docType === 'BRAKE' || docType === 'TIRE' || docType === 'BATTERY') {
      throw new BadRequestException(
        'Technical health apply must run through DocumentActionOrchestratorService',
      );
    }

    if (['SERVICE', 'OIL_CHANGE'].includes(docType)) {
      throw new BadRequestException(
        'Service apply must run through DocumentActionOrchestratorService',
      );
    }

    if (docType === 'TUV_REPORT' || docType === 'BOKRAFT_REPORT') {
      throw new BadRequestException(
        'Inspection apply must run through DocumentActionOrchestratorService',
      );
    }

    if (docType === 'DAMAGE' || docType === 'ACCIDENT') {
      throw new BadRequestException(
        'Damage apply must run through DocumentActionOrchestratorService',
      );
    }

    if (docType === 'INVOICE') {
      throw new BadRequestException(
        'Invoice apply must run through DocumentActionOrchestratorService',
      );
    }

    if (docType === 'FINE') {
      throw new BadRequestException(
        'Fine apply must run through DocumentActionOrchestratorService',
      );
    }

    if (isArchiveDocumentType(docType)) {
      return this.applyArchiveDocument(input, d, docType);
    }

    return {};
  }

  private async applyArchiveDocument(
    input: ApplyInput,
    d: Record<string, unknown>,
    docType: ArchiveDocumentType,
  ): Promise<ApplyResult> {
    const gate = assessArchiveApplyGate({ documentType: docType, fields: d });
    const payload = buildArchiveApplyPayload(d);
    if (!gate.canArchive || !payload) {
      throw new BadRequestException({
        message: 'Archive apply gate blocked — minimal metadata required',
        blockers: gate.blockers,
        archiveSubtype: gate.archiveSubtype,
      });
    }

    return {
      detail: {
        archived: true,
        archiveSubtype: payload.archiveSubtype,
        documentType: docType,
        entityLinkSuggestions: payload.entityLinkSuggestions,
        deadlineSuggestions: payload.deadlineSuggestions,
        referenceNumber: payload.referenceNumber,
        extractionId: input.extractionId,
      },
    };
  }
}
