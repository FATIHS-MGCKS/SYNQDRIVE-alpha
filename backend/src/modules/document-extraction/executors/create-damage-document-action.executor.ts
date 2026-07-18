import { BadRequestException, Injectable } from '@nestjs/common';
import { DamageSeverity, DamageType } from '@prisma/client';
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import {
  assessDamageApplyGate,
  buildDamageCreatePayload,
  buildDamageDraftPayload,
  isDamageDocumentType,
  type DamageDocumentType,
} from '../document-damage-extraction.rules';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_EXECUTOR_ACTION_TYPES,
} from '../document-action.types';
import type { DocumentActionExecutor } from '../document-action-executor.interface';
import { DocumentActionBusinessError, DOCUMENT_ACTION_ERROR_CODES } from '../document-action.errors';

function mapDamageError(error: unknown) {
  if (error instanceof DocumentActionBusinessError) {
    throw error;
  }
  if (error instanceof BadRequestException) {
    const response = error.getResponse();
    const payload =
      typeof response === 'string' ? { message: response } : (response as Record<string, unknown>);
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

function readLinkCandidateId(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
  const fromMetadata = context.plan.metadata?.linkCandidateId;
  if (typeof fromMetadata === 'string' && fromMetadata.length > 0) {
    return fromMetadata;
  }

  const linkedDamageId = context.confirmedData.linkedDamageId;
  return typeof linkedDamageId === 'string' && linkedDamageId.length > 0 ? linkedDamageId : null;
}

@Injectable()
export class CreateDamageDraftDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_DRAFT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_DRAFT;

  constructor(private readonly damagesService: DamagesService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'DAMAGE_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to create a damage draft',
      };
    }

    if (!isDamageDocumentType(context.documentType)) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'UNSUPPORTED_DAMAGE_DOCUMENT_TYPE',
        errorMessage: `Unsupported document type for damage draft: ${context.documentType}`,
      };
    }

    const gate = assessDamageApplyGate({
      documentType: context.documentType,
      fields: context.confirmedData,
      duplicateDamageId:
        typeof context.plan.metadata?.duplicateDamageId === 'string'
          ? context.plan.metadata.duplicateDamageId
          : null,
    });
    const payload = buildDamageDraftPayload(context.confirmedData);

    if (!gate.canCreateDraft || !payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'DAMAGE_DRAFT_GATE_BLOCKED',
        errorMessage: 'Damage draft gate blocked — traceable description and area required',
        output: { blockers: gate.blockers, documentMode: gate.documentMode },
      };
    }

    try {
      const damage = await this.damagesService.createDraftFromDocumentExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        damageType: payload.damageType,
        severity: payload.severity,
        description: payload.description,
        locationLabel: payload.locationLabel,
        estimatedCostCents: payload.estimatedCostCents,
        bookingId: payload.bookingId,
        liabilityNote: payload.liabilityNote,
        linkExistingDamageId: readLinkCandidateId(context),
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'damage',
        resultEntityId: damage.id,
        output: {
          damageId: damage.id,
          status: damage.status,
          draft: true,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
          linkedExisting: Boolean(readLinkCandidateId(context)),
        },
      };
    } catch (error) {
      return mapDamageError(error);
    }
  }
}

@Injectable()
export class CreateDamageRecordDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_RECORD
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.CREATE_DAMAGE_RECORD;

  constructor(private readonly damagesService: DamagesService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'DAMAGE_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to apply a damage record',
      };
    }

    if (!isDamageDocumentType(context.documentType)) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'UNSUPPORTED_DAMAGE_DOCUMENT_TYPE',
        errorMessage: `Unsupported document type for damage record: ${context.documentType}`,
      };
    }

    const gate = assessDamageApplyGate({
      documentType: context.documentType as DamageDocumentType,
      fields: context.confirmedData,
      duplicateDamageId:
        typeof context.plan.metadata?.duplicateDamageId === 'string'
          ? context.plan.metadata.duplicateDamageId
          : null,
    });
    const payload = buildDamageCreatePayload(context.confirmedData);

    if (!gate.canApply || !payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'DAMAGE_GATE_BLOCKED',
        errorMessage: 'Damage apply gate blocked — required confirmed fields missing',
        output: { blockers: gate.blockers, documentMode: gate.documentMode },
      };
    }

    try {
      const damage = await this.damagesService.applyRecordFromDocumentExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        damageType: payload.damageType as DamageType,
        severity: payload.severity as DamageSeverity,
        description: payload.description,
        locationLabel: payload.locationLabel,
        estimatedCostCents: payload.estimatedCostCents,
        bookingId: payload.bookingId,
        liabilityNote: payload.liabilityNote,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'damage',
        resultEntityId: damage.id,
        output: {
          damageId: damage.id,
          status: damage.status,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      return mapDamageError(error);
    }
  }
}

@Injectable()
export class LinkExistingDamageDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.LINK_EXISTING_DAMAGE
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.LINK_EXISTING_DAMAGE;

  constructor(private readonly damagesService: DamagesService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'DAMAGE_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to link an existing damage case',
      };
    }

    const damageId = readLinkCandidateId(context);
    if (!damageId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'DAMAGE_LINK_CANDIDATE_MISSING',
        errorMessage: 'No linkable damage candidate found for this extraction',
      };
    }

    try {
      const damage = await this.damagesService.linkExistingDamageFromDocumentExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        damageId,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'damage',
        resultEntityId: damage.id,
        output: {
          damageId: damage.id,
          linkedExisting: true,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      return mapDamageError(error);
    }
  }
}
