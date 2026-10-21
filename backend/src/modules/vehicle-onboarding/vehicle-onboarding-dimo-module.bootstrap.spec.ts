import { MODULE_METADATA } from '@nestjs/common/constants';
import { DimoModule } from '@modules/dimo/dimo.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { VehicleOnboardingModule } from './vehicle-onboarding.module';

function unwrapModuleImport(token: unknown): unknown {
  if (
    token &&
    typeof token === 'object' &&
    'forwardRef' in token &&
    typeof (token as { forwardRef: () => unknown }).forwardRef === 'function'
  ) {
    return (token as { forwardRef: () => unknown }).forwardRef();
  }
  return token;
}

/**
 * VO-SIG P2 wires VehiclesModule ↔ VehicleOnboardingModule ↔ DimoModule into the
 * existing Dimo ↔ VehicleIntelligence ↔ Vehicles cycle. A direct DimoModule import
 * leaves imports[1] undefined during decorator evaluation (production boot check).
 */
describe('VehicleOnboardingModule DimoModule bootstrap graph', () => {
  it('imports DimoModule through forwardRef so the class resolves under the Vehicles cycle', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      VehicleOnboardingModule,
    ) as unknown[];

    expect(imports).toHaveLength(3);
    expect(unwrapModuleImport(imports[1])).toBe(DimoModule);
    expect(typeof (imports[1] as { forwardRef?: () => unknown }).forwardRef).toBe('function');
  });

  it('documents the reciprocal VehiclesModule forwardRef to VehicleOnboardingModule', () => {
    const vehicleImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      VehiclesModule,
    ) as unknown[];

    const onboardingImport = vehicleImports.find(
      (entry) => unwrapModuleImport(entry) === VehicleOnboardingModule,
    );
    expect(onboardingImport).toBeDefined();
    expect(unwrapModuleImport(onboardingImport)).toBe(VehicleOnboardingModule);
  });
});
