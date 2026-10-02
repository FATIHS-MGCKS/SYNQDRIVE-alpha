import type { PrismaClient, HvChargeSession } from '@prisma/client';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
} from '@prisma/client';
import {
  M3_3_HV_H2_MAX_CAPACITY_OBSERVATIONS_DEFAULT,
  M3_3_HV_H2_MAX_CAPACITY_OBSERVATIONS_HARD,
  M3_3_HV_H2_MAX_GT_ROWS_DEFAULT,
  M3_3_HV_H2_MAX_GT_ROWS_HARD,
  M3_3_HV_H2_MAX_PROVIDER_SOH_ROWS_DEFAULT,
  M3_3_HV_H2_MAX_PROVIDER_SOH_ROWS_HARD,
  M3_3_HV_H2_MAX_SESSIONS_DEFAULT,
  M3_3_HV_H2_MAX_SESSIONS_HARD,
} from './m3-3-hv-h2.constants';
import { buildM3_3HvH2LongitudinalInputReportV1 } from './m3-3-hv-h2-candidate-builder';
import type { M3_3HvH2LoadedDataV1 } from './m3-3-hv-h2-loaded-data.types';
import { resolveM3_3HvH2ReportBound } from './m3-3-hv-h2-report-bounds.util';
import { runM3_3HvH2ReadOnlyTransaction, type HvH2ReadOnlyTx } from './m3-3-hv-h2-readonly-transaction';
import type { M3_3HvH2LongitudinalInputReportV1 } from './m3-3-hv-h2.types';

export { resolveM3_3HvH2ReportBound, M3_3HvH2InvalidReportBoundError } from './m3-3-hv-h2-report-bounds.util';

export function m3_3HvH2GroundTruthEventsWhereClause(
  organizationId: string,
  vehicleId: string,
  evaluationAt: Date,
): {
  organizationId: string;
  vehicleId: string;
  effectiveAt: { lte: Date };
  createdAt: { lte: Date };
} {
  return {
    organizationId,
    vehicleId,
    effectiveAt: { lte: evaluationAt },
    createdAt: { lte: evaluationAt },
  };
}

export interface RunM3_3HvH2LongitudinalInputReportInput {
  organizationId: string;
  vehicleId: string;
  evaluationAt?: Date;
  maxCapacityObservations?: number;
  maxProviderSohRows?: number;
  maxGtRows?: number;
  maxSessions?: number;
}

async function assertVehicleInOrganization(
  tx: HvH2ReadOnlyTx,
  organizationId: string,
  vehicleId: string,
): Promise<void> {
  const vehicle = await tx.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { id: true },
  });
  if (!vehicle) {
    throw new Error(
      `M3.3-HV-H2: vehicle ${vehicleId} not found for organization ${organizationId}`,
    );
  }
}

async function loadReportDataInTransaction(
  tx: HvH2ReadOnlyTx,
  input: RunM3_3HvH2LongitudinalInputReportInput,
  evaluationAt: Date,
): Promise<M3_3HvH2LoadedDataV1> {
  await assertVehicleInOrganization(tx, input.organizationId, input.vehicleId);

  const maxObs = resolveM3_3HvH2ReportBound(
    input.maxCapacityObservations,
    M3_3_HV_H2_MAX_CAPACITY_OBSERVATIONS_DEFAULT,
    M3_3_HV_H2_MAX_CAPACITY_OBSERVATIONS_HARD,
    'maxCapacityObservations',
  );
  const maxSoh = resolveM3_3HvH2ReportBound(
    input.maxProviderSohRows,
    M3_3_HV_H2_MAX_PROVIDER_SOH_ROWS_DEFAULT,
    M3_3_HV_H2_MAX_PROVIDER_SOH_ROWS_HARD,
    'maxProviderSohRows',
  );
  const maxGt = resolveM3_3HvH2ReportBound(
    input.maxGtRows,
    M3_3_HV_H2_MAX_GT_ROWS_DEFAULT,
    M3_3_HV_H2_MAX_GT_ROWS_HARD,
    'maxGtRows',
  );
  const maxSessions = resolveM3_3HvH2ReportBound(
    input.maxSessions,
    M3_3_HV_H2_MAX_SESSIONS_DEFAULT,
    M3_3_HV_H2_MAX_SESSIONS_HARD,
    'maxSessions',
  );

  const capacityObservations = await tx.hvCapacityObservation.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      observedAt: { lte: evaluationAt },
    },
    orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
    take: maxObs + 1,
  });
  const capacityTruncated = capacityObservations.length > maxObs;
  const boundedObservations = capacityTruncated
    ? capacityObservations.slice(0, maxObs)
    : capacityObservations;

  const providerSohRows = await tx.batteryEvidence.findMany({
    where: {
      vehicleId: input.vehicleId,
      vehicle: { organizationId: input.organizationId },
      scope: BatteryEvidenceScope.HV,
      valueType: BatteryEvidenceValueType.SOH_PERCENT,
      sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
      observedAt: { lte: evaluationAt },
    },
    orderBy: [{ observedAt: 'asc' }, { id: 'asc' }],
    take: maxSoh + 1,
  });
  const providerTruncated = providerSohRows.length > maxSoh;
  const providerSohEvidence = providerTruncated ? providerSohRows.slice(0, maxSoh) : providerSohRows;

  const groundTruthEvents = await tx.batteryGroundTruthEvent.findMany({
    where: m3_3HvH2GroundTruthEventsWhereClause(
      input.organizationId,
      input.vehicleId,
      evaluationAt,
    ),
    orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }],
    take: maxGt + 1,
    include: {
      revocations: true,
      supersededByGroundTruthEvents: { select: { id: true, createdAt: true } },
    },
  });
  const gtTruncated = groundTruthEvents.length > maxGt;
  const boundedGt = gtTruncated ? groundTruthEvents.slice(0, maxGt) : groundTruthEvents;

  const sessionIds = new Set<string>();
  for (const obs of boundedObservations) {
    if (obs.chargeSessionId) sessionIds.add(obs.chargeSessionId);
  }

  const sessionsById = new Map<string, HvChargeSession>();
  const sortedSessionIds = [...sessionIds].sort();
  const sessionsTruncated = sortedSessionIds.length > maxSessions;
  const sessionIdsToLoad = sessionsTruncated
    ? sortedSessionIds.slice(0, maxSessions)
    : sortedSessionIds;
  if (sessionIdsToLoad.length > 0) {
    const sessions = await tx.hvChargeSession.findMany({
      where: {
        id: { in: sessionIdsToLoad },
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      orderBy: { id: 'asc' },
    });
    for (const s of sessions) {
      sessionsById.set(s.id, s);
    }
  }

  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    evaluationAt,
    capacityObservations: boundedObservations,
    providerSohEvidence,
    groundTruthEvents: boundedGt,
    sessionsById: sessionsById as M3_3HvH2LoadedDataV1['sessionsById'],
    truncated: {
      capacityObservations: capacityTruncated,
      providerSoh: providerTruncated,
      groundTruth: gtTruncated,
      sessions: sessionsTruncated,
    },
  };
}

export async function runM3_3HvH2LongitudinalInputReport(
  prisma: PrismaClient,
  input: RunM3_3HvH2LongitudinalInputReportInput,
): Promise<M3_3HvH2LongitudinalInputReportV1> {
  const evaluationAt = input.evaluationAt ?? new Date();
  return runM3_3HvH2ReadOnlyTransaction(prisma, async (tx) => {
    const loaded = await loadReportDataInTransaction(tx, input, evaluationAt);
    return buildM3_3HvH2LongitudinalInputReportV1(loaded);
  });
}

export { assertHvH2TransactionReadOnly } from './m3-3-hv-h2-readonly-transaction';
