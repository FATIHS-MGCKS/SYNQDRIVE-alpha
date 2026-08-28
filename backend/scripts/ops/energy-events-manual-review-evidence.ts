/**
 * PRIVATE OPS ONLY — read-only manual-review evidence inspection for E3A.
 *
 * Locates NEEDS_FURTHER_EVIDENCE refuel candidates, fetches bounded DIMO telemetry
 * around each event, and emits a disposition recommendation. Output contains
 * operational identifiers and must NEVER be committed to the repository.
 *
 * Usage (secured infrastructure only):
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/energy-events-manual-review-evidence.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.constants';
import {
  runEnergyEventsRecoveryDryRun,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-runner';
import {
  buildRecoveryVehicleInput,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-capability';
import {
  buildManualReviewReport,
  deriveManualReviewDisposition,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-manual-review';
import {
  buildSanitizationContext,
  durationBucket,
  fuelDeltaBucket,
  odometerDeltaBucket,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-artifact-sanitize';
import {
  createDimoRequestAccounting,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-accounting';
import {
  createMutationGuardedPrismaClient,
  createPrismaRecoveryReadRepository,
} from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery-read.repository';
import {
  fetchEnergyEventSegmentsStandalone,
  fetchRefuelEvidenceSignalsStandalone,
  probeAvailableSignalsForTokenIds,
  probeDimoAccessForTokenIds,
  type RefuelEvidenceSample,
} from './energy-events-standalone-dimo-fetch';
import type { ManualReviewEntry } from '../../src/modules/vehicle-intelligence/energy-events/energy-events-recovery.types';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

const EVIDENCE_PADDING_MS = 30 * 60 * 1000;
const STATIONARY_SPEED_KMH = 3;

interface FuelStep {
  at: string;
  absoluteDeltaLiters: number | null;
  relativeDeltaPercent: number | null;
  odometerDeltaKm: number | null;
  maxSpeedKmh: number | null;
  stationarySeconds: number;
  sustainedAfterMinutes: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function findLargestFuelStep(samples: RefuelEvidenceSample[]): FuelStep | null {
  if (samples.length < 2) return null;

  let best: FuelStep | null = null;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1];
    const current = samples[index];
    const absDelta =
      previous.fuelAbsoluteLiters != null && current.fuelAbsoluteLiters != null
        ? current.fuelAbsoluteLiters - previous.fuelAbsoluteLiters
        : null;
    const relDelta =
      previous.fuelRelativePercent != null && current.fuelRelativePercent != null
        ? current.fuelRelativePercent - previous.fuelRelativePercent
        : null;
    if ((absDelta ?? 0) <= 0 && (relDelta ?? 0) <= 0) continue;

    const windowStartMs = new Date(previous.timestamp).getTime();
    const windowEndMs = new Date(current.timestamp).getTime() + 5 * 60 * 1000;
    const window = samples.filter((sample) => {
      const ts = new Date(sample.timestamp).getTime();
      return ts >= windowStartMs && ts <= windowEndMs;
    });
    const speeds = window
      .map((sample) => sample.speedKmh)
      .filter((value): value is number => value != null);
    const odometers = window
      .map((sample) => sample.odometerKm)
      .filter((value): value is number => value != null);
    const stationarySeconds = window.filter(
      (sample) =>
        (sample.speedKmh ?? 0) <= STATIONARY_SPEED_KMH &&
        sample.ignitionOn !== true,
    ).length * 20;

    const after = samples.filter(
      (sample) => new Date(sample.timestamp).getTime() >= windowEndMs,
    );
    let sustainedAfterMinutes: number | null = null;
    if (after.length > 0 && current.fuelAbsoluteLiters != null) {
      const floor = current.fuelAbsoluteLiters - 1;
      const sustained = after.find(
        (sample) =>
          sample.fuelAbsoluteLiters != null && sample.fuelAbsoluteLiters < floor,
      );
      sustainedAfterMinutes = sustained
        ? (new Date(sustained.timestamp).getTime() - windowEndMs) / 60_000
        : Math.min(
            30,
            (new Date(after[after.length - 1].timestamp).getTime() -
              windowEndMs) /
              60_000,
          );
    }

    const candidate: FuelStep = {
      at: current.timestamp,
      absoluteDeltaLiters: absDelta,
      relativeDeltaPercent: relDelta,
      odometerDeltaKm:
        odometers.length >= 2
          ? Math.abs(odometers[odometers.length - 1] - odometers[0])
          : null,
      maxSpeedKmh: speeds.length > 0 ? Math.max(...speeds) : null,
      stationarySeconds,
      sustainedAfterMinutes,
    };

    const score =
      (candidate.absoluteDeltaLiters ?? 0) +
      (candidate.relativeDeltaPercent ?? 0) / 10;
    const bestScore =
      (best?.absoluteDeltaLiters ?? 0) + (best?.relativeDeltaPercent ?? 0) / 10;
    if (!best || score > bestScore) best = candidate;
  }

  return best;
}

function analyzeCandidate(entry: ManualReviewEntry, samples: RefuelEvidenceSample[]) {
  const absValues = samples
    .map((sample) => sample.fuelAbsoluteLiters)
    .filter((value): value is number => value != null);
  const relValues = samples
    .map((sample) => sample.fuelRelativePercent)
    .filter((value): value is number => value != null);
  const speeds = samples
    .map((sample) => sample.speedKmh)
    .filter((value): value is number => value != null);
  const odometers = samples
    .map((sample) => sample.odometerKm)
    .filter((value): value is number => value != null);

  const preBaselineAbs = median(absValues.slice(0, Math.min(5, absValues.length)));
  const preBaselineRel = median(relValues.slice(0, Math.min(5, relValues.length)));
  const largestStep = findLargestFuelStep(samples);
  const continuousDriving =
    speeds.length > 0 &&
    speeds.filter((speed) => speed > STATIONARY_SPEED_KMH).length /
      speeds.length >
      0.7;
  const segmentOdometerDeltaKm = entry.odometerDeltaKm;
  const trueStepOdometerDeltaKm = largestStep?.odometerDeltaKm ?? null;

  const signalsEventuallyAgree =
    largestStep != null &&
    (largestStep.absoluteDeltaLiters ?? 0) > 0 &&
    (largestStep.relativeDeltaPercent ?? 0) > 0;

  const sustainedIncrease =
    largestStep != null &&
    (largestStep.sustainedAfterMinutes ?? 0) >= 5 &&
    (largestStep.absoluteDeltaLiters ?? 0) >= 2;

  const stationaryRefuelWindow =
    largestStep != null && largestStep.stationarySeconds >= 60;

  const telemetryGapArtifact =
    samples.length < 8 ||
    samples.some((sample, index) => {
      if (index === 0) return false;
      const gapMs =
        new Date(sample.timestamp).getTime() -
        new Date(samples[index - 1].timestamp).getTime();
      return gapMs > 5 * 60 * 1000;
    });

  let recommendedDisposition: 'APPROVE_FOR_BACKFILL' | 'EXCLUDE_FROM_BACKFILL' =
    'EXCLUDE_FROM_BACKFILL';
  let evidenceCategory = 'insufficient_or_artifactual_fuel_step';

  if (
    sustainedIncrease &&
    stationaryRefuelWindow &&
    trueStepOdometerDeltaKm != null &&
    trueStepOdometerDeltaKm <= 10 &&
    !continuousDriving
  ) {
    recommendedDisposition = 'APPROVE_FOR_BACKFILL';
    evidenceCategory = 'stationary_sustained_refuel_step';
  } else if (
    sustainedIncrease &&
    signalsEventuallyAgree &&
    trueStepOdometerDeltaKm != null &&
    trueStepOdometerDeltaKm <= 15
  ) {
    recommendedDisposition = 'APPROVE_FOR_BACKFILL';
    evidenceCategory = 'credible_refuel_despite_segment_padding';
  } else if (
    !sustainedIncrease ||
    telemetryGapArtifact ||
    continuousDriving ||
    (largestStep?.absoluteDeltaLiters ?? 0) < 2
  ) {
    recommendedDisposition = 'EXCLUDE_FROM_BACKFILL';
    evidenceCategory = largestStep
      ? 'unsustained_or_driving_artifact'
      : 'no_discrete_fuel_step';
  } else if (entry.plausibilityReasons.includes('fuel_signal_contradiction')) {
    recommendedDisposition = signalsEventuallyAgree
      ? 'APPROVE_FOR_BACKFILL'
      : 'EXCLUDE_FROM_BACKFILL';
    evidenceCategory = signalsEventuallyAgree
      ? 'signal_contradiction_resolved_by_step_shape'
      : 'irreconcilable_signal_contradiction';
  }

  return {
    sampleCount: samples.length,
    preBaselineAbs,
    preBaselineRel,
    medianSpeedKmh: median(speeds),
    maxSpeedKmh: speeds.length > 0 ? Math.max(...speeds) : null,
    segmentOdometerDeltaKm,
    trueStepOdometerDeltaKm,
    largestStep,
    continuousDriving,
    sustainedIncrease,
    stationaryRefuelWindow,
    signalsEventuallyAgree,
    telemetryGapArtifact,
    segmentPaddingLikely:
      segmentOdometerDeltaKm != null &&
      trueStepOdometerDeltaKm != null &&
      segmentOdometerDeltaKm - trueStepOdometerDeltaKm >= 10,
    recommendedDisposition,
    evidenceCategory,
  };
}

async function main() {
  if (!process.env.DIMO_CLIENT_ID || !process.env.DIMO_PRIVATE_KEY) {
    console.error('Missing DIMO_CLIENT_ID or DIMO_PRIVATE_KEY');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('FULL evidence inspection requires DATABASE_URL');
    process.exit(1);
  }

  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);
  const accounting = createDimoRequestAccounting();
  const prisma = createMutationGuardedPrismaClient(new PrismaClient());
  const repository = createPrismaRecoveryReadRepository(prisma);

  const rows = await repository.loadRecoveryVehicleDbRows({
    outageStart,
    recoveryCutoff,
  });
  const tokenIds = rows.map((row) => row.tokenId);
  const dimoAccessByTokenId = await probeDimoAccessForTokenIds(tokenIds, accounting);
  const accessibleTokenIds = tokenIds.filter((tokenId) => dimoAccessByTokenId[tokenId]);
  const availableSignalsByTokenId = await probeAvailableSignalsForTokenIds(
    accessibleTokenIds,
    accounting,
  );
  const vehicles = rows.map((row) =>
    buildRecoveryVehicleInput(
      { ...row, dimoAccessAvailable: dimoAccessByTokenId[row.tokenId] ?? false },
      availableSignalsByTokenId[row.tokenId] ?? null,
      'full',
    ),
  );

  const report = await runEnergyEventsRecoveryDryRun(vehicles, {
    fetchSegments: (tokenId, from, to, energyClass) =>
      fetchEnergyEventSegmentsStandalone(tokenId, from, to, energyClass),
    interRequestDelayMs: 500,
    mode: 'full',
    dbComparisonEnabled: true,
    dbComparisonStatus: 'ok',
    accounting,
  });

  await prisma.$disconnect();

  const manualReviewReport = buildManualReviewReport(report.candidates);
  const unresolved = manualReviewReport.filter(
    (entry) => deriveManualReviewDisposition(entry.plausibilityReasons) === 'NEEDS_FURTHER_EVIDENCE',
  );

  const ctx = buildSanitizationContext(report);
  const inventoryRows = report.vehicles.map((row) => ({
    alias:
      ctx.aliasByInventorySlot.get(
        `${row.energyClass}:${row.vehicleId ?? row.label}`,
      ) ?? 'UNKNOWN',
    ...row,
  }));

  const investigations = [];
  for (const entry of unresolved) {
    const inventoryRow = inventoryRows.find((row) => row.tokenId === entry.tokenId);
    const startMs = new Date(entry.startTime).getTime();
    const endMs = new Date(entry.endTime).getTime();
    const from = new Date(startMs - EVIDENCE_PADDING_MS);
    const to = new Date(endMs + EVIDENCE_PADDING_MS);
    const samples = await fetchRefuelEvidenceSignalsStandalone(
      entry.tokenId,
      from,
      to,
      accounting,
    );
    investigations.push({
      caseId:
        entry.plausibilityReasons.includes('fuel_signal_contradiction')
          ? 'ICE_A_CASE_A'
          : 'ICE_A_CASE_B',
      inventoryAlias: inventoryRow?.alias ?? 'UNKNOWN',
      vehicle: entry.vehicle,
      tokenId: entry.tokenId,
      dimoSegmentId: entry.dimoSegmentId,
      mechanism: entry.mechanism,
      startTime: entry.startTime,
      endTime: entry.endTime,
      durationSeconds: entry.durationSeconds,
      durationBucket: durationBucket(entry.durationSeconds),
      odometerDeltaBucket: odometerDeltaBucket(entry.odometerDeltaKm),
      fuelDeltaBucket: fuelDeltaBucket(entry.fuelDeltaLiters),
      confidence: entry.confidence,
      plausibilityReasons: entry.plausibilityReasons,
      segmentFuelDeltaLiters: entry.fuelDeltaLiters,
      segmentFuelDeltaPercent: entry.fuelDeltaPercent,
      inspectionWindow: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      analysis: analyzeCandidate(entry, samples),
    });
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        unresolvedCount: unresolved.length,
        investigations,
        requestAccounting: accounting,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
