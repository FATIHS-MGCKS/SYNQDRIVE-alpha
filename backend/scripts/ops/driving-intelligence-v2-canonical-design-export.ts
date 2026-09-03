/**
 * DI-EV-0034F — Export canonical design JSON artifacts.
 * SAFETY: writes docs only; no DB, Prisma, API, or runtime mutation.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  artifactSha256,
  buildCanonicalDesignArtifacts,
  buildExportManifest,
  CANONICAL_DESIGN_EVIDENCE_ID,
  CANONICAL_DESIGN_CLOSEOUT_REVISION,
  canonicalDesignOutputSha256,
  stableStringify,
} from '../../src/modules/vehicle-intelligence/driving-intelligence-v2/driving-intelligence-v2-canonical-design';

const DEFAULT_OUT_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/driving-intelligence-v2-design',
);

const RD003_SUMMARY_ABSOLUTE = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-signal-quality/signal-quality-summary.json',
);

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function main(): void {
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;
  if (!fs.existsSync(RD003_SUMMARY_ABSOLUTE)) {
    throw new Error(`RD003 authority artifact missing: ${RD003_SUMMARY_ABSOLUTE}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const artifacts = buildCanonicalDesignArtifacts();
  const fileSha256: Record<string, string> = {};

  for (const [filename, payload] of Object.entries(artifacts)) {
    const filePath = path.join(outDir, filename);
    const content = `${stableStringify(payload)}\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    fileSha256[filename] = artifactSha256(payload);
  }

  const exportManifest = buildExportManifest(artifacts, new Date().toISOString());

  fs.writeFileSync(
    path.join(outDir, 'export-manifest.json'),
    `${stableStringify(exportManifest)}\n`,
    'utf8',
  );

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        evidenceId: CANONICAL_DESIGN_EVIDENCE_ID,
        closeoutRevision: CANONICAL_DESIGN_CLOSEOUT_REVISION,
        outDir,
        artifactCount: Object.keys(artifacts).length,
        bundleSha256: canonicalDesignOutputSha256(),
        fileSha256Count: Object.keys(fileSha256).length,
      },
      null,
      2,
    ),
  );
}

main();
