import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { hashBrakeServiceRequest } from './brake-service-application.domain';
import { BrakeServiceApplicationService } from './brake-service-application.service';
import {
  applyNewBrakeDefaults,
  normalizeRegistrationBrakeCondition,
  type RegistrationBrakeManualSpec,
  registrationBrakeMeasuredSnapshot,
  resolveRegistrationBrakeOdometerKm,
  shouldInitializeBrakesFromRegistration,
} from './register-brake-baseline';
import { inferScopeFromMeasurements } from './brake-service-scope.matrix';
import type { BrakeLifecycleScope } from './brake-lifecycle.types';

export type {
  BrakeLifecycleKind,
  BrakeLifecycleScope,
  BrakeLifecycleSource,
  RecordBrakeServiceInput,
  RecordBrakeServiceResult,
} from './brake-lifecycle.types';

@Injectable()
export class BrakeLifecycleService {
  private readonly logger = new Logger(BrakeLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly application: BrakeServiceApplicationService,
  ) {}

  async recordService(
    input: import('./brake-lifecycle.types').RecordBrakeServiceInput,
  ): Promise<import('./brake-lifecycle.types').RecordBrakeServiceResult> {
    if (!input.vehicleId) {
      throw new BadRequestException('vehicleId is required');
    }

    const organizationId =
      input.organizationId ??
      (
        await this.prisma.vehicle.findUnique({
          where: { id: input.vehicleId },
          select: { organizationId: true },
        })
      )?.organizationId;

    if (!organizationId) {
      throw new BadRequestException('vehicle_not_found');
    }

    const clientRequestId =
      input.clientRequestId ??
      input.idempotencyKey ??
      `lifecycle:${hashBrakeServiceRequest({
        vehicleId: input.vehicleId,
        serviceDate: input.serviceDate,
        kind: input.kind ?? 'full_brake_service',
        scope: input.scope ?? [],
        measured: input.measured ?? {},
        odometerKm: input.odometerKm ?? null,
      }).slice(0, 24)}`;

    try {
      const result = await this.application.apply({
        organizationId,
        vehicleId: input.vehicleId,
        serviceDate: input.serviceDate,
        odometerKm: input.odometerKm,
        workshopName: input.workshopName,
        notes: input.notes,
        documentUrl: input.documentUrl,
        source: input.source,
        kind: input.kind,
        scope: input.scope,
        measured: input.measured,
        initializeIfPossible: input.initializeIfPossible,
        clientRequestId,
        externalDocumentId: input.externalDocumentId,
        idempotencyKey: input.idempotencyKey,
        actorUserId: input.actorUserId,
      });

      return {
        serviceEventId: result.serviceEventId,
        lifecycleApplied: result.lifecycleApplied,
        initialized: result.initialized,
        status: result.status,
        message: result.message,
        applicationId: result.applicationId,
        replayed: result.replayed,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Baseline initialization failed';
      this.logger.warn(
        `Brake lifecycle apply failed for vehicle ${input.vehicleId}: ${errMsg}`,
      );
      const failedEvent = await this.prisma.vehicleServiceEvent.findFirst({
        where: { vehicleId: input.vehicleId, eventType: 'BRAKE_SERVICE' },
        orderBy: { eventDate: 'desc' },
      });
      return {
        serviceEventId: failedEvent?.id ?? '',
        lifecycleApplied: false,
        initialized: false,
        status: 'history_only',
        message: `Brake service history logged, but baseline initialization failed: ${errMsg}`,
      };
    }
  }

  async initializeFromRegistration(input: {
    vehicleId: string;
    brakes: RegistrationBrakeManualSpec;
    registrationMileageKm?: number | null;
    latestStateOdometerKm?: number | null;
  }): Promise<import('./brake-lifecycle.types').RecordBrakeServiceResult | null> {
    const condition = normalizeRegistrationBrakeCondition(input.brakes.condition);
    if (!shouldInitializeBrakesFromRegistration(input.brakes)) {
      return null;
    }

    const brakesForInit = applyNewBrakeDefaults(input.brakes, condition);
    const odometerKm = resolveRegistrationBrakeOdometerKm({
      brakesOdometerKm: brakesForInit.odometerKm,
      registrationMileageKm: input.registrationMileageKm,
      latestStateOdometerKm: input.latestStateOdometerKm,
      condition,
    });

    if (odometerKm == null) {
      this.logger.warn(
        `Skipping brake registration init for vehicle ${input.vehicleId}: no odometer anchor`,
      );
      return null;
    }

    const measured = registrationBrakeMeasuredSnapshot(input.brakes);
    const hasMeasured = measured != null;
    const kind: import('./brake-lifecycle.types').BrakeLifecycleKind =
      condition === 'NEW' || hasMeasured ? 'full_brake_service' : 'pads_service';

    const registrationScope = this.registrationScopeFromSpec(brakesForInit, measured);

    return this.recordService({
      vehicleId: input.vehicleId,
      serviceDate: brakesForInit.serviceDate ?? new Date().toISOString(),
      odometerKm,
      source: 'manual_registration',
      kind,
      scope: registrationScope,
      measured: measured ?? undefined,
      notes: 'Vehicle registration brake baseline (manual_registration)',
      initializeIfPossible: true,
      clientRequestId: `registration:${input.vehicleId}:${odometerKm}`,
    });
  }

  private registrationScopeFromSpec(
    brakes: RegistrationBrakeManualSpec,
    measured: ReturnType<typeof registrationBrakeMeasuredSnapshot>,
  ): BrakeLifecycleScope[] {
    if (measured) {
      return inferScopeFromMeasurements({
        frontPadMm: measured.frontPadMm ?? null,
        rearPadMm: measured.rearPadMm ?? null,
        frontDiscMm: measured.frontDiscMm ?? null,
        rearDiscMm: measured.rearDiscMm ?? null,
      }).map((c) => {
        switch (c) {
          case 'FRONT_PADS':
            return 'front_pads';
          case 'REAR_PADS':
            return 'rear_pads';
          case 'FRONT_DISCS':
            return 'front_discs';
          default:
            return 'rear_discs';
        }
      });
    }
    const out: BrakeLifecycleScope[] = [];
    if (brakes.frontPadThickness != null) out.push('front_pads');
    if (brakes.rearPadThickness != null) out.push('rear_pads');
    if (brakes.frontRotorWidth != null) out.push('front_discs');
    if (brakes.rearRotorWidth != null) out.push('rear_discs');
    return out;
  }
}
