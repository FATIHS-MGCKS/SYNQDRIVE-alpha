import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { FEATURE_SET_VERSION } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import { buildForecastSeriesFromSnapshots } from '@synq/evaluations-insights/predictive/evaluations-baseline-forecast';
import {
  isUnplannedServiceCategory,
} from '@synq/evaluations-insights/predictive/evaluations-maintenance-risk-forecast';
import type {
  MaintenanceRiskFleetInput,
  RiskForecastHorizonDays,
  RiskServiceCaseRow,
  RiskVehicleHealthSignal,
} from '@synq/evaluations-insights/predictive/evaluations-maintenance-risk.contract';
import { PredictiveFeatureRepository } from './predictive-feature.repository';

const LOOKBACK_DAYS = 400;
const TELEMETRY_STALE_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class PredictiveRiskLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly featureRepository: PredictiveFeatureRepository,
  ) {}

  async loadFleetInput(
    organizationId: string,
    asOfDate: string,
    timezone: string,
    horizonDays: RiskForecastHorizonDays,
  ): Promise<MaintenanceRiskFleetInput> {
    const fromDate = this.shiftDate(asOfDate, -LOOKBACK_DAYS);
    const asOfEnd = new Date(`${asOfDate}T23:59:59.999Z`);
    const horizonEnd = new Date(this.shiftDate(asOfDate, horizonDays) + 'T23:59:59.999Z');

    const [vehicles, serviceCases, snapshots] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { organizationId },
        select: {
          id: true,
          rentalCategoryId: true,
          year: true,
          mileageKm: true,
          nextServiceDueDate: true,
          latestState: { select: { odometerKm: true, lastSeenAt: true, online: true } },
        },
      }),
      this.prisma.serviceCase.findMany({
        where: {
          organizationId,
          openedAt: { gte: new Date(fromDate + 'T00:00:00.000Z'), lte: asOfEnd },
        },
        select: {
          id: true,
          vehicleId: true,
          category: true,
          openedAt: true,
          completedAt: true,
          actualCostCents: true,
          downtimeStart: true,
          downtimeEnd: true,
          blocksRental: true,
          scheduledAt: true,
          status: true,
        },
        orderBy: { openedAt: 'asc' },
      }),
      this.featureRepository.listSnapshots(organizationId, {
        fromDate,
        toDate: asOfDate,
        featureSetVersion: FEATURE_SET_VERSION,
        scopeKey: 'fleet',
      }),
    ]);

    const vehicleIds = vehicles.map((v) => v.id);
    const [tireSnaps, brakeSnaps, dtcCounts] = await Promise.all([
      this.latestTireConditions(vehicleIds),
      this.latestBrakeConditions(vehicleIds),
      this.activeSafetyDtcCounts(organizationId, vehicleIds),
    ]);

    const vehicleSignals: RiskVehicleHealthSignal[] = vehicles.map((v) => {
      const lastSeen = v.latestState?.lastSeenAt?.getTime() ?? 0;
      const telemetryDataAvailable =
        lastSeen > 0 && Date.now() - lastSeen < TELEMETRY_STALE_MS;
      const serviceOverdue =
        v.nextServiceDueDate != null && v.nextServiceDueDate.getTime() < asOfEnd.getTime();
      const tireCondition = tireSnaps.get(v.id) ?? 'unknown';
      const brakeCondition = brakeSnaps.get(v.id) ?? 'unknown';
      const hasHealthSignal =
        tireCondition !== 'unknown' || brakeCondition !== 'unknown' || (dtcCounts.get(v.id) ?? 0) > 0;

      return {
        vehicleId: v.id,
        vehicleClassId: v.rentalCategoryId,
        modelYear: v.year,
        odometerKm: v.latestState?.odometerKm ?? v.mileageKm,
        tireCondition,
        brakeCondition,
        batteryCondition: 'unknown',
        activeSafetyDtcCount: dtcCounts.get(v.id) ?? 0,
        serviceOverdue,
        telemetryDataAvailable,
        hasHealthSignal,
      };
    });

    const healthCoveragePercent =
      vehicles.length === 0
        ? 0
        : Math.round(
            (vehicleSignals.filter((v) => v.hasHealthSignal).length / vehicles.length) * 100,
          );

    const mappedCases: RiskServiceCaseRow[] = serviceCases.map((sc) => ({
      id: sc.id,
      vehicleId: sc.vehicleId,
      category: sc.category,
      openedAt: sc.openedAt.toISOString(),
      completedAt: sc.completedAt?.toISOString() ?? null,
      actualCostCents: sc.actualCostCents,
      downtimeStart: sc.downtimeStart?.toISOString() ?? null,
      downtimeEnd: sc.downtimeEnd?.toISOString() ?? null,
      blocksRental: sc.blocksRental,
      isUnplanned: isUnplannedServiceCategory(sc.category),
    }));

    const maintenanceCostSeries = buildForecastSeriesFromSnapshots(
      snapshots.map((s) => ({
        observationDate: s.observationDate,
        value:
          typeof s.features['maintenance.cost_minor']?.value === 'number'
            ? (s.features['maintenance.cost_minor'].value as number)
            : null,
      })),
    );
    const downtimeMinutesSeries = buildForecastSeriesFromSnapshots(
      snapshots.map((s) => ({
        observationDate: s.observationDate,
        value:
          typeof s.features['downtime.minutes']?.value === 'number'
            ? (s.features['downtime.minutes'].value as number)
            : null,
      })),
    );

    const scheduledCasesInHorizon = serviceCases.filter(
      (sc) =>
        sc.scheduledAt &&
        sc.scheduledAt >= asOfEnd &&
        sc.scheduledAt <= horizonEnd &&
        sc.status !== 'COMPLETED' &&
        sc.status !== 'CANCELLED',
    ).length;

    const scheduledDowntimeMinutesInHorizon = serviceCases.reduce((acc, sc) => {
      if (!sc.downtimeStart || !sc.blocksRental) return acc;
      if (sc.downtimeStart < asOfEnd || sc.downtimeStart > horizonEnd) return acc;
      const end = sc.downtimeEnd ?? horizonEnd;
      const minutes = Math.max(0, (end.getTime() - sc.downtimeStart.getTime()) / 60_000);
      return acc + minutes;
    }, 0);

    return {
      organizationId,
      asOfDate,
      timezone,
      horizonDays,
      fleetVehicleCount: vehicles.length,
      vehicles: vehicleSignals,
      serviceCases: mappedCases,
      maintenanceCostSeries,
      downtimeMinutesSeries,
      scheduledCasesInHorizon,
      scheduledDowntimeMinutesInHorizon: Math.round(scheduledDowntimeMinutesInHorizon),
      healthCoveragePercent,
    };
  }

  private async latestTireConditions(
    vehicleIds: string[],
  ): Promise<Map<string, 'critical' | 'warning' | 'good' | 'unknown'>> {
    const out = new Map<string, 'critical' | 'warning' | 'good' | 'unknown'>();
    if (vehicleIds.length === 0) return out;
    const rows = await this.prisma.tireHealthSnapshot.findMany({
      where: { vehicleId: { in: vehicleIds } },
      orderBy: { snapshotDate: 'desc' },
      distinct: ['vehicleId'],
      select: { vehicleId: true, estimatedWearPercent: true },
    });
    for (const row of rows) {
      const wear = row.estimatedWearPercent;
      if (wear == null) out.set(row.vehicleId, 'unknown');
      else if (wear >= 85) out.set(row.vehicleId, 'critical');
      else if (wear >= 70) out.set(row.vehicleId, 'warning');
      else out.set(row.vehicleId, 'good');
    }
    return out;
  }

  private async latestBrakeConditions(
    vehicleIds: string[],
  ): Promise<Map<string, 'critical' | 'warning' | 'good' | 'unknown'>> {
    const out = new Map<string, 'critical' | 'warning' | 'good' | 'unknown'>();
    if (vehicleIds.length === 0) return out;
    const rows = await this.prisma.brakeHealthSnapshot.findMany({
      where: { vehicleId: { in: vehicleIds } },
      orderBy: { generatedAt: 'desc' },
      distinct: ['vehicleId'],
      select: { vehicleId: true, condition: true },
    });
    for (const row of rows) {
      const c = (row.condition ?? '').toUpperCase();
      if (c.includes('CRITICAL')) out.set(row.vehicleId, 'critical');
      else if (c.includes('WARNING') || c.includes('WORN')) out.set(row.vehicleId, 'warning');
      else if (c) out.set(row.vehicleId, 'good');
      else out.set(row.vehicleId, 'unknown');
    }
    return out;
  }

  private async activeSafetyDtcCounts(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (vehicleIds.length === 0) return out;
    const rows = await this.prisma.vehicleDtcEvent.groupBy({
      by: ['vehicleId'],
      where: {
        vehicleId: { in: vehicleIds },
        isActive: true,
        severity: 'CRITICAL',
        vehicle: { organizationId },
      },
      _count: { _all: true },
    });
    for (const row of rows) out.set(row.vehicleId, row._count._all);
    return out;
  }

  private shiftDate(dateOnly: string, offset: number): string {
    const [y, m, d] = dateOnly.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  }
}
