/**
 * Operational regressions for DIMO provider-link normalization (O1–O5).
 */
import { assembleVehicleConnectivityRuntimeState } from '../vehicles/connectivity/vehicle-connectivity-runtime-batch.assembler';
import { assembleProviderLinkEvidence } from '../vehicles/connectivity/domain/provider-link-evidence.assembler';
import { ProviderLinkStateBuilder } from '../vehicles/connectivity/domain/provider-link-state.builder';
import { buildVehicleOperationalProjection } from '../vehicles/operational/projection/vehicle-operational-projection.builder';
import {
  fixtureHmueC215,
  fixtureWobL7503,
  fixtureWobL9755,
  FIXTURE_GENERATED_AT,
  FIXTURE_ORG_ID,
} from '../vehicles/operational/projection/vehicle-operational-projection.fixtures';
import {
  BusinessOperationalState,
  HealthEvaluabilityState,
  OperationalAvailabilityState,
} from '../vehicles/operational/projection/vehicle-operational-projection.types';
import {
  DIMO_DATA_SOURCE_PROVIDER,
  DIMO_DATA_SOURCE_SUBTYPE,
  DIMO_DATA_SOURCE_TYPE,
} from './dimo-vehicle-data-source-link.contract';

const NOW = new Date('2026-08-25T12:00:00.000Z').getTime();

function hmueProductionRow(withLink: boolean) {
  return {
    id: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    organizationId: FIXTURE_ORG_ID,
    hardwareType: 'OBD',
    fuelType: 'GASOLINE',
    dimoVehicleId: 'dimo-hmue',
    dimoVehicle: {
      connectionStatus: 'CONNECTED',
      tokenId: 12345,
      lastSignal: new Date('2026-08-24T20:30:48.000Z'),
    },
    latestState: {
      lastSeenAt: new Date('2026-08-24T20:30:48.000Z'),
      providerFetchedAt: new Date('2026-08-24T20:30:48.000Z'),
      sourceTimestamp: new Date('2026-08-24T20:30:48.000Z'),
      providerSource: 'DIMO',
      providerBindingId: withLink ? 'binding-hmue' : null,
      rawPayloadJson: { obdIsPluggedIn: { value: true } },
      latitude: 52.5,
      longitude: 13.4,
      speedKmh: 0,
      odometerKm: 1000,
      fuelLevelRelative: 0.5,
      fuelLevelAbsolute: null,
      evSoc: null,
      obdDtcList: null,
      lastDtcPollAt: null,
    },
    dataSourceLinks: withLink
      ? [
          {
            id: 'binding-hmue',
            sourceType: DIMO_DATA_SOURCE_TYPE,
            sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
            isActive: true,
            provider: DIMO_DATA_SOURCE_PROVIDER,
          },
        ]
      : [],
    providerConsents: [
      {
        organizationId: FIXTURE_ORG_ID,
        provider: 'DIMO',
        status: 'ACTIVE',
        grantedAt: new Date('2026-01-01'),
        expiresAt: null,
        revokedAt: null,
      },
    ],
    deviceConnectionEpisodes: [],
  };
}

function wobProductionRow(vehicleId: string, lastSeenAt: string) {
  return {
    id: vehicleId,
    organizationId: FIXTURE_ORG_ID,
    hardwareType: 'OBD',
    fuelType: 'GASOLINE',
    dimoVehicleId: `dimo-${vehicleId}`,
    dimoVehicle: {
      connectionStatus: 'CONNECTED',
      tokenId: 99,
      lastSignal: new Date(lastSeenAt),
    },
    latestState: {
      lastSeenAt: new Date(lastSeenAt),
      providerFetchedAt: new Date(lastSeenAt),
      sourceTimestamp: new Date(lastSeenAt),
      providerSource: 'DIMO',
      providerBindingId: 'binding-wob',
      rawPayloadJson: {},
      latitude: null,
      longitude: null,
      speedKmh: null,
      odometerKm: null,
      fuelLevelRelative: null,
      fuelLevelAbsolute: null,
      evSoc: null,
      obdDtcList: null,
      lastDtcPollAt: null,
    },
    dataSourceLinks: [
      {
        id: 'binding-wob',
        sourceType: DIMO_DATA_SOURCE_TYPE,
        sourceSubtype: DIMO_DATA_SOURCE_SUBTYPE,
        isActive: true,
        provider: DIMO_DATA_SOURCE_PROVIDER,
      },
    ],
    providerConsents: [
      {
        organizationId: FIXTURE_ORG_ID,
        provider: 'DIMO',
        status: 'ACTIVE',
        grantedAt: new Date('2026-01-01'),
        expiresAt: null,
        revokedAt: null,
      },
    ],
    deviceConnectionEpisodes: [],
  };
}

describe('DIMO provider-link operational regressions', () => {
  const orgAuth = { status: 'ACTIVE', expiresAt: null, revokedAt: null };

  it('O1 — HMÜ semantic case → AVAILABLE after valid link', () => {
    const withoutLink = assembleVehicleConnectivityRuntimeState(
      hmueProductionRow(false) as any,
      orgAuth,
      NOW,
    );
    expect(withoutLink.providerLinkState).toBe('UNKNOWN');

    const withLink = assembleVehicleConnectivityRuntimeState(
      hmueProductionRow(true) as any,
      orgAuth,
      NOW,
    );
    expect(withLink.providerLinkState).toBe('ACTIVE');
    expect(withLink.overallState).toBe('STANDBY');

    const f = fixtureHmueC215();
    const projection = buildVehicleOperationalProjection({
      vehicleId: f.vehicleId,
      organizationId: FIXTURE_ORG_ID,
      generatedAt: FIXTURE_GENERATED_AT,
      businessState: BusinessOperationalState.AVAILABLE,
      connectivity: withLink,
      episodeEvidenceReliable: true,
    });
    expect(projection.operationalAvailability).toBe(OperationalAvailabilityState.AVAILABLE);
  });

  it('O2 — WOB L 7503 → NEEDS_VERIFICATION with valid link', () => {
    const runtime = assembleVehicleConnectivityRuntimeState(
      wobProductionRow('fixture-wob-l-7503', '2026-07-23T14:43:38.000Z') as any,
      orgAuth,
      NOW,
    );
    expect(runtime.providerLinkState).toBe('ACTIVE');
    expect(runtime.overallState).toBe('OFFLINE');

    const f = fixtureWobL7503();
    const projection = buildVehicleOperationalProjection({
      vehicleId: f.vehicleId,
      organizationId: FIXTURE_ORG_ID,
      generatedAt: FIXTURE_GENERATED_AT,
      businessState: f.businessState,
      connectivity: runtime,
      health: f.health,
      episodeEvidenceReliable: f.episodeEvidenceReliable,
    });
    expect(projection.operationalAvailability).toBe(
      OperationalAvailabilityState.NEEDS_VERIFICATION,
    );
  });

  it('O3 — WOB L 9755 → NEEDS_VERIFICATION with valid link', () => {
    const runtime = assembleVehicleConnectivityRuntimeState(
      wobProductionRow('fixture-wob-l-9755', '2026-07-18T13:42:28.000Z') as any,
      orgAuth,
      NOW,
    );
    expect(runtime.providerLinkState).toBe('ACTIVE');
    const f = fixtureWobL9755();
    const projection = buildVehicleOperationalProjection({
      vehicleId: f.vehicleId,
      organizationId: FIXTURE_ORG_ID,
      generatedAt: FIXTURE_GENERATED_AT,
      businessState: f.businessState,
      connectivity: runtime,
      health: f.health,
      episodeEvidenceReliable: f.episodeEvidenceReliable,
    });
    expect(projection.operationalAvailability).toBe(
      OperationalAvailabilityState.NEEDS_VERIFICATION,
    );
  });

  it('O4 — inactive-consent vehicle → not falsely ACTIVE/AVAILABLE', () => {
    const evidence = assembleProviderLinkEvidence({
      organizationId: FIXTURE_ORG_ID,
      vehicleId: 'ks-ms-661',
      nowMs: NOW,
      dimoVehicleId: 'dimo-ks',
      dimoVehicle: { tokenId: 55, connectionStatus: 'CONNECTED' },
      dataSourceLinks: [
        {
          id: 'binding-ks',
          provider: DIMO_DATA_SOURCE_PROVIDER,
          isActive: true,
          organizationId: FIXTURE_ORG_ID,
        },
      ],
      providerConsents: [
        {
          organizationId: FIXTURE_ORG_ID,
          provider: 'DIMO',
          status: 'REVOKED',
          grantedAt: new Date('2026-01-01'),
          expiresAt: null,
          revokedAt: new Date('2026-08-01'),
        },
      ],
      orgAuthorization: orgAuth,
      lastSuccessfulTelemetryAt: new Date('2026-08-25T11:00:00.000Z'),
    });
    const provider = ProviderLinkStateBuilder.build(evidence);
    expect(provider.state).toBe('REVOKED');
    expect(provider.state).not.toBe('ACTIVE');
  });

  it('O5 — provider link fix does not alter Health evaluability', () => {
    const f = fixtureWobL7503();
    const projection = buildVehicleOperationalProjection({
      vehicleId: f.vehicleId,
      organizationId: FIXTURE_ORG_ID,
      generatedAt: FIXTURE_GENERATED_AT,
      businessState: f.businessState,
      connectivity: f.connectivity,
      health: f.health,
      episodeEvidenceReliable: f.episodeEvidenceReliable,
    });
    expect(projection.healthEvaluability).toBe(HealthEvaluabilityState.NOT_EVALUABLE);
  });
});
