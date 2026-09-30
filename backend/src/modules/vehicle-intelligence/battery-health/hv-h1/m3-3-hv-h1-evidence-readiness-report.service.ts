import type { PrismaClient } from '@prisma/client';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { resolveHvMethodProfile } from '../hv-method-profile/hv-method-profile.resolver';
import type { HvMethodProfileCapabilityInput } from '../hv-method-profile/hv-method-profile.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1 } from './m3-3-hv-h1.constants';
import { evaluateM3_3HvH1EvidenceQualityV1 } from './m3-3-hv-h1-evidence-quality.evaluator';
import { buildM3_3HvH1ProviderCapabilityMatrixV1 } from './m3-3-hv-h1-provider-capability-matrix.builder';
import { evaluateM3_3HvH1Readiness } from './m3-3-hv-h1-readiness.model';
import { buildM3_3HvH1SessionEvidenceLinkageV1 } from './m3-3-hv-h1-session-evidence-linkage';
import {
  HV_DISTINCT_CURRENT_SURFACE_COUNT,
  HV_MAPPER_FIELD_COUNT,
  HV_REGISTRY_KEY_COUNT,
  buildM3_3HvH1SignalInventory,
} from './m3-3-hv-h1-signal-inventory';

export interface RunM3_3HvH1EvidenceReadinessReportInput {
  organizationId: string;
  vehicleId: string;
  asOf?: Date;
  maxSessions?: number;
}

export interface M3_3HvH1EvidenceReadinessReportV1 {
  contractVersion: typeof M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1;
  organizationId: string;
  vehicleId: string;
  generatedAt: string;
  inventory: {
    hvRegistryKeyCount: number;
    hvMapperFieldCount: number;
    hvDistinctCurrentSurfaceCount: number;
    signals: ReturnType<typeof buildM3_3HvH1SignalInventory>;
  };
  capabilityMatrix: ReturnType<typeof buildM3_3HvH1ProviderCapabilityMatrixV1>;
  methodProfile: ReturnType<typeof resolveHvMethodProfile>;
  evidenceQuality: ReturnType<typeof evaluateM3_3HvH1EvidenceQualityV1>[];
  sessionSummary: {
    totalSessions: number;
    strongDimoSessions: number;
    weakOrFallbackSessions: number;
    sampleLinkages: ReturnType<typeof buildM3_3HvH1SessionEvidenceLinkageV1>[];
  };
  readiness: ReturnType<typeof evaluateM3_3HvH1Readiness>;
  methodIdentityRequired: true;
  crossMethodPoolingDefault: false;
  customerHvHealthScore: null;
}

function mapCapabilityRows(
  rows: Awaited<ReturnType<PrismaClient['vehicleBatteryCapability']['findMany']>>,
): HvMethodProfileCapabilityInput[] {
  return rows
    .filter(
      (row) => row.signalKey.startsWith('hv.') || row.signalKey === RECHARGE_SEGMENTS_SIGNAL_KEY,
    )
    .map((row) => ({
      signalKey: row.signalKey,
      status: row.status,
      checkedAt: row.checkedAt,
      lastSeenAt: row.lastSeenAt,
      sourceTimestamp: row.sourceTimestamp,
      lastValue: row.lastValue,
    }));
}

export async function runM3_3HvH1EvidenceReadinessReport(
  prisma: PrismaClient,
  input: RunM3_3HvH1EvidenceReadinessReportInput,
): Promise<M3_3HvH1EvidenceReadinessReportV1> {
  const asOf = input.asOf ?? new Date();
  const maxSessions = Math.min(input.maxSessions ?? 5, 20);

  const capabilityRows = await prisma.vehicleBatteryCapability.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    },
  });

  const capabilities = mapCapabilityRows(capabilityRows);
  const methodProfile = resolveHvMethodProfile({
    vehicleId: input.vehicleId,
    capabilities,
    now: asOf,
  });

  const matrix = buildM3_3HvH1ProviderCapabilityMatrixV1({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    capabilities,
    methodProfile,
    now: asOf,
  });

  const contextOnly = new Set(['hv.is_charging', 'hv.cable_connected', 'hv.charge_limit']);

  const evidenceQuality = matrix.rows.map((row) =>
    evaluateM3_3HvH1EvidenceQualityV1({
      signalKey: row.signalKey,
      freshnessClass: row.freshnessClass,
      qualityClass: row.qualityClass,
      providerListed: row.providerListed,
      lastProviderValuePresent: row.lastProviderValuePresent,
      lastProviderTimestampPresent: row.lastProviderTimestampPresent,
      methodEligible: row.methodEligibility.length > 0,
      contextOnly: contextOnly.has(row.signalKey),
    }),
  );

  const sessions = await prisma.hvChargeSession.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    },
    orderBy: { startAt: 'desc' },
    take: maxSessions,
  });

  const strongDimoCount = await prisma.hvChargeSession.count({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
    },
  });
  const totalCount = await prisma.hvChargeSession.count({
    where: { organizationId: input.organizationId, vehicleId: input.vehicleId },
  });
  const weakOrFallbackCount = totalCount - strongDimoCount;

  const sampleLinkages = sessions.map((session) => {
    const meta = session.metadata as Record<string, unknown> | null;
    const isFallback = session.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE;
    return buildM3_3HvH1SessionEvidenceLinkageV1({
      sessionId: session.id,
      segmentFingerprint: session.segmentFingerprint,
      source: session.source,
      isFallback,
      hasDimoSegmentId: session.dimoSegmentId != null,
      metadataHasM2: meta?.m2CapacitySummary != null,
      metadataHasM3: meta?.m3Validation != null,
    });
  });

  const readiness = evaluateM3_3HvH1Readiness({
    matrix,
    methodProfile,
    strongSessionCount: strongDimoCount,
    weakSessionCount: weakOrFallbackCount,
  });

  return {
    contractVersion: M3_3_HV_H1_EVIDENCE_READINESS_REPORT_V1,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    generatedAt: asOf.toISOString(),
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
      totalSessions: totalCount,
      strongDimoSessions: strongDimoCount,
      weakOrFallbackSessions: weakOrFallbackCount,
      sampleLinkages,
    },
    readiness,
    methodIdentityRequired: true,
    crossMethodPoolingDefault: false,
    customerHvHealthScore: null,
  };
}
