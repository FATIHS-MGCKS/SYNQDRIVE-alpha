import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeLifecycleService } from './brake-lifecycle.service';
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
  ) {}

  async initializeFromRegistration(
    input: BrakeInitializationFromRegistrationInput,
  ): Promise<BrakeInitializationWorkflowResult> {
    if (!shouldInitializeBrakesFromRegistration(input.brakes)) {
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
        return {
          outcome: 'initialized',
          initialized: true,
          skipped: false,
          message: lifecycleResult.message,
          lifecycleResult,
          serviceEventId: lifecycleResult.serviceEventId,
        };
      }

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
      return {
        outcome: 'failed',
        initialized: false,
        skipped: false,
        message: `Brake baseline initialization failed: ${message}`,
      };
    }
  }
}
