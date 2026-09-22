import { Injectable } from '@nestjs/common';
import {
  BatteryProviderObservabilityGapStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { OPEN_PROVIDER_GAP_STATUSES } from './provider-observability-gap.constants';

function vehicleAdvisoryLockKey(vehicleId: string): bigint {
  let hash = 0;
  for (let i = 0; i < vehicleId.length; i += 1) {
    hash = (hash * 31 + vehicleId.charCodeAt(i)) | 0;
  }
  return BigInt(Math.abs(hash));
}

export type OpenProviderGapResult =
  | { outcome: 'created'; gapId: string }
  | { outcome: 'extended'; gapId: string }
  | { outcome: 'duplicate'; gapId: string };

export type ResolveProviderGapResult =
  | { outcome: 'resolved'; gapId: string }
  | { outcome: 'duplicate'; gapId: string }
  | { outcome: 'not_open'; gapId: string };

@Injectable()
export class ProviderObservabilityGapRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenGap(vehicleId: string, contractVersion: string) {
    return this.prisma.batteryProviderObservabilityGap.findFirst({
      where: {
        vehicleId,
        contractVersion,
        status: { in: [...OPEN_PROVIDER_GAP_STATUSES] },
      },
      orderBy: { gapDetectedAt: 'desc' },
    });
  }

  async openOrExtendGap(
    data: Prisma.BatteryProviderObservabilityGapCreateInput,
  ): Promise<OpenProviderGapResult> {
    const vehicleId =
      typeof data.vehicle === 'object' &&
      data.vehicle !== null &&
      'connect' in data.vehicle &&
      data.vehicle.connect &&
      'id' in data.vehicle.connect
        ? (data.vehicle.connect.id as string)
        : null;
    const contractVersion =
      typeof data.contractVersion === 'string' ? data.contractVersion : null;

    if (!vehicleId || !contractVersion) {
      throw new Error('openOrExtendGap requires vehicle.connect.id and contractVersion');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${vehicleAdvisoryLockKey(vehicleId)})`;

      const open = await tx.batteryProviderObservabilityGap.findFirst({
        where: {
          vehicleId,
          contractVersion,
          status: BatteryProviderObservabilityGapStatus.OPEN,
        },
      });

      if (open) {
        if (open.idempotencyKey === data.idempotencyKey) {
          const updated = await tx.batteryProviderObservabilityGap.update({
            where: { id: open.id },
            data: {
              staleSuccessfulPollCount: { increment: 1 },
              updatedAt: new Date(),
            },
          });
          return { outcome: 'extended', gapId: updated.id };
        }
        return { outcome: 'duplicate', gapId: open.id };
      }

      try {
        const created = await tx.batteryProviderObservabilityGap.create({ data });
        return { outcome: 'created', gapId: created.id };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const raced = await tx.batteryProviderObservabilityGap.findFirst({
            where: {
              organizationId:
                typeof data.organization === 'object' &&
                data.organization &&
                'connect' in data.organization &&
                data.organization.connect &&
                'id' in data.organization.connect
                  ? (data.organization.connect.id as string)
                  : undefined,
              vehicleId,
              idempotencyKey:
                typeof data.idempotencyKey === 'string' ? data.idempotencyKey : undefined,
            },
          });
          if (raced) {
            if (raced.status === BatteryProviderObservabilityGapStatus.OPEN) {
              const updated = await tx.batteryProviderObservabilityGap.update({
                where: { id: raced.id },
                data: { staleSuccessfulPollCount: { increment: 1 } },
              });
              return {
                outcome: raced.idempotencyKey === data.idempotencyKey ? 'extended' : 'duplicate',
                gapId: updated.id,
              };
            }
            return { outcome: 'duplicate', gapId: raced.id };
          }
        }
        throw err;
      }
    });
  }

  async resolveGapIdempotent(input: {
    gapId: string;
    resolutionStatus: BatteryProviderObservabilityGapStatus;
    resolutionAt: Date;
    resolutionIdempotencyKey: string;
    firstFreshObservationAfterGapId?: string | null;
  }): Promise<ResolveProviderGapResult> {
    return this.prisma.$transaction(async (tx) => {
      const gap = await tx.batteryProviderObservabilityGap.findUnique({
        where: { id: input.gapId },
      });
      if (!gap || gap.status !== BatteryProviderObservabilityGapStatus.OPEN) {
        return { outcome: 'not_open', gapId: input.gapId };
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${vehicleAdvisoryLockKey(gap.vehicleId)})`;

      const existingResolution = await tx.batteryProviderObservabilityGap.findFirst({
        where: { resolutionIdempotencyKey: input.resolutionIdempotencyKey },
      });
      if (existingResolution) {
        return { outcome: 'duplicate', gapId: existingResolution.id };
      }

      try {
        await tx.batteryProviderObservabilityGap.update({
          where: { id: gap.id, status: BatteryProviderObservabilityGapStatus.OPEN },
          data: {
            status: input.resolutionStatus,
            resolutionAt: input.resolutionAt,
            resolutionIdempotencyKey: input.resolutionIdempotencyKey,
            firstFreshObservationAfterGapId: input.firstFreshObservationAfterGapId ?? null,
          },
        });
        return { outcome: 'resolved', gapId: gap.id };
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === 'P2002' || err.code === 'P2025')
        ) {
          const raced = await tx.batteryProviderObservabilityGap.findUnique({
            where: { id: gap.id },
          });
          if (raced && raced.status !== BatteryProviderObservabilityGapStatus.OPEN) {
            return { outcome: 'duplicate', gapId: raced.id };
          }
        }
        throw err;
      }
    });
  }
}
