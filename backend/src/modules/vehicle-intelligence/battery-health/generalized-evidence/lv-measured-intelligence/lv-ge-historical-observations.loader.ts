import type { BatteryGeneralizedEvidenceObservation, Prisma } from '@prisma/client';
import type { LvMeasuredHistoricalQueryModeV1 } from './lv-measured-intelligence.types';
import {
  LV_GE_ASSESSMENT_BATCH_SIZE,
  LV_GE_ASSESSMENT_MAX_ROWS,
} from './lv-measured-intelligence.constants';

export const LV_GE_HISTORICAL_OBSERVATION_SELECT = {
  id: true,
  sourceMeasurementId: true,
  restSessionId: true,
  voltage: true,
  voltageObservedAt: true,
  providerObservationAt: true,
  providerTimestampSource: true,
  evidenceClass: true,
  actualRestAgeMs: true,
  nominalRestIntervalIndex: true,
  isLvCharging: true,
  engineRunning: true,
  temperatureC: true,
  createdAt: true,
} as const;

export type LvGeHistoricalObservationRow = Pick<
  BatteryGeneralizedEvidenceObservation,
  keyof typeof LV_GE_HISTORICAL_OBSERVATION_SELECT
>;

export type LvGeHistoricalObservationPrismaPort = {
  batteryGeneralizedEvidenceObservation: {
    findMany: (args: Prisma.BatteryGeneralizedEvidenceObservationFindManyArgs) => Promise<
      LvGeHistoricalObservationRow[]
    >;
  };
};

export type LvGeHistoricalLoadResultV1 = {
  rows: LvGeHistoricalObservationRow[];
  queryMode: LvMeasuredHistoricalQueryModeV1;
  measuredFrom: Date | null;
  measuredTo: Date | null;
  /** Rows returned from DB before client-side dedupe (assessment batches summed). */
  rawRowsFetched: number;
  /** True only when additional matching rows exist beyond what was loaded. */
  hasMoreRowsInQuery: boolean;
};

function buildVoltageWhere(
  organizationId: string,
  vehicleId: string,
  measuredFrom?: Date,
  measuredTo?: Date,
): Prisma.BatteryGeneralizedEvidenceObservationWhereInput {
  return {
    organizationId,
    vehicleId,
    voltage: { not: null },
    ...(measuredFrom != null && measuredTo != null
      ? {
          voltageObservedAt: {
            gte: measuredFrom,
            lte: measuredTo,
          },
        }
      : {}),
  };
}

/**
 * Bounded display fetch with take+1 truncation detection (UI / measured-intelligence charts).
 */
export async function loadGeHistoricalObservationsForDisplay(
  prisma: LvGeHistoricalObservationPrismaPort,
  input: {
    organizationId: string;
    vehicleId: string;
    observationLimit: number;
    measuredFrom?: Date;
    measuredTo?: Date;
  },
): Promise<LvGeHistoricalLoadResultV1> {
  const dateRangeMode =
    input.measuredFrom != null && input.measuredTo != null
      ? { from: input.measuredFrom, to: input.measuredTo }
      : null;
  const queryMode: LvMeasuredHistoricalQueryModeV1 = dateRangeMode
    ? 'DATE_RANGE_ASC'
    : 'RECENT_DESC_LIMIT';
  const take = Math.max(input.observationLimit, 1) + 1;
  const rows = await prisma.batteryGeneralizedEvidenceObservation.findMany({
    where: buildVoltageWhere(
      input.organizationId,
      input.vehicleId,
      dateRangeMode?.from,
      dateRangeMode?.to,
    ),
    orderBy: { voltageObservedAt: dateRangeMode ? 'asc' : 'desc' },
    take,
    select: LV_GE_HISTORICAL_OBSERVATION_SELECT,
  });
  const hasMoreRowsInQuery = rows.length > input.observationLimit;
  const bounded = hasMoreRowsInQuery ? rows.slice(0, input.observationLimit) : rows;
  return {
    rows: bounded,
    queryMode,
    measuredFrom: dateRangeMode?.from ?? null,
    measuredTo: dateRangeMode?.to ?? null,
    rawRowsFetched: bounded.length,
    hasMoreRowsInQuery,
  };
}

/**
 * Full-window assessment load for N16/N14 input assembly (batched ASC, hard row cap).
 */
export async function loadGeHistoricalObservationsForAssessment(
  prisma: LvGeHistoricalObservationPrismaPort,
  input: {
    organizationId: string;
    vehicleId: string;
    measuredFrom: Date;
    measuredTo: Date;
    maxRows?: number;
    batchSize?: number;
  },
): Promise<LvGeHistoricalLoadResultV1> {
  const maxRows = input.maxRows ?? LV_GE_ASSESSMENT_MAX_ROWS;
  const batchSize = input.batchSize ?? LV_GE_ASSESSMENT_BATCH_SIZE;
  const where = buildVoltageWhere(
    input.organizationId,
    input.vehicleId,
    input.measuredFrom,
    input.measuredTo,
  );

  const allRows: LvGeHistoricalObservationRow[] = [];
  let cursorAfter: Date | null = null;
  let hasMoreRowsInQuery = false;

  while (allRows.length < maxRows) {
    const remaining = maxRows - allRows.length;
    const pageSize = Math.min(batchSize, remaining);
    const batch = await prisma.batteryGeneralizedEvidenceObservation.findMany({
      where: {
        ...where,
        ...(cursorAfter != null
          ? {
              voltageObservedAt: {
                gt: cursorAfter,
                lte: input.measuredTo,
              },
            }
          : {}),
      },
      orderBy: { voltageObservedAt: 'asc' },
      take: pageSize + 1,
      select: LV_GE_HISTORICAL_OBSERVATION_SELECT,
    });

    if (batch.length === 0) {
      break;
    }

    const pageHasMore = batch.length > pageSize;
    const accepted = pageHasMore ? batch.slice(0, pageSize) : batch;
    allRows.push(...accepted);

    const lastAt = accepted[accepted.length - 1]?.voltageObservedAt;
    if (!lastAt) {
      break;
    }
    cursorAfter = lastAt;

    if (pageHasMore) {
      if (allRows.length >= maxRows) {
        hasMoreRowsInQuery = true;
        break;
      }
      continue;
    }
    break;
  }

  return {
    rows: allRows,
    queryMode: 'DATE_RANGE_ASC',
    measuredFrom: input.measuredFrom,
    measuredTo: input.measuredTo,
    rawRowsFetched: allRows.length,
    hasMoreRowsInQuery,
  };
}
