import { Injectable } from '@nestjs/common';
import {
  assessArchiveApplyGate,
  buildArchiveApplyPayload,
  type ArchiveDocumentType,
} from '../document-archive-extraction.rules';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_EXECUTOR_ACTION_TYPES,
} from '../document-action.types';
import type { DocumentActionExecutor } from '../document-action-executor.interface';

@Injectable()
export class ArchiveDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.ARCHIVE_DOCUMENT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.ARCHIVE_DOCUMENT;

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    const gate = assessArchiveApplyGate({
      documentType: context.documentType as ArchiveDocumentType,
      fields: context.confirmedData,
    });
    const payload = buildArchiveApplyPayload(context.confirmedData);

    if (!gate.canArchive || !payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'ARCHIVE_GATE_BLOCKED',
        errorMessage: 'Archive apply gate blocked — minimal metadata required',
        output: {
          blockers: gate.blockers,
          archiveSubtype: gate.archiveSubtype,
        },
      };
    }

    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      resultEntityType: 'document_extraction',
      resultEntityId: context.extractionId,
      output: {
        archived: true,
        archiveSubtype: payload.archiveSubtype,
        documentType: context.documentType,
        referenceNumber: payload.referenceNumber,
        extractionId: context.extractionId,
      },
    };
  }
}
