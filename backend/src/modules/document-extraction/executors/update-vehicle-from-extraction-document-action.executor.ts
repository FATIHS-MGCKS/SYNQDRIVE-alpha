import { BadRequestException, Injectable } from '@nestjs/common';
import { ServiceEventsService } from '@modules/vehicle-intelligence/service-events/service-events.service';
import {
  buildInspectionApplyPayload,
  isInspectionDocumentType,
} from '../document-inspection-extraction.rules';
import { isServiceDocumentType } from '../document-service-extraction.rules';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_EXECUTOR_ACTION_TYPES,
} from '../document-action.types';
import type { DocumentActionExecutor } from '../document-action-executor.interface';
import { DocumentActionBusinessError, DOCUMENT_ACTION_ERROR_CODES } from '../document-action.errors';

@Injectable()
export class UpdateVehicleComplianceDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.UPDATE_VEHICLE_COMPLIANCE_DATES
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.UPDATE_VEHICLE_COMPLIANCE_DATES;

  constructor(private readonly serviceEvents: ServiceEventsService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'COMPLIANCE_UPDATE_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to update vehicle compliance dates',
      };
    }

    if (!isInspectionDocumentType(context.documentType)) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'COMPLIANCE_UPDATE_UNSUPPORTED_DOCUMENT',
        errorMessage: 'Vehicle compliance update applies only to inspection documents',
      };
    }

    const payload = buildInspectionApplyPayload(context.documentType, context.confirmedData);
    if (!payload?.canUpdateVehicleMasterData || !payload.complianceUpdate) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED,
        output: {
          reason: 'MISSING_VALID_UNTIL_OR_COMPLIANCE_BLOCK',
          skipped: true,
        },
      };
    }

    try {
      const result = await this.serviceEvents.applyComplianceVehicleUpdateFromExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        documentType: context.documentType,
        lastInspectionDate: payload.complianceUpdate.lastInspectionDate,
        nextValidUntilDate: payload.complianceUpdate.nextValidUntilDate,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'vehicle',
        resultEntityId: result.vehicleId,
        output: {
          vehicleId: result.vehicleId,
          applied: result.applied,
          skipped: result.skipped,
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
        const errorPayload =
          typeof response === 'string'
            ? { message: response }
            : (response as Record<string, unknown>);
        throw new DocumentActionBusinessError(
          String(errorPayload.code ?? DOCUMENT_ACTION_ERROR_CODES.BUSINESS_RULE_VIOLATION),
          String(errorPayload.message ?? error.message),
          errorPayload,
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

@Injectable()
export class RefreshVehicleServiceHistoryDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.REFRESH_VEHICLE_SERVICE_HISTORY
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.REFRESH_VEHICLE_SERVICE_HISTORY;

  constructor(private readonly serviceEvents: ServiceEventsService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'SERVICE_HISTORY_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to refresh vehicle service history',
      };
    }

    if (!isServiceDocumentType(context.documentType)) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'SERVICE_HISTORY_UNSUPPORTED_DOCUMENT',
        errorMessage: 'Service history refresh applies only to service/oil-change documents',
      };
    }

    try {
      const result = await this.serviceEvents.refreshVehicleServiceHistoryFromExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'vehicle',
        resultEntityId: result.vehicleId,
        output: {
          vehicleId: result.vehicleId,
          applied: result.applied,
          skipped: result.skipped,
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
        const errorPayload =
          typeof response === 'string'
            ? { message: response }
            : (response as Record<string, unknown>);
        throw new DocumentActionBusinessError(
          String(errorPayload.code ?? DOCUMENT_ACTION_ERROR_CODES.BUSINESS_RULE_VIOLATION),
          String(errorPayload.message ?? error.message),
          errorPayload,
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
