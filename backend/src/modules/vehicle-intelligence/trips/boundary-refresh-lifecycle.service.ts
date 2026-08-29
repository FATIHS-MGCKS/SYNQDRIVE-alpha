/**
 * Canonical boundary-refresh lifecycle: enqueue lease, stale recovery, and
 * COMPLETED acknowledgement after mandatory downstream stages finish.
 */

import { Injectable, Logger } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  areBoundaryRefreshStagesComplete,
  boundaryRefreshGenerationMatchesRepair,
  buildBoundaryRefreshRecord,
  BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE,
  emptyBoundaryRefreshStages,
  isBoundaryRefreshRetryable,
  mapAnalysisStageToBoundaryStage,
  readBoundaryRefreshRecord,
  readRawDetectionMeta,
  type BoundaryRefreshRecord,
  type BoundaryRefreshStageState,
  type BoundaryRefreshStages,
} from './boundary-repair.state.util';
import { BOUNDARY_REFRESH_STATE, REPAIR_STATUS } from './reconciliation/reconciliation.types';
import {
  emptyAnalysisStages,
  parseAnalysisStagesJson,
  type AnalysisStageName,
  type AnalysisStageState,
} from './trip-analysis-status';

@Injectable()
export class BoundaryRefreshLifecycleService {
  private readonly logger = new Logger(BoundaryRefreshLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  async persistBoundaryRefreshState(
    tripId: string,
    state: (typeof BOUNDARY_REFRESH_STATE)[keyof typeof BOUNDARY_REFRESH_STATE],
    error?: string,
    opts?: {
      generation?: string;
      stages?: Partial<BoundaryRefreshStages>;
    },
  ): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { rawDetectionMeta: true },
    });
    if (!trip) return;

    const priorMeta = readRawDetectionMeta(trip.rawDetectionMeta);
    const priorRefresh = readBoundaryRefreshRecord(trip.rawDetectionMeta);
    const generation = opts?.generation ?? priorRefresh?.generation;
    if (!generation) {
      this.logger.warn(`persistBoundaryRefreshState: missing generation for trip ${tripId}`);
      return;
    }

    const boundaryRefresh = buildBoundaryRefreshRecord(state, priorRefresh, error, {
      generation,
      stages: opts?.stages,
    });

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        rawDetectionMeta: {
          ...priorMeta,
          boundaryRefresh,
        } as any,
      },
    });
  }

  async markBoundaryStageProgress(
    tripId: string,
    stage: keyof BoundaryRefreshStages,
    stageState: BoundaryRefreshStageState,
  ): Promise<void> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { rawDetectionMeta: true },
    });
    if (!trip) return;

    const refresh = readBoundaryRefreshRecord(trip.rawDetectionMeta);
    if (!refresh || refresh.state === 'COMPLETED') return;
    if (!boundaryRefreshGenerationMatchesRepair(refresh, trip.rawDetectionMeta)) return;

    const priorMeta = readRawDetectionMeta(trip.rawDetectionMeta);
    const nowIso = new Date().toISOString();
    const boundaryRefresh: BoundaryRefreshRecord = {
      ...refresh,
      lastProgressAt: nowIso,
      stages: {
        ...refresh.stages,
        [stage]: stageState,
      },
    };

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        rawDetectionMeta: {
          ...priorMeta,
          boundaryRefresh,
        } as any,
      },
    });

    await this.tryMarkCompleted(tripId);
  }

  async onAnalysisStageUpdated(
    tripId: string,
    stage: AnalysisStageName,
    state: AnalysisStageState,
  ): Promise<void> {
    if (stage === 'route' || stage === 'behavior' || stage === 'drivingImpact') {
      await this.markBoundaryStageProgress(
        tripId,
        stage,
        mapAnalysisStageToBoundaryStage(state),
      );
      return;
    }
    await this.tryMarkCompleted(tripId);
  }

  /**
   * Mark COMPLETED only when mandatory boundary-sensitive stages are terminal and
   * generation still matches the active boundary repair.
   */
  async tryMarkCompleted(tripId: string): Promise<boolean> {
    const trip = await this.prisma.vehicleTrip.findUnique({
      where: { id: tripId },
      select: { rawDetectionMeta: true, analysisStagesJson: true },
    });
    if (!trip) return false;

    const refresh = readBoundaryRefreshRecord(trip.rawDetectionMeta);
    if (!refresh || refresh.state !== 'ENQUEUED') return false;
    if (!boundaryRefreshGenerationMatchesRepair(refresh, trip.rawDetectionMeta)) return false;

    const analysisStages = parseAnalysisStagesJson(trip.analysisStagesJson);

    const stages: BoundaryRefreshStages = {
      route:
        refresh.stages.route !== 'pending'
          ? refresh.stages.route
          : mapAnalysisStageToBoundaryStage(analysisStages.route),
      behavior:
        refresh.stages.behavior !== 'pending'
          ? refresh.stages.behavior
          : mapAnalysisStageToBoundaryStage(analysisStages.behavior),
      drivingImpact:
        refresh.stages.drivingImpact !== 'pending'
          ? refresh.stages.drivingImpact
          : mapAnalysisStageToBoundaryStage(analysisStages.drivingImpact),
    };

    if (!areBoundaryRefreshStagesComplete(stages)) return false;

    const priorMeta = readRawDetectionMeta(trip.rawDetectionMeta);
    const boundaryRefresh = buildBoundaryRefreshRecord(
      BOUNDARY_REFRESH_STATE.COMPLETED,
      { ...refresh, stages },
      undefined,
      { generation: refresh.generation, stages },
    );

    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        rawDetectionMeta: {
          ...priorMeta,
          boundaryRefresh,
        } as any,
      },
    });

    await this.syncTripRepairRefreshState(tripId, refresh.generation, BOUNDARY_REFRESH_STATE.COMPLETED);
    this.logger.log(
      `Boundary refresh COMPLETED for trip ${tripId} generation=${refresh.generation}`,
    );
    return true;
  }

  async findRecoverableTrips(
    vehicleId: string,
    limit: number = BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE,
  ): Promise<
    Array<{
      id: string;
      rawDetectionMeta: unknown;
      organizationId: string | null;
    }>
  > {
    const [pendingRows, enqueuedRows] = await Promise.all([
      this.prisma.vehicleTrip.findMany({
        where: {
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          rawDetectionMeta: {
            path: ['boundaryRefresh', 'state'],
            equals: BOUNDARY_REFRESH_STATE.PENDING,
          },
        },
        select: {
          id: true,
          rawDetectionMeta: true,
          vehicle: { select: { organizationId: true } },
        },
        take: limit,
      }),
      this.prisma.vehicleTrip.findMany({
        where: {
          vehicleId,
          tripStatus: TripStatus.COMPLETED,
          rawDetectionMeta: {
            path: ['boundaryRefresh', 'state'],
            equals: BOUNDARY_REFRESH_STATE.ENQUEUED,
          },
        },
        select: {
          id: true,
          rawDetectionMeta: true,
          vehicle: { select: { organizationId: true } },
        },
        take: limit,
      }),
    ]);

    const merged = new Map<
      string,
      { id: string; rawDetectionMeta: unknown; organizationId: string | null }
    >();

    for (const row of [...pendingRows, ...enqueuedRows]) {
      const refresh = readBoundaryRefreshRecord(row.rawDetectionMeta);
      if (!isBoundaryRefreshRetryable(refresh)) continue;
      merged.set(row.id, {
        id: row.id,
        rawDetectionMeta: row.rawDetectionMeta,
        organizationId: row.vehicle?.organizationId ?? null,
      });
    }

    return [...merged.values()]
      .sort((a, b) => {
        const ra = readBoundaryRefreshRecord(a.rawDetectionMeta);
        const rb = readBoundaryRefreshRecord(b.rawDetectionMeta);
        return Date.parse(ra?.requestedAt ?? '0') - Date.parse(rb?.requestedAt ?? '0');
      })
      .slice(0, limit);
  }

  async resetForBoundaryRefreshEnqueue(tripId: string): Promise<void> {
    await this.prisma.vehicleTrip.update({
      where: { id: tripId },
      data: {
        behaviorEnrichmentStatus: null,
        behaviorSummaryStatus: 'PENDING',
        drivingImpactStatus: 'PENDING',
        drivingImpactComputedAt: null,
        tripAnalysisStatus: 'PENDING',
        analysisStagesJson: emptyAnalysisStages() as any,
      },
    });
  }

  private async syncTripRepairRefreshState(
    tripId: string,
    generation: string,
    boundaryRefreshState: string,
  ): Promise<void> {
    const repairs = await this.prisma.tripRepair.findMany({
      where: { tripId, repairType: 'PARTIAL_TRIP_BOUNDARY_EXTENSION' },
      select: { id: true, detectorEvidence: true },
      orderBy: { appliedAt: 'desc' },
      take: 5,
    });

    for (const repair of repairs) {
      const evidence = (repair.detectorEvidence ?? {}) as Record<string, unknown>;
      if (evidence.boundaryRepairGeneration !== generation) continue;
      await this.prisma.tripRepair.update({
        where: { id: repair.id },
        data: {
          detectorEvidence: {
            ...evidence,
            boundaryRefreshState,
          } as any,
        },
      });
      break;
    }
  }

  async markRepairAuditEnqueued(tripId: string, auditId: string, generation: string): Promise<void> {
    const repair = await this.prisma.tripRepair.findUnique({
      where: { id: auditId },
      select: { detectorEvidence: true },
    });
    const evidence = (repair?.detectorEvidence ?? {}) as Record<string, unknown>;
    await this.prisma.tripRepair.update({
      where: { id: auditId },
      data: {
        status: REPAIR_STATUS.APPLIED,
        detectorEvidence: {
          ...evidence,
          boundaryRefreshState: BOUNDARY_REFRESH_STATE.ENQUEUED,
          boundaryRepairGeneration: generation,
        } as any,
      },
    });
    await this.syncTripRepairRefreshState(tripId, generation, BOUNDARY_REFRESH_STATE.ENQUEUED);
  }
}
