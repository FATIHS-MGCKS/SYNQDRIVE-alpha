/**
 * Offline RD003 Video-GT alignment workbench CLI (DI-EV-0034A).
 *
 * SAFETY: read-only; no DB, Prisma, API, or runtime mutation.
 */
import * as fs from 'fs';
import * as path from 'path';
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
  const externalGt = loadExternalGtDocument(externalGtPath);

  const result = runAlignmentWorkbench({ telemetryRows, externalGt });

  fs.mkdirSync(outDir, { recursive: true });

  const clipPath = path.join(outDir, 'clip-alignments.json');
  const clockPath = path.join(outDir, 'cross-clip-clock-model.json');
  const qualityPath = path.join(outDir, 'signal-surface-quality.json');
  const summaryPath = path.join(outDir, 'alignment-summary.json');
  const stalePath = path.join(outDir, 'stale-hold-analysis.json');

  for (const p of [clipPath, clockPath, qualityPath, summaryPath, stalePath]) {
    assertSafeOutputPath(p);
  }

  fs.writeFileSync(clipPath, stableStringify(result.clipAlignments));
  fs.writeFileSync(clockPath, stableStringify(result.crossClipClockModel));
  fs.writeFileSync(qualityPath, stableStringify(result.signalSurfaceQuality));
  fs.writeFileSync(summaryPath, stableStringify(result.alignmentSummary));
  fs.writeFileSync(stalePath, stableStringify(result.staleHolds));

  const outputSha = alignmentOutputSha256({
    clipAlignments: result.clipAlignments,
    crossClipClockModel: result.crossClipClockModel,
    signalSurfaceQuality: result.signalSurfaceQuality,
    alignmentSummary: result.alignmentSummary,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: EVIDENCE_ID,
        canonicalTelemetryJsonlSha256: CANONICAL_TELEMETRY_JSONL_SHA256,
        telemetryRowCount: telemetryRows.length,
        clipCount: externalGt.clips.length,
        outputSha256: outputSha,
        outDir,
        WORKBENCH_READY: 'YES',
        EXTERNAL_GT_VALUES_COMPLETE: 'NO',
        VIDEO_ALIGNMENT_STATUS: 'AWAITING_EXTERNAL_GT_INGESTION',
        GROUND_TRUTH_VALIDATED: 'NO',
        referenceCaptureRuntimeChanged: false,
      },
      null,
      2,
    ),
  );
}

main();
