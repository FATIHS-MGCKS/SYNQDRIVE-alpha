/**
 * Write deterministic DI-EV-0034B external GT document to disk.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  buildExternalGtDocument,
  externalGtDocumentSha256,
  INGESTION_EVIDENCE_ID,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-external-observations';
import { stableStringify } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-alignment';
import { assertSafeOutputPath } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';

const DEFAULT_OUT = path.resolve(
  __dirname,
  '../../../docs/audits/data/rd003-video-ground-truth-observations.json',
);

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function main(): void {
  const outPath = parseArg('--out') ?? DEFAULT_OUT;
  assertSafeOutputPath(outPath);

  const doc = buildExternalGtDocument();
  const sha = externalGtDocumentSha256(doc);
  fs.writeFileSync(outPath, stableStringify(doc));

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: INGESTION_EVIDENCE_ID,
        outPath,
        clipCount: doc.clips.length,
        EXTERNAL_GT_SHA256: sha,
      },
      null,
      2,
    ),
  );
}

main();
