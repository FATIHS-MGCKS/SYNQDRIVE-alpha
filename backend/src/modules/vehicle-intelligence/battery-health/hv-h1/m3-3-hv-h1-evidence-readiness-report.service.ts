import type { PrismaClient } from '@prisma/client';
import {
  BatteryCapabilityStatus,
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  Prisma,
} from '@prisma/client';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { HV_M2_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HV_M3_CAPACITY_METHOD } from '../hv-capacity-shadow/hv-capacity-m3.types';
import { resolveHvMethodProfile } from '../hv-method-profile/hv-method-profile.resolver';
import type { HvMethodProfileCapabilityInput } from '../hv-method-profile/hv-method-profile.types';
import {
  M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1,
  M3_3_HV_H1_HISTORICAL_ASOF_SUPPORTED,
  M3_3_HV_H1_MAX_SESSIONS_DEFAULT,
  M3_3_HV_H1_MAX_SESSIONS_HARD,
  M3_3_HV_H1_REPORT_TEMPORAL_SEMANTICS,
  M3_3_HV_H1_REPORT_TIMEOUT_MS,
} from './m3-3-hv-h1.constants';
import { evaluateM3_3HvH1EvidenceQualityV1 } from './m3-3-hv-h1-evidence-quality.evaluator';
import { buildM3_3HvH1ProviderCapabilityMatrixV1 } from './m3-3-hv-h1-provider-capability-matrix.builder';
import type { M3_3HvH1CapabilityMatrixPersistedRow } from './m3-3-hv-h1-provider-capability-matrix.types';
import { evaluateM3_3HvH1Readiness } from './m3-3-hv-h1-readiness.model';
import { isHvH1QualifiedProviderSohEvidenceRow } from './m3-3-hv-h1-provider-soh-evidence.util';
import {
  buildM3_3HvH1SessionEvidenceLinkageV1,
  sessionFieldPresenceFromRecord,
} from './m3-3-hv-h1-session-evidence-linkage';
import { runM3_3HvH1ReadOnlyTransaction, type HvH1ReadOnlyTx } from './m3-3-hv-h1-readonly-transaction';
import {
  summarizeHvChargeSessionsForH1,
  type M3_3HvH1SessionSummaryCounts,
} from './m3-3-hv-h1-session-summary';
import {
  HV_DISTINCT_CURRENT_SURFACE_COUNT,
  HV_MAPPER_FIELD_COUNT,
  HV_REGISTRY_KEY_COUNT,
  buildM3_3HvH1SignalInventory,
} from './m3-3-hv-h1-signal-inventory';

export interface RunM3_3HvH1EvidenceReadinessReportInput {
  organizationId: string;
  vehicleId: string;
  maxSessions?: number;
  evaluationAt?: Date;
}

export interface M3_3HvH1EvidenceReadinessReportV1 {
  contractVersion: typeof M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1;
  organizationId: string;
  vehicleId: string;
  evaluationAt: string;
  temporalSemantics: typeof M3_3_HV_H1_REPORT_TEMPORAL_SEMANTICS;
  historicalAsOfSupported: typeof M3_3_HV_H1_HISTORICAL_ASOF_SUPPORTED;
  inventory: {
    hvRegistryKeyCount: number;
    hvMapperFieldCount: number;
    hvDistinctCurrentSurfaceCount: number;
    signals: ReturnType<typeof buildM3_3HvH1SignalInventory>;
  };
  capabilityMatrix: ReturnType<typeof buildM3_3HvH1ProviderCapabilityMatrixV1>;
  methodProfile: ReturnType<typeof resolveHvMethodProfile>;
  evidenceQuality: ReturnType<typeof evaluateM3_3HvH1EvidenceQualityV1>[];
  sessionSummary: M3_3HvH1SessionSummaryCounts & {
    sampleLinkages: ReturnType<typeof buildM3_3HvH1SessionEvidenceLinkageV1>[];
  };
  readiness: ReturnType<typeof evaluateM3_3HvH1Readiness>;
  methodIdentityRequired: true;
  crossMethodPoolingDefault: false;
  customerHvHealthScore: null;
  dbReadOnlyTransactionEnforced: true;
}

function mapPersistedCapabilityRows(
  rows: Awaited<ReturnType<PrismaClient['vehicleBatteryCapability']['findMany']>>,
): M3_3HvH1CapabilityMatrixPersistedRow[] {
  return rows
    .filter(
      (row) => row.signalKey.startsWith('hv.') || row.signalKey === RECHARGE_SEGMENTS_SIGNAL_KEY,
    )
    .map((row) => ({
      signalKey: row.signalKey,
      status: row.status,
      provider: row.provider,
      measurementType: row.measurementType,
      checkedAt: row.checkedAt,
      lastSeenAt: row.lastSeenAt,
      sourceTimestamp: row.sourceTimestamp,
      lastValue: row.lastValue,
    }));
}

function mapMethodProfileInput(
  persisted: M3_3HvH1CapabilityMatrixPersistedRow[],
): HvMethodProfileCapabilityInput[] {
  return persisted.map((row) => ({
    signalKey: row.signalKey,
    status: row.status,
    checkedAt: row.checkedAt,
    lastSeenAt: row.lastSeenAt,
    sourceTimestamp: row.sourceTimestamp,
    lastValue: row.lastValue,
  }));
}

async function buildReportInTransaction(
  tx: HvH1ReadOnlyTx,
  input: RunM3_3HvH1EvidenceReadinessReportInput,
  evaluationAt: Date,
  maxSessions: number,
): Promise<M3_3HvH1EvidenceReadinessReportV1> {
  const capabilityRows = await tx.vehicleBatteryCapability.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    },
  });

  const persisted = mapPersistedCapabilityRows(capabilityRows);
  const capabilities = mapMethodProfileInput(persisted);
  const methodProfile = resolveHvMethodProfile({
    vehicleId: input.vehicleId,
    capabilities,
    now: evaluationAt,
  });

  const matrix = buildM3_3HvH1ProviderCapabilityMatrixV1({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    persistedRows: persisted,
    methodProfile,
    evaluationAt,
  });

  const contextOnly = new Set(['hv.is_charging', 'hv.cable_connected', 'hv.charge_limit']);

  const evidenceQuality = matrix.rows.map((row) =>
    evaluateM3_3HvH1EvidenceQualityV1({
      signalKey: row.signalKey,
      freshnessClass: row.freshnessClass,
      qualityClass: row.qualityClass,
      providerListingStatus: row.providerListingStatus,
      vehicleDataStatus: row.vehicleDataStatus,
      lastProviderValuePresent: row.lastProviderValuePresent,
      lastProviderTimestampPresent: row.lastProviderTimestampPresent,
      methodEligible: row.methodEligibility.length > 0,
      contextOnly: contextOnly.has(row.signalKey),
    }),
  );

  const sessions = await tx.hvChargeSession.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      startAt: { lte: evaluationAt },
    },
    orderBy: { startAt: 'desc' },
    take: maxSessions,
  });

  const allSessionsForCounts = await tx.hvChargeSession.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      startAt: { lte: evaluationAt },
    },
    select: {
      source: true,
      isOngoing: true,
      metadata: true,
    },
  });

  const sessionCounts = summarizeHvChargeSessionsForH1(allSessionsForCounts);

  const m2ShadowObservationCount = await tx.hvCapacityObservation.count({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      method: HV_M2_CAPACITY_METHOD,
      observedAt: { lte: evaluationAt },
    },
  });

  const m3ShadowObservationCount = await tx.hvCapacityObservation.count({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      method: HV_M3_CAPACITY_METHOD,
      observedAt: { lte: evaluationAt },
    },
  });

  const providerSohRows = await tx.batteryEvidence.findMany({
    where: {
      vehicleId: input.vehicleId,
      vehicle: { organizationId: input.organizationId },
      scope: BatteryEvidenceScope.HV,
      valueType: BatteryEvidenceValueType.SOH_PERCENT,
      sourceType: BatteryEvidenceSourceType.PROVIDER_REPORTED,
      observedAt: { lte: evaluationAt },
    },
    select: {
      scope: true,
      valueType: true,
      sourceType: true,
      numericValue: true,
      observedAt: true,
      provider: true,
    },
  });
  const providerSohObservationCount = providerSohRows.length;
  const providerSohQualifiedEvidenceCount = providerSohRows.filter((row) =>
    isHvH1QualifiedProviderSohEvidenceRow(row, evaluationAt),
  ).length;

  const sampleLinkages = sessions.map((session) => {
    const isFallback = session.source !== 'DIMO_RECHARGE_SEGMENT';
    return buildM3_3HvH1SessionEvidenceLinkageV1({
      sessionId: session.id,
      segmentFingerprint: session.segmentFingerprint,
      source: session.source,
      isFallback,
      hasDimoSegmentId: session.dimoSegmentId != null,
      presence: sessionFieldPresenceFromRecord(session),
    });
  });

  const readiness = evaluateM3_3HvH1Readiness({
    methodProfile,
    matrix,
    sessionCounts,
    m2ShadowObservationCount,
    m3ShadowObservationCount,
    providerSohObservationCount,
    providerSohQualifiedEvidenceCount,
    longitudinalCandidateCount: 0,
  });

  return {
    contractVersion: M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    evaluationAt: evaluationAt.toISOString(),
    temporalSemantics: M3_3_HV_H1_REPORT_TEMPORAL_SEMANTICS,
    historicalAsOfSupported: M3_3_HV_H1_HISTORICAL_ASOF_SUPPORTED,
    inventory: {
      hvRegistryKeyCount: HV_REGISTRY_KEY_COUNT,
      hvMapperFieldCount: HV_MAPPER_FIELD_COUNT,
      hvDistinctCurrentSurfaceCount: HV_DISTINCT_CURRENT_SURFACE_COUNT,
      signals: buildM3_3HvH1SignalInventory(),
    },
    capabilityMatrix: matrix,
    methodProfile,
    evidenceQuality,
    sessionSummary: {
      ...sessionCounts,
      sampleLinkages,
    },
    readiness,
    methodIdentityRequired: true,
    crossMethodPoolingDefault: false,
    customerHvHealthScore: null,
    dbReadOnlyTransactionEnforced: true,
  };
}

export async function runM3_3HvH1EvidenceReadinessReport(
  prisma: PrismaClient,
  input: RunM3_3HvH1EvidenceReadinessReportInput,
): Promise<M3_3HvH1EvidenceReadinessReportV1> {
  const evaluationAt = input.evaluationAt ?? new Date();
  const maxSessions = Math.min(
    input.maxSessions ?? M3_3_HV_H1_MAX_SESSIONS_DEFAULT,
    M3_3_HV_H1_MAX_SESSIONS_HARD,
  );

  return runM3_3HvH1ReadOnlyTransaction(prisma, (tx) =>
    buildReportInTransaction(tx, input, evaluationAt, maxSessions),
  );
}

export { assertHvH1TransactionReadOnly } from './m3-3-hv-h1-readonly-transaction';
