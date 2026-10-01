import { Injectable } from '@nestjs/common';
import type { Prisma, VehicleRegistryLifecycle } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import {
  OFFBOARD_OUTBOX_PAYLOAD_VERSION,
  type VehicleOffboardedOutboxPayloadV1,
} from '../contracts/offboard-outbox-payload.v1';
import type { VehicleOffboardReasonCode } from '../contracts/vehicle-offboard-reason.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export type OffboardVehicleInput = {
  organizationId: string;
  vehicleId: string;
  reason: VehicleOffboardReasonCode;
  actorUserId: string | null;
  idempotencyKey: string;
  /** Fail-closed: organization transfer is not supported in VO-5A. */
  destinationOrganizationId?: string | null;
};

export type OffboardVehicleResult = {
  vehicleId: string;
  organizationId: string;
  registryLifecycle: VehicleRegistryLifecycle;
  offboardedAt: Date;
  idempotentReplay: boolean;
};

function offboardOutboxIdempotencyKey(idempotencyKey: string): string {
  return `vehicle-onboarding:VEHICLE_OFFBOARDED:v1:${idempotencyKey}`;
}

@Injectable()
export class VehicleOffboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async offboardVehicle(input: OffboardVehicleInput): Promise<OffboardVehicleResult> {
    if (input.destinationOrganizationId) {
      throw new VehicleOnboardingError(
        'ORG_TRANSFER_NOT_SUPPORTED',
        'Organization transfer is not supported',
      );
    }

    const offboardedAt = new Date();
    const outboxKey = offboardOutboxIdempotencyKey(input.idempotencyKey);

    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
        select: { id: true, registryLifecycle: true },
      });
      if (!vehicle) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Vehicle not found for organization');
      }

      if (vehicle.registryLifecycle === 'OFFBOARDED') {
        const existingOutbox = await tx.vehicleRegistryLifecycleOutbox.findUnique({
          where: { idempotencyKey: outboxKey },
        });
        if (existingOutbox?.vehicleId === input.vehicleId) {
          return {
            vehicleId: input.vehicleId,
            organizationId: input.organizationId,
            registryLifecycle: 'OFFBOARDED',
            offboardedAt: existingOutbox.occurredAt,
            idempotentReplay: true,
          };
        }
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          'Vehicle is already offboarded',
        );
      }

      if (vehicle.registryLifecycle !== 'ACTIVE') {
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          `Cannot offboard vehicle in registry lifecycle ${vehicle.registryLifecycle}`,
        );
      }

      const transitioned = await tx.vehicle.updateMany({
        where: {
          id: input.vehicleId,
          organizationId: input.organizationId,
          registryLifecycle: 'ACTIVE',
        },
        data: { registryLifecycle: 'OFFBOARDED' },
      });
      if (transitioned.count !== 1) {
        const afterRace = await tx.vehicle.findFirst({
          where: { id: input.vehicleId, organizationId: input.organizationId },
          select: { registryLifecycle: true },
        });
        if (afterRace?.registryLifecycle === 'OFFBOARDED') {
          const existingOutbox = await tx.vehicleRegistryLifecycleOutbox.findUnique({
            where: { idempotencyKey: outboxKey },
          });
          if (existingOutbox?.vehicleId === input.vehicleId) {
            return {
              vehicleId: input.vehicleId,
              organizationId: input.organizationId,
              registryLifecycle: 'OFFBOARDED',
              offboardedAt: existingOutbox.occurredAt,
              idempotentReplay: true,
            };
          }
        }
        throw new VehicleOnboardingError(
          'ONBOARDING_CONCURRENCY_CONFLICT',
          'Vehicle registry lifecycle changed concurrently',
        );
      }

      await tx.vehicleOrganizationAssignment.updateMany({
        where: { vehicleId: input.vehicleId, validTo: null },
        data: {
          validTo: offboardedAt,
          assignmentReason: input.reason,
        },
      });

      await tx.vehicleDataSourceLink.updateMany({
        where: { vehicleId: input.vehicleId, isActive: true },
        data: {
          isActive: false,
          deactivatedAt: offboardedAt,
          deactivationReason: 'VEHICLE_OFFBOARDED',
        },
      });

      const payload: VehicleOffboardedOutboxPayloadV1 = {
        version: OFFBOARD_OUTBOX_PAYLOAD_VERSION,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        registryLifecycle: 'OFFBOARDED',
        offboardedAt: offboardedAt.toISOString(),
        reason: input.reason,
      };

      await this.ensureOffboardOutboxEvent(tx, {
        idempotencyKey: outboxKey,
        payload,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        offboardedAt,
      });

      return {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        registryLifecycle: 'OFFBOARDED',
        offboardedAt,
        idempotentReplay: false,
      };
    });
  }

  private async ensureOffboardOutboxEvent(
    tx: Prisma.TransactionClient,
    input: {
      idempotencyKey: string;
      payload: VehicleOffboardedOutboxPayloadV1;
      vehicleId: string;
      organizationId: string;
      offboardedAt: Date;
    },
  ): Promise<void> {
    const existing = await tx.vehicleRegistryLifecycleOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const existingPayload = existing.payload as unknown as VehicleOffboardedOutboxPayloadV1;
      const semanticMatch =
        existing.eventType === 'VEHICLE_OFFBOARDED' &&
        existing.vehicleId === input.vehicleId &&
        existing.organizationId === input.organizationId &&
        existing.payloadVersion === OFFBOARD_OUTBOX_PAYLOAD_VERSION &&
        existingPayload?.vehicleId === input.vehicleId &&
        existingPayload?.reason === input.payload.reason;
      if (!semanticMatch) {
        throw new VehicleOnboardingError(
          'OUTBOX_IDEMPOTENCY_CONFLICT',
          'Lifecycle outbox idempotency key belongs to a different offboarding',
        );
      }
      return;
    }

    const eventId = randomUUID();
    try {
      await tx.vehicleRegistryLifecycleOutbox.create({
        data: {
          id: randomUUID(),
          eventId,
          eventType: 'VEHICLE_OFFBOARDED',
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          payloadVersion: OFFBOARD_OUTBOX_PAYLOAD_VERSION,
          payload: input.payload as unknown as Prisma.InputJsonValue,
          occurredAt: input.offboardedAt,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (error) {
      if (!isPrismaUniqueViolation(error, ['idempotency_key'])) {
        throw error;
      }
      throw new VehicleOnboardingError(
        'ONBOARDING_CONCURRENCY_CONFLICT',
        'Lifecycle outbox idempotency race',
      );
    }
  }
}
