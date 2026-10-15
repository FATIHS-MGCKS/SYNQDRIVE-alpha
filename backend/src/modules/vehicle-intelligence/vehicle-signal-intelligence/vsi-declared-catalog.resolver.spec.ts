import { DrivingCapabilityStatus } from '@prisma/client';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

describe('VsiDeclaredCatalogResolver', () => {
  it('does not map generic UNSUPPORTED preflight to NOT_LISTED', async () => {
    const prisma = {
      vehicleDrivingCapability: {
        findMany: async () => [
          {
            signalName: 'angularVelocityYaw',
            capabilityStatus: DrivingCapabilityStatus.UNSUPPORTED,
            checkedAt: new Date(),
            metadata: { reason: 'powertrain_not_applicable' },
          },
        ],
      },
      vehicleBatteryCapability: { findMany: async () => [] },
    };
    const resolver = new VsiDeclaredCatalogResolver(prisma as never);
    const snapshot = await resolver.resolveForVehicle('org', 'veh');
    expect(snapshot.byNativeSignalName.get('angularVelocityYaw')).toBeUndefined();
    expect(
      resolver.catalogForCanonicalKey(snapshot, 'vehicle_speed'),
    ).toBe(VsiProviderCatalogStatus.UNKNOWN);
  });

  it('maps explicit signal_not_in_availableSignals to NOT_LISTED', async () => {
    const prisma = {
      vehicleDrivingCapability: {
        findMany: async () => [
          {
            signalName: 'chassisBrakeIsPedalPressed',
            capabilityStatus: DrivingCapabilityStatus.UNSUPPORTED,
            checkedAt: new Date(),
            metadata: {
              listedInAvailableSignals: false,
              reason: 'signal_not_in_availableSignals',
            },
          },
        ],
      },
      vehicleBatteryCapability: { findMany: async () => [] },
    };
    const resolver = new VsiDeclaredCatalogResolver(prisma as never);
    const snapshot = await resolver.resolveForVehicle('org', 'veh');
    expect(snapshot.byNativeSignalName.get('chassisBrakeIsPedalPressed')).toBe(
      VsiProviderCatalogStatus.NOT_LISTED,
    );
  });
});
