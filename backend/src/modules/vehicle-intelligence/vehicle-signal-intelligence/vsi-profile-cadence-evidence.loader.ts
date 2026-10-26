import { Injectable, Optional } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import type { PrismaService } from '../../../shared/database/prisma.service';
import { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import { buildP25ApdProfileLvLoaderWhere } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-profile-lv-loader';
import { isIceRpmApplicableForFuelType } from './vsi-profile-cadence-stats.util';
import type {
  VsiLvCadenceEvidenceInput,
  VsiLvCadenceEvidencePoint,
  VsiRpmCadenceEvidenceInput,
  VsiRpmCadenceSamplePoint,
  VsiRpmCadenceTripWindow,
} from './vsi-profile-cadence.types';

const RPM_HISTORY_DAYS = 14;
const MAX_FINALIZED_TRIPS = 20;
const MAX_RPM_POINTS = 12_000;
const MAX_LV_ROWS = 256;

const ENGINE_RPM_SIGNAL = 'powertrainCombustionEngineSpeed';

export type VsiProfileCadenceLoadContext = {
  organizationId: string;
  vehicleId: string;
  providerSourceLinkId: string;
  fuelType: string | null;
  linkActivatedAt: Date;
  linkDeactivatedAt: Date | null;
  projectionAsOf: Date;
  refreshRpmCadence: boolean;
  refreshLvCadence: boolean;
};

@Injectable()
export class VsiProfileCadenceEvidenceLoader {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clickHouseHf?: ClickHouseHfService,
  ) {}

  async loadRpmEvidence(
    ctx: VsiProfileCadenceLoadContext,
  ): Promise<VsiRpmCadenceEvidenceInput | null> {
    if (!ctx.refreshRpmCadence) {
      return null;
    }

    const iceRpmApplicable = isIceRpmApplicableForFuelType(ctx.fuelType);
    const windowStart = new Date(
      Math.max(
        ctx.linkActivatedAt.getTime(),
        ctx.projectionAsOf.getTime() - RPM_HISTORY_DAYS * 24 * 3600 * 1000,
      ),
    );

    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId: ctx.vehicleId,
        tripStatus: TripStatus.COMPLETED,
        endTime: { not: null, gte: windowStart, lte: ctx.projectionAsOf },
        startTime: { lte: ctx.projectionAsOf },
      },
      orderBy: { endTime: 'desc' },
      take: MAX_FINALIZED_TRIPS,
      select: { id: true, startTime: true, endTime: true },
    });

    const tripWindows: VsiRpmCadenceTripWindow[] = trips
      .filter((t) => t.endTime != null)
      .map((t) => ({
        tripId: t.id,
        startMs: t.startTime.getTime(),
        endMs: t.endTime!.getTime(),
      }));

    let points: VsiRpmCadenceSamplePoint[] = [];
    if (iceRpmApplicable && this.clickHouseHf && tripWindows.length > 0) {
      const earliest = Math.min(...tripWindows.map((t) => t.startMs));
      const latest = Math.max(...tripWindows.map((t) => t.endMs));
      points = await this.clickHouseHf.getBoundedSignalValuePoints({
        vehicleId: ctx.vehicleId,
        signalName: ENGINE_RPM_SIGNAL,
        from: new Date(earliest),
        to: new Date(latest),
        limit: MAX_RPM_POINTS,
      });
    }

    return {
      iceRpmApplicable,
      tripWindows,
      points,
      provenance: points.length > 0 ? ['CLICKHOUSE_TELEMETRY_HF_POINTS'] : [],
    };
  }

  async loadLvEvidence(ctx: VsiProfileCadenceLoadContext): Promise<VsiLvCadenceEvidenceInput | null> {
    if (!ctx.refreshLvCadence) {
      return null;
    }

    const decisionAtMs = ctx.projectionAsOf.getTime();
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: buildP25ApdProfileLvLoaderWhere(ctx.vehicleId, decisionAtMs),
      orderBy: [{ observedAt: 'desc' }],
      take: MAX_LV_ROWS,
      select: {
        observedAt: true,
        providerTimestamp: true,
      },
    });

    const points: VsiLvCadenceEvidencePoint[] = rows
      .map((r) => ({
        observedAtMs: r.observedAt.getTime(),
        providerTimestampMs: r.providerTimestamp?.getTime() ?? null,
      }))
      .reverse();

    return {
      points,
      provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
      linkActivatedAtMs: ctx.linkActivatedAt.getTime(),
      linkDeactivatedAtMs: ctx.linkDeactivatedAt?.getTime() ?? null,
    };
  }
}
