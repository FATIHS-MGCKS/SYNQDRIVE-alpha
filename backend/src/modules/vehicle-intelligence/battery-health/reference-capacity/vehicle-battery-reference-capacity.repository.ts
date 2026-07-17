import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReferenceCapacityVerificationStatus,
  type VehicleBatteryReferenceCapacity,
  type VehicleBatteryReferenceCapacityChange,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { ReferenceCapacityChangeAction } from './vehicle-battery-reference-capacity.policy';

export interface CreateReferenceCapacityRowInput {
  organizationId: string;
  vehicleId: string;
  capacityKwh: number;
  capacityType: string;
  source: string;
  verificationStatus: ReferenceCapacityVerificationStatus;
  documentId?: string | null;
  serviceEventId?: string | null;
  notes?: string | null;
  supersedeActiveId?: string | null;
}

@Injectable()
export class VehicleBatteryReferenceCapacityRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveForVehicle(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<VehicleBatteryReferenceCapacity | null> {
    return this.prisma.vehicleBatteryReferenceCapacity.findFirst({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        isActive: true,
        supersededById: null,
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  listHistory(input: {
    organizationId: string;
    vehicleId: string;
    limit?: number;
  }): Promise<VehicleBatteryReferenceCapacity[]> {
    return this.prisma.vehicleBatteryReferenceCapacity.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      orderBy: { effectiveFrom: 'desc' },
      take: input.limit ?? 20,
    });
  }

  listAuditTrail(input: {
    organizationId: string;
    vehicleId: string;
    limit?: number;
  }): Promise<VehicleBatteryReferenceCapacityChange[]> {
    return this.prisma.vehicleBatteryReferenceCapacityChange.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      orderBy: { changedAt: 'desc' },
      take: input.limit ?? 50,
    });
  }

  async createWithSupersede(
    input: CreateReferenceCapacityRowInput,
  ): Promise<VehicleBatteryReferenceCapacity> {
    return this.prisma.$transaction(async (tx) => {
      let supersededId: string | null = null;

      if (input.supersedeActiveId) {
        const active = await tx.vehicleBatteryReferenceCapacity.findFirst({
          where: {
            id: input.supersedeActiveId,
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            isActive: true,
          },
        });
        if (active) {
          await tx.vehicleBatteryReferenceCapacity.update({
            where: { id: active.id },
            data: {
              isActive: false,
              effectiveTo: new Date(),
            },
          });
          supersededId = active.id;
        }
      }

      const created = await tx.vehicleBatteryReferenceCapacity.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          capacityKwh: input.capacityKwh,
          capacityType: input.capacityType as never,
          source: input.source as never,
          verificationStatus: input.verificationStatus,
          documentId: input.documentId ?? null,
          serviceEventId: input.serviceEventId ?? null,
          notes: input.notes ?? null,
          isActive: true,
        },
      });

      if (supersededId) {
        await tx.vehicleBatteryReferenceCapacity.update({
          where: { id: supersededId },
          data: { supersededById: created.id },
        });
      }

      return created;
    });
  }

  updateNotes(input: {
    id: string;
    notes: string;
  }): Promise<VehicleBatteryReferenceCapacity> {
    return this.prisma.vehicleBatteryReferenceCapacity.update({
      where: { id: input.id },
      data: { notes: input.notes },
    });
  }

  updateVerified(input: {
    id: string;
    verifiedByUserId: string;
    verifiedAt: Date;
    notes?: string | null;
  }): Promise<VehicleBatteryReferenceCapacity> {
    return this.prisma.vehicleBatteryReferenceCapacity.update({
      where: { id: input.id },
      data: {
        verificationStatus: ReferenceCapacityVerificationStatus.VERIFIED,
        verifiedByUserId: input.verifiedByUserId,
        verifiedAt: input.verifiedAt,
        notes: input.notes ?? undefined,
      },
    });
  }

  async appendChange(input: {
    organizationId: string;
    vehicleId: string;
    referenceCapacityId?: string | null;
    action: ReferenceCapacityChangeAction;
    previousStatus?: ReferenceCapacityVerificationStatus | null;
    newStatus?: ReferenceCapacityVerificationStatus | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<VehicleBatteryReferenceCapacityChange> {
    return this.prisma.vehicleBatteryReferenceCapacityChange.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        referenceCapacityId: input.referenceCapacityId ?? null,
        action: input.action,
        previousStatus: input.previousStatus ?? null,
        newStatus: input.newStatus ?? null,
        actorUserId: input.actorUserId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
