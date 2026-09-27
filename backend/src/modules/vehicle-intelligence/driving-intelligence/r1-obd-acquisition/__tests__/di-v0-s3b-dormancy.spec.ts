import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '../../../../../../..');
const S3B_ROOTS = [
  'backend/src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition',
  'backend/src/modules/vehicle-intelligence/driving-intelligence/native-event-evidence',
];

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

describe('S3B dormancy', () => {
  it('S3B_RUNTIME_CALLER_COUNT=0 outside S3B packages', () => {
    const moduleFile = path.join(
      REPO_ROOT,
      'backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts',
    );
    const content = fs.readFileSync(moduleFile, 'utf8');
    expect(content.includes('acquireDiV0HistoricalR1Obd')).toBe(false);
    expect(content.includes('acquireDiV0NativeEventEvidence')).toBe(false);
    expect(content.includes('DimoTelemetryDiV0HistoricalR1ObdTransport')).toBe(false);
  });

  it('R1_CONTINUOUS_KINEMATIC_PATH_COUNT=0 in S3B sources', () => {
    const banned = ['continuousSpeedKmh', 'canonicalSpeed', 'authoritativeSpeed', 'pointAcceleration'];
    let count = 0;
    for (const rel of S3B_ROOTS) {
      for (const file of walkTs(path.join(REPO_ROOT, rel))) {
        if (file.includes('__tests__')) continue;
        const text = fs.readFileSync(file, 'utf8');
        for (const term of banned) {
          if (text.includes(term)) count += 1;
        }
      }
    }
    expect(count).toBe(0);
  });

  it('SECRET_LEAK_PATH_COUNT=0 in S3B tests and serializers', () => {
    const secretMarkers = ['Bearer ', 'eyJ', 'CLOUD_AGENT', 'private_key'];
    let leaks = 0;
    for (const rel of S3B_ROOTS) {
      for (const file of walkTs(path.join(REPO_ROOT, rel))) {
        if (file.endsWith('di-v0-s3b-dormancy.spec.ts')) continue;
        const text = fs.readFileSync(file, 'utf8');
        for (const marker of secretMarkers) {
          if (text.includes(marker)) leaks += 1;
        }
      }
    }
    expect(leaks).toBe(0);
  });
});
