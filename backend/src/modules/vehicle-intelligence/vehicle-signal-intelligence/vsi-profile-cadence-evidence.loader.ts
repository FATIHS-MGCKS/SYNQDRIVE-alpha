import { Injectable, Optional } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import { buildP25ApdProfileLvLoaderWhere } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-profile-lv-loader';
import {
  clipTripWindowsToLinkBounds,
  resolveIceRpmApplicability,
} from './vsi-profile-cadence-stats.util';
import type {
  VsiHfCadenceReadStatus,
  VsiLvCadenceEvidenceInput,
  VsiLvCadenceEvidencePoint,
  VsiLvStandbyTransmissionEvidenceInput,
  VsiRpmCadenceEvidenceInput,
  VsiRpmCadenceSamplePoint,
  VsiRpmCadenceTripWindow,
} from './vsi-profile-cadence.types';
import { loadLvStandbyTransmissionEvidenceFromDb } from './vsi-lv-standby-transmission-evidence.loader';

const RPM_HISTORY_DAYS = 14;
const MAX_FINALIZED_TRIPS = 20;
const MAX_RPM_POINTS = 12_000;
const MAX_LV_ROWS = 256;

const ENGINE_RPM_SIGNAL = 'powertrainCombustionEngineSpeed';

/** Public surface for cadence evidence loading (tests may supply a noop port). */
export interface VsiProfileCadenceEvidencePort {
  loadRpmEvidence(
    ctx: VsiProfileCadenceLoadContext,
  ): Promise<VsiRpmCadenceEvidenceInput | null>;
  loadLvEvidence(ctx: VsiProfileCadenceLoadContext): Promise<VsiLvCadenceEvidenceInput | null>;
  loadLvStandbyTransmissionEvidence(
    ctx: VsiProfileCadenceLoadContext,
  ): Promise<import('./vsi-profile-cadence.types').VsiLvStandbyTransmissionEvidenceInput | null>;
}

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
  /** When set, HF readiness is checked for this trip before RPM cadence refresh. */
  rpmTripIdForReadiness?: string | null;
};

@Injectable()
export class VsiProfileCadenceEvidenceLoader implements VsiProfileCadenceEvidencePort {
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

    const iceRpmApplicability = resolveIceRpmApplicability(ctx.fuelType);
    const linkActivatedMs = ctx.linkActivatedAt.getTime();
    const linkDeactivatedMs = ctx.linkDeactivatedAt?.getTime() ?? null;
    const windowStart = new Date(
      Math.max(
        linkActivatedMs,
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

    const tripWindows: VsiRpmCadenceTripWindow[] = clipTripWindowsToLinkBounds(
      trips
        .filter((t) => t.endTime != null)
        .map((t) => ({
          tripId: t.id,
          startMs: t.startTime.getTime(),
          endMs: t.endTime!.getTime(),
        })),
      linkActivatedMs,
      linkDeactivatedMs,
    );

    let hfReadStatus: VsiHfCadenceReadStatus = 'SKIPPED';
    let points: VsiRpmCadenceSamplePoint[] = [];

    if (iceRpmApplicability === 'APPLICABLE' && tripWindows.length > 0) {
      if (!this.clickHouseHf) {
        hfReadStatus = 'UNAVAILABLE';
      } else {
        if (ctx.rpmTripIdForReadiness) {
          const ready = await this.clickHouseHf.hasTripHfPoints(
            ctx.vehicleId,
            ctx.rpmTripIdForReadiness,
          );
          if (!ready) {
            return {
              iceRpmApplicability,
              tripWindows,
              points: [],
              provenance: [],
              hfReadStatus: 'EMPTY',
            };
          }
        }
        const earliest = Math.min(...tripWindows.map((t) => t.startMs));
        const latest = Math.max(...tripWindows.map((t) => t.endMs));
        const read = await this.clickHouseHf.getBoundedSignalValuePoints({
          vehicleId: ctx.vehicleId,
          signalName: ENGINE_RPM_SIGNAL,
          from: new Date(earliest),
          to: new Date(latest),
          limit: MAX_RPM_POINTS,
        });
        hfReadStatus = read.status;
        points = read.points;
      }
    }

    return {
      iceRpmApplicability,
      tripWindows,
      points,
      provenance:
        hfReadStatus === 'SUCCESS' ? ['CLICKHOUSE_TELEMETRY_HF_POINTS'] : [],
      hfReadStatus,
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

    const linkEnd = ctx.linkDeactivatedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const points: VsiLvCadenceEvidencePoint[] = rows
      .map((r) => ({
        observedAtMs: r.observedAt.getTime(),
        providerTimestampMs: r.providerTimestamp?.getTime() ?? null,
      }))
      .filter(
        (p) =>
          p.observedAtMs >= ctx.linkActivatedAt.getTime() &&
          p.observedAtMs <= linkEnd,
      )
      .reverse();

    return {
      points,
      provenance: ['POSTGRES_BATTERY_MEASUREMENTS'],
      linkActivatedAtMs: ctx.linkActivatedAt.getTime(),
      linkDeactivatedAtMs: ctx.linkDeactivatedAt?.getTime() ?? null,
    };
  }

  async loadLvStandbyTransmissionEvidence(
    ctx: VsiProfileCadenceLoadContext,
  ): Promise<VsiLvStandbyTransmissionEvidenceInput | null> {
    return loadLvStandbyTransmissionEvidenceFromDb(this.prisma, ctx);
  }
}
