import { Injectable, NotFoundException } from '@nestjs/common';
import { VehicleRegistryLifecycle } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { composeReadonlyVehicleSignals } from './vsi-readonly-composer.engine';
import type {
  VsiReadonlyComposerRequest,
  VsiReadonlyComposerResult,
} from './vsi-readonly-composer.types';

const MAX_SOURCE_LINKS = 10;
const DEFAULT_POLL_LOG_LIMIT = 5;
const MAX_POLL_LOG_LIMIT = 20;

/**
 * Read-only VSI P1 composer — no provider calls, no persistence writes.
 */
@Injectable()
export class VsiReadonlySignalComposerService {
  constructor(private readonly prisma: PrismaService) {}

  async composeVehicleSignals(
    request: VsiReadonlyComposerRequest,
  ): Promise<VsiReadonlyComposerResult> {
    const projectionAsOf = request.projectionAsOf ?? new Date();
    const pollLogLookbackLimit = Math.min(
      Math.max(request.pollLogLookbackLimit ?? DEFAULT_POLL_LOG_LIMIT, 1),
      MAX_POLL_LOG_LIMIT,
    );

    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: request.vehicleId,
        organizationId: request.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        registryLifecycle: true,
        hardwareType: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for tenant scope');
    }

    const links = await this.prisma.vehicleDataSourceLink.findMany({
      where: {
        vehicleId: request.vehicleId,
        isActive: true,
      },
      orderBy: { activatedAt: 'desc' },
      take: MAX_SOURCE_LINKS,
      select: {
        id: true,
        provider: true,
        isActive: true,
        metadata: true,
      },
    });

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId: request.vehicleId },
    });

    const pollLogs = await this.prisma.dimoPollLog.findMany({
      where: { vehicleId: request.vehicleId },
      orderBy: { createdAt: 'desc' },
      take: pollLogLookbackLimit,
      select: {
        status: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    return composeReadonlyVehicleSignals({
      organizationId: request.organizationId,
      vehicleId: request.vehicleId,
      registryLifecycle: vehicle.registryLifecycle,
      hardwareTypeLegacy: vehicle.hardwareType,
      projectionAsOf,
      links,
      latestState: latestState
        ? {
            vehicleId: latestState.vehicleId,
            providerBindingId: latestState.providerBindingId,
            lvBatteryVoltage: latestState.lvBatteryVoltage,
            evSoc: latestState.evSoc,
            online: latestState.online,
            sourceTimestamp: latestState.sourceTimestamp,
            providerFetchedAt: latestState.providerFetchedAt,
            updatedAt: latestState.updatedAt,
            rawPayloadJson: latestState.rawPayloadJson,
          }
        : null,
      pollLogs,
      offboarded: vehicle.registryLifecycle === VehicleRegistryLifecycle.OFFBOARDED,
    });
  }
}
