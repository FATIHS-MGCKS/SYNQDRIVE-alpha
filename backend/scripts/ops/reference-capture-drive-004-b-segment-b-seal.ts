/**
 * DI-EV-0035B — Seal RD004 Segment B evidence envelope from full-session export.
 * SAFETY: read-only derivation; does not modify Segment A artifacts or production runtime.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { stableStringify } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';
import {
  buildQualifiedHfSpeedSeries,
  computeRd004SourceBundleSha256,
  filterRowsByProviderTimestampEnvelope,
  loadRd004Jsonl,
  SEGMENT_A_CONSTANTS,
  toRepoRelativePath,
  type LegacyPreprocessedSpeedRow,
  type Rd004ObservationRow,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-a-segment-a';
import {
  RD004_B_SOURCE_FILES,
  SEGMENT_B_CONSTANTS,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd004-b-segment-b';
import { preprocessHighFrequency } from '../../src/modules/vehicle-intelligence/trips/hf-preprocessing';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_FULL_SESSION = path.join(
  REPO_ROOT,
  'docs/audits/data/rd004-segment-a',
  'source-observations.jsonl',
);
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'docs/audits/data/rd004-segment-b');

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function buildLegacySidecar(
  envelope: Rd004ObservationRow[],
  videoStartUtc: string,
): LegacyPreprocessedSpeedRow[] {
  const qualified = buildQualifiedHfSpeedSeries(envelope, videoStartUtc);
  const clean = preprocessHighFrequency(
    qualified.map((p) => ({
      timestamp: p.providerTimestamp,
      speedKmh: p.speedKmh,
      engineCoolantTempC: null,
      rpm: null,
      throttlePosition: null,
      engineLoad: null,
      tractionBatteryPowerKw: null,
    })),
  );
  const smoothedByTs = new Map(clean.map((p) => [new Date(p.ts).toISOString(), p.speedKmh]));
  return qualified.map((p) => ({
    providerTimestamp: p.providerTimestamp,
    qualifiedRawHfSpeedKmh: p.speedKmh,
    legacy3PointSmoothedSpeedKmh: smoothedByTs.get(p.providerTimestamp) ?? p.speedKmh,
  }));
}

function main(): void {
  const fullSessionPath = parseArg('--full-session') ?? DEFAULT_FULL_SESSION;
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;
  assertSafeOutputPath(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const fullContent = fs.readFileSync(fullSessionPath, 'utf8');
  const fullSha = crypto.createHash('sha256').update(fullContent).digest('hex');
  if (fullSha !== SEGMENT_A_CONSTANTS.sealedEvidenceSha256) {
    throw new Error(
      `Full-session SHA mismatch: expected ${SEGMENT_A_CONSTANTS.sealedEvidenceSha256}, got ${fullSha}`,
    );
  }

  const allRows = loadRd004Jsonl(fullContent);
  const envelope = filterRowsByProviderTimestampEnvelope(
    allRows,
    SEGMENT_B_CONSTANTS.queryEnvelopeStartUtc,
    SEGMENT_B_CONSTANTS.queryEnvelopeEndUtc,
  );
  const legacySidecar = buildLegacySidecar(envelope, SEGMENT_B_CONSTANTS.videoStartUtc);

  const observationsPath = path.join(outDir, RD004_B_SOURCE_FILES.observations);
  const legacyPath = path.join(outDir, RD004_B_SOURCE_FILES.legacySidecar);
  const manifestPath = path.join(outDir, RD004_B_SOURCE_FILES.manifest);

  const observationsContent = envelope.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const legacyContent = legacySidecar
    .map((r) =>
      JSON.stringify({
        referenceDriveId: SEGMENT_B_CONSTANTS.referenceDriveId,
        sessionId: SEGMENT_B_CONSTANTS.sessionId,
        ...r,
        derivation: 'OFFLINE_SEAL_TIME_hf-preprocessing_equivalent_NO_PRODUCTION_RUNTIME_CHANGE',
      }),
    )
    .join('\n') + '\n';

  fs.writeFileSync(observationsPath, observationsContent);
  fs.writeFileSync(legacyPath, legacyContent);

  const observationsSha = crypto.createHash('sha256').update(observationsContent).digest('hex');
  const legacySha = crypto.createHash('sha256').update(legacyContent).digest('hex');
  const { bundleSha256 } = computeRd004SourceBundleSha256({
    [RD004_B_SOURCE_FILES.observations]: observationsSha,
    [RD004_B_SOURCE_FILES.legacySidecar]: legacySha,
  });

  const manifest = {
    referenceDriveId: SEGMENT_B_CONSTANTS.referenceDriveId,
    sessionId: SEGMENT_B_CONSTANTS.sessionId,
    vehicleId: SEGMENT_B_CONSTANTS.vehicleId,
    vehicle: SEGMENT_B_CONSTANTS.vehicleLabel,
    segment: 'B',
    sealedAt: new Date().toISOString(),
    derivedFromFullSessionSha256: SEGMENT_A_CONSTANTS.sealedEvidenceSha256,
    fullSessionSourcePath: toRepoRelativePath(fullSessionPath, REPO_ROOT),
    queryEnvelope: {
      startUtc: SEGMENT_B_CONSTANTS.queryEnvelopeStartUtc,
      endUtc: SEGMENT_B_CONSTANTS.queryEnvelopeEndUtc,
    },
    files: {
      [RD004_B_SOURCE_FILES.observations]: {
        sha256: observationsSha,
        rowCount: envelope.length,
        bytes: Buffer.byteLength(observationsContent, 'utf8'),
      },
      [RD004_B_SOURCE_FILES.legacySidecar]: {
        sha256: legacySha,
        rowCount: legacySidecar.length,
        bytes: Buffer.byteLength(legacyContent, 'utf8'),
        note: 'OFFLINE derivation at seal time; production hf-preprocessing unchanged',
      },
    },
    bundleSha256,
    BUNDLE_SHA256_METHOD: 'CANONICAL_MEMBER_HASH_MANIFEST',
    segmentAEvidenceUnchanged: true,
    segmentARawEvidenceMutated: false,
  };

  fs.writeFileSync(manifestPath, stableStringify(manifest));

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: toRepoRelativePath(outDir, REPO_ROOT),
        envelopeRowCount: envelope.length,
        legacySidecarRows: legacySidecar.length,
        observationsSha256: observationsSha,
        legacySidecarSha256: legacySha,
        bundleSha256,
        derivedFromFullSessionSha256: fullSha,
      },
      null,
      2,
    ),
  );
}

main();
