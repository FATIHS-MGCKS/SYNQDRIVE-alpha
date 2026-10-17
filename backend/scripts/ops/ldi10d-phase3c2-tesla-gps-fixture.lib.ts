/**
 * LDI-10D Phase 3C.2 — Tesla POSITION fixture recovery + seven-algorithm replay.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/calibration/CALIBRATION_UNSET_V0';
import { classifyPositionRows } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/position/hold-release';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { EXP021_EV_GT_REFERENCE } from './exp021-ev-ground-truth-forensic-export.lib';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import {
  ALGORITHM_IDS,
  type AlgorithmId,
  type ComparisonRow,
  type ErrorStats,
  computeCandidateSpeed,
  computeErrorStats,
  fixtureRowsToObservations,
  loadVideoComparison,
  VIDEO_EVIDENCE,
} from './ldi10d-phase3c-gps-speed-research.lib';

export const FIXTURE_REL = 'architecture/drivingintelligence/evidence/ldi-10d/fixtures/tesla-20261016';

export type FixtureBucket = {
  bucketLabelUtc: string;
  availability: string;
  latitude: number | null;
  longitude: number | null;
  providerRowCount: number;
  coordinateStatus: string;
  temporalConfidence: string;
  referenceTimeUtc: string | null;
  qcTrustLevel: string;
  qcReasonCodes: string[];
  pinnedProductionL3Kmh: number | null;
  positionState: string;
  abstentionReason: string | null;
};

export type TeslaFixturePackage = {
  schema: string;
  tripId: string;
  vehicleId: string;
  dimoTokenId: number;
  pinnedSnapshotHash: string;
  positionPayloadSha256: string;
  bucketCount: number;
  buckets: FixtureBucket[];
};

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function recoverPositionFromProductionDb(): Promise<{
  positionPayload: string;
  positionPayloadSha256: string;
  pinnedSnapshotHash: string;
  buckets: FixtureBucket[];
  replayRows: ReturnType<typeof buildEvGroundTruthPerSecondReplay>;
}> {
  const prisma = new PrismaClient();
  try {
    const { organizationId, tripId, workItemId } = EXP021_EV_GT_REFERENCE;
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });
    const wi = ctx.workItem;
    const snapshotRows = await prisma.$queryRaw<
      Array<{
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        boundary_fingerprint: string;
        acquisition_window_start: Date;
        acquisition_window_end: Date;
        channel_manifest: unknown;
        payload_gzip: Buffer;
        uncompressed_bytes: number | bigint;
      }>
    >`
      SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint, acquisition_window_start,
        acquisition_window_end, channel_manifest, payload_gzip, uncompressed_bytes
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${wi.organization_id}
        AND trip_id = ${wi.trip_id}
        AND snapshot_hash = ${ctx.pinnedSnapshotHash}
      LIMIT 1`;

    if (!snapshotRows[0]) throw new Error('S4 evidence snapshot row not found');

    const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(snapshotRows[0]!, {
      organizationId: wi.organization_id,
      vehicleId: wi.vehicle_id,
      tripId: wi.trip_id,
      boundaryFingerprint: wi.boundary_fingerprint,
      snapshotHash: ctx.pinnedSnapshotHash,
      sourceFamily: wi.source_family as 'API_SYNTHETIC',
    });
    if (!verified.ok) throw new Error(`snapshot verify failed: ${verified.code}`);

    const positionPayload = verified.parsed.channelPayloads.POSITION;
    if (!positionPayload) throw new Error('POSITION channel payload missing');

    const payloadHash = sha256Hex(positionPayload);
    const material = parseDiV0PositionSnapshot(positionPayload);
    const replayRows = buildEvGroundTruthPerSecondReplay(ctx);

    const replayByLabel = new Map(replayRows.map((r) => [r.bucketLabelUtc, r]));

    const buckets: FixtureBucket[] = material.buckets.map((b) => {
      const rep = replayByLabel.get(b.bucketLabel);
      return {
        bucketLabelUtc: b.bucketLabel,
        availability: b.availability,
        latitude: b.observation.latitude ?? null,
        longitude: b.observation.longitude ?? null,
        providerRowCount: b.providerRowCount,
        coordinateStatus: b.coordinateStatus,
        temporalConfidence: b.temporalConfidence,
        referenceTimeUtc: b.observation.referenceTime ?? null,
        qcTrustLevel: rep?.qcTrustLevel ?? 'UNTRUSTED',
        qcReasonCodes: rep?.qcReasonCodes ?? [],
        pinnedProductionL3Kmh: rep?.l3SpeedKmh ?? null,
        positionState: rep?.positionState ?? 'UNKNOWN',
        abstentionReason: rep?.abstentionReason ?? null,
      };
    });

    return {
      positionPayload,
      positionPayloadSha256: payloadHash,
      pinnedSnapshotHash: ctx.pinnedSnapshotHash,
      buckets,
      replayRows,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export function writeFixturePackage(
  repoRoot: string,
  recovered: Awaited<ReturnType<typeof recoverPositionFromProductionDb>>,
  recoveryObservedAtUtc: string,
): { fixtureDir: string; hashParity: boolean; recordsRecovered: number } {
  const fixtureDir = path.join(repoRoot, FIXTURE_REL);
  fs.mkdirSync(fixtureDir, { recursive: true });

  const positionPath = path.join(fixtureDir, 'POSITION_CHANNEL_SNAPSHOT_V0_1.txt');
  fs.writeFileSync(positionPath, recovered.positionPayload, 'utf8');

  const grid: TeslaFixturePackage = {
    schema: 'LDI10D_TESLA_POSITION_GRID_V1',
    tripId: EXP021_EV_GT_REFERENCE.tripId,
    vehicleId: EXP021_EV_GT_REFERENCE.vehicleId,
    dimoTokenId: 186946,
    pinnedSnapshotHash: recovered.pinnedSnapshotHash,
    positionPayloadSha256: recovered.positionPayloadSha256,
    bucketCount: recovered.buckets.length,
    buckets: recovered.buckets,
  };
  fs.writeFileSync(path.join(fixtureDir, 'TESLA_POSITION_GRID.json'), JSON.stringify(grid, null, 2));

  const comparison = loadVideoComparison(repoRoot);
  const videoRef = comparison.map((r) => ({
    bucketLabelUtc: r.bucketLabelUtc,
    tachoKmh: r.tachoKmh,
    pinnedProductionL3Kmh: r.l3SpeedKmh,
    qcTrustLevel: r.qcTrustLevel,
    videoFile: r.videoFile,
    positionAvailability: r.positionAvailability,
    positionState: r.positionState,
  }));
  fs.writeFileSync(
    path.join(fixtureDir, 'VIDEO_TACHO_REFERENCE.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_TESLA_VIDEO_TACHO_REF_V1',
        sourceComparisonPath: VIDEO_EVIDENCE.comparisonRel,
        rows: videoRef,
      },
      null,
      2,
    ),
  );

  const provenance = {
    schema: 'LDI10D_TESLA_FIXTURE_PROVENANCE_V1',
    recoveryObservedAtUtc,
    recoveryMode: 'READ_ONLY_PRODUCTION_DB',
    productionMutations: 'NONE',
    providerCalls: 'NONE',
    referenceManifest:
      'architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json',
    expectedPositionPayloadSha256: POSITION_PAYLOAD_SHA256,
    recoveredPositionPayloadSha256: recovered.positionPayloadSha256,
    pinnedSnapshotHash: recovered.pinnedSnapshotHash,
    dimoTokenId: 186946,
    tripId: EXP021_EV_GT_REFERENCE.tripId,
    privacyReview: {
      credentialsInFixture: false,
      accessTokensInFixture: false,
      unrelatedPersonalData: false,
      thirdPartyLocationTracesOutsideTrip: false,
      note:
        'Fixture contains only this owner-authorized research trip GPS grid (Germany route ~2026-10-16). Repository visibility follows org git access; coordinates are sensitive mobility data.',
    },
  };
  fs.writeFileSync(path.join(fixtureDir, 'PROVENANCE_MANIFEST.json'), JSON.stringify(provenance, null, 2));

  fs.writeFileSync(
    path.join(fixtureDir, 'SCHEMA.md'),
    [
      '# Tesla 2026-10-16 GPS research fixture schema',
      '',
      '| File | Role |',
      '| --- | --- |',
      '| `POSITION_CHANNEL_SNAPSHOT_V0_1.txt` | Raw S4 POSITION channel payload (LF JSON lines) |',
      '| `TESLA_POSITION_GRID.json` | Parsed 1 Hz buckets + QC join (no interpolation) |',
      '| `VIDEO_TACHO_REFERENCE.json` | Synchronized video tacho witness (not GPS ground truth) |',
      '| `PROVENANCE_MANIFEST.json` | Recovery provenance + hash parity |',
      '| `SHA256SUMS` | Integrity |',
      '',
      'Missing seconds remain `ROW_ABSENT` with null coordinates — never synthesized.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(fixtureDir, 'REPLAY_INSTRUCTIONS.md'),
    [
      '# Replay instructions',
      '',
      '```bash',
      'cd backend && npm run ldi10d:phase3c2-tesla-seven-algorithm-replay',
      'cd backend && npx jest ldi10d-phase3c2 --runInBand',
      '```',
      '',
      'Requires fixture files only (no DB) after initial recovery commit.',
    ].join('\n'),
  );

  const sums = [
    `POSITION_CHANNEL_SNAPSHOT_V0_1.txt  ${sha256Hex(fs.readFileSync(positionPath))}`,
    `TESLA_POSITION_GRID.json  ${sha256Hex(fs.readFileSync(path.join(fixtureDir, 'TESLA_POSITION_GRID.json')))}`,
    `VIDEO_TACHO_REFERENCE.json  ${sha256Hex(fs.readFileSync(path.join(fixtureDir, 'VIDEO_TACHO_REFERENCE.json')))}`,
    `PROVENANCE_MANIFEST.json  ${sha256Hex(fs.readFileSync(path.join(fixtureDir, 'PROVENANCE_MANIFEST.json')))}`,
  ].join('\n');
  fs.writeFileSync(path.join(fixtureDir, 'SHA256SUMS'), `${sums}\n`);

  return {
    fixtureDir,
    hashParity: recovered.positionPayloadSha256 === POSITION_PAYLOAD_SHA256,
    recordsRecovered: recovered.buckets.length,
  };
}

export function loadCommittedFixture(repoRoot: string): TeslaFixturePackage {
  const p = path.join(repoRoot, FIXTURE_REL, 'TESLA_POSITION_GRID.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as TeslaFixturePackage;
}

export type AlgorithmReplayResult = {
  algorithm: AlgorithmId;
  numericCoverage: number;
  trustedWitnessPairs: ErrorStats;
  allTachoReadablePairs: ErrorStats;
  lowSpeedMae: ErrorStats;
  frozenCoordAbstentions: number;
  gapAbstentions: number;
};

function pairedTachoStats(
  speedsByLabel: Map<string, number | null>,
  comparison: ComparisonRow[],
  trustedOnly: boolean,
): ErrorStats {
  const pairs: Array<{ pred: number; ref: number }> = [];
  for (const row of comparison) {
    if (row.tachoKmh == null) continue;
    if (trustedOnly && row.qcTrustLevel !== 'TRUSTED') continue;
    const pred = speedsByLabel.get(row.bucketLabelUtc);
    if (pred == null) continue;
    pairs.push({ pred, ref: row.tachoKmh });
  }
  return computeErrorStats(pairs);
}

export function runSevenAlgorithmReplay(repoRoot: string): {
  results: AlgorithmReplayResult[];
  bestCandidate: AlgorithmId;
  accuracyImprovementProven: boolean;
  baseline: AlgorithmReplayResult;
} {
  const fixture = loadCommittedFixture(repoRoot);
  const comparison = loadVideoComparison(repoRoot);
  const observations = fixtureRowsToObservations(fixture.buckets);
  const classified = classifyPositionRows(observations, CALIBRATION_UNSET_V0_BUNDLE);

  const results: AlgorithmReplayResult[] = [];

  for (const algo of ALGORITHM_IDS) {
    const ema = { value: null as number | null };
    const speedsByLabel = new Map<string, number | null>();
    let frozenAbstain = 0;
    let gapAbstain = 0;
    for (let i = 0; i < classified.length; i++) {
      const { speedKmh, abstainReason } = computeCandidateSpeed(algo, classified, i, ema);
      const label = classified[i].observation.bucketLabel;
      speedsByLabel.set(label, speedKmh);
      if (abstainReason?.includes('FROZEN')) frozenAbstain += 1;
      if (abstainReason?.includes('INCOMPLETE') || abstainReason?.includes('ROW_ABSENT')) gapAbstain += 1;
    }
    const numeric = [...speedsByLabel.values()].filter((v) => v != null).length;
    results.push({
      algorithm: algo,
      numericCoverage: numeric / fixture.bucketCount,
      trustedWitnessPairs: pairedTachoStats(speedsByLabel, comparison, true),
      allTachoReadablePairs: pairedTachoStats(speedsByLabel, comparison, false),
      lowSpeedMae: pairedTachoStats(
        speedsByLabel,
        comparison.filter((r) => r.tachoKmh != null && r.tachoKmh < 15),
        false,
      ),
      frozenCoordAbstentions: frozenAbstain,
      gapAbstentions: gapAbstain,
    });
  }

  const baseline =
    results.find((r) => r.algorithm === 'L3_BASELINE_PRODUCTION') ?? results[0]!;
  const baseMae = baseline.trustedWitnessPairs.maeKmh ?? Infinity;

  let best = baseline.algorithm;
  let bestMae = baseMae;
  for (const r of results) {
    const mae = r.trustedWitnessPairs.maeKmh;
    if (mae != null && mae < bestMae - 1e-6) {
      bestMae = mae;
      best = r.algorithm;
    }
  }

  const accuracyImprovementProven =
    best !== 'L3_BASELINE_PRODUCTION' &&
    bestMae < baseMae &&
    (results.find((r) => r.algorithm === best)?.trustedWitnessPairs.n ?? 0) >=
      (baseline.trustedWitnessPairs.n ?? 0) * 0.95;

  return { results, bestCandidate: best, accuracyImprovementProven, baseline };
}
