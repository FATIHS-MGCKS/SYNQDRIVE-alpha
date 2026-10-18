import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { DimoModule } from '@modules/dimo/dimo.module';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { VehicleIntelligenceModule } from '../../vehicle-intelligence.module';
import { HvChargingCounterEvidenceModule } from './hv-charging-counter-evidence.module';
import { DimoChargingAddedEnergyIntervalClient } from './dimo-charging-added-energy-interval.client';

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
 * HV R22 P1: HvChargingCounterEvidenceModule imports DimoModule for interval GraphQL.
 * DimoModule already uses forwardRef(() => VehicleIntelligenceModule) while VI imports
 * HvChargingCounterEvidenceModule — a direct DimoModule import leaves imports[0] undefined
 * during decorator evaluation (Nest production boot check on main f30be79f).
 */
describe('HvChargingCounterEvidenceModule DimoModule bootstrap graph', () => {
  const hvImports: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, HvChargingCounterEvidenceModule) ?? [];
  const viImports: unknown[] =
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, VehicleIntelligenceModule) ?? [];

  it('imports DimoModule through forwardRef under the Dimo ↔ VehicleIntelligence cycle', () => {
    expect(hvImports).toHaveLength(1);
    expect(unwrapModuleImport(hvImports[0])).toBe(DimoModule);
    expect(typeof (hvImports[0] as { forwardRef?: () => unknown }).forwardRef).toBe('function');
    expect(hvImports[0]).not.toBe(DimoModule);
  });

  it('documents VehicleIntelligenceModule imports HvChargingCounterEvidenceModule', () => {
    expect(viImports.some((entry) => entry === HvChargingCounterEvidenceModule)).toBe(true);
  });

  it('resolves DimoChargingAddedEnergyIntervalClient with DIMO auth and telemetry injection', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DimoChargingAddedEnergyIntervalClient,
        { provide: DimoAuthService, useValue: { getVehicleJwt: jest.fn() } },
        { provide: DimoTelemetryService, useValue: { queryGraphQL: jest.fn() } },
      ],
    }).compile();

    const client = moduleRef.get(DimoChargingAddedEnergyIntervalClient);
    expect(client).toBeInstanceOf(DimoChargingAddedEnergyIntervalClient);
  });
});
