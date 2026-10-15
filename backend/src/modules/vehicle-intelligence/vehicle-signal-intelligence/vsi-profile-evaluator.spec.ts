import { DrivingCapabilityStatus } from '@prisma/client';
import { evaluateVsiSignalProfile } from './vsi-profile-evaluator';
import { VsiDeclaredCatalogResolver } from './vsi-declared-catalog.resolver';
import { VsiEmpiricalObservationStatus, VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

const catalogResolver = {
  catalogForCanonicalKey: (
    snapshot: { byNativeSignalName: ReadonlyMap<string, VsiProviderCatalogStatus> },
    key: string,
  ) => {
    const defMap: Record<string, string> = {
      lv_voltage: 'lowVoltageBatteryCurrentVoltage',
      hv_battery_soc: 'powertrainTractionBatteryStateOfChargeCurrent',
    };
    const native = defMap[key];
    return native
      ? snapshot.byNativeSignalName.get(native) ?? VsiProviderCatalogStatus.UNKNOWN
      : VsiProviderCatalogStatus.UNKNOWN;
  },
} as VsiDeclaredCatalogResolver;

describe('evaluateVsiSignalProfile', () => {
  const baseLink = {
    id: 'link-1',
    provider: 'DIMO',
    isActive: true,
    metadata: {
      connectionIdentity: {
        version: 'vo-source-link-connection-identity-v1',
        verifiedModality: 'HARDWARE_DEVICE',
        telemetrySourceFamily: 'RUPTELA_R1',
      },
    },
    consentId: null,
  };

  const hardwareIdentity = {
    provider: 'DIMO',
    providerSourceLinkId: 'link-1',
    verifiedModality: 'HARDWARE_DEVICE',
    physicalDeviceReference: 'UNKNOWN',
    telemetrySourceFamily: 'RUPTELA_R1' as const,
    treatsAsPhysicalHardwareDevice: true,
    confidenceLimitations: [],
  };

  it('maps declared LISTED separately from empirical LV observation (Ruptela)', () => {
    const declared = {
      checkedAt: new Date('2026-10-01T00:00:00Z'),
      byNativeSignalName: new Map([
        ['lowVoltageBatteryCurrentVoltage', VsiProviderCatalogStatus.LISTED],
      ]),
      limitations: [],
    };
    const result = evaluateVsiSignalProfile(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'LTE_R1',
        link: baseLink,
        identity: hardwareIdentity,
        latestState: {
          vehicleId: 'veh-1',
          providerBindingId: 'link-1',
          providerSource: 'DIMO',
          lvBatteryVoltage: 12.4,
          evSoc: null,
          online: true,
          sourceTimestamp: new Date('2026-10-15T10:00:00Z'),
          providerFetchedAt: new Date('2026-10-15T10:00:01Z'),
          updatedAt: new Date('2026-10-15T10:00:01Z'),
          rawPayloadJson: {
            lowVoltageBatteryCurrentVoltage: {
              value: 12.4,
              timestamp: '2026-10-15T10:00:00.000Z',
            },
          },
        },
        pollLogs: [{ status: 'SUCCESS', startedAt: new Date(), finishedAt: new Date() }],
        declaredCatalog: declared,
        priorAggregatedSourceTimestamp: new Date('2026-10-14T10:00:00Z'),
      },
      catalogResolver,
    );

    const lv = result.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv?.declaredSupport).toBe('LISTED');
    expect(lv?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result.signals.find((s) => s.canonicalSignalKey === 'provider_source_timestamp')?.strictSourceAdvanced).toBe(
      true,
    );
  });

  it('Tesla software: HV observed, LV not inferred from catalog alone', () => {
    const softwareIdentity = {
      ...hardwareIdentity,
      verifiedModality: 'SOFTWARE_INTEGRATION',
      telemetrySourceFamily: 'API_SYNTHETIC' as const,
      treatsAsPhysicalHardwareDevice: false,
    };
    const declared = {
      checkedAt: new Date('2026-10-01T00:00:00Z'),
      byNativeSignalName: new Map([
        ['lowVoltageBatteryCurrentVoltage', VsiProviderCatalogStatus.LISTED],
        ['powertrainTractionBatteryStateOfChargeCurrent', VsiProviderCatalogStatus.LISTED],
      ]),
      limitations: [],
    };
    const result = evaluateVsiSignalProfile(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-tesla',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'LTE_R1',
        link: baseLink,
        identity: softwareIdentity,
        latestState: {
          vehicleId: 'veh-tesla',
          providerBindingId: 'link-1',
          providerSource: 'DIMO',
          lvBatteryVoltage: null,
          evSoc: 72,
          online: true,
          sourceTimestamp: new Date('2026-10-15T10:00:00Z'),
          providerFetchedAt: new Date('2026-10-15T10:00:01Z'),
          updatedAt: new Date('2026-10-15T10:00:01Z'),
          rawPayloadJson: {
            powertrainTractionBatteryStateOfChargeCurrent: {
              value: 72,
              timestamp: '2026-10-15T10:00:00.000Z',
            },
          },
        },
        pollLogs: [],
        declaredCatalog: declared,
      },
      catalogResolver,
    );

    const lv = result.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    const hv = result.signals.find((s) => s.canonicalSignalKey === 'hv_battery_soc');
    expect(lv?.declaredSupport).toBe('LISTED');
    expect(lv?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(hv?.empiricalObservation).toBe(VsiEmpiricalObservationStatus.OBSERVED);
    expect(result.profileLimitations).toContain('SOFTWARE_INTEGRATION_STRATIFICATION_ACTIVE');
  });

  it('missing catalog evidence yields UNKNOWN declared support', () => {
    const declared = {
      checkedAt: null,
      byNativeSignalName: new Map<string, VsiProviderCatalogStatus>(),
      limitations: ['NO_CACHED_PROVIDER_CATALOG_EVIDENCE'],
    };
    const result = evaluateVsiSignalProfile(
      {
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        registryLifecycle: 'ACTIVE',
        hardwareTypeLegacy: 'UNKNOWN',
        link: baseLink,
        identity: hardwareIdentity,
        latestState: null,
        pollLogs: [],
        declaredCatalog: declared,
      },
      catalogResolver,
    );
    const lv = result.signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
    expect(lv?.declaredSupport).toBe('UNKNOWN');
  });
});
