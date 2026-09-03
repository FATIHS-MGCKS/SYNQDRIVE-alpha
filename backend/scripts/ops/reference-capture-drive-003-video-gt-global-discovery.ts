/**
 * DI-EV-0034C — GLOBAL_FINGERPRINT_DISCOVERY CLI.
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
  DISCOVERY_EVIDENCE_ID,
  discoveryOutputSha256,
  runGlobalFingerprintDiscovery,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-global-discovery';
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
  '../../../docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery',
);
const HARD_PRIOR_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-gt-alignment/hard-clock-prior-run',
);

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function buildHardPriorManifest(): Record<string, unknown> {
  const files = [
    'alignment-summary.json',
    'per-clip-alignment-report.json',
    'clip-alignments.json',
    'cross-clip-clock-model.json',
    'episode-analysis.json',
    'signal-surface-quality.json',
    'stale-hold-analysis.json',
  ];
  const artifacts: Record<string, string> = {};
  for (const file of files) {
    const p = path.join(HARD_PRIOR_DIR, file);
    if (fs.existsSync(p)) {
      artifacts[file] = artifactSha256(fs.readFileSync(p, 'utf8'));
    }
  }
  return {
    methodology: 'HARD_CLOCK_PRIOR_RUN',
    evidenceId: 'DI-EV-0034B',
    outcome: 'NO_STRONG_CANDIDATES',
    preservedAt: 'DI-EV-0034C',
    note: 'Immutable diagnostic snapshot of first real alignment run — not erased',
    artifactSha256: artifacts,
    manifestSha256: artifactSha256(stableStringify(artifacts)),
  };
}

function main(): void {
  const telemetryPath = parseArg('--telemetry') ?? DEFAULT_TELEMETRY;
  const externalGtPath = parseArg('--external-gt') ?? DEFAULT_EXTERNAL_GT;
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;

  assertSafeOutputPath(outDir);
  assertSafeOutputPath(HARD_PRIOR_DIR);

  const externalGtContent = fs.readFileSync(externalGtPath, 'utf8');
  const externalGt = loadExternalGtDocument(externalGtPath);
  const externalGtSha256 = externalGtDocumentSha256(externalGt);
  const telemetryRows = loadCanonicalTelemetryJsonl(telemetryPath);

  const manifest = buildHardPriorManifest();
  const manifestPath = path.join(HARD_PRIOR_DIR, 'hard-clock-prior-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, stableStringify(manifest));
  }

  const result = runGlobalFingerprintDiscovery({ telemetryRows, externalGt });
  fs.mkdirSync(outDir, { recursive: true });

  const paths = {
    perClipTopBasins: path.join(outDir, 'per-clip-top-basins.json'),
    chronologyPath: path.join(outDir, 'chronology-consistent-path.json'),
    clockPhaseModel: path.join(outDir, 'clock-phase-model.json'),
    providerVsIngress: path.join(outDir, 'provider-vs-ingress-diagnostics.json'),
    discoverySummary: path.join(outDir, 'discovery-summary.json'),
  };

  for (const p of Object.values(paths)) assertSafeOutputPath(p);

  const discoverySummary = {
    ...result.discoverySummary,
    EXTERNAL_GT_SHA256: externalGtSha256,
    EXTERNAL_GT_SHA_UNCHANGED: 'YES',
    DI_EV_0033_CANONICAL_SHA256: CANONICAL_TELEMETRY_JSONL_SHA256,
    HARD_CLOCK_PRIOR_RUN_PRESERVED: 'YES',
    HARD_CLOCK_PRIOR_MANIFEST_SHA256: (manifest as { manifestSha256: string }).manifestSha256,
    READY_FOR_DI_EV_0034D_SIGNAL_QUALITY_INTERPRETATION: 'YES',
  };

  fs.writeFileSync(paths.perClipTopBasins, stableStringify(result.perClipTopBasins));
  fs.writeFileSync(paths.chronologyPath, stableStringify(result.chronologyPath));
  fs.writeFileSync(paths.clockPhaseModel, stableStringify(result.clockPhaseModel));
  fs.writeFileSync(paths.providerVsIngress, stableStringify(result.providerVsIngress));
  fs.writeFileSync(paths.discoverySummary, stableStringify(discoverySummary));

  const outputSha = discoveryOutputSha256({
    perClipTopBasins: result.perClipTopBasins,
    chronologyPath: result.chronologyPath,
    clockPhaseModel: result.clockPhaseModel,
    providerVsIngress: result.providerVsIngress,
    discoverySummary,
  });

  if (crypto.createHash('sha256').update(externalGtContent).digest('hex') !== externalGtSha256) {
    throw new Error('External GT SHA drift detected during discovery run');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: DISCOVERY_EVIDENCE_ID,
        discoveryMode: 'GLOBAL_FINGERPRINT_DISCOVERY',
        EXTERNAL_GT_SHA256: externalGtSha256,
        outputSha256: outputSha,
        outDir,
        HARD_CLOCK_PRIOR_RUN_PRESERVED: 'YES',
        GROUND_TRUTH_VALIDATED: 'NO',
      },
      null,
      2,
    ),
  );
}

main();
