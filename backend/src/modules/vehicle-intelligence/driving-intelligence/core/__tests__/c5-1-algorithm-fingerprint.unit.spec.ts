import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  motionCoreSpeedC5_1AlgorithmFileSha256,
  resolveC5_1AlgorithmFilePathForFingerprint,
} from '../kinematics/c5-1-gated-repair';

describe('C5.1 algorithm runtime fingerprint', () => {
  it('prefers compiled .js over .ts (Nest production dist layout)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c51-fp-'));
    const jsPath = path.join(dir, 'c5-1-gated-repair-v1-2.js');
    const tsPath = path.join(dir, 'c5-1-gated-repair-v1-2.ts');
    fs.writeFileSync(jsPath, 'compiled-runtime-v1');
    fs.writeFileSync(tsPath, 'source-typescript-v1');
    expect(resolveC5_1AlgorithmFilePathForFingerprint(dir)).toBe(jsPath);
  });

  it('falls back to .ts when .js is absent (local dev)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c51-fp-'));
    const tsPath = path.join(dir, 'c5-1-gated-repair-v1-2.ts');
    fs.writeFileSync(tsPath, 'dev-only-source');
    expect(resolveC5_1AlgorithmFilePathForFingerprint(dir)).toBe(tsPath);
  });

  it('fingerprints real kinematics sources in this workspace (ts dev or js after build)', () => {
    const kinematicsDir = path.join(__dirname, '../kinematics');
    const filePath = resolveC5_1AlgorithmFilePathForFingerprint(kinematicsDir);
    expect(fs.existsSync(filePath)).toBe(true);
    const hash = motionCoreSpeedC5_1AlgorithmFileSha256();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes the resolved file deterministically', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c51-fp-'));
    const jsPath = path.join(dir, 'c5-1-gated-repair-v1-2.js');
    fs.writeFileSync(jsPath, 'deterministic-payload');
    const filePath = resolveC5_1AlgorithmFilePathForFingerprint(dir);
    const buf = fs.readFileSync(filePath);
    const { createHash } = require('crypto') as typeof import('crypto');
    const expected = createHash('sha256').update(buf).digest('hex');
    expect(createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')).toBe(expected);
  });
});
