import { DrivingCapabilityStatus } from '@prisma/client';
import {
  VsiDeclaredCatalogResolver,
  VSI_DECLARED_CATALOG_MULTI_ACTIVE_LINK_LIMITATION,
  VSI_DECLARED_CATALOG_PROVIDER_MISMATCH_LIMITATION,
} from './vsi-declared-catalog.resolver';
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

  it('resolveForMaterialization forces UNKNOWN when multiple active source links exist', async () => {
    const prisma = {
      vehicleDrivingCapability: {
        findMany: async () => [
          {
            signalName: 'lowVoltageBatteryCurrentVoltage',
            capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
            checkedAt: new Date(),
            metadata: { listedInAvailableSignals: true },
          },
        ],
      },
      vehicleBatteryCapability: { findMany: async () => [] },
      vehicleDataSourceLink: { count: async () => 2 },
    };
    const resolver = new VsiDeclaredCatalogResolver(prisma as never);
    const snapshot = await resolver.resolveForMaterialization(
      'org',
      'veh',
      'link-a',
      'DIMO',
    );
    expect(snapshot.limitations).toContain(VSI_DECLARED_CATALOG_MULTI_ACTIVE_LINK_LIMITATION);
    expect(
      resolver.catalogForCanonicalKey(snapshot, 'lv_voltage'),
    ).toBe(VsiProviderCatalogStatus.UNKNOWN);
  });

  it('resolveForMaterialization forces UNKNOWN for non-DIMO link provider', async () => {
    const prisma = {
      vehicleDrivingCapability: {
        findMany: async () => [
          {
            signalName: 'lowVoltageBatteryCurrentVoltage',
            capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
            checkedAt: new Date(),
            metadata: { listedInAvailableSignals: true },
          },
        ],
      },
      vehicleBatteryCapability: { findMany: async () => [] },
      vehicleDataSourceLink: { count: async () => 1 },
    };
    const resolver = new VsiDeclaredCatalogResolver(prisma as never);
    const snapshot = await resolver.resolveForMaterialization(
      'org',
      'veh',
      'link-a',
      'HIGH_MOBILITY',
    );
    expect(snapshot.limitations).toContain(VSI_DECLARED_CATALOG_PROVIDER_MISMATCH_LIMITATION);
    expect(
      resolver.catalogForCanonicalKey(snapshot, 'lv_voltage'),
    ).toBe(VsiProviderCatalogStatus.UNKNOWN);
  });

  it('resolveForMaterialization preserves LISTED for single DIMO link', async () => {
    const prisma = {
      vehicleDrivingCapability: {
        findMany: async () => [
          {
            signalName: 'lowVoltageBatteryCurrentVoltage',
            capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
            checkedAt: new Date(),
            metadata: { listedInAvailableSignals: true },
          },
        ],
      },
      vehicleBatteryCapability: { findMany: async () => [] },
      vehicleDataSourceLink: { count: async () => 1 },
    };
    const resolver = new VsiDeclaredCatalogResolver(prisma as never);
    const snapshot = await resolver.resolveForMaterialization(
      'org',
      'veh',
      'link-a',
      'DIMO',
    );
    expect(snapshot.limitations).not.toContain(VSI_DECLARED_CATALOG_MULTI_ACTIVE_LINK_LIMITATION);
    expect(
      resolver.catalogForCanonicalKey(snapshot, 'lv_voltage'),
    ).toBe(VsiProviderCatalogStatus.LISTED);
  });
});
