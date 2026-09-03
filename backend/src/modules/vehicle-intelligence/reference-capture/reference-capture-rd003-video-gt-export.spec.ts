import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  assertSafeOutputPath,
  assertSealedSha256,
  AUTHORITATIVE_SEALED_SOURCE_PATH,
  buildSummary,
  buildVideoGtCorrelationExport,
  EXPECTED_SEALED_SHA256,
  parseSealedJsonl,
  serializeCanonicalJsonl,
  sha256Hex,
  VIDEO_GT_CORRELATION_FIELDS,
  type VideoGtSourceObsRow,
} from './reference-capture-rd003-video-gt-export';
import { sortByAcquisitionOrder } from './reference-capture-signal-metrics';

const FIXTURE = path.resolve(__dirname, '../../../../../tmp/rd003-evidence/observations.jsonl');
const SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/ops/reference-capture-drive-003-video-gt-telemetry-export.ts',
);
const SEALED_ROOT = '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-003';
const SESSION_START = '2026-09-02T18:59:15.695Z';
const CANONICAL_JSONL_SHA =
  '69209a6d9e488d51c3aaf3b55dee5584ce622dc072a191b81e7061597cdda87a';

describe('reference-capture-rd003-video-gt-export', () => {
  const hasFixture = fs.existsSync(FIXTURE);

  describe('A) wrong sealed SHA → hard failure', () => {
    it('throws on SHA mismatch', () => {
      const tmp = fs.mkdtempSync(path.join('/tmp', 'rd003-bad-sha-'));
      const badFile = path.join(tmp, 'observations.jsonl');
      fs.writeFileSync(badFile, '{"observationKind":"SESSION_METADATA"}\n');
      expect(() => assertSealedSha256(badFile)).toThrow(/SHA-256 mismatch/);
    });
  });

  describe('B) sealed source cannot be used as output destination', () => {
    it('refuses sealed evidence path as output', () => {
      expect(() => assertSafeOutputPath(path.join(SEALED_ROOT, 'observations.jsonl'))).toThrow(
        /Refusing to write derived output into sealed evidence/,
      );
      expect(() => assertSafeOutputPath(SEALED_ROOT)).toThrow(/Refusing to write derived output/);
    });

    (hasFixture ? it : it.skip)('CLI refuses --docs-dir inside sealed root', () => {
      expect(() =>
        execFileSync(
          'npx',
          [
            'ts-node',
            '-r',
            'tsconfig-paths/register',
            SCRIPT,
            `--input=${FIXTURE}`,
            `--docs-dir=${SEALED_ROOT}`,
          ],
          { cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8' },
        ),
      ).toThrow();
    });
  });

  describe('C–J) export invariants', () => {
    let sourceRows: VideoGtSourceObsRow[];
    let exportedRows: ReturnType<typeof buildVideoGtCorrelationExport>['exportedRows'];
    let canonicalJsonl: string;
    let canonicalSha: string;

    beforeAll(() => {
      if (!hasFixture) return;
      const sealedSha = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');
      expect(sealedSha).toBe(EXPECTED_SEALED_SHA256);
      sourceRows = parseSealedJsonl(FIXTURE);
      const result = buildVideoGtCorrelationExport(sourceRows);
      exportedRows = result.exportedRows;
      canonicalJsonl = serializeCanonicalJsonl(exportedRows);
      canonicalSha = sha256Hex(canonicalJsonl);
    });

    (hasFixture ? it : it.skip)('C) only allowlisted fields are exported', () => {
      const allowlist = new Set<string>(VIDEO_GT_CORRELATION_FIELDS);
      for (const row of exportedRows) {
        expect(allowlist.has(row.providerField)).toBe(true);
      }
      const exportedFields = [...new Set(exportedRows.map((r) => r.providerField))].sort();
      expect(exportedFields).toEqual([...VIDEO_GT_CORRELATION_FIELDS].sort());
    });

    (hasFixture ? it : it.skip)('D) all acquisition surfaces are preserved where present', () => {
      const surfaces = [...new Set(exportedRows.map((r) => r.acquisitionSurface))].sort();
      expect(surfaces).toEqual(['HF_HISTORICAL', 'LATEST_LIVE', 'LATEST_SLOW']);
      expect(exportedRows.filter((r) => r.acquisitionSurface === 'HF_HISTORICAL').length).toBe(2783);
      expect(exportedRows.filter((r) => r.acquisitionSurface === 'LATEST_LIVE').length).toBe(1855);
      expect(exportedRows.filter((r) => r.acquisitionSurface === 'LATEST_SLOW').length).toBe(372);
      expect(exportedRows.length).toBe(5010);
    });

    (hasFixture ? it : it.skip)('E) timestamps/raw values remain unchanged', () => {
      const fieldSet = new Set<string>(VIDEO_GT_CORRELATION_FIELDS);
      const sourceFiltered = sortByAcquisitionOrder(
        sourceRows.filter(
          (r) => r.observationKind === 'SIGNAL_POINT' && fieldSet.has(r.providerField ?? ''),
        ),
      );
      expect(sourceFiltered.length).toBe(exportedRows.length);
      for (let i = 0; i < exportedRows.length; i++) {
        const src = sourceFiltered[i];
        const exp = exportedRows[i];
        expect(exp.providerTimestamp).toBe(
          src.providerTimestamp == null
            ? null
            : src.providerTimestamp instanceof Date
              ? src.providerTimestamp.toISOString()
              : String(src.providerTimestamp),
        );
        expect(exp.rawValueJson).toEqual(src.rawValueJson);
        expect(exp.sequenceNumber).toBe(src.sequenceNumber ?? null);
        expect(exp.physicalSampleFingerprint).toBe(src.physicalSampleFingerprint ?? null);
      }
    });

    (hasFixture ? it : it.skip)('F) provider time is NOT rewritten to acquisition order', () => {
      const providerTimes = exportedRows
        .map((r) => r.providerTimestamp)
        .filter((v): v is string => v != null);
      const sortedProvider = [...providerTimes].sort();
      const isMonotonic = providerTimes.every((t, i) => i === 0 || t >= providerTimes[i - 1]!);
      expect(isMonotonic).toBe(false);
      expect(sortedProvider[0]).not.toBe(providerTimes[0]);
    });

    (hasFixture ? it : it.skip)('G) no interpolation/resampling — row count equals filtered source', () => {
      const fieldSet = new Set<string>(VIDEO_GT_CORRELATION_FIELDS);
      const expectedCount = sourceRows.filter(
        (r) => r.observationKind === 'SIGNAL_POINT' && fieldSet.has(r.providerField ?? ''),
      ).length;
      expect(exportedRows.length).toBe(expectedCount);
      expect(exportedRows.length).toBe(5010);
    });

    (hasFixture ? it : it.skip)('H) same sealed fixture + same field set → same canonical output SHA', () => {
      const run1 = serializeCanonicalJsonl(buildVideoGtCorrelationExport(sourceRows).exportedRows);
      const run2 = serializeCanonicalJsonl(buildVideoGtCorrelationExport(sourceRows).exportedRows);
      expect(sha256Hex(run1)).toBe(sha256Hex(run2));
      expect(sha256Hex(run1)).toBe(canonicalSha);
    });

    (hasFixture ? it : it.skip)('I) video candidate times have no effect on exported row selection', () => {
      const fullExport = buildVideoGtCorrelationExport(sourceRows);
      expect(fullExport.exportedRows.length).toBe(5010);
      const providerTimes = fullExport.exportedRows
        .map((r) => r.providerTimestamp)
        .filter((v): v is string => v != null)
        .sort();
      const earliest = providerTimes[0]!;
      const latest = providerTimes.at(-1)!;
      expect(earliest <= '2026-09-02T18:59:15.695Z').toBe(true);
      expect(latest >= '2026-09-02T19:36:00.000Z').toBe(true);
    });

    (hasFixture ? it : it.skip)('J) original sealed evidence remains unchanged', () => {
      const beforeSha = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');
      const outDir = fs.mkdtempSync(path.join('/tmp', 'rd003-vgt-export-'));
      execFileSync(
        'npx',
        [
          'ts-node',
          '-r',
          'tsconfig-paths/register',
          SCRIPT,
          `--input=${FIXTURE}`,
          `--docs-dir=${outDir}`,
        ],
        { cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8' },
      );
      const afterSha = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');
      expect(afterSha).toBe(beforeSha);
      expect(afterSha).toBe(EXPECTED_SEALED_SHA256);

      const summary = JSON.parse(
        fs.readFileSync(
          path.join(outDir, 'dimo-lte-r1-reference-drive-003-video-gt-correlation-source-summary.json'),
          'utf8',
        ),
      );
      expect(summary.evidenceId).toBe('DI-EV-0033');
      expect(summary.authoritativeSealedSourcePath).toBe(AUTHORITATIVE_SEALED_SOURCE_PATH);
      expect(summary.authoritativeSealedSourceSha256).toBe(EXPECTED_SEALED_SHA256);
      expect(summary.sealedSourcePath).toBeUndefined();
      expect(summary.ANALYSIS_INPUT_SHA_MATCHES_SEALED_AUTHORITY).toBe('YES');
      expect(summary.methodology.FULL_SESSION_FILTERED_EXPORT).toBe('YES');
      expect(summary.methodology.VIDEO_CANDIDATE_WINDOWS_USED_AS_FILTER).toBe('NO');
      expect(summary.methodology.NO_INTERPOLATION_PERFORMED).toBe('YES');
      expect(summary.methodology.ROW_SELECTION_BASIS).toBe(
        'SEALED_RD003_SESSION_OBSERVATIONS_BY_ACQUISITION',
      );
      expect(summary.methodology.PROVIDER_TIMESTAMP_USED_AS_SESSION_FILTER).toBe('NO');
      expect(summary.methodology.VIDEO_TO_TELEMETRY_CLOCK_MODEL_STATUS).toBe(
        'PENDING_MULTI_CLOCK_CORRELATION',
      );
      expect(summary.exportedRowCount).toBe(5010);
    });
  });

  describe('K–Q) source-semantics closeout', () => {
    (hasFixture ? it : it.skip)('K) committed authority path is canonical /opt sealed path', () => {
      const rows = parseSealedJsonl(FIXTURE);
      const { exportedRows, sourceRowCount } = buildVideoGtCorrelationExport(rows);
      const jsonl = serializeCanonicalJsonl(exportedRows);
      const summary = buildSummary({
        analysisInputSha256: EXPECTED_SEALED_SHA256,
        sourceRowCount,
        exportedRows,
        canonicalJsonlSha256: sha256Hex(jsonl),
        sessionStart: SESSION_START,
        sessionStop: '2026-09-02T19:36:22.970Z',
      });
      expect(summary.authoritativeSealedSourcePath).toBe(
        `${SEALED_ROOT}/observations.jsonl`,
      );
      expect(summary.authoritativeSealedSourceSha256).toBe(EXPECTED_SEALED_SHA256);
      expect(JSON.stringify(summary)).not.toContain('/workspace/tmp/');
    });

    (hasFixture ? it : it.skip)('L) workspace --input is not mislabeled as sealed authority in summary', () => {
      const outDir = fs.mkdtempSync(path.join('/tmp', 'rd003-vgt-semantics-'));
      const stdout = execFileSync(
        'npx',
        [
          'ts-node',
          '-r',
          'tsconfig-paths/register',
          SCRIPT,
          `--input=${FIXTURE}`,
          `--docs-dir=${outDir}`,
        ],
        { cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8' },
      );
      const summary = JSON.parse(
        fs.readFileSync(
          path.join(outDir, 'dimo-lte-r1-reference-drive-003-video-gt-correlation-source-summary.json'),
          'utf8',
        ),
      );
      expect(summary.authoritativeSealedSourcePath).toBe(AUTHORITATIVE_SEALED_SOURCE_PATH);
      expect(summary.sealedSourcePath).toBeUndefined();
      expect(JSON.stringify(summary)).not.toContain(FIXTURE);

      const jsonStart = stdout.lastIndexOf('{\n  "ok"');
      const cliResult = JSON.parse(stdout.slice(jsonStart));
      expect(cliResult.analysisInputPath).toBe(FIXTURE);
      expect(cliResult.authoritativeSealedSourcePath).toBe(AUTHORITATIVE_SEALED_SOURCE_PATH);
    });

    (hasFixture ? it : it.skip)('M) matching input SHA is required', () => {
      const tmp = fs.mkdtempSync(path.join('/tmp', 'rd003-bad-sha-export-'));
      const badFile = path.join(tmp, 'observations.jsonl');
      fs.writeFileSync(badFile, '{"observationKind":"SESSION_METADATA"}\n');
      expect(() => assertSealedSha256(badFile)).toThrow(/SHA-256 mismatch/);
    });

    (hasFixture ? it : it.skip)('N) provider timestamps before session start remain in export', () => {
      const rows = parseSealedJsonl(FIXTURE);
      const { exportedRows } = buildVideoGtCorrelationExport(rows);
      const predating = exportedRows.filter(
        (r) => r.providerTimestamp != null && r.providerTimestamp < SESSION_START,
      );
      expect(predating.length).toBeGreaterThan(0);
      expect(exportedRows.length).toBe(5010);
    });

    (hasFixture ? it : it.skip)('O) providerTimestamp is not used as session-row filter', () => {
      const rows = parseSealedJsonl(FIXTURE);
      const fieldSet = new Set<string>(VIDEO_GT_CORRELATION_FIELDS);
      const unfiltered = rows.filter(
        (r) => r.observationKind === 'SIGNAL_POINT' && fieldSet.has(r.providerField ?? ''),
      );
      expect(buildVideoGtCorrelationExport(rows).exportedRows.length).toBe(unfiltered.length);
      expect(buildVideoGtCorrelationExport(rows).exportedRows.length).toBe(5010);
    });

    (hasFixture ? it : it.skip)('P) no new video clock assumption introduced', () => {
      const rows = parseSealedJsonl(FIXTURE);
      const { exportedRows, sourceRowCount } = buildVideoGtCorrelationExport(rows);
      const summary = buildSummary({
        analysisInputSha256: EXPECTED_SEALED_SHA256,
        sourceRowCount,
        exportedRows,
        canonicalJsonlSha256: CANONICAL_JSONL_SHA,
        sessionStart: SESSION_START,
        sessionStop: '2026-09-02T19:36:22.970Z',
      });
      const methodology = summary.methodology as Record<string, string>;
      expect(methodology.NO_VIDEO_CLOCK_ASSUMPTION_APPLIED).toBe('YES');
      expect(methodology.VIDEO_CANDIDATE_WINDOWS_USED_AS_FILTER).toBe('NO');
      expect(methodology.VIDEO_TO_TELEMETRY_CLOCK_MODEL_STATUS).toBe(
        'PENDING_MULTI_CLOCK_CORRELATION',
      );
    });

    (hasFixture ? it : it.skip)('Q) canonical JSONL remains deterministic and unchanged', () => {
      const rows = parseSealedJsonl(FIXTURE);
      const jsonl = serializeCanonicalJsonl(buildVideoGtCorrelationExport(rows).exportedRows);
      expect(sha256Hex(jsonl)).toBe(CANONICAL_JSONL_SHA);
    });
  });
});
