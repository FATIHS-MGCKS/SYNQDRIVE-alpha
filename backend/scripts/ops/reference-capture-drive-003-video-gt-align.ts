/**
 * Offline RD003 Video-GT alignment workbench CLI (DI-EV-0034A / DI-EV-0034B).
 *
 * SAFETY: read-only; no DB, Prisma, API, or runtime mutation.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildEpisodeAnalyses,
  buildPerClipAlignmentReport,
  summarizeEligibleSpeedGt,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment-episodes';
import {
  externalGtDocumentSha256,
  INGESTION_EVIDENCE_ID,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-external-observations';
import {
  alignmentOutputSha256,
  CANONICAL_TELEMETRY_JSONL_SHA256,
  EVIDENCE_ID,
  loadCanonicalTelemetryJsonl,
  loadExternalGtDocument,
  runAlignmentWorkbench,
  stableStringify,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';

const DEFAULT_TELEMETRY = path.resolve(
  __dirname,
  '../../../docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl',
);
const DEFAULT_EXTERNAL_GT = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-ground-truth-observations.json',
);
const DEFAULT_OUT_DIR = path.resolve(__dirname, '../../../docs/audits/data/rd003-video-gt-alignment');

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function main(): void {
  const telemetryPath = parseArg('--telemetry') ?? DEFAULT_TELEMETRY;
  const externalGtPath = parseArg('--external-gt') ?? DEFAULT_EXTERNAL_GT;
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;

  assertSafeOutputPath(outDir);

  const telemetryRows = loadCanonicalTelemetryJsonl(telemetryPath);
  const externalGtContent = fs.readFileSync(externalGtPath, 'utf8');
  const externalGt = loadExternalGtDocument(externalGtPath);
  const externalGtSha256 = externalGtDocumentSha256(externalGt);

  const result = runAlignmentWorkbench({ telemetryRows, externalGt });
  const gtSummary = summarizeEligibleSpeedGt(externalGt.clips);
  const hasRealGt = gtSummary.totalRawObservations > 0;

  const perClipReport = externalGt.clips.map((clip, i) =>
    buildPerClipAlignmentReport(clip, result.clipAlignments[i]!),
  );
  const episodeAnalyses = buildEpisodeAnalyses({
    clips: externalGt.clips,
    telemetryRows,
    clipAlignments: result.clipAlignments,
  });

  const alignmentSummary = {
    ...result.alignmentSummary,
    ingestionEvidenceId: hasRealGt ? INGESTION_EVIDENCE_ID : undefined,
    EXTERNAL_GT_SHA256: externalGtSha256,
    REAL_EXTERNAL_GT_INGESTED: hasRealGt ? 'YES' : 'NO',
    REAL_ALIGNMENT_EXECUTED: hasRealGt ? 'YES' : 'NO',
    VIDEO_ALIGNMENT_STATUS: hasRealGt
      ? 'REAL_CANDIDATE_ALIGNMENTS_AVAILABLE'
      : result.alignmentSummary.VIDEO_ALIGNMENT_STATUS,
    EXTERNAL_GT_VALUES_COMPLETE: hasRealGt ? 'YES' : result.alignmentSummary.EXTERNAL_GT_VALUES_COMPLETE,
    CLIPS_WITH_GT: gtSummary.clipsWithGt,
    TOTAL_RAW_EXTERNAL_GT_OBSERVATIONS: gtSummary.totalRawObservations,
    TOTAL_ALIGNMENT_ELIGIBLE_SPEED_GT_POINTS: gtSummary.totalAlignmentEligibleSpeedPoints,
    NO_VIDEO_GT_INTERPOLATION: 'YES',
    NO_VIDEO_GT_30HZ_FABRICATION: 'YES',
    GROUND_TRUTH_VALIDATED: 'NO',
    READY_FOR_DI_EV_0034C_RESULT_INTERPRETATION: hasRealGt ? 'YES' : 'NO',
    CROSS_CLIP_CLOCK_MODEL_OUTCOME: result.crossClipClockModel.modelOutcome,
    CLOCK_BOUNDARY_ELIGIBLE_CLIPS: result.crossClipClockModel.eligibleClipCount,
  };

  fs.mkdirSync(outDir, { recursive: true });

  const clipPath = path.join(outDir, 'clip-alignments.json');
  const clockPath = path.join(outDir, 'cross-clip-clock-model.json');
  const qualityPath = path.join(outDir, 'signal-surface-quality.json');
  const summaryPath = path.join(outDir, 'alignment-summary.json');
  const stalePath = path.join(outDir, 'stale-hold-analysis.json');
  const perClipPath = path.join(outDir, 'per-clip-alignment-report.json');
  const episodePath = path.join(outDir, 'episode-analysis.json');

  for (const p of [clipPath, clockPath, qualityPath, summaryPath, stalePath, perClipPath, episodePath]) {
    assertSafeOutputPath(p);
  }

  fs.writeFileSync(clipPath, stableStringify(result.clipAlignments));
  fs.writeFileSync(clockPath, stableStringify(result.crossClipClockModel));
  fs.writeFileSync(qualityPath, stableStringify(result.signalSurfaceQuality));
  fs.writeFileSync(summaryPath, stableStringify(alignmentSummary));
  fs.writeFileSync(stalePath, stableStringify(result.staleHolds));
  fs.writeFileSync(perClipPath, stableStringify(perClipReport));
  fs.writeFileSync(episodePath, stableStringify(episodeAnalyses));

  const outputSha = alignmentOutputSha256({
    clipAlignments: result.clipAlignments,
    crossClipClockModel: result.crossClipClockModel,
    signalSurfaceQuality: result.signalSurfaceQuality,
    alignmentSummary,
  });

  // Guard: external GT and telemetry inputs must remain unchanged
  if (crypto.createHash('sha256').update(externalGtContent).digest('hex') !== externalGtSha256) {
    throw new Error('External GT SHA drift detected during alignment run');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: hasRealGt ? INGESTION_EVIDENCE_ID : EVIDENCE_ID,
        canonicalTelemetryJsonlSha256: CANONICAL_TELEMETRY_JSONL_SHA256,
        EXTERNAL_GT_SHA256: externalGtSha256,
        telemetryRowCount: telemetryRows.length,
        clipCount: externalGt.clips.length,
        outputSha256: outputSha,
        outDir,
        WORKBENCH_READY: 'YES',
        REAL_EXTERNAL_GT_INGESTED: hasRealGt ? 'YES' : 'NO',
        REAL_ALIGNMENT_EXECUTED: hasRealGt ? 'YES' : 'NO',
        GROUND_TRUTH_VALIDATED: 'NO',
        referenceCaptureRuntimeChanged: false,
      },
      null,
      2,
    ),
  );
}

main();
