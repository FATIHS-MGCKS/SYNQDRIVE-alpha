import type { PrismaClient } from '@prisma/client';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  Prisma,
} from '@prisma/client';
import { m3_3HvH2GroundTruthEventsWhereClause } from '../hv-h2/m3-3-hv-h2-longitudinal-input-report.service';
import {
  buildM3_3HvH4CoverageReportV1,
  validateM3_3HvH4CoverageReportContract,
} from './m3-3-hv-h4-coverage-report.builder';
import { M3_3_HV_H4_DEFAULT_RETENTION_DAYS } from './m3-3-hv-h4.constants';
import type { M3_3HvH4LoadedDataV1, M3_3HvH4ObservedRange } from './m3-3-hv-h4-loaded-data.types';
import type { M3_3HvH4CoverageReportV1 } from './m3-3-hv-h4.types';
import type { M3_3HvH4GroundTruthRow } from './m3-3-hv-h4-lifecycle.util';
import { runM3_3HvH4ReadOnlyTransaction, type HvH4ReadOnlyTx } from './m3-3-hv-h4-readonly-transaction';

const MS_PER_DAY = 86_400_000;
const MAX_CHARGE_SESSIONS = 5_000;

export interface RunM3_3HvH4CoverageReportInput {
  organizationId: string;
  vehicleId: string;
  evaluationAt?: Date;
}

async function assertVehicleInOrganization(
  tx: HvH4ReadOnlyTx,
  organizationId: string,
  vehicleId: string,
): Promise<void> {
  const vehicle = await tx.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { id: true },
  });
  if (!vehicle) {
    throw new Error(
      `M3.3-HV-H4: vehicle ${vehicleId} not found for organization ${organizationId}`,
    );
  }
}

async function observedRange(
  tx: HvH4ReadOnlyTx,
  where: Prisma.BatteryEvidenceWhereInput,
): Promise<M3_3HvH4ObservedRange> {
  const agg = await tx.batteryEvidence.aggregate({
    where,
    _count: { _all: true },
    _min: { observedAt: true },
    _max: { observedAt: true },
  });
  return {
    count: agg._count._all,
    earliest: agg._min.observedAt,
    latest: agg._max.observedAt,
  };
}

async function loadData(
  tx: HvH4ReadOnlyTx,
  input: RunM3_3HvH4CoverageReportInput,
  evaluationAt: Date,
): Promise<M3_3HvH4LoadedDataV1> {
  await assertVehicleInOrganization(tx, input.organizationId, input.vehicleId);

  const groundTruthEvents = (await tx.batteryGroundTruthEvent.findMany({
    where: m3_3HvH2GroundTruthEventsWhereClause(
      input.organizationId,
      input.vehicleId,
      evaluationAt,
    ),
    orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }],
    include: {
      revocations: true,
      supersededByGroundTruthEvents: { select: { id: true, createdAt: true } },
    },
  })) as M3_3HvH4GroundTruthRow[];

  const chargeSessions = await tx.hvChargeSession.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      startAt: { lte: evaluationAt },
    },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    take: MAX_CHARGE_SESSIONS,
  });

  const snapshotAgg = await tx.hvBatteryHealthSnapshot.aggregate({
    where: {
      vehicleId: input.vehicleId,
      vehicle: { organizationId: input.organizationId },
      recordedAt: { lte: evaluationAt },
    },
    _count: { _all: true },
    _min: { recordedAt: true },
    _max: { recordedAt: true },
  });

  const hvSnapshots: M3_3HvH4ObservedRange = {
    count: snapshotAgg._count._all,
    earliest: snapshotAgg._min.recordedAt,
    latest: snapshotAgg._max.recordedAt,
  };

  const baseEvidenceWhere = {
    vehicleId: input.vehicleId,
    vehicle: { organizationId: input.organizationId },
    scope: BatteryEvidenceScope.HV,
    observedAt: { lte: evaluationAt },
  };

  const hvSocEvidence = await observedRange(tx, {
    ...baseEvidenceWhere,
    valueType: BatteryEvidenceValueType.SOC_PERCENT,
  });
  const hvTemperatureEvidence = await observedRange(tx, {
    ...baseEvidenceWhere,
    valueType: BatteryEvidenceValueType.BATTERY_TEMPERATURE_C,
  });
  const hvChargingPowerEvidence = await observedRange(tx, {
    ...baseEvidenceWhere,
    valueType: BatteryEvidenceValueType.CHARGING_POWER_KW,
  });

  const retentionCutoffs = {
    hvChargeSessionEarliestRemaining: new Date(
      evaluationAt.getTime() -
        M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvChargeSessions * MS_PER_DAY,
    ),
    hvSnapshotEarliestRemaining: new Date(
      evaluationAt.getTime() -
        M3_3_HV_H4_DEFAULT_RETENTION_DAYS.hvProviderSnapshots * MS_PER_DAY,
    ),
  };

  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    evaluationAt,
    groundTruthEvents,
    chargeSessions,
    hvSnapshots,
    hvSocEvidence,
    hvTemperatureEvidence,
    hvChargingPowerEvidence,
    retentionCutoffs,
  };
}

export async function runM3_3HvH4CoverageReport(
  prisma: PrismaClient,
  input: RunM3_3HvH4CoverageReportInput,
): Promise<M3_3HvH4CoverageReportV1> {
  const evaluationAt = input.evaluationAt ?? new Date();
  if (Number.isNaN(evaluationAt.getTime())) {
    throw new Error('M3.3-HV-H4: invalid evaluationAt');
  }

  const data = await runM3_3HvH4ReadOnlyTransaction(prisma, (tx) =>
    loadData(tx, input, evaluationAt),
  );
  const report = buildM3_3HvH4CoverageReportV1(data);
  validateM3_3HvH4CoverageReportContract(report);
  return report;
}
