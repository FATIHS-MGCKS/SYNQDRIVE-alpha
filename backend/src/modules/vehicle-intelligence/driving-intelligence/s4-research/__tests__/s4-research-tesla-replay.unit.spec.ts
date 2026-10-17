import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const backendRoot = path.resolve(__dirname, '../../../../../../');
const harnessPath = path.join(backendRoot, 'scripts/test/di-s4-research-tesla-replay.harness.ts');
const evidenceDir = path.join(
  backendRoot,
  '..',
  'architecture/drivingintelligence/evidence/ldi-10d',
);
const fixturePath = path.join(evidenceDir, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
const osmPath = path.join(evidenceDir, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');

const EXPECTED_BASELINE = { ASSOCIATED: 264, AMBIGUOUS: 512, UNKNOWN: 360 };
const EXPECTED_VITERBI = { ASSOCIATED: 300, AMBIGUOUS: 357, UNKNOWN: 479 };

describe('s4-research Tesla frozen fixture replay', () => {
  it('has fixture artifacts present', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    expect(fs.existsSync(osmPath)).toBe(true);
  });

  it('replays baseline/viterbi parity and F4-B uncertainty via transpile-only harness', () => {
    const out = execFileSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', harnessPath],
      { cwd: backendRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
    const lastLine = out.trim().split('\n').pop()!;
    const result = JSON.parse(lastLine) as {
      baseline: typeof EXPECTED_BASELINE;
      viterbi: typeof EXPECTED_VITERBI;
      promotions: number;
      impossible: number;
      stillAmbiguousReplay: number;
      independentAccuracy: string;
    };
    expect(result.baseline).toEqual(EXPECTED_BASELINE);
    expect(result.viterbi).toEqual(EXPECTED_VITERBI);
    expect(result.promotions).toBe(36);
    expect(result.impossible).toBeGreaterThanOrEqual(5);
    expect(result.stillAmbiguousReplay).toBeGreaterThanOrEqual(20);
    expect(result.independentAccuracy).toBe('NOT_ASSESSABLE');
  }, 180_000);
});
