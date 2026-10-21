import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const FIXTURE = path.resolve(__dirname, '../../../../../tmp/rd003-evidence/observations.jsonl');
const SCRIPT = path.resolve(__dirname, '../../../../scripts/ops/reference-capture-drive-003-reanalyze.ts');
const EXPECTED_SHA = '81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4';
const SEALED_ROOT = '/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-003';

describe('reference-capture-drive-003-reanalyze', () => {
  const hasFixture = fs.existsSync(FIXTURE);

  (hasFixture ? it : it.skip)('verifies sealed SHA and reproduces core invariants', () => {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');
    expect(sha).toBe(EXPECTED_SHA);

    const lines = fs.readFileSync(FIXTURE, 'utf8').split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBe(6251);

    const kinds = lines.map((l) => JSON.parse(l).observationKind);
    expect(kinds.filter((k) => k === 'SIGNAL_POINT').length).toBe(6250);
    expect(kinds.filter((k) => k === 'SESSION_METADATA').length).toBe(1);
    expect(kinds.filter((k) => k === 'NATIVE_EVENT').length).toBe(0);
  });

  (hasFixture ? it : it.skip)('refuses to write into sealed evidence directory', () => {
    expect(() =>
      execFileSync(
        'npx',
        [
          'ts-node',
          '-r',
          'tsconfig-paths/register',
          SCRIPT,
          `--input=${FIXTURE}`,
          `--out-dir=${SEALED_ROOT}`,
        ],
        { cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8' },
      ),
    ).toThrow();
  });

  (hasFixture ? it : it.skip)('runs reanalyze script and writes derived artifacts with corrected semantics', () => {
    const outDir = fs.mkdtempSync(path.join('/tmp', 'rd003-reanalyze-'));
    const docsDir = path.join(outDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });

    const stdout = execFileSync(
      'npx',
      [
        'ts-node',
        '-r',
        'tsconfig-paths/register',
        SCRIPT,
        `--input=${FIXTURE}`,
        `--out-dir=${outDir}`,
        `--docs-dir=${docsDir}`,
      ],
      { cwd: path.resolve(__dirname, '../../../..'), encoding: 'utf8' },
    );

    const jsonStart = stdout.lastIndexOf('{\n  "ok"');
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const result = JSON.parse(stdout.slice(jsonStart));
    expect(result.ok).toBe(true);
    expect(result.REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ).toBe('NO');
    expect(result.HF_IDEMPOTENCY_RUNTIME_VALIDATED).toBe('NOT_EXERCISED');
    expect(result.NO_DUPLICATE_AGGREGATE_BUCKET_IDENTITIES_OBSERVED).toBe('YES');
    expect(result.HF_DATA_WATERMARK_RUNTIME_VALIDATED).toBe('YES');
    expect(result.HF_QUERY_WINDOW_BOUNDED_RUNTIME_VALIDATED).toBe('YES');
    expect(result.hfFieldCount).toBe(5);
    expect(result.observedFieldCount).toBe(31);

    const summary = JSON.parse(
      fs.readFileSync(path.join(outDir, 'dimo-lte-r1-reference-drive-003-session-summary.json'), 'utf8'),
    );
    expect(summary.sessionId).toBe('0fa040aa-6105-4872-9b2c-f8ad477009b8');
    expect(summary.verdicts.GROUND_TRUTH_VALIDATED).toBe('NO');
    expect(summary.verdicts.VIDEO_GROUND_TRUTH).toBe('PENDING_SEGMENTED_VIDEO');
    expect(summary.RD003_VIDEO_GT_COVERAGE).toBe('PARTIAL_SEGMENTED');
    expect(summary.segmentedVideoGtModel.continuousVideoAssumptionRemoved).toBe(true);
    expect(summary.timingMetrics.SESSION_START_TO_FIRST_SIGNAL_INGRESS_MS).toBe(254);
    expect(summary.timingMetrics.FAST_GO_TO_FIRST_CYCLE_MS).toBe(1222);
    expect(summary.physicsAssessability.VEHICLE_LOAD_ASSESSABILITY).toBe('RECONSTRUCTABLE_MEDIUM_CONFIDENCE');

    const metrics = JSON.parse(
      fs.readFileSync(path.join(outDir, 'dimo-lte-r1-reference-drive-003-signal-quality-metrics.json'), 'utf8'),
    );
    expect(metrics.physicsAssessability.domains.VEHICLE_LOAD_ASSESSABILITY).toBe(
      'RECONSTRUCTABLE_MEDIUM_CONFIDENCE',
    );
    expect(metrics.physicsAssessability.targets.longitudinalAcceleration).toBe(
      'RECONSTRUCTABLE_WITH_CADENCE_GATING',
    );
    expect(metrics.physicsAssessability.gear.GEAR_STATE_OBSERVED).toBe('YES');
    expect(metrics.physicsAssessability.gear.GEAR_CHANGE_TIMING_VALIDATED).toBe('NO');
    expect(metrics.nativeEventForensics.NATIVE_EVENT_RUNTIME_DELIVERY_VALIDATED).toBe('NOT_EXERCISED');
    expect(metrics.hfRuntimeValidation.proofMethod).toBe('ACQUISITION_ORDER_PER_FIELD_EXECUTION');
    expect(metrics.samplingInvarianceReadiness.RAW_PHYSICAL_SAMPLE_CADENCE).toBe('NOT_PROVEN');

    const videoGt = fs.readFileSync(
      path.join(docsDir, 'dimo-lte-r1-reference-drive-003-ground-truth-evidence-index-2026-09-02.md'),
      'utf8',
    );
    expect(videoGt).toContain('PARTIAL_SEGMENTED');
    expect(videoGt).toContain('TELEMETRY_ONLY');
    expect(videoGt).not.toContain('VIDEO_START_TIME | _empty_');
  });
});
