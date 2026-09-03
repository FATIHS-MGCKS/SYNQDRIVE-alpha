/**
 * DI-EV-0034D — GLOBAL_FINGERPRINT_DISCOVERY V2 CLI.
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
  artifactSha256,
  DISCOVERY_V2_EVIDENCE_ID,
  DISCOVERY_V2_MODE,
  discoveryV2OutputSha256,
  runGlobalFingerprintDiscoveryV2,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-global-discovery-v2';
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
  '../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery-v2',
);
const V1_DISCOVERY_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery',
);
const HARD_PRIOR_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-gt-alignment/hard-clock-prior-run',
);

const EXPECTED_EXTERNAL_GT_SHA =
  'ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function assertPriorArtifactsPreserved(): void {
  const v1Summary = path.join(V1_DISCOVERY_DIR, 'discovery-summary.json');
  const hardSummary = path.join(HARD_PRIOR_DIR, 'alignment-summary.json');
  if (!fs.existsSync(v1Summary)) {
    throw new Error('DI-EV-0034C global-fingerprint-discovery artifacts missing — must be preserved');
  }
  if (!fs.existsSync(hardSummary)) {
    throw new Error('DI-EV-0034B hard-clock-prior-run artifacts missing — must be preserved');
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
  const result = runGlobalFingerprintDiscoveryV2({ telemetryRows, externalGt });

  fs.mkdirSync(outDir, { recursive: true });

  const paths = {
    candidateParetoFrontiers: path.join(outDir, 'candidate-pareto-frontiers.json'),
    perClipTopBasins: path.join(outDir, 'per-clip-top-basins-v2.json'),
    independentProviderDiscovery: path.join(outDir, 'independent-provider-discovery.json'),
    independentIngressDiscovery: path.join(outDir, 'independent-ingress-discovery.json'),
    relativeClockInterceptModel: path.join(outDir, 'relative-clock-intercept-model.json'),
    jointClockChronologyPath: path.join(outDir, 'joint-clock-chronology-path.json'),
    mutuallyExclusiveCandidates: path.join(outDir, 'mutually-exclusive-candidates.json'),
    discoverySummary: path.join(outDir, 'discovery-v2-summary.json'),
  };

  for (const p of Object.values(paths)) assertSafeOutputPath(p);

  const discoverySummary = {
    ...result.discoverySummary,
    EXTERNAL_GT_SHA256: externalGtSha256,
    EXTERNAL_GT_SHA_UNCHANGED: 'YES',
    DI_EV_0033_CANONICAL_SHA256: CANONICAL_TELEMETRY_JSONL_SHA256,
    DI_EV_0034B_PRESERVED: 'YES',
    DI_EV_0034C_PRESERVED: 'YES',
    evidenceClass: 'METHOD_CORRECTION+JOINT_ALIGNMENT_DISCOVERY',
    supersedesMethodologicalDefectsIn: 'DI-EV-0034C',
    GROUND_TRUTH_VALIDATED: 'NO',
    REFERENCE_CAPTURE_RUNTIME_CHANGED: 'NO',
    DRIVING_SCORE_CHANGED: 'NO',
  };

  fs.writeFileSync(paths.candidateParetoFrontiers, stableStringify(result.paretoFrontiers));
  fs.writeFileSync(paths.perClipTopBasins, stableStringify(result.perClipTopBasins));
  fs.writeFileSync(paths.independentProviderDiscovery, stableStringify(result.independentProviderDiscovery));
  fs.writeFileSync(paths.independentIngressDiscovery, stableStringify(result.independentIngressDiscovery));
  fs.writeFileSync(paths.relativeClockInterceptModel, stableStringify(result.relativeClockInterceptModel));
  fs.writeFileSync(paths.jointClockChronologyPath, stableStringify(result.jointClockChronologyPath));
  fs.writeFileSync(paths.mutuallyExclusiveCandidates, stableStringify(result.mutuallyExclusiveCandidates));
  fs.writeFileSync(paths.discoverySummary, stableStringify(discoverySummary));

  const outputSha = discoveryV2OutputSha256({
    paretoFrontiers: result.paretoFrontiers,
    perClipTopBasins: result.perClipTopBasins,
    independentProviderDiscovery: result.independentProviderDiscovery,
    independentIngressDiscovery: result.independentIngressDiscovery,
    relativeClockInterceptModel: result.relativeClockInterceptModel,
    jointClockChronologyPath: result.jointClockChronologyPath,
    mutuallyExclusiveCandidates: result.mutuallyExclusiveCandidates,
    discoverySummary,
  });

  if (crypto.createHash('sha256').update(externalGtContent).digest('hex') !== externalGtSha256) {
    throw new Error('External GT SHA drift detected during discovery v2 run');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: DISCOVERY_V2_EVIDENCE_ID,
        discoveryMode: DISCOVERY_V2_MODE,
        EXTERNAL_GT_SHA256: externalGtSha256,
        outputSha256: outputSha,
        outDir,
        DI_EV_0034B_PRESERVED: 'YES',
        DI_EV_0034C_PRESERVED: 'YES',
        GROUND_TRUTH_VALIDATED: 'NO',
      },
      null,
      2,
    ),
  );
}

main();
