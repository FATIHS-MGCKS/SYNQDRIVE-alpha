import {
  BatteryAssessmentType,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
  Prisma,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import type {
  BatteryShadowValidationHvMetrics,
  BatteryShadowValidationLvMetrics,
  BatteryShadowValidationVehicleSample,
} from './battery-shadow-validation.types';

function roundPct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function readSessionCv(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const stats = (metadata as Record<string, unknown>).sessionCvPercent;
  if (typeof stats === 'number' && Number.isFinite(stats)) return stats;
  const sampleStats = (metadata as Record<string, unknown>).sampleStats;
  if (sampleStats && typeof sampleStats === 'object') {
    const cv = (sampleStats as Record<string, unknown>).cvPercent;
    if (typeof cv === 'number' && Number.isFinite(cv)) return cv;
  }
  return null;
}

export async function aggregateLvShadowMetrics(
  prisma: PrismaService,
  input: {
    organizationId?: string;
    vehicleId?: string;
    startAt: Date;
    endAt: Date;
  },
): Promise<BatteryShadowValidationLvMetrics> {
  const vehicleWhere: Prisma.VehicleWhereInput = {
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.vehicleId ? { id: input.vehicleId } : {}),
  };

  const vehicleIds = (
    await prisma.vehicle.findMany({
      where: vehicleWhere,
      select: { id: true },
    })
  ).map((v) => v.id);

  if (vehicleIds.length === 0) {
    return emptyLvMetrics();
  }

  const measurementWhere: Prisma.BatteryMeasurementWhereInput = {
    vehicleId: { in: vehicleIds },
    observedAt: { gte: input.startAt, lte: input.endAt },
    type: { in: [BatteryMeasurementType.REST_60M, BatteryMeasurementType.REST_6H] },
  };

  const restMeasurements = await prisma.batteryMeasurement.findMany({
    where: measurementWhere,
    select: { type: true, quality: true },
  });

  const rest60m = restMeasurements.filter((m) => m.type === BatteryMeasurementType.REST_60M);
  const rest6h = restMeasurements.filter((m) => m.type === BatteryMeasurementType.REST_6H);

  const buildCapture = (rows: typeof restMeasurements) => {
    const scheduled = rows.length;
    const missed = rows.filter((r) => r.quality === BatteryMeasurementQuality.MISSED).length;
    const captured = scheduled - missed;
    return {
      scheduled,
      captured,
      missed,
      captureRatePct: roundPct(captured, scheduled),
    };
  };

  const wakeContaminationCount = restMeasurements.filter(
    (r) => r.quality === BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
  ).length;
  const chargingContaminationCount = restMeasurements.filter(
    (r) => r.quality === BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
  ).length;

  const restWindowVehicles = await prisma.batteryMeasurementSession.groupBy({
    by: ['vehicleId'],
    where: {
      vehicleId: { in: vehicleIds },
      type: BatteryMeasurementSessionType.LV_REST_WINDOW,
      startedAt: { gte: input.startAt, lte: input.endAt },
    },
  });

  const startProxySessions = await prisma.batteryMeasurementSession.count({
    where: {
      vehicleId: { in: vehicleIds },
      type: { in: [BatteryMeasurementSessionType.LV_ICE_START, BatteryMeasurementSessionType.ICE_START_PROXY] },
      startedAt: { gte: input.startAt, lte: input.endAt },
    },
  });

  const startProxyMeasurements = await prisma.batteryMeasurement.count({
    where: {
      vehicleId: { in: vehicleIds },
      type: {
        in: [
          BatteryMeasurementType.PRE_START_VOLTAGE,
          BatteryMeasurementType.START_DIP_PROXY,
          BatteryMeasurementType.RECOVERY_5S_VOLTAGE,
          BatteryMeasurementType.RECOVERY_30S_VOLTAGE,
          BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE,
        ],
      },
      observedAt: { gte: input.startAt, lte: input.endAt },
    },
  });

  const startProxyInsufficientCoverage = await prisma.batteryMeasurement.count({
    where: {
      vehicleId: { in: vehicleIds },
      quality: BatteryMeasurementQuality.INSUFFICIENT_COVERAGE,
      observedAt: { gte: input.startAt, lte: input.endAt },
    },
  });

  const shadowAssessmentRows = await prisma.batteryAssessment.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      type: BatteryAssessmentType.LV_ESTIMATED_HEALTH,
      computedAt: { gte: input.startAt, lte: input.endAt },
      supersededAt: null,
    },
    select: { vehicleId: true, scoreValue: true, inputSummary: true, dataQuality: true },
  });

  const shadowAssessments = shadowAssessmentRows.filter((row) => {
    const summary = row.inputSummary as Record<string, unknown> | null;
    return (
      summary?.assessmentMode === 'SHADOW' ||
      row.dataQuality?.toUpperCase().includes('SHADOW') === true
    );
  });

  const scoresByVehicle = new Map<string, number[]>();
  const allScores: number[] = [];
  for (const row of shadowAssessments) {
    if (row.scoreValue == null || !Number.isFinite(row.scoreValue)) continue;
    allScores.push(row.scoreValue);
    const bucket = scoresByVehicle.get(row.vehicleId) ?? [];
    bucket.push(row.scoreValue);
    scoresByVehicle.set(row.vehicleId, bucket);
  }

  const perVehicleStdDevs = [...scoresByVehicle.values()]
    .map((scores) => stdDev(scores))
    .filter((v): v is number => v != null);

  const falsePositiveCandidates = shadowAssessments.filter(
    (row) => row.scoreValue != null && row.scoreValue < 55,
  ).length;

  const profileRows = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds } },
    select: {
      id: true,
      fuelType: true,
      batterySpecs: { select: { batteryType: true }, take: 1, orderBy: { updatedAt: 'desc' } },
    },
  });

  const profileDistribution = new Map<string, number>();
  for (const row of profileRows) {
    const key = row.batterySpecs[0]?.batteryType ?? row.fuelType ?? 'UNKNOWN';
    profileDistribution.set(key, (profileDistribution.get(key) ?? 0) + 1);
  }

  // Rental-blocker aus Shadow werden manuell über Rental-Health geprüft — kein Snapshot-Store.
  const rentalBlockedFromBatteryInPeriod = 0;

  const totalRest = restMeasurements.length;

  return {
    vehiclesWithRestWindows: restWindowVehicles.length,
    restWindowCount: await prisma.batteryMeasurementSession.count({
      where: {
        vehicleId: { in: vehicleIds },
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        startedAt: { gte: input.startAt, lte: input.endAt },
      },
    }),
    rest60m: buildCapture(rest60m),
    rest6h: buildCapture(rest6h),
    wakeContaminationCount,
    wakeContaminationRatePct: roundPct(wakeContaminationCount, totalRest),
    chargingContaminationCount,
    missedTotal: rest60m.filter((r) => r.quality === 'MISSED').length +
      rest6h.filter((r) => r.quality === 'MISSED').length,
    profileDistribution: [...profileDistribution.entries()]
      .map(([profile, vehicleCount]) => ({ profile, vehicleCount }))
      .sort((a, b) => b.vehicleCount - a.vehicleCount),
    startProxySessions,
    startProxyMeasurements,
    startProxyInsufficientCoverage,
    shadowLvAssessmentCount: shadowAssessments.length,
    shadowLvScoreStdDevMedian: median(perVehicleStdDevs),
    shadowLvScoreRange: {
      min: allScores.length ? Math.min(...allScores) : null,
      max: allScores.length ? Math.max(...allScores) : null,
    },
    falsePositiveCandidates,
    rentalBlockedFromBatteryInPeriod,
  };
}

export async function aggregateHvShadowMetrics(
  prisma: PrismaService,
  input: {
    organizationId?: string;
    vehicleId?: string;
    startAt: Date;
    endAt: Date;
  },
): Promise<BatteryShadowValidationHvMetrics> {
  const vehicleWhere: Prisma.VehicleWhereInput = {
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.vehicleId ? { id: input.vehicleId } : {}),
  };

  const vehicleIds = (
    await prisma.vehicle.findMany({
      where: vehicleWhere,
      select: { id: true },
    })
  ).map((v) => v.id);

  if (vehicleIds.length === 0) {
    return emptyHvMetrics();
  }

  const sessionWhere: Prisma.HvChargeSessionWhereInput = {
    vehicleId: { in: vehicleIds },
    startAt: { gte: input.startAt, lte: input.endAt },
  };

  const rechargeSessionCount = await prisma.hvChargeSession.count({ where: sessionWhere });

  const sessionVehicles = await prisma.hvChargeSession.groupBy({
    by: ['vehicleId'],
    where: sessionWhere,
  });

  const sessionQualityGroups = await prisma.hvChargeSession.groupBy({
    by: ['quality'],
    where: sessionWhere,
    _count: { _all: true },
  });

  const qualifiedSessionCount = await prisma.hvChargeSession.count({
    where: {
      ...sessionWhere,
      quality: { in: [BatteryMeasurementQuality.VALID, BatteryMeasurementQuality.SHADOW, BatteryMeasurementQuality.VALID_PROXY] },
    },
  });

  const segmentSessions = await prisma.hvChargeSession.count({
    where: { ...sessionWhere, source: 'DIMO_RECHARGE_SEGMENT' },
  });

  const m2Observations = await prisma.hvCapacityObservation.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      method: HV_M2_CAPACITY_METHOD,
      observedAt: { gte: input.startAt, lte: input.endAt },
    },
    select: {
      chargeSessionId: true,
      metadata: true,
      estimatedSohPct: true,
    },
  });

  const sessionCvValues = m2Observations
    .map((row) => readSessionCv(row.metadata))
    .filter((v): v is number => v != null);

  const m2Sessions = new Set(
    m2Observations.map((o) => o.chargeSessionId).filter((id): id is string => id != null),
  );

  const crossSessionAssessmentCount = await prisma.batteryAssessment.count({
    where: {
      vehicleId: { in: vehicleIds },
      type: BatteryAssessmentType.HV_CAPACITY_SHADOW,
      computedAt: { gte: input.startAt, lte: input.endAt },
      supersededAt: null,
    },
  });

  const sohScores = m2Observations
    .map((o) => o.estimatedSohPct)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const crossSessionScatterPct =
    sohScores.length >= 2 && median(sohScores) != null && median(sohScores)! > 0
      ? Math.round((stdDev(sohScores)! / median(sohScores)!) * 1000) / 10
      : null;

  const m3Validations = await prisma.batteryAssessment.findMany({
    where: {
      vehicleId: { in: vehicleIds },
      type: BatteryAssessmentType.HV_CAPACITY_SESSION,
      computedAt: { gte: input.startAt, lte: input.endAt },
      supersededAt: null,
    },
    select: { inputSummary: true },
  });

  let m3AgreementCount = 0;
  let m3ConflictCount = 0;
  for (const row of m3Validations) {
    const summary = row.inputSummary as Record<string, unknown> | null;
    const m3 = summary?.m3Validation as Record<string, unknown> | null | undefined;
    if (!m3) continue;
    if (m3.methodConflict === true) m3ConflictCount += 1;
    else if (m3.persisted === true || m3.gatePassed === true) m3AgreementCount += 1;
  }

  const m3ValidationCount = m3AgreementCount + m3ConflictCount;
  const m3AgreementRatePct =
    m3ValidationCount > 0
      ? roundPct(m3AgreementCount, m3ValidationCount)
      : null;

  const capabilityChanges = await prisma.vehicleBatteryCapabilityChange.groupBy({
    by: ['newStatus'],
    where: {
      vehicleId: { in: vehicleIds },
      changedAt: { gte: input.startAt, lte: input.endAt },
    },
    _count: { _all: true },
  });

  let capabilityStableCount = 0;
  let capabilityChangedCount = 0;
  let capabilityUnavailableCount = 0;
  for (const row of capabilityChanges) {
    capabilityChangedCount += row._count._all;
    if (row.newStatus === 'UNAVAILABLE') capabilityUnavailableCount += row._count._all;
    if (row.newStatus === 'AVAILABLE') capabilityStableCount += row._count._all;
  }

  const referenceCapacityActiveCount = await prisma.vehicleBatteryReferenceCapacity.count({
    where: {
      vehicleId: { in: vehicleIds },
      isActive: true,
    },
  });

  const referenceCapacityUnverifiedCount = await prisma.vehicleBatteryReferenceCapacity.count({
    where: {
      vehicleId: { in: vehicleIds },
      isActive: true,
      verificationStatus: 'UNVERIFIED',
    },
  });

  const storageWhere = {
    vehicleId: { in: vehicleIds },
    createdAt: { gte: input.startAt, lte: input.endAt },
  };

  const [batteryMeasurements, batteryMeasurementSessions, hvChargeSessions, hvCapacityObservations, batteryAssessments] =
    await Promise.all([
      prisma.batteryMeasurement.count({ where: { ...storageWhere, observedAt: { gte: input.startAt, lte: input.endAt } } }),
      prisma.batteryMeasurementSession.count({ where: { ...storageWhere, startedAt: { gte: input.startAt, lte: input.endAt } } }),
      prisma.hvChargeSession.count({ where: sessionWhere }),
      prisma.hvCapacityObservation.count({
        where: { vehicleId: { in: vehicleIds }, observedAt: { gte: input.startAt, lte: input.endAt } },
      }),
      prisma.batteryAssessment.count({
        where: { vehicleId: { in: vehicleIds }, computedAt: { gte: input.startAt, lte: input.endAt } },
      }),
    ]);

  return {
    vehiclesWithRechargeSessions: sessionVehicles.length,
    rechargeSessionCount,
    rechargeSegmentCoveragePct: roundPct(segmentSessions, rechargeSessionCount),
    sessionQualityDistribution: sessionQualityGroups.map((row) => ({
      quality: row.quality ?? 'UNKNOWN',
      count: row._count._all,
    })),
    qualifiedSessionCount,
    m2ObservationCount: m2Observations.length,
    m2SessionsWithSamples: m2Sessions.size,
    m2SessionCvP95: percentile(sessionCvValues, 95),
    m2SessionCvMedian: median(sessionCvValues),
    crossSessionAssessmentCount,
    crossSessionScatterPct,
    m3ValidationCount,
    m3AgreementCount,
    m3ConflictCount,
    m3AgreementRatePct,
    capabilityStableCount,
    capabilityChangedCount,
    capabilityUnavailableCount,
    referenceCapacityActiveCount,
    referenceCapacityUnverifiedCount,
    storageGrowth: {
      batteryMeasurements,
      batteryMeasurementSessions,
      hvChargeSessions,
      hvCapacityObservations,
      batteryAssessments,
    },
  };
}

export async function sampleVehicleShadowSummaries(
  prisma: PrismaService,
  input: {
    organizationId?: string;
    vehicleId?: string;
    startAt: Date;
    endAt: Date;
    limit: number;
  },
): Promise<BatteryShadowValidationVehicleSample[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.vehicleId ? { id: input.vehicleId } : {}),
    },
    select: { id: true, licensePlate: true, fuelType: true },
    take: input.limit,
    orderBy: { updatedAt: 'desc' },
  });

  const samples: BatteryShadowValidationVehicleSample[] = [];

  for (const vehicle of vehicles) {
    const rest60m = await prisma.batteryMeasurement.findMany({
      where: {
        vehicleId: vehicle.id,
        type: BatteryMeasurementType.REST_60M,
        observedAt: { gte: input.startAt, lte: input.endAt },
      },
      select: { quality: true },
    });

    const wakeContamination = rest60m.filter(
      (r) => r.quality === BatteryMeasurementQuality.CONTAMINATED_BY_WAKE,
    ).length;

    const captured = rest60m.filter((r) => r.quality !== BatteryMeasurementQuality.MISSED).length;

    const hvSessionCount = await prisma.hvChargeSession.count({
      where: {
        vehicleId: vehicle.id,
        startAt: { gte: input.startAt, lte: input.endAt },
      },
    });

    const hvM2SampleCount = await prisma.hvCapacityObservation.count({
      where: {
        vehicleId: vehicle.id,
        method: HV_M2_CAPACITY_METHOD,
        observedAt: { gte: input.startAt, lte: input.endAt },
      },
    });

  const latestStartSession = await prisma.batteryMeasurementSession.findFirst({
      where: {
        vehicleId: vehicle.id,
        type: { in: [BatteryMeasurementSessionType.LV_ICE_START, BatteryMeasurementSessionType.ICE_START_PROXY] },
        startedAt: { gte: input.startAt, lte: input.endAt },
      },
      orderBy: { startedAt: 'desc' },
      select: { status: true },
    });

    samples.push({
      vehicleId: vehicle.id,
      licensePlate: vehicle.licensePlate,
      fuelType: vehicle.fuelType,
      lvRestCaptureRate60mPct: roundPct(captured, rest60m.length),
      lvWakeContamination: wakeContamination,
      startProxyAvailability: latestStartSession?.status ?? null,
      hvSessionCount,
      hvM2SampleCount,
      hvM3Conflict: null,
    });
  }

  return samples;
}

function emptyLvMetrics(): BatteryShadowValidationLvMetrics {
  return {
    vehiclesWithRestWindows: 0,
    restWindowCount: 0,
    rest60m: { scheduled: 0, captured: 0, missed: 0, captureRatePct: null },
    rest6h: { scheduled: 0, captured: 0, missed: 0, captureRatePct: null },
    wakeContaminationCount: 0,
    wakeContaminationRatePct: null,
    chargingContaminationCount: 0,
    missedTotal: 0,
    profileDistribution: [],
    startProxySessions: 0,
    startProxyMeasurements: 0,
    startProxyInsufficientCoverage: 0,
    shadowLvAssessmentCount: 0,
    shadowLvScoreStdDevMedian: null,
    shadowLvScoreRange: { min: null, max: null },
    falsePositiveCandidates: 0,
    rentalBlockedFromBatteryInPeriod: 0,
  };
}

function emptyHvMetrics(): BatteryShadowValidationHvMetrics {
  return {
    vehiclesWithRechargeSessions: 0,
    rechargeSessionCount: 0,
    rechargeSegmentCoveragePct: null,
    sessionQualityDistribution: [],
    qualifiedSessionCount: 0,
    m2ObservationCount: 0,
    m2SessionsWithSamples: 0,
    m2SessionCvP95: null,
    m2SessionCvMedian: null,
    crossSessionAssessmentCount: 0,
    crossSessionScatterPct: null,
    m3ValidationCount: 0,
    m3AgreementCount: 0,
    m3ConflictCount: 0,
    m3AgreementRatePct: null,
    capabilityStableCount: 0,
    capabilityChangedCount: 0,
    capabilityUnavailableCount: 0,
    referenceCapacityActiveCount: 0,
    referenceCapacityUnverifiedCount: 0,
    storageGrowth: {
      batteryMeasurements: 0,
      batteryMeasurementSessions: 0,
      hvChargeSessions: 0,
      hvCapacityObservations: 0,
      batteryAssessments: 0,
    },
  };
}
