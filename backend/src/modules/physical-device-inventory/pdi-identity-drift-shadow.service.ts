import { Injectable, Logger } from '@nestjs/common';
import { DimoPollJobType, DimoPollStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  isPdiIdentityDriftShadowEnabled,
  PDI_IDENTITY_DRIFT_SHADOW_META_KEY,
} from './pdi-identity-drift-shadow.config';
import {
  applyDualConfirmationPolicy,
  formatShadowLogLine,
  parsePersistedState,
  shouldEmitShadowLogLine,
} from './pdi-identity-drift-shadow.dual-confirmation';
import { evaluateAllInstalledDevices } from './pdi-identity-drift-shadow.evaluator';
import { loadPdiIdentityDriftObservationData } from './pdi-identity-drift-shadow.data-loader';
import type { PdiIdentityDriftShadowPersistedStateV1 } from './pdi-identity-drift-shadow.types';
import { randomUUID } from 'node:crypto';

export type PdiIdentityDriftShadowHookResult = {
  metaJsonFragment: Record<string, unknown>;
};

@Injectable()
export class PdiIdentityDriftShadowService {
  private readonly logger = new Logger(PdiIdentityDriftShadowService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runAfterSuccessfulDimoVehicleSync(input: {
    syncedCount: number;
  }): Promise<PdiIdentityDriftShadowHookResult | null> {
    if (!isPdiIdentityDriftShadowEnabled()) {
      return null;
    }

    const syncRunId = randomUUID();
    const evaluatedAt = new Date();

    try {
      const { devices, knownInventorySerials } = await loadPdiIdentityDriftObservationData(
        this.prisma,
      );

      const evaluatedRows = evaluateAllInstalledDevices({
        now: evaluatedAt,
        syncRunId,
        devices,
        knownInventorySerials,
      });

      const previousState = await this.loadPreviousPersistedState();
      const { rows, nextState } = applyDualConfirmationPolicy({
        rows: evaluatedRows,
        previousState,
        evaluatedAt,
        syncRunId,
      });

      for (const row of rows) {
        if (!shouldEmitShadowLogLine(row, previousState)) continue;
        this.logger.log(formatShadowLogLine(row));
      }

      const nonMatchCount = rows.filter((r) => r.reasonCode !== 'MATCH').length;
      if (nonMatchCount === 0 && devices.length > 0) {
        this.logger.debug(
          JSON.stringify({
            channel: 'PDI_IDENTITY_DRIFT_SHADOW',
            summary: 'all_match',
            evaluatedDeviceCount: devices.length,
            syncRunId,
          }),
        );
      }

      return {
        metaJsonFragment: {
          syncedCount: input.syncedCount,
          [PDI_IDENTITY_DRIFT_SHADOW_META_KEY]: {
            ...nextState,
            evaluatedDeviceCount: devices.length,
            nonMatchCount,
            summaryReasonCounts: rows.reduce<Record<string, number>>((acc, r) => {
              acc[r.reasonCode] = (acc[r.reasonCode] ?? 0) + 1;
              return acc;
            }, {}),
          } satisfies PdiIdentityDriftShadowPersistedStateV1 & Record<string, unknown>,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          channel: 'PDI_IDENTITY_DRIFT_SHADOW',
          level: 'error',
          message: 'shadow_evaluation_failed',
          error: message.slice(0, 500),
          syncRunId,
        }),
      );
      return {
        metaJsonFragment: {
          syncedCount: input.syncedCount,
          [PDI_IDENTITY_DRIFT_SHADOW_META_KEY]: {
            version: 1,
            lastSyncRunId: syncRunId,
            lastEvaluatedAt: evaluatedAt.toISOString(),
            driftCandidates: {},
            shadowError: message.slice(0, 200),
          },
        },
      };
    }
  }

  private async loadPreviousPersistedState(): Promise<PdiIdentityDriftShadowPersistedStateV1 | null> {
    const last = await this.prisma.dimoPollLog.findFirst({
      where: {
        jobType: DimoPollJobType.VEHICLE_SYNC,
        status: DimoPollStatus.SUCCESS,
        vehicleId: null,
      },
      orderBy: { finishedAt: 'desc' },
      select: { metaJson: true },
    });
    if (!last?.metaJson || typeof last.metaJson !== 'object') return null;
    const root = last.metaJson as Record<string, unknown>;
    const nested = root[PDI_IDENTITY_DRIFT_SHADOW_META_KEY];
    return parsePersistedState(nested);
  }
}

export function mergeDimoVehicleSyncMetaJson(
  base: Prisma.InputJsonValue,
  fragment: Record<string, unknown> | null,
): Prisma.InputJsonValue {
  if (!fragment) return base;
  const baseObj =
    base && typeof base === 'object' && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
  return { ...baseObj, ...fragment } as Prisma.InputJsonValue;
}
