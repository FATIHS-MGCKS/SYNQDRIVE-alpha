import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const S4C_DIR = path.join(__dirname, '..');

describe('DI V0 S4C dormant-by-construction audit', () => {
  it('S4C package is not imported by AppModule', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    expect(app.includes('s4c-executor')).toBe(false);
    expect(app.includes('DiV0S4c')).toBe(false);
  });

  it('production files stay under s4c-executor/', () => {
    const files = fs.readdirSync(S4C_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.startsWith('di-v0-s4c-'))).toBe(true);
  });
});
