import { Injectable } from '@nestjs/common';
import {
  BatteryCapabilityStatus,
  Prisma,
  VehicleBatteryCapability,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  applyCapabilityLifecycle,
  type BatteryCapabilityRefreshTrigger,
} from './battery-capability-lifecycle.policy';
import type { AssessedBatteryCapabilitySignal } from './battery-capability-preflight.types';
import {
  getBatteryCapabilityDegradedGraceMs,
  getBatteryCapabilityLossThreshold,
} from '@config/battery-health-v2.config';

export interface UpsertBatteryCapabilityInput {
  organizationId: string;
  vehicleId: string;
  checkedAt: Date;
  signal: AssessedBatteryCapabilitySignal;
  refreshTrigger?: BatteryCapabilityRefreshTrigger | null;
  correlationId?: string | null;
}

@Injectable()
export class BatteryCapabilityPreflightRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertSignal(
    input: UpsertBatteryCapabilityInput,
  ): Promise<VehicleBatteryCapability> {
    const { organizationId, vehicleId, checkedAt, signal } = input;
    const existing = await this.prisma.vehicleBatteryCapability.findUnique({
      where: {
        vehicleId_signalKey: {
          vehicleId,
          signalKey: signal.signalKey,
        },
      },
    });

    const lifecycle = applyCapabilityLifecycle(
      existing
        ? {
            status: existing.status,
            capabilityVersion: existing.capabilityVersion,
            consecutiveLossCount: existing.consecutiveLossCount,
            degradedAt: existing.degradedAt,
            lastValue: existing.lastValue,
          }
        : null,
      signal.preflightStatus,
      checkedAt,
      {
        lossThreshold: getBatteryCapabilityLossThreshold(),
        degradedGraceMs: getBatteryCapabilityDegradedGraceMs(),
      },
    );

    const firstSeenAt =
      existing?.firstSeenAt ??
      signal.firstSeenAt ??
      signal.sourceTimestamp ??
      null;

    const metadata = {
      ...signal.metadata,
      lifecycleReason: lifecycle.lifecycleReason,
      preflightStatus: signal.preflightStatus,
      refreshTrigger: input.refreshTrigger ?? null,
    } as Prisma.InputJsonValue;

    const data: Prisma.VehicleBatteryCapabilityUncheckedCreateInput = {
      organizationId,
      vehicleId,
      signalKey: signal.signalKey,
      provider: signal.provider,
      status: lifecycle.status,
      measurementType: signal.measurementType,
      capabilityVersion: lifecycle.capabilityVersion,
      consecutiveLossCount: lifecycle.consecutiveLossCount,
      degradedAt: lifecycle.degradedAt,
      firstSeenAt,
      lastSeenAt: signal.lastSeenAt,
      sourceTimestamp: signal.sourceTimestamp,
      lastValue: signal.lastValue,
      metadata,
      checkedAt,
    };

    const saved = await this.prisma.vehicleBatteryCapability.upsert({
      where: {
        vehicleId_signalKey: {
          vehicleId,
          signalKey: signal.signalKey,
        },
      },
      create: data,
      update: {
        provider: data.provider,
        status: data.status,
        measurementType: data.measurementType,
        capabilityVersion: data.capabilityVersion,
        consecutiveLossCount: data.consecutiveLossCount,
        degradedAt: data.degradedAt,
        firstSeenAt,
        lastSeenAt: data.lastSeenAt,
        sourceTimestamp: data.sourceTimestamp,
        lastValue: data.lastValue,
        metadata: data.metadata,
        checkedAt: data.checkedAt,
      },
    });

    if (
      lifecycle.statusChanged ||
      !existing ||
      existing.capabilityVersion !== lifecycle.capabilityVersion
    ) {
      await this.prisma.vehicleBatteryCapabilityChange.create({
        data: {
          organizationId,
          vehicleId,
          capabilityId: saved.id,
          signalKey: signal.signalKey,
          capabilityVersion: lifecycle.capabilityVersion,
          previousStatus: existing?.status ?? null,
          newStatus: lifecycle.status,
          refreshTrigger: input.refreshTrigger ?? null,
          correlationId: input.correlationId ?? null,
          metadata: {
            lifecycleReason: lifecycle.lifecycleReason,
            preflightStatus: signal.preflightStatus,
            consecutiveLossCount: lifecycle.consecutiveLossCount,
          },
        },
      });
    }

    return saved;
  }

  async upsertMany(
    organizationId: string,
    vehicleId: string,
    checkedAt: Date,
    signals: AssessedBatteryCapabilitySignal[],
    options?: {
      refreshTrigger?: BatteryCapabilityRefreshTrigger | null;
      correlationId?: string | null;
    },
  ): Promise<VehicleBatteryCapability[]> {
    const results: VehicleBatteryCapability[] = [];
    for (const signal of signals) {
      results.push(
        await this.upsertSignal({
          organizationId,
          vehicleId,
          checkedAt,
          signal,
          refreshTrigger: options?.refreshTrigger,
          correlationId: options?.correlationId,
        }),
      );
    }
    return results;
  }

  listForVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<VehicleBatteryCapability[]> {
    return this.prisma.vehicleBatteryCapability.findMany({
      where: { organizationId, vehicleId },
      orderBy: { signalKey: 'asc' },
    });
  }

  listChangesForVehicle(
    organizationId: string,
    vehicleId: string,
    limit = 50,
  ) {
    return this.prisma.vehicleBatteryCapabilityChange.findMany({
      where: { organizationId, vehicleId },
      orderBy: { changedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
