import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const S4D_DIR = path.join(__dirname, '..');

describe('DI V0 S4D dormant-by-construction audit', () => {
  it('S4D package is not imported by AppModule', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    expect(app.includes('s4d-replay')).toBe(false);
    expect(app.includes('DiV0S4d')).toBe(false);
  });

  it('production files stay under s4d-replay/', () => {
    const files = fs.readdirSync(S4D_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.startsWith('di-v0-s4d-'))).toBe(true);
  });
});
