/**
 * Offline read-only RD003 Video-GT correlation telemetry source export.
 *
 * SAFETY CONTRACT (REFERENCE_CAPTURE_RUNTIME_CHANGED = NO):
 * - Verifies sealed observations SHA-256 before export (fail closed)
 * - Reads input JSONL only; never writes to sealed evidence paths
 * - Writes derived artifacts only to --out-dir / --docs-dir
 * - No production DB access, no Prisma, no session mutation, no API calls
 *
 * Evidence ID: DI-EV-0033
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  assertSafeOutputPath,
  assertSealedSha256,
  AUTHORITATIVE_SEALED_SOURCE_PATH,
  buildPerFieldConvenienceCsvs,
  buildSummary,
  buildVideoGtCorrelationExport,
  buildCsvContent,
  EXPECTED_SEALED_SHA256,
  parseSealedJsonl,
  REFERENCE_DRIVE_ID,
  SEALED_EVIDENCE_ROOT,
  serializeCanonicalJsonl,
  sha256Hex,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-rd003-video-gt-export';

const SESSION_START = '2026-09-02T18:59:15.695Z';
const SESSION_STOP = '2026-09-02T19:36:22.970Z';

const CANONICAL_JSONL = 'dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl';
const CANONICAL_CSV = 'dimo-lte-r1-reference-drive-003-video-gt-correlation-source.csv';
const SUMMARY_JSON = 'dimo-lte-r1-reference-drive-003-video-gt-correlation-source-summary.json';
const PER_FIELD_DIR = 'rd003-video-gt-source';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function main(): void {
  const inputPath =
    parseArg('--input') ??
    path.join(SEALED_EVIDENCE_ROOT, 'observations.jsonl');
  const docsDir =
    parseArg('--docs-dir') ??
    path.resolve(__dirname, '../../../docs/audits/data');
  const outDir = parseArg('--out-dir') ?? docsDir;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Sealed input not found: ${inputPath}`);
  }

  const sealedSha = assertSealedSha256(inputPath);

  const jsonlPath = path.join(docsDir, CANONICAL_JSONL);
  const csvPath = path.join(docsDir, CANONICAL_CSV);
  const summaryPath = path.join(docsDir, SUMMARY_JSON);
  const perFieldDir = path.join(docsDir, PER_FIELD_DIR);

  for (const p of [jsonlPath, csvPath, summaryPath, perFieldDir]) {
    assertSafeOutputPath(p);
  }

  const rows = parseSealedJsonl(inputPath);
  const { exportedRows, sourceRowCount } = buildVideoGtCorrelationExport(rows);

  const jsonlContent = serializeCanonicalJsonl(exportedRows);
  const canonicalJsonlSha256 = sha256Hex(jsonlContent);
  const csvContent = buildCsvContent(exportedRows);
  const summary = buildSummary({
    analysisInputSha256: sealedSha,
    sourceRowCount,
    exportedRows,
    canonicalJsonlSha256,
    sessionStart: SESSION_START,
    sessionStop: SESSION_STOP,
  });

  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(perFieldDir, { recursive: true });

  fs.writeFileSync(jsonlPath, jsonlContent, 'utf8');
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  const perFieldCsvs = buildPerFieldConvenienceCsvs(exportedRows);
  for (const [fileName, content] of Object.entries(perFieldCsvs)) {
    assertSafeOutputPath(path.join(perFieldDir, fileName));
    fs.writeFileSync(path.join(perFieldDir, fileName), content, 'utf8');
  }

  const perSurface = summary.perSurface as Record<string, number>;

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidenceId: 'DI-EV-0033',
        referenceDriveId: REFERENCE_DRIVE_ID,
        authoritativeSealedSourcePath: AUTHORITATIVE_SEALED_SOURCE_PATH,
        authoritativeSealedSourceSha256: EXPECTED_SEALED_SHA256,
        analysisInputPath: inputPath,
        analysisInputSha256: sealedSha,
        ANALYSIS_INPUT_SHA_MATCHES_SEALED_AUTHORITY:
          sealedSha === EXPECTED_SEALED_SHA256 ? 'YES' : 'NO',
        sourceRowCount,
        exportedRowCount: exportedRows.length,
        HF_HISTORICAL_ROWS: perSurface.HF_HISTORICAL ?? 0,
        LATEST_LIVE_ROWS: perSurface.LATEST_LIVE ?? 0,
        LATEST_SLOW_ROWS: perSurface.LATEST_SLOW ?? 0,
        canonicalJsonlPath: jsonlPath,
        canonicalJsonlSha256,
        csvPath,
        summaryPath,
        perFieldDir,
        FULL_SESSION_FILTERED_EXPORT: 'YES',
        VIDEO_CANDIDATE_WINDOWS_USED_AS_FILTER: 'NO',
        NO_INTERPOLATION_PERFORMED: 'YES',
        NO_RESAMPLING_PERFORMED: 'YES',
        NO_SMOOTHING_PERFORMED: 'YES',
        NO_VIDEO_CLOCK_ASSUMPTION_APPLIED: 'YES',
        referenceCaptureRuntimeChanged: false,
      },
      null,
      2,
    ),
  );
}

main();
