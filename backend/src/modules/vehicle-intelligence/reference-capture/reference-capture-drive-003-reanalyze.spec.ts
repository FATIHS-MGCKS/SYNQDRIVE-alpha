import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const FIXTURE = path.resolve(__dirname, '../../../../../tmp/rd003-evidence/observations.jsonl');
const SCRIPT = path.resolve(__dirname, '../../../../scripts/ops/reference-capture-drive-003-reanalyze.ts');
const EXPECTED_SHA = '81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4';

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

  (hasFixture ? it : it.skip)('runs reanalyze script and writes derived artifacts', () => {
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
    expect(result.HF_IDEMPOTENCY_RUNTIME_VALIDATED).toBe('YES');
    expect(result.hfFieldCount).toBe(5);
    expect(result.observedFieldCount).toBe(31);

    const summary = JSON.parse(
      fs.readFileSync(path.join(outDir, 'dimo-lte-r1-reference-drive-003-session-summary.json'), 'utf8'),
    );
    expect(summary.sessionId).toBe('0fa040aa-6105-4872-9b2c-f8ad477009b8');
    expect(summary.verdicts.GROUND_TRUTH_VALIDATED).toBe('NO');
    expect(summary.verdicts.VIDEO_GROUND_TRUTH).toBe('PENDING_VIDEO');
  });
});
