import { Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  DocumentExtractionStatus,
  ServiceEventType,
} from '@prisma/client';
import { readDocumentActionPlanState } from '@modules/document-extraction/document-action-plan.store';
import { PrismaService } from '@shared/database/prisma.service';
import type { ApplyBatteryFromDocumentExtractionInput } from '../battery-health.service';
import {
  GROUND_TRUTH_ADMISSION_LEVEL,
  type GroundTruthSourceIdentityV1,
} from './ground-truth-admission.types';
import type { DocumentApplyConfirmationAuthorityV1 } from './document-ground-truth-confirmation.types';
import {
  GroundTruthEmissionFailedError,
  ManualGroundTruthConfirmationConflictError,
  ReplacementGroundTruthScopeConflictError,
} from './ground-truth-emission.errors';
import { BatteryGroundTruthRepository } from './ground-truth.repository';
import { BatteryGroundTruthService } from './ground-truth.service';

const MEASUREMENT_VALUE_TYPES = new Set<BatteryEvidenceValueType>([
  BatteryEvidenceValueType.SOH_PERCENT,
  BatteryEvidenceValueType.VOLTAGE_V,
  BatteryEvidenceValueType.RESTING_VOLTAGE_V,
  BatteryEvidenceValueType.CRANKING_VOLTAGE_V,
  BatteryEvidenceValueType.CHARGING_VOLTAGE_V,
  BatteryEvidenceValueType.BATTERY_TEMPERATURE_C,
]);

const APPLIED_STATUSES = new Set<DocumentExtractionStatus>([
  DocumentExtractionStatus.APPLIED,
  DocumentExtractionStatus.PARTIALLY_APPLIED,
]);

export type DocumentApplyGroundTruthConvergenceInput = ApplyBatteryFromDocumentExtractionInput & {
  serviceEventId: string | null;
  evidenceIds: string[];
};

export type ConfirmManualBatteryReplacementInput = {
  organizationId: string;
  vehicleId: string;
  serviceEventId: string;
  batteryScope: BatteryEvidenceScope;
  actorUserId: string;
};

@Injectable()
export class BatteryGroundTruthEmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groundTruth: BatteryGroundTruthService,
    private readonly groundTruthRepository: BatteryGroundTruthRepository,
  ) {}

  async convergeDocumentApplyGroundTruth(
    input: DocumentApplyGroundTruthConvergenceInput,
  ): Promise<string[]> {
    const document = await this.prisma.vehicleDocumentExtraction.findUnique({
      where: { id: input.documentExtractionId },
      select: {
        id: true,
        status: true,
        organizationId: true,
        vehicleId: true,
        contentSha256: true,
        plausibility: true,
        confirmedById: true,
        appliedById: true,
      },
    });

    if (!document) {
      throw new GroundTruthEmissionFailedError(
        'GT_DOCUMENT_SOURCE_MISSING',
        'Document extraction not found for ground-truth emission',
      );
    }

    if (
      document.organizationId !== input.organizationId ||
      document.vehicleId !== input.vehicleId
    ) {
      throw new GroundTruthEmissionFailedError(
        'GT_DOCUMENT_TENANT_MISMATCH',
        'Document extraction tenant mismatch',
      );
    }

    this.assertDocumentStatusAllowsEmission(document.status, input.confirmationAuthority);

    const { confirmedAt, confirmedByUserId } = this.resolveConfirmationTiming(
      document,
      input.confirmationAuthority,
    );

    const emitted: string[] = [];

    if (input.isReplacement) {
      if (!input.serviceEventId) {
        throw new GroundTruthEmissionFailedError(
          'GT_REPLACEMENT_SERVICE_EVENT_REQUIRED',
          'Replacement document apply requires service event before ground-truth emission',
        );
      }
      const replacementId = await this.emitDocumentReplacementGroundTruth({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        documentExtractionId: input.documentExtractionId,
        serviceEventId: input.serviceEventId,
        batteryScope: input.scope,
        effectiveAt: input.observedAt,
        confirmedAt,
        confirmedByUserId,
      });
      if (replacementId) {
        emitted.push(replacementId);
      }
    } else {
      const measurementIds = await this.emitDocumentMeasurementGroundTruths({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        documentExtractionId: input.documentExtractionId,
        serviceEventId: input.serviceEventId,
        batteryScope: input.scope,
        effectiveAt: input.observedAt,
        confirmedAt,
        confirmedByUserId,
        evidenceIds: input.evidenceIds,
      });
      emitted.push(...measurementIds);
    }

    return emitted;
  }

  async confirmManualBatteryReplacement(
    input: ConfirmManualBatteryReplacementInput,
  ): Promise<{ groundTruthEventId: string }> {
    const event = await this.prisma.vehicleServiceEvent.findFirst({
      where: {
        id: input.serviceEventId,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        eventType: true,
        eventDate: true,
        origin: true,
        organizationId: true,
        vehicleId: true,
      },
    });

    if (!event) {
      throw new GroundTruthEmissionFailedError(
        'GT_SERVICE_EVENT_NOT_FOUND',
        'Service event not found for manual ground-truth confirmation',
      );
    }

    if (event.eventType !== ServiceEventType.BATTERY_REPLACEMENT) {
      throw new GroundTruthEmissionFailedError(
        'GT_WRONG_SERVICE_EVENT_TYPE',
        'Manual battery replacement confirmation requires BATTERY_REPLACEMENT event',
      );
    }

    const sourceResolution = await this.resolveReplacementBySourceEvent(
      input.organizationId,
      input.serviceEventId,
      input.batteryScope,
    );
    if (sourceResolution.kind === 'converge') {
      return { groundTruthEventId: sourceResolution.groundTruthEventId };
    }
    if (sourceResolution.kind === 'scope_conflict') {
      throw new ManualGroundTruthConfirmationConflictError(
        'MANUAL_CONFIRMATION_SCOPE_CONFLICT',
        'Service event already has confirmed ground truth for a different battery scope',
      );
    }

    const confirmedAt = new Date();
    let result;
    try {
      result = await this.groundTruth.admitAndPersist({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      groundTruthType: 'BATTERY_REPLACEMENT',
      batteryScope: input.batteryScope,
      effectiveAt: event.eventDate,
      sourceAuthority: 'MANUAL_CONFIRMED',
      confirmedByUserId: input.actorUserId,
      confirmedAt,
      manualConfirmationTrusted: true,
      pointers: { sourceServiceEventId: input.serviceEventId },
    });
    } catch (error) {
      if (error instanceof ReplacementGroundTruthScopeConflictError) {
        throw new ManualGroundTruthConfirmationConflictError(
          'MANUAL_CONFIRMATION_SCOPE_CONFLICT',
          error.message,
        );
      }
      throw error;
    }

    if (result.outcome === 'PERSISTED' || result.outcome === 'IDEMPOTENT_EXISTING') {
      return { groundTruthEventId: result.groundTruthEventId };
    }

    throw new GroundTruthEmissionFailedError(
      'GT_MANUAL_CONFIRMATION_NOT_ADMITTED',
      `Manual confirmation not admitted: ${result.admission.reasons.join(',')}`,
      { admission: result.admission },
    );
  }

  private assertDocumentStatusAllowsEmission(
    status: DocumentExtractionStatus,
    authority: DocumentApplyConfirmationAuthorityV1 | null | undefined,
  ): void {
    if (APPLIED_STATUSES.has(status)) {
      return;
    }
    if (status === DocumentExtractionStatus.CONFIRMED) {
      if (authority?.mode !== 'CONFIRMED_ACTION_EXECUTION') {
        throw new GroundTruthEmissionFailedError(
          'GT_DOCUMENT_CONFIRMATION_AUTHORITY_REQUIRED',
          'Ground-truth emission during CONFIRMED apply requires confirmed action-plan authority',
        );
      }
      return;
    }
    throw new GroundTruthEmissionFailedError(
      'GT_DOCUMENT_STATUS_NOT_ELIGIBLE',
      `Document extraction status ${status} is not eligible for ground-truth emission`,
    );
  }

  private resolveConfirmationTiming(
    document: {
      plausibility: unknown;
      confirmedById: string | null;
      appliedById: string | null;
    },
    authority: DocumentApplyConfirmationAuthorityV1 | null | undefined,
  ): { confirmedAt: Date; confirmedByUserId: string | null } {
    if (authority?.mode === 'CONFIRMED_ACTION_EXECUTION') {
      const planState = readDocumentActionPlanState(document.plausibility);
      const storedFingerprint = planState.actionPlan?.fingerprint;
      if (
        storedFingerprint &&
        storedFingerprint !== authority.actionPlanFingerprint
      ) {
        throw new GroundTruthEmissionFailedError(
          'GT_DOCUMENT_PLAN_FINGERPRINT_MISMATCH',
          'Confirmed action plan fingerprint mismatch for ground-truth emission',
        );
      }
      return {
        confirmedAt: authority.confirmedAt,
        confirmedByUserId: authority.confirmedByUserId ?? document.confirmedById,
      };
    }

    const planState = readDocumentActionPlanState(document.plausibility);
    const planConfirmedAt = planState.actionPlan?.confirmedAt;
    if (planConfirmedAt) {
      return {
        confirmedAt: new Date(planConfirmedAt),
        confirmedByUserId: document.confirmedById ?? document.appliedById ?? null,
      };
    }

    throw new GroundTruthEmissionFailedError(
      'GT_DOCUMENT_CONFIRMATION_TIME_MISSING',
      'Human confirmation time could not be resolved for ground-truth emission',
    );
  }

  private async emitDocumentReplacementGroundTruth(params: {
    organizationId: string;
    vehicleId: string;
    documentExtractionId: string;
    serviceEventId: string;
    batteryScope: BatteryEvidenceScope;
    effectiveAt: Date;
    confirmedAt: Date;
    confirmedByUserId: string | null;
  }): Promise<string | null> {
    const sourceResolution = await this.resolveReplacementBySourceEvent(
      params.organizationId,
      params.serviceEventId,
      params.batteryScope,
    );
    if (sourceResolution.kind === 'converge') {
      return sourceResolution.groundTruthEventId;
    }
    if (sourceResolution.kind === 'scope_conflict') {
      throw new GroundTruthEmissionFailedError(
        'GT_REPLACEMENT_SCOPE_CONFLICT',
        'Service event already has confirmed replacement ground truth for a different battery scope; use revoke/supersede correction workflow',
        {
          existingGroundTruthEventId: sourceResolution.existingId,
          existingScope: sourceResolution.existingScope,
        },
      );
    }

    let result;
    try {
      result = await this.groundTruth.admitAndPersist({
      organizationId: params.organizationId,
      vehicleId: params.vehicleId,
      groundTruthType: 'BATTERY_REPLACEMENT',
      batteryScope: params.batteryScope,
      effectiveAt: params.effectiveAt,
      sourceAuthority: 'CONFIRMED_DOCUMENT',
      confirmedByUserId: params.confirmedByUserId,
      confirmedAt: params.confirmedAt,
      pointers: {
        sourceServiceEventId: params.serviceEventId,
        sourceDocumentExtractionId: params.documentExtractionId,
      },
    });
    } catch (error) {
      if (error instanceof ReplacementGroundTruthScopeConflictError) {
        throw new GroundTruthEmissionFailedError(
          'GT_REPLACEMENT_SCOPE_CONFLICT',
          error.message,
          { code: error.code },
        );
      }
      throw error;
    }

    if (result.outcome === 'PERSISTED' || result.outcome === 'IDEMPOTENT_EXISTING') {
      return result.groundTruthEventId;
    }

    if (result.admission.level === GROUND_TRUTH_ADMISSION_LEVEL.UNVERIFIED_EVIDENCE) {
      return null;
    }

    throw new GroundTruthEmissionFailedError(
      'GT_REPLACEMENT_EMISSION_FAILED',
      `Replacement ground-truth not admitted: ${result.admission.reasons.join(',')}`,
      { admission: result.admission },
    );
  }

  private async emitDocumentMeasurementGroundTruths(params: {
    organizationId: string;
    vehicleId: string;
    documentExtractionId: string;
    serviceEventId: string | null;
    batteryScope: BatteryEvidenceScope;
    effectiveAt: Date;
    confirmedAt: Date;
    confirmedByUserId: string | null;
    evidenceIds: string[];
  }): Promise<string[]> {
    if (params.evidenceIds.length === 0) {
      return [];
    }

    const evidenceRows = await this.prisma.batteryEvidence.findMany({
      where: { id: { in: params.evidenceIds }, vehicleId: params.vehicleId },
    });

    const ids: string[] = [];
    for (const evidence of evidenceRows) {
      if (evidence.scope !== params.batteryScope) {
        continue;
      }
      if (evidence.numericValue == null) {
        continue;
      }
      if (!MEASUREMENT_VALUE_TYPES.has(evidence.valueType)) {
        continue;
      }
      if (
        evidence.sourceType !== BatteryEvidenceSourceType.DOCUMENT_CONFIRMED &&
        evidence.sourceType !== BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT
      ) {
        continue;
      }

      const result = await this.groundTruth.admitAndPersist({
        organizationId: params.organizationId,
        vehicleId: params.vehicleId,
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        batteryScope: params.batteryScope,
        effectiveAt: evidence.observedAt,
        sourceAuthority: 'CONFIRMED_DOCUMENT',
        confirmedByUserId: params.confirmedByUserId,
        confirmedAt: params.confirmedAt,
        pointers: {
          sourceDocumentExtractionId: params.documentExtractionId,
          sourceBatteryEvidenceId: evidence.id,
          sourceServiceEventId: params.serviceEventId,
        },
      });

      if (result.outcome === 'PERSISTED' || result.outcome === 'IDEMPOTENT_EXISTING') {
        ids.push(result.groundTruthEventId);
      } else if (result.admission.level !== GROUND_TRUTH_ADMISSION_LEVEL.EXCLUDED) {
        throw new GroundTruthEmissionFailedError(
          'GT_MEASUREMENT_EMISSION_FAILED',
          `Measurement ground-truth not admitted for evidence ${evidence.id}: ${result.admission.reasons.join(',')}`,
          { evidenceId: evidence.id, admission: result.admission },
        );
      }
    }

    return ids;
  }

  private async resolveReplacementBySourceEvent(
    organizationId: string,
    sourceServiceEventId: string,
    requestedScope: BatteryEvidenceScope,
  ): Promise<
    | { kind: 'none' }
    | { kind: 'converge'; groundTruthEventId: string }
    | {
        kind: 'scope_conflict';
        existingScope: BatteryEvidenceScope;
        existingId: string;
      }
  > {
    const active = await this.groundTruthRepository.findActiveReplacementBySourceEvent(
      organizationId,
      sourceServiceEventId,
    );
    if (!active) {
      return { kind: 'none' };
    }
    if (active.batteryScope === requestedScope) {
      return { kind: 'converge', groundTruthEventId: active.id };
    }
    return {
      kind: 'scope_conflict',
      existingScope: active.batteryScope,
      existingId: active.id,
    };
  }
}
