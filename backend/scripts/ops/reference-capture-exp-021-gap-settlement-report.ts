#!/usr/bin/env ts-node
/**
 * EXP-021 gap → settlement correlation report (read-only).
 *
 * Usage:
 *   SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
 *   npx ts-node -r tsconfig-paths/register scripts/ops/reference-capture-exp-021-gap-settlement-report.ts
 */
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  buildGapSettlementMatrix,
  summarizeGapSettlementMatrix,
  EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp021-gap-settlement-analyzer';
import {
  analyzeGlobalCrossAge,
  analyzeProbeCrossAge,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow-cross-age-analyzer';
import {
  buildFixedIntervalProbesForPhase,
  formatPhaseLabel,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-settlement-shadow.policy';

const EXPECTED = {
  sessionId: '945edc40-3002-4b87-83f6-a55d8cf66ffb',
  experimentId: 'exp-021-945edc40-e7850aa0',
  canonicalT0: '2026-09-10T19:41:19.000Z',
  primaryField: 'speed',
};

function loadEnv(): void {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const prisma = new PrismaClient();
  const out: Record<string, unknown> = { generatedAtUtc: new Date().toISOString() };

  try {
    const session = await prisma.referenceCaptureSession.findUnique({
      where: { id: EXPECTED.sessionId },
      select: { acquisitionStateJson: true },
    });
    const exp = await prisma.referenceCaptureSettlementShadowExperiment.findFirst({
      where: { experimentId: EXPECTED.experimentId },
      select: { id: true },
    });

    const acquisitionState = (session?.acquisitionStateJson ?? {}) as Record<string, unknown>;
    const series = (acquisitionState.hfCalibrationSeries ?? {}) as Record<string, unknown>;
    const completed = (series.completedPhaseSummaries ?? []) as Array<Record<string, unknown>>;
    const activeCounters = (acquisitionState.hfCalibrationActiveCounters ?? null) as {
      nativeUniqueTemporalBucketStarts?: string[];
    } | null;

    const observations = exp
      ? await prisma.referenceCaptureSettlementShadowObservation.findMany({
          where: { experimentId: exp.id, probeType: 'FIXED_INTERVAL' },
          orderBy: [{ probeId: 'asc' }, { scheduledAgeMs: 'asc' }],
        })
      : [];

    const observationsByProbeId: Record<
      string,
      Array<{
        probeId: string;
        scheduledAgeMs: number;
        providerRequestStatus: string;
        rawRowCount: number;
        uniqueBucketIdentities: string[];
        bucketValueSnapshots?: Record<string, string>;
        valueContentHash?: string | null;
      }>
    > = {};

    for (const row of observations) {
      const json = (row.observationJson ?? {}) as {
        uniqueBucketIdentities?: string[];
        bucketValueSnapshots?: Record<string, string>;
        valueContentHash?: string;
      };
      const list = observationsByProbeId[row.probeId] ?? [];
      list.push({
        probeId: row.probeId,
        scheduledAgeMs: row.scheduledAgeMs,
        providerRequestStatus: row.providerRequestStatus,
        rawRowCount: row.rawRowCount,
        uniqueBucketIdentities: json.uniqueBucketIdentities ?? [],
        bucketValueSnapshots: json.bucketValueSnapshots,
        valueContentHash: json.valueContentHash ?? null,
      });
      observationsByProbeId[row.probeId] = list;
    }

    const phasePollIntervals = [60_000, 30_000, 20_000];
    const gapMatrices: Record<string, unknown> = {};
    const phaseSummaries: Record<string, unknown> = {};

    for (const pollMs of phasePollIntervals) {
      const label = formatPhaseLabel(pollMs);
      const summary = completed.find(
        (p: { effectivePollIntervalMs?: number }) => p.effectivePollIntervalMs === pollMs,
      );
      phaseSummaries[label] = summary ?? { status: 'NOT_IN_COMPLETED_SUMMARIES' };

      const completedPhases = (series.completedPhases ?? []) as Array<Record<string, unknown>>;
      const activePhase = series.activePhase as Record<string, unknown> | null;
      const phaseRecord = [...completedPhases, activePhase].find(
        (p) => (p?.effectivePollIntervalMs as number | undefined) === pollMs,
      );
      const phaseStartMs = phaseRecord?.phaseStartedAt
        ? Date.parse(String(phaseRecord.phaseStartedAt))
        : Date.parse(EXPECTED.canonicalT0);

      const { probes } = buildFixedIntervalProbesForPhase({
        phasePollIntervalMs: pollMs,
        phaseStartedAtMs: phaseStartMs,
        phaseEndedAtMs: phaseRecord?.phaseEndedAt
          ? Date.parse(String(phaseRecord.phaseEndedAt))
          : phaseStartMs + 600_000,
      });

      const persistedEvidence = summary?.nativeTemporalEvidence as
        | { orderedNativeTemporalBucketStarts?: string[] }
        | undefined;
      const nativeStarts: string[] =
        persistedEvidence?.orderedNativeTemporalBucketStarts?.length
          ? persistedEvidence.orderedNativeTemporalBucketStarts
          : pollMs === 20_000 && activeCounters?.nativeUniqueTemporalBucketStarts?.length
            ? activeCounters.nativeUniqueTemporalBucketStarts
            : [];

      if (nativeStarts.length === 0) {
        gapMatrices[label] = {
          status: 'NOT_ASSESSABLE',
          reason:
            'orderedNativeTemporalBucketStarts not in completedPhaseSummaries.nativeTemporalEvidence (KS MS 661 frozen run predates persistence)',
          aggregateMaxGapMs: summary?.nativeMaxTemporalGapMs ?? null,
        };
        continue;
      }

      const matrix = buildGapSettlementMatrix({
        phaseLabel: label,
        nativeTemporalBucketStarts: nativeStarts,
        minGapMs: EXP021_GAP_SETTLEMENT_MIN_GAP_MS,
        primaryField: EXPECTED.primaryField,
        probes: probes.map((p) => ({
          probeId: p.probeId,
          phaseLabel: p.phaseLabel,
          sourceIntervalStartIso: new Date(p.sourceIntervalStartMs).toISOString(),
          sourceIntervalEndIso: new Date(p.sourceIntervalEndMs).toISOString(),
        })),
        observationsByProbeId,
      });
      gapMatrices[label] = {
        matrixRowCount: matrix.length,
        summary: summarizeGapSettlementMatrix(matrix),
        sample: matrix.slice(0, 5),
      };
    }

    const crossAgeReports = Object.keys(observationsByProbeId).map((probeId) =>
      analyzeProbeCrossAge(
        observationsByProbeId[probeId].map((o) => ({
          probeId: o.probeId,
          probeType: 'FIXED_INTERVAL',
          phase: null,
          scheduledAgeMs: o.scheduledAgeMs,
          providerRequestStatus: o.providerRequestStatus,
          rawRowCount: o.rawRowCount,
          uniqueBucketIdentities: o.uniqueBucketIdentities,
          bucketValueSnapshots: o.bucketValueSnapshots,
          valueContentHash: o.valueContentHash,
        })),
      ),
    );

    out.phaseSummaries = phaseSummaries;
    out.gapMatrices = gapMatrices;
    out.crossAge = {
      perProbe: crossAgeReports,
      global: analyzeGlobalCrossAge(crossAgeReports),
    };
    out.historicalValueRevisionPossible = observations.some(
      (o) =>
        Boolean(
          (o.observationJson as { bucketValueSnapshots?: Record<string, string> } | null)
            ?.bucketValueSnapshots,
        ),
    )
      ? 'YES'
      : 'NO';

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
