import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { WheelPos } from '../tire-evidence-provenance';
import {
  hasRotationDuringMountPeriod,
  resolveActiveMountPeriod,
} from '../wear-v3-prior/tire-wear-v3-prior.lifecycle';
import {
  evaluateTireWearV3CalibrationPairing,
  selectLatestProspectiveSnapshotBeforeMeasurement,
  type TireWearV3CalibrationMeasurementRef,
  type TireWearV3CalibrationSnapshotRef,
} from './tire-wear-v3-calibration-pairing.policy';
import { TireWearV3CalibrationSnapshotRepository } from './tire-wear-v3-calibration-snapshot.repository';
import { TireWearV3CalibrationShadowWriterService } from './tire-wear-v3-calibration-shadow-writer.service';
import type { TireWearV3CalibrationPairingRejectionReason } from './tire-wear-v3-calibration-snapshot.types';

@Injectable()
export class TireWearV3CalibrationShadowMasterReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: TireWearV3CalibrationSnapshotRepository,
    private readonly writer: TireWearV3CalibrationShadowWriterService,
  ) {}

  getWriterHealth() {
    const stats = this.writer.getWriterStats();
    return {
      writeEnabled: this.writer.isWriteEnabled(),
      ...stats,
    };
  }

  async getGlobalSummary() {
    const [snapshotCount, setupCount, latest] = await Promise.all([
      this.prisma.tireWearV3CalibrationSnapshotV1.count(),
      this.prisma.tireWearV3CalibrationSnapshotV1.groupBy({
        by: ['tireSetupId'],
        _count: { _all: true },
      }),
      this.prisma.tireWearV3CalibrationSnapshotV1.findFirst({
        orderBy: { predictionCreatedAt: 'desc' },
        select: { predictionCreatedAt: true, tireSetupId: true, organizationId: true },
      }),
    ]);

    return {
      snapshotRowCount: snapshotCount,
      setupCountWithSnapshots: setupCount.length,
      latestSnapshotAt: latest?.predictionCreatedAt?.toISOString() ?? null,
      latestSnapshotSetupId: latest?.tireSetupId ?? null,
      latestSnapshotOrganizationId: latest?.organizationId ?? null,
      writer: this.getWriterHealth(),
    };
  }

  async getSetupInspection(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
  }) {
    const scopedCount = await this.prisma.tireWearV3CalibrationSnapshotV1.count({
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
      },
    });

    const latestAt = await this.snapshots.latestSnapshotTimestampForSetup(
      args.tireSetupId,
    );

    const recent = await this.snapshots.listRecentSnapshotsForSetup({
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      tireSetupId: args.tireSetupId,
      limit: 20,
    });

    const pairingSummary = await this.summarizePairingForSetup(args);

    return {
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      tireSetupId: args.tireSetupId,
      snapshotCount: scopedCount,
      latestSnapshotAt: latestAt?.toISOString() ?? null,
      recentSnapshots: recent,
      pairing: pairingSummary,
      writer: this.getWriterHealth(),
    };
  }

  private async summarizePairingForSetup(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
  }) {
    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: {
        id: args.tireSetupId,
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
      },
      select: {
        organizationId: true,
        mountPeriods: {
          select: {
            id: true,
            installedAt: true,
            removedAt: true,
            installedOdometerKm: true,
            odometerAnchorStatus: true,
          },
          orderBy: { installedAt: 'asc' },
        },
        installedAt: true,
        removedAt: true,
        installedOdometerKm: true,
        odometerAnchorStatus: true,
      },
    });
    if (!setup) {
      return { pairableCount: 0, rejectionCounts: {}, sampled: 0 };
    }

    const measurements = await this.prisma.vehicleTireTreadMeasurement.findMany({
      where: {
        tireSetupId: args.tireSetupId,
        vehicleId: args.vehicleId,
      },
      orderBy: { measuredAt: 'desc' },
      take: 40,
      select: {
        id: true,
        vehicleId: true,
        tireSetupId: true,
        measuredAt: true,
        odometerAtMeasurement: true,
        evidenceSource: true,
        frontLeftMm: true,
        frontRightMm: true,
        rearLeftMm: true,
        rearRightMm: true,
      },
    });

    const snapshotRows = await this.prisma.tireWearV3CalibrationSnapshotV1.findMany({
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
      },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        tireSetupId: true,
        mountPeriodId: true,
        wheelPosition: true,
        predictionCreatedAt: true,
        sourceComputedAt: true,
        sourceOdometerKm: true,
      },
    });

    const snapshots: TireWearV3CalibrationSnapshotRef[] = snapshotRows.map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      vehicleId: s.vehicleId,
      tireSetupId: s.tireSetupId,
      mountPeriodId: s.mountPeriodId,
      wheelPosition: s.wheelPosition,
      predictionCreatedAt: s.predictionCreatedAt,
      sourceComputedAt: s.sourceComputedAt,
      sourceOdometerKm: s.sourceOdometerKm,
    }));

    const rejectionCounts: Partial<
      Record<TireWearV3CalibrationPairingRejectionReason, number>
    > = {};
    let pairableCount = 0;
    const wheels: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];

    const rotationEvents = await this.prisma.tirePositionHistory.findMany({
      where: { tireSetId: args.tireSetupId },
      select: { changedAt: true },
    });

    for (const m of measurements) {
      const measurementRef: TireWearV3CalibrationMeasurementRef = {
        id: m.id,
        organizationId: setup.organizationId,
        vehicleId: m.vehicleId,
        tireSetupId: m.tireSetupId,
        measuredAt: m.measuredAt,
        odometerAtMeasurement: m.odometerAtMeasurement,
        evidenceSource: m.evidenceSource,
        treadMmByWheel: {
          FL: m.frontLeftMm,
          FR: m.frontRightMm,
          RL: m.rearLeftMm,
          RR: m.rearRightMm,
        },
      };

      const mountPeriod = resolveActiveMountPeriod(
        setup.mountPeriods,
        m.measuredAt,
        {
          installedAt: setup.installedAt,
          removedAt: setup.removedAt,
          installedOdometerKm: setup.installedOdometerKm,
          odometerAnchorStatus: setup.odometerAnchorStatus,
        },
      );
      const rotationDuringMountPeriod =
        mountPeriod != null
          ? hasRotationDuringMountPeriod(rotationEvents, mountPeriod)
          : false;

      for (const wheel of wheels) {
        const snapshot = selectLatestProspectiveSnapshotBeforeMeasurement(
          snapshots,
          measurementRef,
          wheel,
        );
        const evalResult = evaluateTireWearV3CalibrationPairing({
          snapshot,
          measurement: measurementRef,
          wheel,
          mountPeriod,
          rotationDuringMountPeriod,
          dataCutoff: m.measuredAt,
        });
        if (evalResult.eligible) pairableCount += 1;
        else if (evalResult.rejectionReason) {
          rejectionCounts[evalResult.rejectionReason] =
            (rejectionCounts[evalResult.rejectionReason] ?? 0) + 1;
        }
      }
    }

    return {
      pairableCount,
      rejectionCounts,
      sampledMeasurements: measurements.length,
    };
  }
}
