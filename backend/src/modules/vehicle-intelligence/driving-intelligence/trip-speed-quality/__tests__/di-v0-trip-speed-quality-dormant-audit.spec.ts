import * as fs from 'fs';
import * as path from 'path';
import {
  collectP2S4aFenceViolations,
  isUnauthorizedNonP2S4aImport,
  P2_TRIP_SPEED_QUALITY_DIR,
} from '../../s4a-foundation/__tests__/di-v0-s4a-dormant-audit.p2-fence';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const TRIP_SQ = path.join(__dirname, '..');
const S4C_DIR = path.join(__dirname, '../../s4c-executor');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkTs(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

describe('DI V0 P2 trip speed quality dormant-by-construction audit', () => {
  it('trip-speed-quality module is not imported by AppModule or VehicleIntelligenceModule', () => {
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    const vi = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts'), 'utf8');
    expect(app.includes('trip-speed-quality')).toBe(false);
    expect(vi.includes('trip-speed-quality')).toBe(false);
    expect(app.includes('DiV0TripSpeedQualityModule')).toBe(false);
    expect(vi.includes('DiV0TripSpeedQualityModule')).toBe(false);
  });

  it('negative: synthetic AppModule P2 registration would fail audit', () => {
    const synthetic = `import { DiV0TripSpeedQualityModule } from './modules/vehicle-intelligence/driving-intelligence/trip-speed-quality';`;
    expect(synthetic.includes('trip-speed-quality')).toBe(true);
    expect(synthetic.includes('DiV0TripSpeedQualityModule')).toBe(true);
  });

  it('S4C executor package does not import P2 projector (completion path unchanged)', () => {
    const files = fs.readdirSync(S4C_DIR).filter((f) => f.endsWith('.ts') && !f.includes('.spec.'));
    for (const file of files) {
      const source = stripComments(fs.readFileSync(path.join(S4C_DIR, file), 'utf8'));
      expect(source.includes('trip-speed-quality')).toBe(false);
      expect(source.includes('DiV0TripSpeedQuality')).toBe(false);
    }
  });

  it('S4C executor entry does not reference P2 trip speed quality (T06 path unchanged)', () => {
    const executorFile = path.join(S4C_DIR, 'di-v0-s4c-executor.ts');
    const source = stripComments(fs.readFileSync(executorFile, 'utf8'));
    expect(source.includes('trip-speed-quality')).toBe(false);
    expect(source.includes('TripSpeedQuality')).toBe(false);
  });

  it('negative: synthetic S4C P2 import would fail audit', () => {
    const synthetic = `import { DiV0TripSpeedQualityProjectionService } from '../trip-speed-quality/di-v0-trip-speed-quality-projection.service';`;
    expect(synthetic.includes('trip-speed-quality')).toBe(true);
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

  it('P2 does not import S4A mutation repositories (authority uses explicit read SQL only)', () => {
    const violations: string[] = [];
    for (const file of walkTs(TRIP_SQ)) {
      if (file.includes('__tests__')) continue;
      violations.push(...collectP2S4aFenceViolations(file, fs.readFileSync(file, 'utf8')));
    }
    expect(violations).toEqual([]);
  });

  it('speed-qc package does not import s4a-foundation (unauthorized module guard)', () => {
    const speedQc = path.join(__dirname, '../../speed-qc');
    for (const file of walkTs(speedQc)) {
      if (file.includes('.spec.')) continue;
      expect(isUnauthorizedNonP2S4aImport(file, fs.readFileSync(file, 'utf8'))).toBe(false);
    }
  });

  it('P2 tree is confined to trip-speed-quality directory', () => {
    expect(P2_TRIP_SPEED_QUALITY_DIR).toBe(TRIP_SQ);
  });

  it('P2.1 ops preview CLI is not wired into Nest bootstrap', () => {
    const opsScript = fs.readFileSync(
      path.join(REPO_ROOT, 'backend/scripts/ops/di-v0-trip-speed-quality-preview.ts'),
      'utf8',
    );
    expect(opsScript.includes('previewDiV0TripSpeedQualityForWorkItem')).toBe(true);
    expect(opsScript.includes('persistCurrentProjection')).toBe(false);
    const app = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/app.module.ts'), 'utf8');
    expect(app.includes('di-v0-trip-speed-quality-preview')).toBe(false);
  });
});
