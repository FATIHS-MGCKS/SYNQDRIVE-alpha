import { Injectable } from '@nestjs/common';
import type { Prisma, VehicleRegistryLifecycle } from '@prisma/client';
import { VehicleProviderConsentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import {
  OFFBOARD_OUTBOX_PAYLOAD_VERSION,
  type VehicleOffboardedOutboxPayloadV2,
} from '../contracts/offboard-outbox-payload.v1';
import type { VehicleOffboardReasonCode } from '../contracts/vehicle-offboard-reason.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  assertOffboardOutboxSemanticMatch,
  buildExpectedOffboardSemantics,
} from '../offboarding/offboard-outbox-semantics';
import { closeOpenOrganizationAssignmentForOffboard } from '../offboarding/offboard-organization-assignment';

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
    const expectedSemantics = buildExpectedOffboardSemantics({
      vehicleId: input.vehicleId,
      organizationId: input.organizationId,
      reason: input.reason,
    });

    return this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{ registry_lifecycle: VehicleRegistryLifecycle }>
      >`
        SELECT registry_lifecycle
        FROM vehicles
        WHERE id = ${input.vehicleId}
          AND organization_id = ${input.organizationId}
        FOR UPDATE
      `;
      if (lockedRows.length === 0) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Vehicle not found for organization');
      }
      const registryLifecycle = lockedRows[0]!.registry_lifecycle;

      const replayFromOutbox = async (): Promise<OffboardVehicleResult | null> => {
        const existingOutbox = await tx.vehicleRegistryLifecycleOutbox.findUnique({
          where: { idempotencyKey: outboxKey },
        });
        if (!existingOutbox) return null;
        assertOffboardOutboxSemanticMatch(existingOutbox, expectedSemantics);
        return {
          vehicleId: input.vehicleId,
          organizationId: input.organizationId,
          registryLifecycle: 'OFFBOARDED',
          offboardedAt: existingOutbox.occurredAt,
          idempotentReplay: true,
        };
      };

      if (registryLifecycle === 'OFFBOARDED') {
        const replay = await replayFromOutbox();
        if (replay) return replay;
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          'Vehicle is already offboarded',
        );
      }

      if (registryLifecycle !== 'ACTIVE') {
        throw new VehicleOnboardingError(
          'VEHICLE_REGISTRY_INVALID_TRANSITION',
          `Cannot offboard vehicle in registry lifecycle ${registryLifecycle}`,
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
          const replay = await replayFromOutbox();
          if (replay) return replay;
        }
        throw new VehicleOnboardingError(
          'ONBOARDING_CONCURRENCY_CONFLICT',
          'Vehicle registry lifecycle changed concurrently',
        );
      }

      await closeOpenOrganizationAssignmentForOffboard(tx, {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        reason: input.reason,
        offboardedAt,
      });

      await tx.vehicleDataSourceLink.updateMany({
        where: { vehicleId: input.vehicleId, isActive: true },
        data: {
          isActive: false,
          deactivatedAt: offboardedAt,
          deactivationReason: 'VEHICLE_OFFBOARDED',
        },
      });

      await tx.vehicleProviderConsent.updateMany({
        where: {
          vehicleId: input.vehicleId,
          status: VehicleProviderConsentStatus.ACTIVE,
        },
        data: {
          status: VehicleProviderConsentStatus.REVOKED,
          revokedAt: offboardedAt,
          revokedByUserId: input.actorUserId,
          metadataJson: {
            revokedReason: 'VEHICLE_OFFBOARDED',
            offboardReason: input.reason,
          },
        },
      });

      const payload: VehicleOffboardedOutboxPayloadV2 = {
        version: OFFBOARD_OUTBOX_PAYLOAD_VERSION,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        registryLifecycle: 'OFFBOARDED',
        offboardedAt: offboardedAt.toISOString(),
        reason: input.reason,
        actorUserId: input.actorUserId,
      };

      await this.ensureOffboardOutboxEvent(tx, {
        idempotencyKey: outboxKey,
        payload,
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        offboardedAt,
        expectedSemantics,
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
      payload: VehicleOffboardedOutboxPayloadV2;
      vehicleId: string;
      organizationId: string;
      offboardedAt: Date;
      expectedSemantics: ReturnType<typeof buildExpectedOffboardSemantics>;
    },
  ): Promise<void> {
    const existing = await tx.vehicleRegistryLifecycleOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      assertOffboardOutboxSemanticMatch(existing, input.expectedSemantics);
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
      const raced = await tx.vehicleRegistryLifecycleOutbox.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raced) {
        assertOffboardOutboxSemanticMatch(raced, input.expectedSemantics);
        return;
      }
      throw new VehicleOnboardingError(
        'ONBOARDING_CONCURRENCY_CONFLICT',
        'Lifecycle outbox idempotency race',
      );
    }
  }
}
