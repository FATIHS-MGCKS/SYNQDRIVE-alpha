/**
 * DI-EV-0034E — RD003 Signal Quality Interpretation CLI.
 * SAFETY: read-only; no DB, Prisma, API, or runtime mutation.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { externalGtDocumentSha256 } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-external-observations';
import {
  CANONICAL_TELEMETRY_JSONL_SHA256,
  loadCanonicalTelemetryJsonl,
  loadExternalGtDocument,
  stableStringify,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import {
  runRd003SignalQualityInterpretation,
  SIGNAL_QUALITY_EVIDENCE_ID,
  SIGNAL_QUALITY_CLOSEOUT_REVISION,
  SIGNAL_QUALITY_MODE,
  signalQualityOutputSha256,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-signal-quality';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';

const DEFAULT_TELEMETRY = path.resolve(
  __dirname,
  '../../../docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl',
);
const DEFAULT_EXTERNAL_GT = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-ground-truth-observations.json',
);
const DEFAULT_OUT_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-signal-quality',
);
const V2_DISCOVERY_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery-v2',
);
const HARD_PRIOR_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-gt-alignment/hard-clock-prior-run',
);
const V1_DISCOVERY_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery',
);

const EXPECTED_EXTERNAL_GT_SHA =
  'ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function assertPriorArtifactsPreserved(): void {
  const checks = [
    path.join(V2_DISCOVERY_DIR, 'discovery-v2-summary.json'),
    path.join(V1_DISCOVERY_DIR, 'discovery-summary.json'),
    path.join(HARD_PRIOR_DIR, 'hard-clock-prior-manifest.json'),
  ];
  for (const p of checks) {
    if (!fs.existsSync(p)) {
      throw new Error(`Prior RD003 artifact missing (must be preserved): ${p}`);
    }
  }
}

function main(): void {
  const telemetryPath = parseArg('--telemetry') ?? DEFAULT_TELEMETRY;
  const externalGtPath = parseArg('--external-gt') ?? DEFAULT_EXTERNAL_GT;
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;

  assertSafeOutputPath(outDir);
  assertPriorArtifactsPreserved();

  const externalGtContent = fs.readFileSync(externalGtPath, 'utf8');
  const externalGt = loadExternalGtDocument(externalGtPath);
  const externalGtSha256 = externalGtDocumentSha256(externalGt);
  if (externalGtSha256 !== EXPECTED_EXTERNAL_GT_SHA) {
    throw new Error(`External GT SHA mismatch: expected ${EXPECTED_EXTERNAL_GT_SHA}, got ${externalGtSha256}`);
  }

  const telemetryRows = loadCanonicalTelemetryJsonl(telemetryPath);
  const result = runRd003SignalQualityInterpretation({ telemetryRows, externalGt });

  fs.mkdirSync(outDir, { recursive: true });

  const paths = {
    signalSurfaceQualityMatrix: path.join(outDir, 'signal-surface-quality-matrix.json'),
    speedVideoValidation: path.join(outDir, 'speed-video-validation.json'),
    cadenceAndStaleness: path.join(outDir, 'cadence-and-staleness.json'),
    derivedAccelerationQuality: path.join(outDir, 'derived-acceleration-quality.json'),
    jerkQuality: path.join(outDir, 'jerk-quality.json'),
    powertrainSignalCorrelation: path.join(outDir, 'powertrain-signal-correlation.json'),
    gearDirectionQuality: path.join(outDir, 'gear-direction-quality.json'),
    useCaseEligibilityMatrix: path.join(outDir, 'use-case-eligibility-matrix.json'),
    signalQualitySummary: path.join(outDir, 'signal-quality-summary.json'),
  };

  for (const p of Object.values(paths)) assertSafeOutputPath(p);

  const signalQualitySummary = {
    ...result.signalQualitySummary,
    EXTERNAL_GT_SHA256: externalGtSha256,
    EXTERNAL_GT_SHA_UNCHANGED: 'YES',
    DI_EV_0033_CANONICAL_SHA256: CANONICAL_TELEMETRY_JSONL_SHA256,
    DI_EV_0034B_PRESERVED: 'YES',
    DI_EV_0034C_PRESERVED: 'YES',
    DI_EV_0034D_PRESERVED: 'YES',
    GROUND_TRUTH_VALIDATED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    DRIVING_SCORE_CHANGED: 'NO',
  };

  fs.writeFileSync(paths.signalSurfaceQualityMatrix, stableStringify(result.signalSurfaceQualityMatrix));
  fs.writeFileSync(paths.speedVideoValidation, stableStringify(result.speedVideoValidation));
  fs.writeFileSync(paths.cadenceAndStaleness, stableStringify(result.cadenceAndStaleness));
  fs.writeFileSync(paths.derivedAccelerationQuality, stableStringify(result.derivedAccelerationQuality));
  fs.writeFileSync(paths.jerkQuality, stableStringify(result.jerkQuality));
  fs.writeFileSync(paths.powertrainSignalCorrelation, stableStringify(result.powertrainSignalCorrelation));
  fs.writeFileSync(paths.gearDirectionQuality, stableStringify(result.gearDirectionQuality));
  fs.writeFileSync(paths.useCaseEligibilityMatrix, stableStringify(result.useCaseEligibilityMatrix));
  fs.writeFileSync(paths.signalQualitySummary, stableStringify(signalQualitySummary));

  const outputSha = signalQualityOutputSha256({
    ...result,
    signalQualitySummary,
  });

  if (crypto.createHash('sha256').update(externalGtContent).digest('hex') !== externalGtSha256) {
    throw new Error('External GT SHA drift detected during signal quality run');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: SIGNAL_QUALITY_EVIDENCE_ID,
        analysisMode: SIGNAL_QUALITY_MODE,
        EXTERNAL_GT_SHA256: externalGtSha256,
        outputSha256: outputSha,
        outDir,
        closeoutRevision: SIGNAL_QUALITY_CLOSEOUT_REVISION,
        humanSummary: result.signalQualitySummary.humanSummary,
        HF_SPEED_ALIGNMENT_FIT_MAE_KMH: result.signalQualitySummary.HF_SPEED_ALIGNMENT_FIT_MAE_KMH,
        HF_SPEED_INDEPENDENT_ACCURACY_MAE_KMH: result.signalQualitySummary.HF_SPEED_INDEPENDENT_ACCURACY_MAE_KMH,
        DRIVING_SCORE_CHANGED: 'NO',
      },
      null,
      2,
    ),
  );
}

main();
