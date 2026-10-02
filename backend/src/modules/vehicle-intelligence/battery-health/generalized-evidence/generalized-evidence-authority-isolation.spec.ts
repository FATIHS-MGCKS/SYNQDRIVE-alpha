import * as fs from 'fs';
import * as path from 'path';

describe('generalized evidence authority isolation', () => {
  const repoRoot = path.resolve(__dirname, '../../../../../..');
  const forbiddenImports = [
    'generalized-evidence/generalized-evidence.repository',
    'generalized-evidence/generalized-evidence-capture.service',
    'BatteryGeneralizedEvidenceObservation',
  ];

  const authoritativeFiles = [
    'backend/src/modules/vehicle-intelligence/battery-health/battery-assessment.service.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/battery-publication.service.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/battery-rest-target-evaluation.service.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-measurement-quality.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/lv-assessment/lv-estimated-health-assessment.policy.ts',
  ];

  it('does not import generalized evidence into authoritative battery paths', () => {
    for (const rel of authoritativeFiles) {
      const full = path.join(repoRoot, rel);
      const text = fs.readFileSync(full, 'utf8');
      for (const token of forbiddenImports) {
        expect(text.includes(token)).toBe(false);
      }
    }
  });
});

describe('generalized evidence capture contract (G/H raw independence)', () => {
  const capturePath = path.join(
    path.resolve(__dirname, '../../../../../..'),
    'backend/src/modules/vehicle-intelligence/battery-health/generalized-evidence/generalized-evidence-capture.service.ts',
  );

  it('does not gate capture on trip COMPLETED or finalized trip lookup', () => {
    const text = fs.readFileSync(capturePath, 'utf8');
    expect(text.includes('TripStatus.COMPLETED')).toBe(false);
    expect(text.includes('findLatestCompletedIceTrip')).toBe(false);
    expect(text.includes('resolveFinalizedTripForAnchor')).toBe(false);
  });
});
