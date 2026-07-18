import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertHomeFleetTargetStationAssignable,
  buildHomeFleetVehicleIdempotencyKey,
  evaluateAddVehicleToHomeStation,
  evaluateMoveVehicleToHomeStation,
  evaluateRemoveVehicleFromHomeStation,
} from './vehicle-home-fleet-delta.util';
import {
  VehicleHomeFleetDeltaCommandName,
  VehicleHomeFleetDeltaIssueCode,
  VehicleHomeFleetDeltaItemOutcome,
  type VehicleHomeFleetDeltaBatchResult,
  type VehicleHomeFleetDeltaItemResult,
  type VehicleHomeFleetDeltaVehicleSnapshot,
} from './vehicle-home-fleet-delta.types';

type VehicleRow = {
  id: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  stationPositionVersion: number;
  status: VehicleHomeFleetDeltaVehicleSnapshot['status'];
};

@Injectable()
export class VehicleHomeFleetDeltaService {
  constructor(private readonly prisma: PrismaService) {}

  async addVehiclesToHomeStation(
    organizationId: string,
    stationId: string,
    vehicleIds: string[],
    options?: { idempotencyKey?: string | null; reason?: string | null },
  ): Promise<VehicleHomeFleetDeltaBatchResult> {
    const station = await this.requireAssignableTargetStation(organizationId, stationId);
    if (!station) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }

    return this.processBatch({
      command: VehicleHomeFleetDeltaCommandName.ADD,
      organizationId,
      stationId,
      vehicleIds,
      batchIdempotencyKey: options?.idempotencyKey ?? null,
      evaluate: (vehicle) =>
        evaluateAddVehicleToHomeStation({
          vehicleId: vehicle.id,
          homeStationId: vehicle.homeStationId,
          targetStationId: stationId,
          vehicleStatus: vehicle.status as never,
        }),
    });
  }

  async removeVehiclesFromHomeStation(
    organizationId: string,
    stationId: string,
    vehicleIds: string[],
    options?: { idempotencyKey?: string | null; reason?: string | null },
  ): Promise<VehicleHomeFleetDeltaBatchResult> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true },
    });
    if (!station) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }

    return this.processBatch({
      command: VehicleHomeFleetDeltaCommandName.REMOVE,
      organizationId,
      stationId,
      vehicleIds,
      batchIdempotencyKey: options?.idempotencyKey ?? null,
      evaluate: (vehicle) =>
        evaluateRemoveVehicleFromHomeStation({
          sourceStationId: stationId,
          homeStationId: vehicle.homeStationId,
          vehicleStatus: vehicle.status as never,
        }),
    });
  }

  async moveVehiclesToHomeStation(
    organizationId: string,
    sourceStationId: string,
    targetStationId: string,
    vehicleIds: string[],
    options?: { idempotencyKey?: string | null; reason?: string | null },
  ): Promise<VehicleHomeFleetDeltaBatchResult> {
    const [sourceStation, targetStation] = await Promise.all([
      this.prisma.station.findFirst({
        where: { id: sourceStationId, organizationId },
        select: { id: true, status: true, name: true },
      }),
      this.requireAssignableTargetStation(organizationId, targetStationId),
    ]);

    if (!sourceStation) {
      throw new NotFoundException(`Station ${sourceStationId} not found`);
    }
    if (!targetStation) {
      throw new NotFoundException(`Station ${targetStationId} not found`);
    }

    return this.processBatch({
      command: VehicleHomeFleetDeltaCommandName.MOVE,
      organizationId,
      stationId: sourceStationId,
      targetStationId,
      vehicleIds,
      batchIdempotencyKey: options?.idempotencyKey ?? null,
      evaluate: (vehicle) =>
        evaluateMoveVehicleToHomeStation({
          sourceStationId,
          targetStationId,
          homeStationId: vehicle.homeStationId,
          vehicleStatus: vehicle.status as never,
        }),
    });
  }

  private async requireAssignableTargetStation(organizationId: string, stationId: string) {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true, status: true, name: true },
    });
    if (!station) return null;

    const issue = assertHomeFleetTargetStationAssignable(station);
    if (issue) {
      throw new NotFoundException({
        message: issue.message,
        code: issue.code,
      });
    }

    return station;
  }

  private async processBatch(input: {
    command: VehicleHomeFleetDeltaBatchResult['command'];
    organizationId: string;
    stationId: string;
    targetStationId?: string;
    vehicleIds: string[];
    batchIdempotencyKey: string | null;
    evaluate: (
      vehicle: VehicleRow,
    ) => Pick<VehicleHomeFleetDeltaItemResult, 'outcome' | 'warnings' | 'error'> & {
      nextHomeStationId: string | null;
    };
  }): Promise<VehicleHomeFleetDeltaBatchResult> {
    const uniqueVehicleIds = Array.from(
      new Set((input.vehicleIds ?? []).filter((id) => typeof id === 'string' && id.length > 0)),
    );

    const vehicles = uniqueVehicleIds.length
      ? await this.prisma.vehicle.findMany({
          where: { organizationId: input.organizationId, id: { in: uniqueVehicleIds } },
          select: {
            id: true,
            homeStationId: true,
            currentStationId: true,
            expectedStationId: true,
            stationPositionVersion: true,
            status: true,
          },
        })
      : [];

    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const operation = input.command === VehicleHomeFleetDeltaCommandName.ADD
      ? 'add'
      : input.command === VehicleHomeFleetDeltaCommandName.REMOVE
        ? 'remove'
        : 'move';

    const results: VehicleHomeFleetDeltaItemResult[] = [];

    for (const vehicleId of uniqueVehicleIds) {
      const idempotencyKey = buildHomeFleetVehicleIdempotencyKey({
        operation,
        organizationId: input.organizationId,
        stationId: input.stationId,
        vehicleId,
        targetStationId: input.targetStationId ?? null,
        batchIdempotencyKey: input.batchIdempotencyKey,
      });

      const vehicle = vehicleById.get(vehicleId);
      if (!vehicle) {
        results.push({
          vehicleId,
          idempotencyKey,
          outcome: VehicleHomeFleetDeltaItemOutcome.FAILED,
          vehicle: null,
          warnings: [],
          error: {
            code: VehicleHomeFleetDeltaIssueCode.VEHICLE_NOT_FOUND,
            message: 'Vehicle does not belong to this organization.',
          },
        });
        continue;
      }

      const evaluation = input.evaluate(vehicle);
      if (
        evaluation.outcome === VehicleHomeFleetDeltaItemOutcome.IDEMPOTENT ||
        evaluation.outcome === VehicleHomeFleetDeltaItemOutcome.FAILED
      ) {
        results.push({
          vehicleId,
          idempotencyKey,
          outcome: evaluation.outcome,
          vehicle: this.toSnapshot(vehicle),
          warnings: evaluation.warnings,
          error: evaluation.error,
        });
        continue;
      }

      const updated = await this.applyHomeOnlyUpdate(
        input.organizationId,
        vehicle,
        evaluation.nextHomeStationId,
      );

      results.push({
        vehicleId,
        idempotencyKey,
        outcome: updated.outcome,
        vehicle: updated.vehicle,
        warnings: evaluation.warnings,
        error: updated.error,
      });
    }

    return {
      command: input.command,
      organizationId: input.organizationId,
      stationId: input.stationId,
      targetStationId: input.targetStationId ?? null,
      batchIdempotencyKey: input.batchIdempotencyKey,
      summary: summarizeResults(results),
      results,
    };
  }

  private async applyHomeOnlyUpdate(
    organizationId: string,
    vehicle: VehicleRow,
    nextHomeStationId: string | null,
  ): Promise<Pick<VehicleHomeFleetDeltaItemResult, 'outcome' | 'vehicle' | 'error'>> {
    const updateResult = await this.prisma.vehicle.updateMany({
      where: {
        id: vehicle.id,
        organizationId,
        stationPositionVersion: vehicle.stationPositionVersion,
      },
      data: {
        homeStationId: nextHomeStationId,
        stationPositionVersion: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      const latest = await this.prisma.vehicle.findFirst({
        where: { id: vehicle.id, organizationId },
        select: {
          id: true,
          homeStationId: true,
          currentStationId: true,
          expectedStationId: true,
          stationPositionVersion: true,
          status: true,
        },
      });

      return {
        outcome: VehicleHomeFleetDeltaItemOutcome.FAILED,
        vehicle: latest ? this.toSnapshot(latest) : this.toSnapshot(vehicle),
        error: {
          code: VehicleHomeFleetDeltaIssueCode.VERSION_CONFLICT,
          message:
            'Vehicle station position version conflict. Reload the vehicle and retry the delta operation.',
        },
      };
    }

    const updated = await this.prisma.vehicle.findFirst({
      where: { id: vehicle.id, organizationId },
      select: {
        id: true,
        homeStationId: true,
        currentStationId: true,
        expectedStationId: true,
        stationPositionVersion: true,
        status: true,
      },
    });

    return {
      outcome: VehicleHomeFleetDeltaItemOutcome.APPLIED,
      vehicle: updated ? this.toSnapshot(updated) : null,
      error: null,
    };
  }

  private toSnapshot(vehicle: VehicleRow): VehicleHomeFleetDeltaVehicleSnapshot {
    return {
      id: vehicle.id,
      homeStationId: vehicle.homeStationId,
      currentStationId: vehicle.currentStationId,
      expectedStationId: vehicle.expectedStationId,
      stationPositionVersion: vehicle.stationPositionVersion,
      status: vehicle.status,
    };
  }
}

function summarizeResults(results: VehicleHomeFleetDeltaItemResult[]) {
  return {
    requested: results.length,
    applied: results.filter((r) => r.outcome === VehicleHomeFleetDeltaItemOutcome.APPLIED).length,
    idempotent: results.filter((r) => r.outcome === VehicleHomeFleetDeltaItemOutcome.IDEMPOTENT)
      .length,
    failed: results.filter((r) => r.outcome === VehicleHomeFleetDeltaItemOutcome.FAILED).length,
  };
}
