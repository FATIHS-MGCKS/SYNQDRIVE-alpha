import { performance } from 'node:perf_hooks';
import { randomUUID } from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '../hv-charge-session/hv-charge-session-quality.status';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1,
  mirrorFromScientificProjectionV1,
} from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { loadM3_3HvH4DurableModeAChargeSessionsV1 } from './m3-3-hv-h4-a3-durable-charge-session-loader.v1';
import {
  runM3_3HvH4DurableModeAA2ReportBundleV1,
  runM3_3HvH4LiveA2ReportBundleV1,
} from './m3-3-hv-h4-a3-parity.harness.v1';
import { runM3_3HvH4ReadOnlyTransaction } from './m3-3-hv-h4-readonly-transaction';
import {
  computeTimingStatsV1,
  formatTimingStatsV1,
  type M3_3HvH4A3_6R0TimingStatsV1,
} from './m3-3-hv-h4-a3-6-r0-benchmark.stats.v1';

const KNOWABLE = new Date('2026-05-01T10:00:00.000Z');

export interface M3_3HvH4A3_6R0BenchmarkScenarioV1 {
  id: string;
  canonicalSessions: number;
  revisionsPerSession: number;
}

export interface M3_3HvH4A3_6R0ScenarioResultV1 {
  scenarioId: string;
  revisionRows: number;
  durableTotalMs: M3_3HvH4A3_6R0TimingStatsV1;
  liveTotalMs: M3_3HvH4A3_6R0TimingStatsV1;
  durableRevisionFetchMs: M3_3HvH4A3_6R0TimingStatsV1;
  durableReportMs: M3_3HvH4A3_6R0TimingStatsV1;
}

async function createNativeSession(
  prisma: PrismaClient,
  organizationId: string,
  vehicleId: string,
  index: number,
) {
  const startAt = new Date(Date.UTC(2020, 0, 1, 0, 0, index));
  const endAt = new Date(startAt.getTime() + 3_600_000);
  return prisma.hvChargeSession.create({
    data: {
      id: randomUUID(),
      organizationId,
      vehicleId,
      segmentFingerprint: `bench-fp-${index}-${randomUUID()}`,
      dimoSegmentId: `dimo-${randomUUID()}`,
      source: HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
      startAt,
      endAt,
      energyAddedKwh: 10 + (index % 7),
      isOngoing: false,
      idempotencyKey: `idem-${randomUUID()}`,
      createdAt: KNOWABLE,
      receivedAt: KNOWABLE,
      updatedAt: KNOWABLE,
      providerObservedAt: endAt,
      metadata: {
        providerSegmentId: `prov-${index}`,
        addedEnergyProvenance: M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE,
        qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      },
    },
  });
}

async function insertRevisionForSession(
  prisma: PrismaClient,
  session: Awaited<ReturnType<typeof createNativeSession>>,
  revisionOrdinal: number,
) {
  const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(session);
  const updatedAt = new Date(session.updatedAt.getTime() + revisionOrdinal * 1_000);
  projection.sourceUpdatedAt = updatedAt.toISOString();
  const sourceRevisionFingerprint = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
  const mirror = mirrorFromScientificProjectionV1(projection);
  const capturedAt = new Date(KNOWABLE.getTime() + revisionOrdinal);
  const revision = await prisma.batteryHvChargeSessionEvidenceRevision.create({
    data: {
      organizationId: mirror.organizationId,
      vehicleId: mirror.vehicleId,
      sourceHvChargeSessionId: mirror.sourceHvChargeSessionId,
      segmentFingerprint: mirror.segmentFingerprint,
      evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
      sourceRevisionFingerprint,
      scientificEvidenceJson: projection as unknown as Prisma.InputJsonValue,
      dimoSegmentId: mirror.dimoSegmentId,
      providerSegmentId: mirror.providerSegmentId,
      source: mirror.source,
      startAt: mirror.startAt,
      endAt: mirror.endAt,
      isOngoing: mirror.isOngoing,
      energyAddedKwh: mirror.energyAddedKwh,
      providerObservedAt: mirror.providerObservedAt,
      addedEnergyProvenance: mirror.addedEnergyProvenance,
      qualityStatus: mirror.qualityStatus,
      supersededBySegmentFingerprint: mirror.supersededBySegmentFingerprint,
      startedBeforeRange: mirror.startedBeforeRange,
      sourceCreatedAt: mirror.sourceCreatedAt,
      sourceReceivedAt: mirror.sourceReceivedAt,
      sourceUpdatedAt: mirror.sourceUpdatedAt,
      capturedAt,
      createdAt: capturedAt,
    },
  });
  await prisma.batteryHvChargeSessionEvidenceAck.create({
    data: {
      organizationId: revision.organizationId,
      vehicleId: revision.vehicleId,
      segmentFingerprint: revision.segmentFingerprint,
      evidenceContractVersion: revision.evidenceContractVersion,
      sourceRevisionFingerprint: revision.sourceRevisionFingerprint,
      revisionId: revision.id,
      durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
    },
  });
}

export async function seedM3_3HvH4A3_6R0BenchmarkScenarioV1(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    canonicalSessions: number;
    revisionsPerSession: number;
  },
): Promise<{ revisionRows: number }> {
  for (let i = 0; i < input.canonicalSessions; i += 1) {
    const session = await createNativeSession(prisma, input.organizationId, input.vehicleId, i);
    for (let r = 0; r < input.revisionsPerSession; r += 1) {
      await insertRevisionForSession(prisma, session, r);
    }
  }
  return { revisionRows: input.canonicalSessions * input.revisionsPerSession };
}

async function timeMs(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

export async function runM3_3HvH4A3_6R0ScenarioBenchmarkV1(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    evaluationAt: Date;
    scenario: M3_3HvH4A3_6R0BenchmarkScenarioV1;
    iterations: number;
    warmup: number;
  },
): Promise<M3_3HvH4A3_6R0ScenarioResultV1> {
  const { revisionRows } = await seedM3_3HvH4A3_6R0BenchmarkScenarioV1(prisma, {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    canonicalSessions: input.scenario.canonicalSessions,
    revisionsPerSession: input.scenario.revisionsPerSession,
  });

  const durableTotalSamples: number[] = [];
  const liveTotalSamples: number[] = [];
  const durableRevisionFetchSamples: number[] = [];
  const durableReportSamples: number[] = [];

  const reportInput = {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
  };

  for (let i = 0; i < input.warmup + input.iterations; i += 1) {
    const durableRevisionFetch = await timeMs(async () => {
      await runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) => {
        await loadM3_3HvH4DurableModeAChargeSessionsV1(tx, {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          evaluationAt: input.evaluationAt,
        });
      });
    });
    const durableReport = await timeMs(async () => {
      await runM3_3HvH4DurableModeAA2ReportBundleV1(prisma, reportInput, input.evaluationAt);
    });
    const liveReport = await timeMs(async () => {
      await runM3_3HvH4LiveA2ReportBundleV1(prisma, reportInput, input.evaluationAt);
    });
    if (i >= input.warmup) {
      durableRevisionFetchSamples.push(durableRevisionFetch);
      durableReportSamples.push(durableReport);
      durableTotalSamples.push(durableReport);
      liveTotalSamples.push(liveReport);
    }
  }

  return {
    scenarioId: input.scenario.id,
    revisionRows,
    durableTotalMs: computeTimingStatsV1(durableTotalSamples),
    liveTotalMs: computeTimingStatsV1(liveTotalSamples),
    durableRevisionFetchMs: computeTimingStatsV1(durableRevisionFetchSamples),
    durableReportMs: computeTimingStatsV1(durableReportSamples),
  };
}

export function printM3_3HvH4A3_6R0ScenarioResultV1(result: M3_3HvH4A3_6R0ScenarioResultV1): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      `A3_6_R0_SCENARIO=${result.scenarioId}`,
      `revisionRows=${result.revisionRows}`,
      `durableReport=${formatTimingStatsV1(result.durableReportMs)}`,
      `durableRevisionFetch=${formatTimingStatsV1(result.durableRevisionFetchMs)}`,
      `liveReport=${formatTimingStatsV1(result.liveTotalMs)}`,
    ].join(' '),
  );
}

export function ratioP50(
  durable: M3_3HvH4A3_6R0TimingStatsV1,
  live: M3_3HvH4A3_6R0TimingStatsV1,
): number {
  if (live.p50Ms <= 0) return 0;
  return durable.p50Ms / live.p50Ms;
}

export function ratioP95(
  durable: M3_3HvH4A3_6R0TimingStatsV1,
  live: M3_3HvH4A3_6R0TimingStatsV1,
): number {
  if (live.p95Ms <= 0) return 0;
  return durable.p95Ms / live.p95Ms;
}
