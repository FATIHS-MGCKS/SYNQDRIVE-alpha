import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { legacyManualVehicleRegistrationDisabledException } from '@modules/vehicles/legacy-manual-vehicle-registration.errors';
import {
  isHmOnlyCanonicalRoutingEnabled,
  shouldSuppressLegacyVehicleCreateBillingHook,
} from './vehicle-registration-convergence.routing';
import { VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_NOT_ARMABLE_PR1 } from '@config/vehicle-registration-convergence.config';

const repoBackendSrc = join(__dirname, '../../..');

function readModuleSource(relativeFromBackendSrc: string): string {
  return readFileSync(join(repoBackendSrc, relativeFromBackendSrc), 'utf8');
}

describe('V2B-PR6 single registration billing authority (characterization)', () => {
  it('VehiclesService.create fail-closes without legacy billing hook body', () => {
    const src = readModuleSource('modules/vehicles/vehicles.service.ts');
    expect(src).toContain('legacyManualVehicleRegistrationDisabledException()');
    expect(legacyManualVehicleRegistrationDisabledException().getResponse()).toMatchObject({
      code: 'MANUAL_VEHICLE_REGISTRATION_RETIRED',
    });
    const afterCreate = src.split('async create(')[1]?.split('async findByOrganization')[0] ?? '';
    expect(afterCreate).not.toContain('onVehicleProvisioned');
  });

  it('registry lifecycle outbox processor is the only production wiring to onVehicleProvisioned', () => {
    const processorSrc = readModuleSource(
      'modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.processor.ts',
    );
    expect(processorSrc).toContain('onVehicleProvisioned');
    const hmLegacySrc = readModuleSource('modules/high-mobility/high-mobility-registration.service.ts');
    expect(hmLegacySrc).not.toContain('onVehicleProvisioned');
    expect(hmLegacySrc).not.toContain('recordVehicleLicenseAdded');
  });

  it('integration harness uses production default deny with explicit ALLOW override', () => {
    const harnessSrc = readModuleSource('modules/vehicles/testing/vehicle-row-integration.harness.ts');
    expect(harnessSrc).toContain('ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS');
    expect(harnessSrc).toContain("NODE_ENV === 'production'");
    expect(harnessSrc).toContain('VEHICLE_ROW_INTEGRATION_HARNESS_FORBIDDEN');
    expect(harnessSrc).toMatch(
      /NODE_ENV === 'production'[\s\S]*ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS !== '1'/,
    );
  });

  it('billing single-rail flag remains not armable after manual registration retirement', () => {
    expect(VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL_NOT_ARMABLE_PR1).toMatch(
      /V2B-PR4|manual|retired|provider-only/i,
    );
    expect(shouldSuppressLegacyVehicleCreateBillingHook({ billingSingleRailEnabled: true } as never)).toBe(
      false,
    );
    expect(isHmOnlyCanonicalRoutingEnabled({ hmOnlyCanonicalEnabled: true } as never)).toBe(true);
  });
});