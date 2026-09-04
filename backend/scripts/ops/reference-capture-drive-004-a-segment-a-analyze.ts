/**
 * DI-EV-0035A — RD004-A Segment A video ↔ telemetry alignment CLI.
 * SAFETY: read-only; no DB, Prisma, API, production runtime, or detector mutation.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { stableStringify } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';
import {
  loadRd004Jsonl,
  RD004_A_EVIDENCE_ID,
  RD004_A_MODE,
  rd004SegmentAOutputSha256,
  runRd004SegmentAAnalysis,
  SEGMENT_A_CONSTANTS,
  type LegacyPreprocessedSpeedRow,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-a-segment-a';

const DEFAULT_OBSERVATIONS = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd004-segment-a/source-observations.jsonl',
);
const DEFAULT_LEGACY_SIDECAR = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd004-segment-a/source-legacy-preprocessed-speed-sidecar.jsonl',
);
const DEFAULT_OUT_DIR = path.resolve(__dirname, '../../../docs/audits/data/rd004-segment-a');

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
    findingsMd: path.join(outDir, 'rd004-a-findings.md'),
  };

  for (const p of Object.values(paths)) assertSafeOutputPath(p);

  const sessionSummary = {
    evidenceId: RD004_A_EVIDENCE_ID,
    mode: RD004_A_MODE,
    phase: 'RD004-A',
    vehicle: SEGMENT_A_CONSTANTS.vehicleLabel,
    vehicleId: SEGMENT_A_CONSTANTS.vehicleId,
    tokenId: SEGMENT_A_CONSTANTS.tokenId,
    sessionId: SEGMENT_A_CONSTANTS.sessionId,
    referenceDriveId: SEGMENT_A_CONSTANTS.referenceDriveId,
    sourceObservationsPath: observationsPath,
    sourceObservationsSha256: observationsSha256,
    sourceLegacySidecarPath: legacySidecarPath,
    sourceLegacySidecarSha256: legacySidecarSha256,
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

  fs.writeFileSync(paths.sessionSummary, stableStringify(sessionSummary));
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
        outDir,
        sourceObservationsSha256: observationsSha256,
        outputSha256,
        flags: result.flags,
      },
      null,
      2,
    ),
  );
}

main();
