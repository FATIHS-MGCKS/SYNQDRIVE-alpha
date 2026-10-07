import { Injectable } from '@nestjs/common';
import type { VehicleOffboardReasonCode } from '../contracts/vehicle-offboard-reason.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { VehicleOffboardPreflightService } from '../offboarding/vehicle-offboard-preflight.service';
import type { VehicleOffboardPreflightWarningCode } from '../offboarding/vehicle-offboard-preflight.types';
import { VehicleOffboardingService } from './vehicle-offboarding.service';

export type MasterAdminOffboardVehicleInput = {
  organizationId: string;
  vehicleId: string;
  reason: VehicleOffboardReasonCode;
  actorUserId: string | null;
  idempotencyKey: string;
  note?: string;
};

export type MasterAdminOffboardVehicleResult = {
  vehicleId: string;
  organizationId: string;
  registryLifecycle: 'OFFBOARDED';
  offboardedAt: Date;
  reason: VehicleOffboardReasonCode;
  idempotentReplay: boolean;
  warnings: VehicleOffboardPreflightWarningCode[];
  lifecycleOutboxEventId?: string;
};

@Injectable()
export class VehicleOnboardingOffboardService {
  constructor(
    private readonly preflight: VehicleOffboardPreflightService,
    private readonly offboarding: VehicleOffboardingService,
  ) {}

  async offboardVehicle(input: MasterAdminOffboardVehicleInput): Promise<MasterAdminOffboardVehicleResult> {
    if (!input.actorUserId) {
      throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'Authenticated actor is required');
    }

    const assessment = await this.preflight.assess({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });
    if (!assessment.allowed) {
      throw new VehicleOnboardingError(
        'OFFBOARD_OPERATIONALLY_BLOCKED',
        'Vehicle cannot be offboarded while operational preconditions are not met',
        { blockingReasons: assessment.blockingReasons },
      );
    }

    const gateContext = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    };

    const result = await this.offboarding.offboardVehicle({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      reason: input.reason,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      operationalGate: (tx) => this.preflight.assertBlockingAbsentInTransaction(tx, gateContext),
    });

    return {
      vehicleId: result.vehicleId,
      organizationId: result.organizationId,
      registryLifecycle: 'OFFBOARDED',
      offboardedAt: result.offboardedAt,
      reason: input.reason,
      idempotentReplay: result.idempotentReplay,
      warnings: assessment.warnings,
    };
  }
}
