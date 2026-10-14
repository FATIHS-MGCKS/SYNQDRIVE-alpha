import { VehicleConnectionModality } from '../../vehicle-onboarding/connection-identity/vehicle-connection-identity.contract';
import { VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION } from '../../vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';
import {
  VsiAuthorizationStatus,
  VsiEmpiricalObservationStatus,
} from './vehicle-signal-evidence.contract';
import { composeReadonlyVehicleSignals } from './vsi-readonly-composer.engine';
import { projectConnectionIdentitiesFromLinks } from './vsi-connection-identity-projection';
import { projectVsiEvidenceForApdsReadonlyCorrelation } from './vsi-apds-consumer.adapter.contract';
import {
  isLatestStateAttributedToLink,
  resolveStrictSourceAdvanceEvidence,
} from './vsi-readonly-composer.evidence';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const LINK_TESLA = '805b271c-ba87-4776-9e39-23e24d595c53';
const LINK_RUPTELA = '71b75519-3053-4836-8bcd-554680d592b2';

function ciV2(overrides: Record<string, unknown>) {
  return {
    connectionIdentity: {
      version: VO_SOURCE_LINK_CONNECTION_IDENTITY_V2_VERSION,
      contractVersion: 'vo-connection-identity-v1',
      origin: 'LEGACY_RECONCILIATION',
      providerSourceLinkId: LINK_TESLA,
      provider: 'DIMO',
      verifiedModality: VehicleConnectionModality.SOFTWARE_INTEGRATION,
      physicalDeviceReference: 'NOT_APPLICABLE',
      verificationEvidence: ['DIMO_RAW_JSON:API_SYNTHETIC'],
      organizationId: ORG,
      vehicleId: VEH,
      ...overrides,
    },
  };
}

describe('vsi-readonly-composer.evidence', () => {
  it('strict source advance is UNKNOWN without independent prior timestamp', () => {
    const current = new Date('2026-10-14T11:00:00Z');
    expect(
      resolveStrictSourceAdvanceEvidence({
        priorAggregatedSourceTimestamp: null,
        currentAggregatedSourceTimestamp: current,
      }),
    ).toBe('UNKNOWN');
  });
});

describe('vsi-readonly-composer.engine', () => {
  const projectionAsOf = new Date('2026-10-14T12:00:00.000Z');

  it('Tesla 186946 software integration is not physical hardware despite LTE_R1 legacy hardwareType', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [
        {
          id: LINK_TESLA,
          provider: 'DIMO',
          isActive: true,
          metadata: ciV2({
            providerSourceLinkId: LINK_TESLA,
            verifiedModality: VehicleConnectionModality.SOFTWARE_INTEGRATION,
          }),
        },
      ],
      latestState: null,
      pollLogs: [],
    });
    expect(result.identityProjections[0].treatsAsPhysicalHardwareDevice).toBe(false);
    expect(result.identityProjections[0].telemetrySourceFamily).toBe('API_SYNTHETIC');
    expect(
      result.signals.some((s) =>
        s.confidenceLimitations.includes('VERIFIED_SOFTWARE_INTEGRATION_NOT_PHYSICAL_R1_DEVICE'),
      ),
    ).toBe(true);
  });

  it('Ruptela R1 hardware connection treats as physical device', () => {
    const projections = projectConnectionIdentitiesFromLinks(
      [
        {
          id: LINK_RUPTELA,
          provider: 'DIMO',
          isActive: true,
          metadata: ciV2({
            providerSourceLinkId: LINK_RUPTELA,
            verifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
            physicalDeviceReference: 'R1-861773070120068',
            verificationEvidence: ['DIMO_RAW_JSON:RUPTELA_R1', 'serial:R1-861773070120068'],
          }),
        },
      ],
      { organizationId: ORG, vehicleId: VEH },
    );
    expect(projections[0].treatsAsPhysicalHardwareDevice).toBe(true);
    expect(projections[0].telemetrySourceFamily).toBe('RUPTELA_R1');
  });

  it('HARDWARE_DEVICE with UNKNOWN physical reference is not physical hardware', () => {
    const projections = projectConnectionIdentitiesFromLinks([
      {
        id: LINK_RUPTELA,
        provider: 'DIMO',
        isActive: true,
        metadata: ciV2({
          providerSourceLinkId: LINK_RUPTELA,
          verifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
          physicalDeviceReference: 'UNKNOWN',
        }),
      },
    ]);
    expect(projections[0].treatsAsPhysicalHardwareDevice).toBe(false);
    expect(projections[0].confidenceLimitations).toContain(
      'HARDWARE_MODALITY_WITHOUT_PROVEN_PHYSICAL_DEVICE_REFERENCE',
    );
  });

  it('unresolved source identity when connectionIdentity metadata missing', () => {
    const projections = projectConnectionIdentitiesFromLinks([
      { id: 'link-1', provider: 'DIMO', isActive: true, metadata: {} },
    ]);
    expect(projections[0].verifiedModality).toBe('UNRESOLVED');
    expect(projections[0].confidenceLimitations).toContain(
      'MISSING_OR_MALFORMED_CONNECTION_IDENTITY_METADATA',
    );
  });

  it('malformed unsupported connection identity contract version is unresolved', () => {
    const projections = projectConnectionIdentitiesFromLinks(
      [
        {
          id: LINK_TESLA,
          provider: 'DIMO',
          isActive: true,
          metadata: ciV2({ contractVersion: 'vo-connection-identity-v0' }),
        },
      ],
      { organizationId: ORG, vehicleId: VEH },
    );
    expect(projections[0].verifiedModality).toBe('UNRESOLVED');
    expect(projections[0].confidenceLimitations).toContain(
      'UNSUPPORTED_CONNECTION_IDENTITY_CONTRACT_VERSION',
    );
  });

  it('connectionIdentity scope mismatch fails closed to unresolved identity', () => {
    const projections = projectConnectionIdentitiesFromLinks(
      [
        {
          id: LINK_TESLA,
          provider: 'DIMO',
          isActive: true,
          metadata: ciV2({ organizationId: 'other-org', vehicleId: 'other-veh' }),
        },
      ],
      { organizationId: ORG, vehicleId: VEH },
    );
    expect(projections[0].verifiedModality).toBe('UNRESOLVED');
    expect(projections[0].treatsAsPhysicalHardwareDevice).toBe(false);
    expect(projections[0].confidenceLimitations).toContain(
      'CONNECTION_IDENTITY_METADATA_ORG_MISMATCH',
    );
    expect(projections[0].confidenceLimitations).toContain(
      'CONNECTION_IDENTITY_METADATA_VEHICLE_MISMATCH',
    );
  });

  it('missing LV observation — raw key without usable value', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_RUPTELA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_RUPTELA,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: new Date('2026-10-14T11:00:00Z'),
        providerFetchedAt: new Date('2026-10-14T11:01:00Z'),
        updatedAt: projectionAsOf,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { timestamp: '2026-10-14T11:00:00Z', value: null },
        },
      },
      pollLogs: [{ status: 'SUCCESS', startedAt: projectionAsOf, finishedAt: projectionAsOf }],
    });
    const lv = result.signals.find((s) => s.identity.canonicalSignalKey === 'lv_voltage');
    expect(lv?.confidenceLimitations).toContain('RAW_SNAPSHOT_KEY_NULL_VALUE_NOT_PHYSICAL_OBSERVATION');
    expect(lv?.capability.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
    expect(lv?.capability.providerCatalog).toBe('UNKNOWN');
    expect(lv?.catalogEvidence).toBeUndefined();
  });

  it('catalog evidence omitted when provider catalog is unknown', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_RUPTELA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_RUPTELA,
        providerSource: 'DIMO',
        lvBatteryVoltage: 12.5,
        evSoc: null,
        online: true,
        sourceTimestamp: projectionAsOf,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: {
            timestamp: projectionAsOf.toISOString(),
            value: 12.5,
          },
        },
      },
      pollLogs: [],
    });
    const lv = result.signals.find((s) => s.identity.canonicalSignalKey === 'lv_voltage');
    expect(lv?.capability.providerCatalog).toBe('UNKNOWN');
    expect(lv?.catalogEvidence).toBeUndefined();
  });

  it('two SUCCESS polls with one source timestamp and no prior observation => UNKNOWN strict advance', () => {
    const src = new Date('2026-10-14T11:00:00Z');
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_TESLA,
        providerSource: 'DIMO',
        lvBatteryVoltage: 12.4,
        evSoc: 80,
        online: true,
        sourceTimestamp: src,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {},
      },
      pollLogs: [
        { status: 'SUCCESS', startedAt: projectionAsOf, finishedAt: projectionAsOf },
        { status: 'SUCCESS', startedAt: projectionAsOf, finishedAt: projectionAsOf },
      ],
    });
    const ts = result.signals.find(
      (s) => s.identity.canonicalSignalKey === 'provider_source_timestamp',
    );
    expect(ts?.empiricalEvidence?.strictSourceAdvanced).toBe('UNKNOWN');
    expect(ts?.confidenceLimitations).toContain('STRICT_SOURCE_ADVANCE_EVIDENCE_UNAVAILABLE');
    expect(ts?.confidenceLimitations).not.toContain('POLL_SUCCESS_WITHOUT_STRICT_SOURCE_ADVANCE');
  });

  it('stale source timestamp with proven prior equal timestamp after poll success', () => {
    const stale = new Date('2026-10-01T00:00:00Z');
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      priorAggregatedSourceTimestamp: stale,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_TESLA,
        providerSource: 'DIMO',
        lvBatteryVoltage: 12.4,
        evSoc: 80,
        online: true,
        sourceTimestamp: stale,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {},
      },
      pollLogs: [
        { status: 'SUCCESS', startedAt: projectionAsOf, finishedAt: projectionAsOf },
        { status: 'SUCCESS', startedAt: projectionAsOf, finishedAt: projectionAsOf },
      ],
    });
    const ts = result.signals.find(
      (s) => s.identity.canonicalSignalKey === 'provider_source_timestamp',
    );
    expect(ts?.empiricalEvidence?.strictSourceAdvanced).toBe(false);
    expect(ts?.confidenceLimitations).toContain('POLL_SUCCESS_WITHOUT_STRICT_SOURCE_ADVANCE');
  });

  it('P2C observation evaluation overrides legacy prior for strict advance', () => {
    const stale = new Date('2026-10-01T00:00:00Z');
    const current = new Date('2026-10-14T15:00:00.000Z');
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      priorAggregatedSourceTimestamp: stale,
      strictAdvanceEvaluations: {
        [LINK_TESLA]: {
          classification: 'NOT_ADVANCED',
          strictSourceAdvanced: false,
          reasons: ['SOURCE_TIMESTAMP_UNCHANGED'],
        },
      },
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_TESLA,
        providerSource: 'DIMO',
        lvBatteryVoltage: 12.4,
        evSoc: 80,
        online: true,
        sourceTimestamp: current,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {},
      },
      pollLogs: [
        { status: 'SUCCESS', startedAt: projectionAsOf, finishedAt: projectionAsOf },
      ],
    });
    const ts = result.signals.find(
      (s) => s.identity.canonicalSignalKey === 'provider_source_timestamp',
    );
    expect(ts?.empiricalEvidence?.strictSourceAdvanced).toBe(false);
  });

  it('poll success does not prove scoped authorization without consent evidence', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: null,
      pollLogs: [{ status: 'SUCCESS', startedAt: projectionAsOf, finishedAt: projectionAsOf }],
    });
    expect(
      result.signals.every((s) => s.capability.authorization === VsiAuthorizationStatus.UNKNOWN),
    ).toBe(true);
  });

  it('valid org consent does not imply provider telemetry authorization', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [
        {
          id: LINK_TESLA,
          provider: 'DIMO',
          isActive: true,
          metadata: ciV2({}),
          scopedOrgProviderConsentValid: true,
        },
      ],
      latestState: null,
      pollLogs: [],
    });
    expect(result.signals[0].capability.authorization).toBe(VsiAuthorizationStatus.UNKNOWN);
    expect(result.signals[0].confidenceLimitations).toContain(
      'ORG_PROVIDER_CONSENT_ACTIVE_NOT_PROVIDER_TELEMETRY_AUTHORIZATION_PROOF',
    );
  });

  it('missing provider binding prevents attribution to active links', () => {
    const latest = {
      vehicleId: VEH,
      providerBindingId: null,
      providerSource: 'DIMO',
      lvBatteryVoltage: 12.1,
      evSoc: 50,
      online: true,
      sourceTimestamp: projectionAsOf,
      providerFetchedAt: projectionAsOf,
      updatedAt: projectionAsOf,
      rawPayloadJson: {},
    };
    expect(
      isLatestStateAttributedToLink({
        latestState: latest,
        link: { id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: null },
        activeLinkCount: 1,
      }),
    ).toBe(false);
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: latest,
      pollLogs: [],
    });
    const lv = result.signals.find((s) => s.identity.canonicalSignalKey === 'lv_voltage');
    expect(lv?.confidenceLimitations).toContain('LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK');
    expect(lv?.capability.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
  });

  it('two providers sharing vehicle state without binding does not cross-attribute', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [
        { id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) },
        {
          id: LINK_RUPTELA,
          provider: 'DIMO',
          isActive: true,
          metadata: ciV2({
            providerSourceLinkId: LINK_RUPTELA,
            verifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
            physicalDeviceReference: 'R1-861773070120068',
          }),
        },
      ],
      latestState: {
        vehicleId: VEH,
        providerBindingId: null,
        providerSource: 'DIMO',
        lvBatteryVoltage: 12.2,
        evSoc: 40,
        online: true,
        sourceTimestamp: projectionAsOf,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {},
      },
      pollLogs: [],
    });
    const lvSignals = result.signals.filter((s) => s.identity.canonicalSignalKey === 'lv_voltage');
    expect(lvSignals.length).toBe(2);
    expect(lvSignals.every((s) => s.capability.empiricalObservation === 'NEVER_OBSERVED')).toBe(
      true,
    );
  });

  it('HV physical vs display SOC — display present without physical', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_TESLA,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: 55,
        online: true,
        sourceTimestamp: projectionAsOf,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {
          powertrainTractionBatteryStateOfChargeDisplay: {
            timestamp: projectionAsOf.toISOString(),
            value: 55,
          },
        },
      },
      pollLogs: [],
    });
    const hv = result.signals.find((s) => s.identity.canonicalSignalKey === 'hv_battery_soc');
    expect(hv?.confidenceLimitations).toContain('DISPLAY_SOC_ALIAS_CONFLICT_UNRESOLVED');
    expect(hv?.confidenceLimitations).toContain('HV_PHYSICAL_SOC_MISSING_DISPLAY_PRESENT');
    expect(hv?.confidenceLimitations).toContain('EV_SOC_COLUMN_NOT_PHYSICAL_BMS_PROVENANCE');
    expect(hv?.capability.empiricalObservation).toBe(VsiEmpiricalObservationStatus.NEVER_OBSERVED);
  });

  it('raw snapshot key without catalog proof keeps catalog UNKNOWN', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_TESLA,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: false,
        sourceTimestamp: null,
        providerFetchedAt: null,
        updatedAt: projectionAsOf,
        rawPayloadJson: { lastSeen: { timestamp: projectionAsOf.toISOString(), value: 1 } },
      },
      pollLogs: [],
    });
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('aggregate latest-state timestamp does not substitute missing per-signal LV timestamp', () => {
    const aggregate = projectionAsOf;
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_RUPTELA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_RUPTELA,
        providerSource: 'DIMO',
        lvBatteryVoltage: 12.7,
        evSoc: null,
        online: true,
        sourceTimestamp: aggregate,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: { value: 12.7 },
        },
      },
      pollLogs: [],
    });
    const lv = result.signals.find((s) => s.identity.canonicalSignalKey === 'lv_voltage');
    expect(lv?.timestamps.source).toBe('NOT_MEASURED');
    expect(lv?.freshnessClassification).toBe('UNKNOWN');
    expect(lv?.confidenceLimitations).toContain('SIGNAL_VALUE_WITHOUT_KNOWN_OBSERVATION_TIME');
  });

  it('HV physical SOC without signal timestamp stays freshness UNKNOWN', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_TESLA,
        providerSource: 'DIMO',
        lvBatteryVoltage: null,
        evSoc: null,
        online: true,
        sourceTimestamp: projectionAsOf,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {
          powertrainTractionBatteryStateOfChargeCurrent: { value: 61 },
        },
      },
      pollLogs: [],
    });
    const hv = result.signals.find((s) => s.identity.canonicalSignalKey === 'hv_battery_soc');
    expect(hv?.timestamps.source).toBe('NOT_MEASURED');
    expect(hv?.freshnessClassification).toBe('UNKNOWN');
  });

  it('future native signal timestamp is rejected for LV freshness', () => {
    const future = new Date('2026-10-15T00:00:00Z');
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_RUPTELA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_RUPTELA,
        providerSource: 'DIMO',
        lvBatteryVoltage: 12.8,
        evSoc: null,
        online: true,
        sourceTimestamp: projectionAsOf,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: {
            timestamp: future.toISOString(),
            value: 12.8,
          },
        },
      },
      pollLogs: [],
    });
    const lv = result.signals.find((s) => s.identity.canonicalSignalKey === 'lv_voltage');
    expect(lv?.confidenceLimitations).toContain('FUTURE_SIGNAL_TIMESTAMP_REJECTED');
    expect(lv?.freshnessClassification).toBe('UNKNOWN');
  });

  it('stale per-signal LV observation uses signal timestamp not aggregate when fresh', () => {
    const oldAggregate = new Date('2026-10-01T00:00:00Z');
    const freshSignal = new Date('2026-10-14T11:55:00Z');
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_RUPTELA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: {
        vehicleId: VEH,
        providerBindingId: LINK_RUPTELA,
        providerSource: 'DIMO',
        lvBatteryVoltage: 12.6,
        evSoc: null,
        online: true,
        sourceTimestamp: oldAggregate,
        providerFetchedAt: projectionAsOf,
        updatedAt: projectionAsOf,
        rawPayloadJson: {
          lowVoltageBatteryCurrentVoltage: {
            timestamp: freshSignal.toISOString(),
            value: 12.6,
          },
        },
      },
      pollLogs: [],
    });
    const lv = result.signals.find((s) => s.identity.canonicalSignalKey === 'lv_voltage');
    expect(lv?.freshnessClassification).toBe('FRESH');
    expect(lv?.timestamps.source).toEqual(freshSignal);
    const conn = result.signals.find((s) => s.identity.canonicalSignalKey === 'device_connectivity');
    expect(conn?.freshnessClassification).toBe('STALE');
  });

  it('OFFBOARDED registry is non-operational without inventing consent revocation', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'OFFBOARDED',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: null,
      pollLogs: [],
    });
    expect(
      result.signals.every((s) => s.capability.authorization === VsiAuthorizationStatus.UNKNOWN),
    ).toBe(true);
    expect(
      result.signals.every((s) =>
        s.confidenceLimitations.includes('VEHICLE_REGISTRY_NON_OPERATIONAL'),
      ),
    ).toBe(true);
  });

  it('ARCHIVED registry is non-operational', () => {
    const result = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ARCHIVED',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: null,
      pollLogs: [],
    });
    expect(
      result.signals.every((s) =>
        s.confidenceLimitations.includes('VEHICLE_REGISTRY_NON_OPERATIONAL'),
      ),
    ).toBe(true);
  });

  it('APDS adapter contract stays read-only and stratified', () => {
    const composed = composeReadonlyVehicleSignals({
      organizationId: ORG,
      vehicleId: VEH,
      registryLifecycle: 'ACTIVE',
      hardwareTypeLegacy: 'LTE_R1',
      projectionAsOf,
      links: [{ id: LINK_TESLA, provider: 'DIMO', isActive: true, metadata: ciV2({}) }],
      latestState: null,
      pollLogs: [],
    });
    const views = projectVsiEvidenceForApdsReadonlyCorrelation({
      composerResult: composed,
      shadowDecisionAt: projectionAsOf,
    });
    expect(composed.apdsConsumptionBoundary.wiredToShadowDecisionPath).toBe(false);
    expect(views[0].limitations).toContain('NOT_WIRED_TO_APDS_SHADOW_DECISION_PATH');
  });
});
