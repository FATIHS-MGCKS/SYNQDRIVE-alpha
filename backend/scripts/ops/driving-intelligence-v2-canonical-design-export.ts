/**
 * DI-EV-0034F — Export canonical design JSON artifacts.
 * SAFETY: writes docs only; no DB, Prisma, API, or runtime mutation.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  buildCanonicalDesignArtifacts,
  CANONICAL_DESIGN_EVIDENCE_ID,
  canonicalDesignOutputSha256,
  stableStringify,
} from '../../src/modules/vehicle-intelligence/driving-intelligence-v2/driving-intelligence-v2-canonical-design';

const DEFAULT_OUT_DIR = path.resolve(
  __dirname,
  '../../../docs/audits/data/driving-intelligence-v2-design',
);

const RD003_SUMMARY = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-signal-quality/signal-quality-summary.json',
);

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function main(): void {
  const outDir = parseArg('--out-dir') ?? DEFAULT_OUT_DIR;
  if (!fs.existsSync(RD003_SUMMARY)) {
    throw new Error(`RD003 authority artifact missing: ${RD003_SUMMARY}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const artifacts = buildCanonicalDesignArtifacts();
  const manifest: Record<string, string> = {};

  for (const [filename, payload] of Object.entries(artifacts)) {
    const filePath = path.join(outDir, filename);
    const content = `${stableStringify(payload)}\n`;
    fs.writeFileSync(filePath, content, 'utf8');
    manifest[filename] = canonicalDesignOutputSha256();
  }

  const exportManifest = {
    evidenceId: CANONICAL_DESIGN_EVIDENCE_ID,
    exportedAt: new Date().toISOString(),
    outputDirectory: 'docs/audits/data/driving-intelligence-v2-design',
    artifactCount: Object.keys(artifacts).length,
    bundleSha256: canonicalDesignOutputSha256(),
    rd003AuthorityPreserved: RD003_SUMMARY,
    files: Object.keys(artifacts).sort(),
  };

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
        outDir,
        artifactCount: Object.keys(artifacts).length,
        bundleSha256: canonicalDesignOutputSha256(),
      },
      null,
      2,
    ),
  );
}

main();
