import {
  BatteryEvidenceScope,
  BatteryEvidenceValueType,
} from '@prisma/client';
import { m3_3HvH2GroundTruthEventsWhereClause } from '../hv-h2/m3-3-hv-h2-longitudinal-input-report.service';
import {
  M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT,
  M3_3_HV_H4_CHARGE_SESSION_PAGE_SIZE,
  M3_3_HV_H4_DEFAULT_RETENTION_DAYS,
} from './m3-3-hv-h4.constants';
import type { M3_3HvH4LoadedDataV1 } from './m3-3-hv-h4-loaded-data.types';
import type { M3_3HvH4GroundTruthRow } from './m3-3-hv-h4-lifecycle.util';
import type { HvH4ReadOnlyTx } from './m3-3-hv-h4-readonly-transaction';

const MS_PER_DAY = 86_400_000;

export interface M3_3HvH4ReportInputV1 {
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

async function loadChargeSessionsPaginated(
  tx: HvH4ReadOnlyTx,
  organizationId: string,
  vehicleId: string,
  evaluationAt: Date,
): Promise<{
  sessions: M3_3HvH4LoadedDataV1['chargeSessions'];
  sourceLoad: M3_3HvH4LoadedDataV1['chargeSessionSourceLoad'];
}> {
  const sessions: M3_3HvH4LoadedDataV1['chargeSessions'] = [];
  let skip = 0;
  let hardLimitReached = false;
  let sourceTruncated = false;

  while (sessions.length < M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT) {
    const remaining = M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT - sessions.length;
    const take = Math.min(M3_3_HV_H4_CHARGE_SESSION_PAGE_SIZE, remaining);
    const page = await tx.hvChargeSession.findMany({
      where: {
        organizationId,
        vehicleId,
        startAt: { lte: evaluationAt },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      skip,
      take,
    });
    if (page.length === 0) {
      break;
    }
    sessions.push(...page);
    skip += page.length;
    if (page.length < take) {
      break;
    }
  }

  if (sessions.length >= M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT) {
    const probe = await tx.hvChargeSession.findFirst({
      where: {
        organizationId,
        vehicleId,
        startAt: { lte: evaluationAt },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      skip: sessions.length,
      select: { id: true },
    });
    if (probe) {
      sourceTruncated = true;
      hardLimitReached = true;
    }
  }

  return {
    sessions,
    sourceLoad: {
      loadedCount: sessions.length,
      hardLimit: M3_3_HV_H4_CHARGE_SESSION_LOAD_HARD_LIMIT,
      sourceTruncated,
      hardLimitReached,
    },
  };
}

async function loadObservedTimestamps(
  tx: HvH4ReadOnlyTx,
  organizationId: string,
  vehicleId: string,
  evaluationAt: Date,
): Promise<{
  hvSnapshotRecordedAt: Date[];
  hvSocEvidenceObservedAt: Date[];
  hvTemperatureEvidenceObservedAt: Date[];
  hvChargingPowerEvidenceObservedAt: Date[];
}> {
  const snapshotRows = await tx.hvBatteryHealthSnapshot.findMany({
    where: {
      vehicleId,
      vehicle: { organizationId },
      recordedAt: { lte: evaluationAt },
    },
    select: { recordedAt: true },
    orderBy: { recordedAt: 'asc' },
  });

  const baseEvidenceWhere = {
    vehicleId,
    vehicle: { organizationId },
    scope: BatteryEvidenceScope.HV,
    observedAt: { lte: evaluationAt },
  };

  const [socRows, tempRows, powerRows] = await Promise.all([
    tx.batteryEvidence.findMany({
      where: { ...baseEvidenceWhere, valueType: BatteryEvidenceValueType.SOC_PERCENT },
      select: { observedAt: true },
      orderBy: { observedAt: 'asc' },
    }),
    tx.batteryEvidence.findMany({
      where: {
        ...baseEvidenceWhere,
        valueType: BatteryEvidenceValueType.BATTERY_TEMPERATURE_C,
      },
      select: { observedAt: true },
      orderBy: { observedAt: 'asc' },
    }),
    tx.batteryEvidence.findMany({
      where: {
        ...baseEvidenceWhere,
        valueType: BatteryEvidenceValueType.CHARGING_POWER_KW,
      },
      select: { observedAt: true },
      orderBy: { observedAt: 'asc' },
    }),
  ]);

  return {
    hvSnapshotRecordedAt: snapshotRows.map((r) => r.recordedAt),
    hvSocEvidenceObservedAt: socRows.map((r) => r.observedAt),
    hvTemperatureEvidenceObservedAt: tempRows.map((r) => r.observedAt),
    hvChargingPowerEvidenceObservedAt: powerRows.map((r) => r.observedAt),
  };
}

export async function loadM3_3HvH4DataV1(
  tx: HvH4ReadOnlyTx,
  input: M3_3HvH4ReportInputV1,
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

  const { sessions: chargeSessions, sourceLoad: chargeSessionSourceLoad } =
    await loadChargeSessionsPaginated(
      tx,
      input.organizationId,
      input.vehicleId,
      evaluationAt,
    );

  const timestamps = await loadObservedTimestamps(
    tx,
    input.organizationId,
    input.vehicleId,
    evaluationAt,
  );

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
    chargeSessionSourceLoad,
    ...timestamps,
    retentionCutoffs,
  };
}
