import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../../../');

function rgListFilePaths(rgArgs: string[]): string[] {
  try {
    const out = execFileSync('rg', rgArgs, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
}

describe('V2B-PR6 production billing caller discovery (rg-backed)', () => {
  it('onVehicleProvisioned invocations are only outbox processor + integration harness', () => {
    const files = rgListFilePaths([
      '-l',
      '\\.onVehicleProvisioned\\(',
      'backend/src',
      '--glob',
      '!**/*.spec.ts',
      '--glob',
      '!**/*.integration.spec.ts',
    ]);

    expect(files.sort()).toEqual(
      [
        'backend/src/modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.processor.ts',
        'backend/src/modules/vehicles/testing/vehicle-row-integration.harness.ts',
      ].sort(),
    );
  });

  it('harness importers are test-scoped paths only', () => {
    const files = rgListFilePaths([
      '-l',
      "from.*vehicle-row-integration\\.harness",
      'backend/src',
    ]);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const testScoped =
        file.includes('/testing/') ||
        file.endsWith('.spec.ts') ||
        file.endsWith('.integration.spec.ts') ||
        file.includes('.characterization.spec.ts');
      expect({ file, testScoped }).toEqual({ file, testScoped: true });
    }
  });

  it('ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS runtime reference is harness module only', () => {
    const files = rgListFilePaths(['-l', '-F', 'ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS', 'backend/src']);

    expect(files.sort()).toEqual(
      [
        'backend/src/modules/vehicle-onboarding/convergence/v2b-pr6-production-billing-callers.characterization.spec.ts',
        'backend/src/modules/vehicle-onboarding/convergence/v2b-pr6-single-billing-authority.characterization.spec.ts',
        'backend/src/modules/vehicles/testing/vehicle-row-integration.harness.spec.ts',
        'backend/src/modules/vehicles/testing/vehicle-row-integration.harness.ts',
      ].sort(),
    );
  });
});