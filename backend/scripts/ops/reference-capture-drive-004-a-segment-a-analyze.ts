/**
 * DI-EV-0035A.2 — RD004-A Segment A video ↔ telemetry alignment CLI.
 * SAFETY: read-only; no DB, Prisma, API, production runtime, or detector mutation.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { stableStringify } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';
import {
  assertNoEnvironmentSpecificPathsInObject,
  computeRd004SourceBundleSha256,
  loadRd004Jsonl,
  RD004_A_EVIDENCE_ID,
  RD004_A_MODE,
  RD004_A_SOURCE_FILES,
  rd004SegmentAOutputSha256,
  runRd004SegmentAAnalysis,
  SEGMENT_A_CONSTANTS,
  toRepoRelativePath,
  type LegacyPreprocessedSpeedRow,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-a-segment-a';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_OBSERVATIONS = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-a',
  RD004_A_SOURCE_FILES.observations,
);
const DEFAULT_LEGACY_SIDECAR = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-a',
  RD004_A_SOURCE_FILES.legacySidecar,
);
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-a');

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function loadLegacySidecar(content: string): LegacyPreprocessedSpeedRow[] {
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LegacyPreprocessedSpeedRow);
}

function writeCsv(
  filePath: string,
  headers: string[],
  rows: Array<Record<string, string | number | null>>,
): void {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? '')).join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'));
}

function main(): void {
  const observationsPath = parseArg('--observations') ?? DEFAULT_OBSERVATIONS;
  const legacySidecarPath = parseArg('--legacy-sidecar') ?? DEFAULT_LEGACY_SIDECAR;
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;

  assertSafeOutputPath(outDir);

  const observationsContent = fs.readFileSync(observationsPath, 'utf8');
  const legacySidecarContent = fs.readFileSync(legacySidecarPath, 'utf8');
  const observationsSha256 = crypto.createHash('sha256').update(observationsContent).digest('hex');
  const legacySidecarSha256 = crypto.createHash('sha256').update(legacySidecarContent).digest('hex');

  const { bundleSha256 } = computeRd004SourceBundleSha256({
    [RD004_A_SOURCE_FILES.observations]: observationsSha256,
    [RD004_A_SOURCE_FILES.legacySidecar]: legacySidecarSha256,
  });

  const observations = loadRd004Jsonl(observationsContent);
  const legacySidecar = loadLegacySidecar(legacySidecarContent);
  const result = runRd004SegmentAAnalysis({ observations, legacySidecar });

  fs.mkdirSync(outDir, { recursive: true });

  const paths = {
    sessionSummary: path.join(outDir, 'rd004-a-session-summary.json'),
    rawSpeedSeriesJson: path.join(outDir, 'rd004-a-raw-speed-series.json'),
    rawSpeedSeriesCsv: path.join(outDir, 'rd004-a-raw-speed-series.csv'),
    signalCadence: path.join(outDir, 'rd004-a-signal-cadence.json'),
    videoClockAlignment: path.join(outDir, 'rd004-a-video-clock-alignment.json'),
    speedComparison: path.join(outDir, 'rd004-a-speed-comparison.json'),
    kinematicReconstruction: path.join(outDir, 'rd004-a-kinematic-reconstruction.json'),
    legacyDetectorAudit: path.join(outDir, 'rd004-a-legacy-detector-audit.json'),
    preprocessingResponse: path.join(outDir, 'rd004-a-preprocessing-response.json'),
    supportingSignals: path.join(outDir, 'rd004-a-supporting-signals.json'),
    reverseValidation: path.join(outDir, 'rd004-a-reverse-validation.json'),
    sourceManifest: path.join(outDir, RD004_A_SOURCE_FILES.manifest),
  };

  for (const p of Object.values(paths)) assertSafeOutputPath(p);

  const sourceObservationsRel = toRepoRelativePath(observationsPath, REPO_ROOT);
  const sourceLegacyRel = toRepoRelativePath(legacySidecarPath, REPO_ROOT);

  const sessionSummary = {
    evidenceId: RD004_A_EVIDENCE_ID,
    mode: RD004_A_MODE,
    phase: 'RD004-A.2',
    vehicle: SEGMENT_A_CONSTANTS.vehicleLabel,
    vehicleId: SEGMENT_A_CONSTANTS.vehicleId,
    tokenId: SEGMENT_A_CONSTANTS.tokenId,
    sessionId: SEGMENT_A_CONSTANTS.sessionId,
    referenceDriveId: SEGMENT_A_CONSTANTS.referenceDriveId,
    sourceObservationsPath: sourceObservationsRel,
    sourceObservationsSha256: observationsSha256,
    sourceLegacySidecarPath: sourceLegacyRel,
    sourceLegacySidecarSha256: legacySidecarSha256,
    sourceBundleSha256: bundleSha256,
    BUNDLE_SHA256_METHOD: 'CANONICAL_MEMBER_HASH_MANIFEST',
    PER_FILE_SHA256_PRESERVED: 'YES',
    CANONICAL_PATHS_REPO_RELATIVE: 'YES',
    sealedEvidenceSha256: SEGMENT_A_CONSTANTS.sealedEvidenceSha256,
    queryEnvelope: {
      startUtc: SEGMENT_A_CONSTANTS.queryEnvelopeStartUtc,
      endUtc: SEGMENT_A_CONSTANTS.queryEnvelopeEndUtc,
    },
    videoWindow: {
      startUtc: SEGMENT_A_CONSTANTS.videoStartUtc,
      endUtc: SEGMENT_A_CONSTANTS.videoEndUtc,
      durationSeconds: SEGMENT_A_CONSTANTS.videoDurationSeconds,
      independentClockAnchorUtc: SEGMENT_A_CONSTANTS.independentClockAnchorUtc,
      timeIsClockDifferenceSeconds: SEGMENT_A_CONSTANTS.timeIsClockDifferenceSeconds,
      timeIsUncertaintySeconds: SEGMENT_A_CONSTANTS.timeIsUncertaintySeconds,
    },
    envelopeRowCount: result.envelopeRowCount,
    flags: result.flags,
    RD003_PRESERVED: 'YES',
    RD004_WHOLE_DRIVE_COMPLETE: 'NO',
    SEGMENT_B_PENDING: 'YES',
    PRODUCTION_SCORE_CHANGED: 'NO',
    PRODUCTION_DETECTORS_CHANGED: 'NO',
    TIRE_RUNTIME_CHANGED: 'NO',
    BRAKE_RUNTIME_CHANGED: 'NO',
    DEPLOYED: 'NO',
  };

  const pathViolations = assertNoEnvironmentSpecificPathsInObject(sessionSummary);
  if (pathViolations.length) {
    throw new Error(`Environment-specific paths in session summary: ${pathViolations.join(', ')}`);
  }

  const sourceManifest = {
    referenceDriveId: SEGMENT_A_CONSTANTS.referenceDriveId,
    sessionId: SEGMENT_A_CONSTANTS.sessionId,
    vehicleId: SEGMENT_A_CONSTANTS.vehicleId,
    vehicle: SEGMENT_A_CONSTANTS.vehicleLabel,
    sealedAt: '2026-09-04T04:16:49.742Z',
    files: {
      [RD004_A_SOURCE_FILES.observations]: {
        sha256: observationsSha256,
        rowCount: observations.length,
        bytes: Buffer.byteLength(observationsContent, 'utf8'),
      },
      [RD004_A_SOURCE_FILES.legacySidecar]: {
        sha256: legacySidecarSha256,
        rowCount: legacySidecar.length,
        bytes: Buffer.byteLength(legacySidecarContent, 'utf8'),
        note: 'OFFLINE derivation at seal time; production hf-preprocessing unchanged',
      },
    },
    bundleSha256,
    BUNDLE_SHA256_METHOD: 'CANONICAL_MEMBER_HASH_MANIFEST',
    rd003EvidenceSha256: '81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4',
    rd003EvidenceUnchanged: true,
  };

  fs.writeFileSync(paths.sessionSummary, stableStringify(sessionSummary));
  fs.writeFileSync(paths.sourceManifest, stableStringify(sourceManifest));
  fs.writeFileSync(paths.rawSpeedSeriesJson, stableStringify(result.qualifiedSpeedSeries));
  writeCsv(
    paths.rawSpeedSeriesCsv,
    ['providerTimestamp', 'speedKmh', 'videoRelativeSecondsProvisional', 'flags'],
    result.qualifiedSpeedSeries.map((p) => ({
      providerTimestamp: p.providerTimestamp,
      speedKmh: p.speedKmh,
      videoRelativeSecondsProvisional: p.videoRelativeSecondsProvisional,
      flags: p.flags.join('|'),
    })),
  );
  fs.writeFileSync(paths.signalCadence, stableStringify(result.signalCadence));
  fs.writeFileSync(paths.videoClockAlignment, stableStringify(result.videoClockAlignment));
  fs.writeFileSync(paths.speedComparison, stableStringify(result.speedComparison));
  fs.writeFileSync(paths.kinematicReconstruction, stableStringify(result.kinematicReconstruction));
  fs.writeFileSync(
    paths.legacyDetectorAudit,
    stableStringify({
      events: result.legacyDetectorAudit.events,
      counts: result.legacyDetectorAudit.counts,
      cleanPointCount: result.legacyDetectorAudit.cleanPointCount,
      mode: 'OFFLINE_READ_ONLY',
      note: 'Current legacy hf-acceleration/hf-braking/hf-abuse detectors evaluated on preserved Segment-A HF data only',
    }),
  );
  fs.writeFileSync(paths.preprocessingResponse, stableStringify(result.preprocessingResponse));
  fs.writeFileSync(paths.supportingSignals, stableStringify(result.supportingSignals));
  fs.writeFileSync(paths.reverseValidation, stableStringify(result.reverseValidation));

  const outputSha256 = rd004SegmentAOutputSha256({
    sessionSummary,
    flags: result.flags,
    envelopeRowCount: result.envelopeRowCount,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: RD004_A_EVIDENCE_ID,
        analysisMode: RD004_A_MODE,
        outDir: toRepoRelativePath(outDir, REPO_ROOT),
        sourceObservationsSha256: observationsSha256,
        sourceLegacySidecarSha256: legacySidecarSha256,
        sourceBundleSha256: bundleSha256,
        outputSha256,
        flags: result.flags,
      },
      null,
      2,
    ),
  );
}

main();
