import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const TRIP_SQ = path.join(__dirname, '..');
const S4C_DIR = path.join(__dirname, '../../s4c-executor');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('DI V0 P2 trip speed quality dormant-by-construction audit', () => {
  it('trip-speed-quality module is not imported by AppModule or VehicleIntelligenceModule', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    const vi = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts'), 'utf8');
    expect(app.includes('trip-speed-quality')).toBe(false);
    expect(vi.includes('trip-speed-quality')).toBe(false);
  });

  it('S4C executor package does not import P2 projector (completion path unchanged)', () => {
    const files = fs.readdirSync(S4C_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    for (const file of files) {
      const source = stripComments(fs.readFileSync(path.join(S4C_DIR, file), 'utf8'));
      expect(source.includes('trip-speed-quality')).toBe(false);
      expect(source.includes('DiV0TripSpeedQuality')).toBe(false);
    }
  });

  it('P2 package files stay under trip-speed-quality/', () => {
    const files = fs.readdirSync(TRIP_SQ).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    expect(
      files.every(
        (f) =>
          f === 'index.ts' ||
          f.startsWith('di-v0-trip-speed-quality') ||
          f.startsWith('build-di-v0-trip-speed'),
      ),
    ).toBe(true);
  });
});
