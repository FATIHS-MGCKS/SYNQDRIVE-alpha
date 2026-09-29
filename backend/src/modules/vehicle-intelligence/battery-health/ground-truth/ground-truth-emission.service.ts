import { Injectable } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  DocumentExtractionStatus,
  ServiceEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { ApplyBatteryFromDocumentExtractionInput } from '../battery-health.service';
import {
  GROUND_TRUTH_ADMISSION_LEVEL,
  type GroundTruthSourceIdentityV1,
} from './ground-truth-admission.types';
import {
  GroundTruthEmissionFailedError,
  ManualGroundTruthConfirmationConflictError,
} from './ground-truth-emission.errors';
import { BatteryGroundTruthService } from './ground-truth.service';

const MEASUREMENT_VALUE_TYPES = new Set<BatteryEvidenceValueType>([
  BatteryEvidenceValueType.SOH_PERCENT,
  BatteryEvidenceValueType.VOLTAGE_V,
  BatteryEvidenceValueType.RESTING_VOLTAGE_V,
  BatteryEvidenceValueType.CRANKING_VOLTAGE_V,
  BatteryEvidenceValueType.CHARGING_VOLTAGE_V,
  BatteryEvidenceValueType.BATTERY_TEMPERATURE_C,
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
        appliedAt: true,
        appliedById: true,
        confirmedById: true,
      },
    });

    if (!document) {
      throw new GroundTruthEmissionFailedError(
        'GT_DOCUMENT_SOURCE_MISSING',
        'Document extraction not found for ground-truth emission',
      );
    }

    if (document.status !== DocumentExtractionStatus.APPLIED) {
      return [];
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

    const confirmedAt = document.appliedAt ?? input.observedAt;
    const confirmedByUserId = document.appliedById ?? document.confirmedById ?? null;

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
        documentActionIdempotencyKey: input.documentActionIdempotencyKey ?? null,
        measurementType: input.measurementType,
        contentSha256: document.contentSha256,
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
        documentActionIdempotencyKey: input.documentActionIdempotencyKey ?? null,
        measurementType: input.measurementType,
        contentSha256: document.contentSha256,
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

    const existingForEvent = await this.prisma.batteryGroundTruthEvent.findMany({
      where: {
        organizationId: input.organizationId,
        sourceServiceEventId: input.serviceEventId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        verificationStatus: 'CONFIRMED',
      },
      select: { id: true, batteryScope: true },
    });

    const sameScope = existingForEvent.find((row) => row.batteryScope === input.batteryScope);
    if (sameScope) {
      return { groundTruthEventId: sameScope.id };
    }

    if (existingForEvent.length > 0) {
      throw new ManualGroundTruthConfirmationConflictError(
        'MANUAL_CONFIRMATION_SCOPE_CONFLICT',
        'Service event already has confirmed ground truth for a different battery scope',
      );
    }

    const result = await this.groundTruth.admitAndPersist({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      groundTruthType: 'BATTERY_REPLACEMENT',
      batteryScope: input.batteryScope,
      effectiveAt: event.eventDate,
      sourceAuthority: 'MANUAL_CONFIRMED',
      confirmedByUserId: input.actorUserId,
      confirmedAt: new Date(),
      manualConfirmationTrusted: true,
      pointers: { sourceServiceEventId: input.serviceEventId },
    });

    if (result.outcome === 'PERSISTED' || result.outcome === 'IDEMPOTENT_EXISTING') {
      return { groundTruthEventId: result.groundTruthEventId };
    }

    throw new GroundTruthEmissionFailedError(
      'GT_MANUAL_CONFIRMATION_NOT_ADMITTED',
      `Manual confirmation not admitted: ${result.admission.reasons.join(',')}`,
      { admission: result.admission },
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
    documentActionIdempotencyKey: string | null;
    measurementType: string | null;
    contentSha256: string | null;
  }): Promise<string | null> {
    const result = await this.groundTruth.admitAndPersist({
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
    documentActionIdempotencyKey: string | null;
    measurementType: string | null;
    contentSha256: string | null;
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
}
