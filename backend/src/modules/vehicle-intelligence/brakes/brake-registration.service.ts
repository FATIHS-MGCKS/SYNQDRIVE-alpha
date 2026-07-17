import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeInitializationWorkflowService } from './brake-initialization-workflow.service';
import {
  applyNewBrakeDefaults,
  hasRegistrationBrakeSpecValues,
  normalizeRegistrationBrakeCondition,
  shouldInitializeBrakesFromRegistration,
  validateRegistrationBrakeInput,
  type RegistrationBrakeManualSpec,
} from './register-brake-baseline';
import {
  buildNoBrakePayloadResult,
  deriveRegistrationBrakeResult,
  type VehicleRegistrationBrakeResult,
} from './registration-brake-outcome';

export interface ProcessRegistrationBrakesInput {
  vehicleId: string;
  organizationId: string;
  brakes: RegistrationBrakeManualSpec;
  registrationMileageKm?: number | null;
  latestStateOdometerKm?: number | null;
}

@Injectable()
export class BrakeRegistrationService {
  private readonly logger = new Logger(BrakeRegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeInitializationWorkflow: BrakeInitializationWorkflowService,
  ) {}

  /**
   * Canonical registration brake path: validate → spec → initialize → explicit outcome.
   * Vehicle registration continues even when brake init fails; status is always returned.
   */
  async processRegistrationBrakes(
    input: ProcessRegistrationBrakesInput,
  ): Promise<VehicleRegistrationBrakeResult> {
    await this.assertVehicleInOrganization(input.vehicleId, input.organizationId);

    const validation = validateRegistrationBrakeInput(input.brakes);
    if (!validation.valid) {
      const error = validation.errors.join('; ');
      this.logger.warn(
        `Brake registration validation failed for vehicle ${input.vehicleId}: ${error}`,
      );
      return deriveRegistrationBrakeResult({
        rawBrakes: input.brakes,
        specCreated: false,
        initialized: false,
        initializationError: error,
        workflowMessage: `Brake registration rejected: ${error}`,
      });
    }

    const rawBrakes = input.brakes;
    const condition = normalizeRegistrationBrakeCondition(rawBrakes.condition);
    const brakesForSpec = applyNewBrakeDefaults(rawBrakes, condition);
    const shouldCreateSpec =
      condition === 'NEW' || hasRegistrationBrakeSpecValues(brakesForSpec);

    let specCreated = false;
    if (shouldCreateSpec) {
      await this.prisma.vehicleBrakeReferenceSpec.create({
        data: {
          vehicleId: input.vehicleId,
          frontRotorDiameter: brakesForSpec.frontRotorDiameter ?? null,
          frontRotorWidth: brakesForSpec.frontRotorWidth ?? null,
          frontPadThickness: brakesForSpec.frontPadThickness ?? null,
          rearRotorDiameter: brakesForSpec.rearRotorDiameter ?? null,
          rearRotorWidth: brakesForSpec.rearRotorWidth ?? null,
          rearPadThickness: brakesForSpec.rearPadThickness ?? null,
          sourceType: rawBrakes.source?.trim() || 'manual_registration',
        },
      });
      specCreated = true;
    }

    if (!shouldInitializeBrakesFromRegistration(rawBrakes)) {
      return deriveRegistrationBrakeResult({
        rawBrakes,
        specCreated,
        initialized: false,
        workflowMessage: 'Brake registration payload does not qualify for baseline initialization.',
      });
    }

    const init = await this.brakeInitializationWorkflow.initializeFromRegistration({
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      brakes: rawBrakes,
      registrationMileageKm: input.registrationMileageKm,
      latestStateOdometerKm: input.latestStateOdometerKm,
    });

    if (init.outcome === 'already_initialized') {
      const current = await this.prisma.brakeHealthCurrent.findUnique({
        where: { vehicleId: input.vehicleId },
        select: { isInitialized: true, anchorValidationStatus: true },
      });
      if (current?.isInitialized === true) {
        return deriveRegistrationBrakeResult({
          rawBrakes,
          specCreated,
          initialized: true,
          anchorValidationStatus: current.anchorValidationStatus,
          workflowMessage: init.message,
        });
      }
    }

    if (init.outcome === 'failed') {
      await this.persistInitializationRequiredMarker(input.vehicleId, input.organizationId, init.message);
      return deriveRegistrationBrakeResult({
        rawBrakes,
        specCreated,
        initialized: false,
        initializationError: init.message,
        workflowMessage: init.message,
      });
    }

    if (!init.initialized) {
      if (specCreated && init.outcome === 'skipped_no_odometer') {
        await this.persistInitializationRequiredMarker(
          input.vehicleId,
          input.organizationId,
          init.message,
        );
      }
      return deriveRegistrationBrakeResult({
        rawBrakes,
        specCreated,
        initialized: false,
        workflowMessage: init.message,
        initBlockedReason: init.outcome === 'skipped_no_odometer' ? 'missing_odometer' : 'not_eligible',
      });
    }

    const current = await this.prisma.brakeHealthCurrent.findUnique({
      where: { vehicleId: input.vehicleId },
      select: { isInitialized: true, anchorValidationStatus: true },
    });

    if (current?.isInitialized !== true) {
      const message =
        'Brake initialization reported success but BrakeHealthCurrent is not materialized.';
      await this.persistInitializationRequiredMarker(input.vehicleId, input.organizationId, message);
      return deriveRegistrationBrakeResult({
        rawBrakes,
        specCreated,
        initialized: false,
        initializationError: message,
        workflowMessage: message,
      });
    }

    return deriveRegistrationBrakeResult({
      rawBrakes,
      specCreated,
      initialized: true,
      anchorValidationStatus: current.anchorValidationStatus,
      workflowMessage: init.message,
    });
  }

  noBrakePayloadResult(): VehicleRegistrationBrakeResult {
    return buildNoBrakePayloadResult();
  }

  private async assertVehicleInOrganization(
    vehicleId: string,
    organizationId: string,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new BadRequestException(
        'Vehicle not found for organization — brake registration rejected.',
      );
    }
  }

  private async persistInitializationRequiredMarker(
    vehicleId: string,
    organizationId: string,
    message: string,
  ): Promise<void> {
    const warning = `Registration brake initialization required: ${message}`;
    const existing = await this.prisma.brakeHealthCurrent.findUnique({
      where: { vehicleId },
      select: { baselineWarnings: true, isInitialized: true },
    });

    if (existing?.isInitialized === true) {
      return;
    }

    const priorWarnings = Array.isArray(existing?.baselineWarnings)
      ? (existing!.baselineWarnings as string[])
      : [];

    await this.prisma.brakeHealthCurrent.upsert({
      where: { vehicleId },
      create: {
        vehicleId,
        organizationId,
        isInitialized: false,
        stateClass: 'NO_BASELINE',
        anchorValidationStatus: 'invalid',
        baselineWarnings: [warning, ...priorWarnings],
        modelVersion: 'registration-marker',
      },
      update: {
        isInitialized: false,
        stateClass: 'NO_BASELINE',
        anchorValidationStatus: 'invalid',
        baselineWarnings: [warning, ...priorWarnings],
      },
    });
  }
}
