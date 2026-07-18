import { BadRequestException, Injectable } from '@nestjs/common';
import { FinesService } from '@modules/fines/fines.service';
import {
  assessFineApplyGate,
  buildFineApplyPayload,
} from '../document-fine-extraction.rules';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_EXECUTOR_ACTION_TYPES,
} from '../document-action.types';
import type { DocumentActionExecutor } from '../document-action-executor.interface';
import { DocumentActionBusinessError, DOCUMENT_ACTION_ERROR_CODES } from '../document-action.errors';

@Injectable()
export class CreateFineDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_FINE_DRAFT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_FINE_DRAFT;

  constructor(private readonly finesService: FinesService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'FINE_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to create a fine draft',
      };
    }

    const duplicateReference = context.plan.metadata?.duplicateReferenceFineId;
    const gate = assessFineApplyGate({
      fields: context.confirmedData,
      duplicateReferenceFineId:
        typeof duplicateReference === 'string' ? duplicateReference : null,
    });
    const payload = buildFineApplyPayload(context.confirmedData);

    if (!gate.canApply || !payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'FINE_GATE_BLOCKED',
        errorMessage: 'Fine apply gate blocked — required confirmed fields missing',
        output: { blockers: gate.blockers },
      };
    }

    try {
      const fine = await this.finesService.createFromDocumentExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        fineNumber: payload.fineNumber,
        title: payload.title,
        description: payload.description,
        offenseType: payload.offenseType,
        issuingAuthority: payload.issuingAuthority,
        offenseDate: payload.offenseDate,
        location: payload.location,
        amountCents: payload.amountCents,
        currency: payload.currency,
        dueDate: payload.dueDate,
        imageUrl: context.sourceFileUrl,
        extractedData: context.confirmedData,
        notes: payload.notes,
        bookingId: payload.entityLinks.bookingId,
        customerId: payload.entityLinks.customerId,
        driverCustomerId: payload.entityLinks.driverCustomerId,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'fine',
        resultEntityId: String(fine.id),
        output: {
          fineId: fine.id,
          status: fine.status,
          draft: true,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      if (error instanceof DocumentActionBusinessError) {
        throw error;
      }
      if (error instanceof BadRequestException) {
        const response = error.getResponse();
        const payload =
          typeof response === 'string'
            ? { message: response }
            : (response as Record<string, unknown>);
        throw new DocumentActionBusinessError(
          String(payload.code ?? DOCUMENT_ACTION_ERROR_CODES.BUSINESS_RULE_VIOLATION),
          String(payload.message ?? error.message),
          payload,
        );
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: DOCUMENT_ACTION_ERROR_CODES.TECHNICAL_FAILURE,
        errorMessage: message,
      };
    }
  }
}
