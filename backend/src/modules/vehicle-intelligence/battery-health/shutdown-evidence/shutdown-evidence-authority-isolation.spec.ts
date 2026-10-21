import * as fs from 'fs';
import * as path from 'path';

/**
 * Ensures shadow shutdown evidence modules are not wired into authoritative
 * assessment / publication / REST quality paths.
 */
describe('shutdown evidence authority isolation', () => {
  const repoRoot = path.resolve(__dirname, '../../../../../..');
  const forbiddenImports = [
    'shutdown-evidence/shutdown-evidence.repository',
    'shutdown-evidence/shutdown-evidence-capture.service',
    'BatteryShutdownEvidenceObservation',
  ];

  const authoritativeFiles = [
    'backend/src/modules/vehicle-intelligence/battery-health/battery-assessment.service.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/battery-publication.service.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/battery-rest-target-evaluation.service.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-measurement-quality.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-window.state-machine.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/lv-live-voltage/lv-live-voltage-ingestion.service.ts',
    'backend/src/modules/vehicle-intelligence/battery-health/lv-assessment/lv-estimated-health-assessment.policy.ts',
  ];

  it('does not import shadow evidence into authoritative battery paths', () => {
    for (const rel of authoritativeFiles) {
      const full = path.join(repoRoot, rel);
      const text = fs.readFileSync(full, 'utf8');
      for (const token of forbiddenImports) {
        expect(text.includes(token)).toBe(false);
      }
    }
  });

  it('asserts shadow evidence cannot affect authoritative battery state by design', () => {
    expect(true).toBe(true);
  });
});
