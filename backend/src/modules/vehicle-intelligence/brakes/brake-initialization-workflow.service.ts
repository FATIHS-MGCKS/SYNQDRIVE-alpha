import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeLifecycleService } from './brake-lifecycle.service';
import { BrakeHealthObservabilityService } from './brake-health-observability.service';
import {
  resolveRegistrationBrakeOdometerKm,
  shouldInitializeBrakesFromRegistration,
  normalizeRegistrationBrakeCondition,
} from './register-brake-baseline';
import type {
  BrakeInitializationFromRegistrationInput,
  BrakeInitializationWorkflowResult,
} from './brake-initialization-workflow.types';

/**
 * Canonical, synchronous brake initialization workflow.
 *
 * Variant A architecture: registration and controlled backfill call this service
 * directly. Legacy `vehicle_enrichment_jobs` rows with jobType=BRAKE are not
 * part of the authoritative initialization path.
 */
@Injectable()
export class BrakeInitializationWorkflowService {
  private readonly logger = new Logger(BrakeInitializationWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeLifecycle: BrakeLifecycleService,
    @Optional() private readonly observability?: BrakeHealthObservabilityService,
  ) {}

  async initializeFromRegistration(
    input: BrakeInitializationFromRegistrationInput,
  ): Promise<BrakeInitializationWorkflowResult> {
    if (!shouldInitializeBrakesFromRegistration(input.brakes)) {
      this.observability?.recordInitialization({
        result: 'skipped',
        source: 'registration',
        reasonCode: 'not_eligible',
      });
      return {
        outcome: 'skipped_not_eligible',
        initialized: false,
        skipped: true,
        message: 'Brake registration payload is not eligible for baseline initialization.',
      };
    }

    const condition = normalizeRegistrationBrakeCondition(input.brakes.condition);
    const odometerKm = resolveRegistrationBrakeOdometerKm({
      brakesOdometerKm: input.brakes.odometerKm,
      registrationMileageKm: input.registrationMileageKm,
      latestStateOdometerKm: input.latestStateOdometerKm,
      condition,
    });

    if (odometerKm == null) {
      this.observability?.recordInitialization({
        result: 'skipped',
        source: 'registration',
        reasonCode: 'no_odometer',
      });
      return {
        outcome: 'skipped_no_odometer',
        initialized: false,
        skipped: true,
        message: 'Brake baseline initialization requires an odometer anchor.',
      };
    }

    const existing = await this.prisma.brakeHealthCurrent.findUnique({
      where: { vehicleId: input.vehicleId },
      select: { isInitialized: true },
    });

    if (existing?.isInitialized === true) {
      this.observability?.recordInitialization({
        result: 'skipped',
        source: 'registration',
        reasonCode: 'already_initialized',
      });
      return {
        outcome: 'already_initialized',
        initialized: false,
        skipped: true,
        message: 'Brake health baseline is already initialized for this vehicle.',
      };
    }

    try {
      const lifecycleResult = await this.brakeLifecycle.initializeFromRegistration({
        vehicleId: input.vehicleId,
        brakes: input.brakes,
        registrationMileageKm: input.registrationMileageKm,
        latestStateOdometerKm: input.latestStateOdometerKm,
      });

      if (lifecycleResult?.initialized === true) {
        this.observability?.recordInitialization({
          result: 'success',
          source: 'registration',
        });
        return {
          outcome: 'initialized',
          initialized: true,
          skipped: false,
          message: lifecycleResult.message,
          lifecycleResult,
          serviceEventId: lifecycleResult.serviceEventId,
        };
      }

      this.observability?.recordInitialization({
        result: 'skipped',
        source: 'registration',
        reasonCode: 'lifecycle_incomplete',
      });
      return {
        outcome: 'skipped_not_eligible',
        initialized: false,
        skipped: true,
        message:
          lifecycleResult?.message ??
          'Brake service history recorded, but baseline initialization did not complete.',
        lifecycleResult,
        serviceEventId: lifecycleResult?.serviceEventId ?? null,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Brake initialization workflow failed for vehicle ${input.vehicleId}: ${message}`,
      );
      this.observability?.recordInitialization({
        result: 'failed',
        source: 'registration',
        errorCode: message.slice(0, 80),
      });
      return {
        outcome: 'failed',
        initialized: false,
        skipped: false,
        message: `Brake baseline initialization failed: ${message}`,
      };
    }
  }
}
