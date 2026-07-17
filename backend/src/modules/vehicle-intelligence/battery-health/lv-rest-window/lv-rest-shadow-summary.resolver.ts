import type { BatteryMeasurementQuality } from '@prisma/client';
import {
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { isBatteryV2RestShadowEnabled } from '@config/battery-health-v2.config';
import {
  isLvRestShadowContaminationQuality,
  isLvRestShadowMeasurementContext,
} from './lv-rest-shadow.policy';
import { isLvRestMeasurementEvidenceEligible } from './lv-rest-measurement-quality';

export type LvRestShadowQualityBucket = {
  quality: BatteryMeasurementQuality;
  count: number;
};

export type LvRestShadowTargetCapture = {
  targetType: 'REST_60M' | 'REST_6H';
  scheduled: number;
  captured: number;
  missed: number;
  captureRate: number | null;
};

export type LvRestShadowSummary = {
  vehicleId: string;
  shadowMode: true;
  shadowEnabled: boolean;
  restWindowCount: number;
  capture: {
    rest60m: LvRestShadowTargetCapture;
    rest6h: LvRestShadowTargetCapture;
  };
  qualityDistribution: LvRestShadowQualityBucket[];
  wakeContaminationCount: number;
  lastValidMeasurement: {
    id: string;
    measurementType: BatteryMeasurementType;
    observedAt: string;
    voltageV: number | null;
    quality: BatteryMeasurementQuality;
  } | null;
};

type RestMeasurementRow = {
  id: string;
  type: BatteryMeasurementType;
  observedAt: Date;
  numericValue: number | null;
  quality: BatteryMeasurementQuality;
  context: unknown;
};

function roundRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

function buildTargetCapture(
  targetType: 'REST_60M' | 'REST_6H',
  measurements: RestMeasurementRow[],
): LvRestShadowTargetCapture {
  const measurementType =
    targetType === 'REST_6H'
      ? BatteryMeasurementType.REST_6H
      : BatteryMeasurementType.REST_60M;
  const forTarget = measurements.filter((row) => row.type === measurementType);
  const scheduled = forTarget.length;
  const missed = forTarget.filter((row) => row.quality === 'MISSED').length;
  const captured = scheduled - missed;
  return {
    targetType,
    scheduled,
    captured,
    missed,
    captureRate: roundRate(captured, scheduled),
  };
}

function buildQualityDistribution(
  measurements: RestMeasurementRow[],
): LvRestShadowQualityBucket[] {
  const counts = new Map<BatteryMeasurementQuality, number>();
  for (const row of measurements) {
    counts.set(row.quality, (counts.get(row.quality) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([quality, count]) => ({ quality, count }))
    .sort((a, b) => b.count - a.count || a.quality.localeCompare(b.quality));
}

export async function resolveLvRestShadowSummary(
  prisma: PrismaService,
  vehicleId: string,
): Promise<LvRestShadowSummary> {
  const restWindowCount = await prisma.batteryMeasurementSession.count({
    where: {
      vehicleId,
      type: BatteryMeasurementSessionType.LV_REST_WINDOW,
    },
  });

  const measurements = await prisma.batteryMeasurement.findMany({
    where: {
      vehicleId,
      type: {
        in: [BatteryMeasurementType.REST_60M, BatteryMeasurementType.REST_6H],
      },
    },
    orderBy: { observedAt: 'desc' },
    select: {
      id: true,
      type: true,
      observedAt: true,
      numericValue: true,
      quality: true,
      context: true,
    },
  });

  const shadowMeasurements = measurements.filter((row) =>
    isLvRestShadowMeasurementContext(row.context),
  );

  const wakeContaminationCount = shadowMeasurements.filter(
    (row) => row.quality === 'CONTAMINATED_BY_WAKE',
  ).length;

  const lastValid = shadowMeasurements.find((row) =>
    isLvRestMeasurementEvidenceEligible(row.quality),
  );

  return {
    vehicleId,
    shadowMode: true,
    shadowEnabled: isBatteryV2RestShadowEnabled(),
    restWindowCount,
    capture: {
      rest60m: buildTargetCapture('REST_60M', shadowMeasurements),
      rest6h: buildTargetCapture('REST_6H', shadowMeasurements),
    },
    qualityDistribution: buildQualityDistribution(shadowMeasurements),
    wakeContaminationCount,
    lastValidMeasurement: lastValid
      ? {
          id: lastValid.id,
          measurementType: lastValid.type,
          observedAt: lastValid.observedAt.toISOString(),
          voltageV: lastValid.numericValue,
          quality: lastValid.quality,
        }
      : null,
  };
}

export function countLvRestShadowContamination(
  quality: BatteryMeasurementQuality,
): boolean {
  return isLvRestShadowContaminationQuality(quality);
}
