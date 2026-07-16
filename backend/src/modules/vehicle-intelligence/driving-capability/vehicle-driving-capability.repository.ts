import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { UpsertVehicleDrivingCapabilityInput } from './vehicle-driving-capability.types';
import {
  normalizeCapabilityStatusForWrite,
  resolveCapabilityKey,
} from './vehicle-driving-capability.util';
import { buildLifecycleMetadata } from './vehicle-driving-capability-lifecycle.transition';

@Injectable()
export class VehicleDrivingCapabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertVehicleInOrg(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }
  }

  findByVehicle(organizationId: string, vehicleId: string) {
    return this.prisma.vehicleDrivingCapability.findMany({
      where: { organizationId, vehicleId },
      orderBy: [{ providerSource: 'asc' }, { capabilityKey: 'asc' }],
    });
  }

  findOne(
    organizationId: string,
    vehicleId: string,
    providerSource: string,
    capabilityKey: string,
  ) {
    return this.prisma.vehicleDrivingCapability.findUnique({
      where: {
        organizationId_vehicleId_providerSource_capabilityKey: {
          organizationId,
          vehicleId,
          providerSource,
          capabilityKey,
        },
      },
    });
  }

  /**
   * Idempotent upsert for probe results. Does not schedule or trigger polls.
   */
  async upsertProbe(input: UpsertVehicleDrivingCapabilityInput) {
    await this.assertVehicleInOrg(input.organizationId, input.vehicleId);

    const capabilityKey = resolveCapabilityKey(input.signalName, input.detectorName);
    const capabilityStatus = normalizeCapabilityStatusForWrite(
      input.capabilityStatus,
      input.metadata ?? null,
    );
    const checkedAt = input.checkedAt;
    const lastSeenAt = input.lastSeenAt ?? checkedAt;
    const firstSeenAt = input.firstSeenAt ?? checkedAt;

    const lifecycleMetadata =
      input.refreshTrigger != null
        ? buildLifecycleMetadata({
            refreshTrigger: input.refreshTrigger,
            previousRow: input.previousRow ?? null,
            nextStatus: capabilityStatus,
            checkedAt,
            existingMetadata: input.metadata ?? null,
          })
        : (input.metadata ?? null);

    const metadata = lifecycleMetadata as Prisma.InputJsonValue | undefined;

    return this.prisma.vehicleDrivingCapability.upsert({
      where: {
        organizationId_vehicleId_providerSource_capabilityKey: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          providerSource: input.providerSource,
          capabilityKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        hardwareProfile: input.hardwareProfile,
        providerSource: input.providerSource,
        signalName: input.signalName?.trim() || null,
        detectorName: input.detectorName?.trim() || null,
        capabilityKey,
        capabilityStatus,
        firstSeenAt,
        lastSeenAt,
        checkedAt,
        effectiveCadenceMs: input.effectiveCadenceMs ?? null,
        p95CadenceMs: input.p95CadenceMs ?? null,
        coverage: input.coverage ?? null,
        nativeEventAvailable: input.nativeEventAvailable ?? false,
        metadata,
        capabilityVersion: input.capabilityVersion,
      },
      update: {
        hardwareProfile: input.hardwareProfile,
        capabilityStatus,
        lastSeenAt,
        checkedAt,
        effectiveCadenceMs: input.effectiveCadenceMs ?? null,
        p95CadenceMs: input.p95CadenceMs ?? null,
        coverage: input.coverage ?? null,
        nativeEventAvailable: input.nativeEventAvailable ?? false,
        metadata,
        capabilityVersion: input.capabilityVersion,
      },
    });
  }
}
