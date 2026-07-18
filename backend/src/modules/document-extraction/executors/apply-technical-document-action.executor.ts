import { BadRequestException, Injectable } from '@nestjs/common';
import { BatteryHealthService } from '@modules/vehicle-intelligence/battery-health/battery-health.service';
import { BrakeLifecycleService } from '@modules/vehicle-intelligence/brakes/brake-lifecycle.service';
import { TireLifecycleService } from '@modules/vehicle-intelligence/tires/tire-lifecycle.service';
import {
  assessBatteryApplyGate,
  buildBatteryApplyPayload,
} from '../document-battery-extraction.rules';
import {
  assessBrakeApplyGate,
  buildBrakeApplyPayload,
} from '../document-brake-extraction.rules';
import {
  assessTireApplyGate,
  buildTireMeasurementApplyPayload,
} from '../document-tire-extraction.rules';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_EXECUTOR_ACTION_TYPES,
} from '../document-action.types';
import type { DocumentActionExecutor } from '../document-action-executor.interface';
import { DocumentActionBusinessError, DOCUMENT_ACTION_ERROR_CODES } from '../document-action.errors';

function mapTechnicalError(error: unknown) {
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

@Injectable()
export class ApplyTireMeasurementDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_TIRE_MEASUREMENT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_TIRE_MEASUREMENT;

  constructor(private readonly tireLifecycle: TireLifecycleService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'TIRE_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to apply tire measurements',
      };
    }

    const gate = assessTireApplyGate({ fields: context.confirmedData });
    const payload = buildTireMeasurementApplyPayload(context.confirmedData);
    if (!gate.canApply || !payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'TIRE_GATE_BLOCKED',
        errorMessage: 'Tire apply gate blocked — required confirmed fields missing',
        output: { blockers: gate.blockers },
      };
    }

    const treadByPosition = Object.fromEntries(
      payload.positions.map((row) => [row.position, row.treadDepthMm]),
    ) as Record<string, number | null>;

    try {
      const result = await this.tireLifecycle.applyMeasurementFromDocumentExtraction({
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        measurementDate: payload.measurementDate,
        treadDepthUnit: payload.treadDepthUnit,
        pressureUnit: payload.pressureUnit,
        odometerKm: payload.odometerKm,
        workshopName: payload.workshopName,
        frontLeftMm: treadByPosition.fl,
        frontRightMm: treadByPosition.fr,
        rearLeftMm: treadByPosition.rl,
        rearRightMm: treadByPosition.rr,
        documentUrl: context.sourceFileUrl,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'tireMeasurement',
        resultEntityId: result.measurementId,
        output: {
          tireMeasurementId: result.measurementId,
          reused: result.reused,
          treadDepthUnit: payload.treadDepthUnit,
          pressureUnit: payload.pressureUnit,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      return mapTechnicalError(error);
    }
  }
}

@Injectable()
export class ApplyBrakeMeasurementDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BRAKE_MEASUREMENT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BRAKE_MEASUREMENT;

  constructor(private readonly brakeLifecycle: BrakeLifecycleService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'BRAKE_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to apply brake measurements',
      };
    }

    const gate = assessBrakeApplyGate({ fields: context.confirmedData });
    const payload = buildBrakeApplyPayload(context.confirmedData);
    if (!gate.canApply || !payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'BRAKE_GATE_BLOCKED',
        errorMessage: 'Brake apply gate blocked — required confirmed fields missing',
        output: { blockers: gate.blockers },
      };
    }

    const frontAxle = payload.axles.find((row) => row.axle === 'front');
    const rearAxle = payload.axles.find((row) => row.axle === 'rear');

    try {
      const result = await this.brakeLifecycle.applyFromDocumentExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        measurementDate: payload.measurementDate,
        serviceKind: payload.serviceKind,
        scope: payload.scope,
        thicknessUnit: payload.thicknessUnit,
        odometerKm: payload.odometerKm,
        workshopName: payload.workshopName,
        workshopFinding: payload.workshopFinding,
        notes: payload.notes,
        documentUrl: context.sourceFileUrl,
        frontPadMm: frontAxle?.padMm ?? null,
        rearPadMm: rearAxle?.padMm ?? null,
        frontDiscMm: frontAxle?.discMm ?? null,
        rearDiscMm: rearAxle?.discMm ?? null,
        discCondition: payload.discCondition,
        brakeFluidStatus: payload.brakeFluidStatus,
        immediateReplacement: payload.immediateReplacement,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'serviceEvent',
        resultEntityId: result.serviceEventId,
        output: {
          serviceEventId: result.serviceEventId,
          brakeEvidenceIds: result.evidenceIds,
          thicknessUnit: payload.thicknessUnit,
          lifecycleApplied: result.lifecycleApplied,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      return mapTechnicalError(error);
    }
  }
}

@Injectable()
export class ApplyBatteryMeasurementDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BATTERY_MEASUREMENT
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.APPLY_BATTERY_MEASUREMENT;

  constructor(private readonly batteryHealth: BatteryHealthService) {}

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    if (!context.organizationId) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'BATTERY_MISSING_ORGANIZATION',
        errorMessage: 'Organization is required to apply battery measurements',
      };
    }

    const gate = assessBatteryApplyGate({ fields: context.confirmedData });
    const payload = buildBatteryApplyPayload(context.confirmedData);
    if (!gate.canApply || !payload) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.FAILED,
        errorCode: 'BATTERY_GATE_BLOCKED',
        errorMessage: 'Battery apply gate blocked — required confirmed fields missing',
        output: { blockers: gate.blockers },
      };
    }

    try {
      const result = await this.batteryHealth.applyFromDocumentExtraction({
        organizationId: context.organizationId,
        vehicleId: context.vehicleId,
        documentExtractionId: context.extractionId,
        documentActionIdempotencyKey: context.idempotencyKey,
        scope: payload.scope,
        isReplacement: payload.isReplacement,
        observedAt: payload.observedAt,
        odometerKm: payload.odometerKm,
        workshopName: payload.workshopName,
        notes: payload.notes,
        documentUrl: context.sourceFileUrl,
        costCents: null,
        measurementType: payload.measurementType,
        sohPercent: payload.sohPercent,
        voltageV: payload.voltageV,
        restingVoltage: payload.restingVoltage,
        crankingVoltage: payload.crankingVoltage,
        chargingVoltage: payload.chargingVoltage,
        temperatureC: payload.temperatureC,
      });

      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'batteryEvidence',
        resultEntityId: result.evidenceIds[0] ?? null,
        output: {
          serviceEventId: result.serviceEventId,
          batteryEvidenceIds: result.evidenceIds,
          snapshotId: result.snapshotId,
          scope: payload.scope,
          measurementType: payload.measurementType,
          documentExtractionId: context.extractionId,
          documentActionIdempotencyKey: context.idempotencyKey,
        },
      };
    } catch (error) {
      return mapTechnicalError(error);
    }
  }
}
