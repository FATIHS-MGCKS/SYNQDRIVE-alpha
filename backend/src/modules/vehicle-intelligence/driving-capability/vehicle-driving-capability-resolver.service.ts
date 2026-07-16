import { Injectable } from '@nestjs/common';
import type { VehicleDrivingCapability } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { deriveVehicleCapabilityProfile } from '../vehicle-capabilities';
import {
  DRIVING_CAPABILITY_PROVIDER,
  type ResolvedVehicleDrivingCapability,
  type VehicleDrivingCapabilitySnapshot,
} from './vehicle-driving-capability.types';
import { VehicleDrivingCapabilityRepository } from './vehicle-driving-capability.repository';
import { resolveCapabilityKey, unknownCapability } from './vehicle-driving-capability.util';

/**
 * Read-only resolver: persisted per-vehicle probes are the source of truth.
 * Hardware type alone never upgrades capability to SUPPORTED.
 */
@Injectable()
export class VehicleDrivingCapabilityResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VehicleDrivingCapabilityRepository,
  ) {}

  async resolveForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleDrivingCapabilitySnapshot> {
    const [vehicle, rows] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId },
        select: { id: true, hardwareType: true, fuelType: true },
      }),
      this.repository.findByVehicle(organizationId, vehicleId),
    ]);

    const hardwareBaselineLabel = vehicle
      ? deriveVehicleCapabilityProfile({
          hardwareType: vehicle.hardwareType,
          fuelType: vehicle.fuelType,
        }).profileLabel
      : null;

    return {
      organizationId,
      vehicleId,
      capabilities: rows.map((row) => this.toResolved(row)),
      hardwareBaselineLabel,
    };
  }

  async resolveSignal(
    organizationId: string,
    vehicleId: string,
    providerSource: string,
    signalName: string,
  ): Promise<ResolvedVehicleDrivingCapability> {
    const capabilityKey = resolveCapabilityKey(signalName, null);
    const row = await this.repository.findOne(
      organizationId,
      vehicleId,
      providerSource,
      capabilityKey,
    );
    if (!row) {
      return unknownCapability(
        organizationId,
        vehicleId,
        providerSource,
        capabilityKey,
        signalName,
        null,
      );
    }
    return this.toResolved(row);
  }

  async resolveDetector(
    organizationId: string,
    vehicleId: string,
    providerSource: string,
    detectorName: string,
  ): Promise<ResolvedVehicleDrivingCapability> {
    const capabilityKey = resolveCapabilityKey(null, detectorName);
    const row = await this.repository.findOne(
      organizationId,
      vehicleId,
      providerSource,
      capabilityKey,
    );
    if (!row) {
      return unknownCapability(
        organizationId,
        vehicleId,
        providerSource,
        capabilityKey,
        null,
        detectorName,
      );
    }
    return this.toResolved(row);
  }

  /** Whether native behavior events were empirically observed for this vehicle (not hardware-inferred). */
  async isNativeBehaviorSignalSupported(
    organizationId: string,
    vehicleId: string,
    signalName: string,
  ): Promise<boolean> {
    const resolved = await this.resolveSignal(
      organizationId,
      vehicleId,
      DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
      signalName,
    );
    return (
      resolved.resolutionSource === 'persisted' &&
      resolved.capabilityStatus === 'SUPPORTED' &&
      resolved.nativeEventAvailable === true
    );
  }

  private toResolved(row: VehicleDrivingCapability): ResolvedVehicleDrivingCapability {
    return {
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      providerSource: row.providerSource,
      capabilityKey: row.capabilityKey,
      signalName: row.signalName,
      detectorName: row.detectorName,
      capabilityStatus: row.capabilityStatus,
      nativeEventAvailable: row.nativeEventAvailable,
      hardwareProfile: row.hardwareProfile,
      effectiveCadenceMs: row.effectiveCadenceMs,
      p95CadenceMs: row.p95CadenceMs,
      coverage: row.coverage,
      checkedAt: row.checkedAt,
      resolutionSource: 'persisted',
      row,
    };
  }
}
