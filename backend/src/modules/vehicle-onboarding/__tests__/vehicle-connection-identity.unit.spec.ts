import { buildDimoOnboardingSourceSnapshot } from '../adapters/dimo-onboarding-source.adapter';
import { buildHmOnboardingSourceSnapshot } from '../adapters/high-mobility-onboarding-source.adapter';
import { buildManualOnboardingSourceSnapshot } from '../adapters/manual-onboarding-source.adapter';
import {
  VehicleConnectionModality,
  assertHardwareDeviceBindingForActivation,
  assessTelemetryConnectionIdentityForActivation,
  detectConflictingProviderIdentity,
  mergeConnectionIdentityIntoBindingMetadata,
  proposeDefaultConnectionModality,
} from '../connection-identity';
import type { VehicleOnboardingCaseSourceRef } from '@prisma/client';

const org = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

function refFromSnapshot(
  snap: ReturnType<typeof buildDimoOnboardingSourceSnapshot>,
  provider: string,
): VehicleOnboardingCaseSourceRef {
  return {
    id: 'ref-1',
    onboardingCaseId: 'case-1',
    provider,
    connectionScope: snap.connectionScope,
    connectionScopeKey: '',
    externalVehicleIdentity: snap.externalVehicleIdentity,
    sourceMirrorTable: snap.sourceMirrorTable,
    sourceMirrorId: snap.sourceMirrorId,
    provenanceAt: null,
    firstSeenAt: null,
    lastSeenAt: null,
    isPrimary: true,
    snapshotMetadataJson: snap as unknown as VehicleOnboardingCaseSourceRef['snapshotMetadataJson'],
    snapshotMetadataVersion: 1,
    createdAt: new Date(),
  };
}

describe('VO-SIG-01 connection identity', () => {
  it('1. DIMO LTE_R1 hardware onboarding proposes HARDWARE_DEVICE modality', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd1',
      externalId: '187361',
      vin: 'WVWZZZ',
      make: 'Volkswagen',
      model: 'Tiguan',
      year: 2022,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
    });
    expect(proposeDefaultConnectionModality(snap)).toBe(VehicleConnectionModality.HARDWARE_DEVICE);
    expect(snap.bindingMetadata).toMatchObject({
      connectionIdentity: { classifiedModality: VehicleConnectionModality.HARDWARE_DEVICE },
    });
  });

  it('2. SMART5 hardware source identification stays HARDWARE_DEVICE (not fuel inferred)', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd2',
      externalId: '192922',
      vin: 'VIN',
      make: 'Audi',
      model: 'A4',
      year: 2021,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
    });
    expect(proposeDefaultConnectionModality(snap)).toBe(VehicleConnectionModality.HARDWARE_DEVICE);
  });

  it('3. Tesla software/OEM DIMO connection proposes SOFTWARE_INTEGRATION', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd3',
      externalId: '186946',
      vin: 'TESLA',
      make: 'Tesla',
      model: 'Model 3',
      year: 2024,
      fuelType: 'ELECTRIC',
      updatedAt: new Date(),
    });
    expect(proposeDefaultConnectionModality(snap)).toBe(
      VehicleConnectionModality.SOFTWARE_INTEGRATION,
    );
  });

  it('4. High Mobility OEM connection proposes OEM_CLOUD', () => {
    const snap = buildHmOnboardingSourceSnapshot(
      {
        id: 'hm-1',
        vin: 'WDD',
        brand: 'Mercedes-Benz',
        hmVehicleReference: 'hm-ref-1',
        clearanceStatus: 'APPROVED',
        sourceMode: 'HM_ONLY',
        packageType: 'HEALTH',
        appContainerType: 'HM_HEALTH_APP',
        updatedAt: new Date(),
      },
      org,
    );
    expect(proposeDefaultConnectionModality(snap)).toBe(VehicleConnectionModality.OEM_CLOUD);
  });

  it('5. DIMO + HM multi-provider vehicle passes connection readiness', () => {
    const dimoSnap = buildDimoOnboardingSourceSnapshot({
      id: 'd4',
      externalId: '187784',
      vin: 'VIN',
      make: 'Volkswagen',
      model: 'Arteon',
      year: 2020,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
    });
    const hmSnap = buildHmOnboardingSourceSnapshot(
      {
        id: 'hm-2',
        vin: 'VIN',
        brand: 'Volkswagen',
        hmVehicleReference: 'hm-ref-2',
        clearanceStatus: 'APPROVED',
        sourceMode: 'DIMO_PLUS_HM',
        packageType: 'HEALTH',
        appContainerType: 'HM_HEALTH_APP',
        updatedAt: new Date(),
      },
      org,
    );
    const verdict = assessTelemetryConnectionIdentityForActivation([
      refFromSnapshot(dimoSnap, 'DIMO'),
      refFromSnapshot(hmSnap, 'HIGH_MOBILITY'),
    ]);
    expect(verdict.ok).toBe(true);
  });

  it('6. Unknown connection modality blocks telemetry activation readiness', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd5',
      externalId: '999',
      vin: null,
      make: 'Unknown',
      model: 'X',
      year: 2020,
      fuelType: null,
      updatedAt: new Date(),
    });
    const unknownSnap = {
      ...snap,
      bindingMetadata: {
        ...snap.bindingMetadata,
        connectionIdentity: {
          ...(snap.bindingMetadata as { connectionIdentity: object }).connectionIdentity,
          classifiedModality: VehicleConnectionModality.UNKNOWN_REQUIRES_REVIEW,
        },
      },
    };
    const verdict = assessTelemetryConnectionIdentityForActivation([
      refFromSnapshot(unknownSnap, 'DIMO'),
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reasonCode: 'CONNECTION_MODALITY_UNKNOWN' });
  });

  it('7. Missing required physical device binding fails activation guard', () => {
    const binding = {
      contractVersion: 'vo-connection-identity-v1' as const,
      classifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
      provider: 'DIMO',
      providerVehicleReference: '187361',
      deviceBindingPresent: 'UNKNOWN' as const,
    };
    const verdict = assertHardwareDeviceBindingForActivation(binding);
    expect(verdict.ok).toBe(false);
  });

  it('8. Manual non-connected registration allows MANUAL_NO_TELEMETRY', () => {
    const snap = buildManualOnboardingSourceSnapshot(
      { vin: 'MANUAL1', make: 'Ford', model: 'Van', year: 2019, fuelType: 'DIESEL' },
      org,
      'manual:1',
    );
    const verdict = assessTelemetryConnectionIdentityForActivation([
      refFromSnapshot(snap as ReturnType<typeof buildDimoOnboardingSourceSnapshot>, 'MANUAL'),
    ]);
    expect(verdict.ok).toBe(true);
    expect(verdict).toMatchObject({
      modality: VehicleConnectionModality.MANUAL_NO_TELEMETRY,
    });
  });

  it('9. Conflicting provider identity detected', () => {
    const conflict = detectConflictingProviderIdentity([
      {
        id: '1',
        onboardingCaseId: 'c',
        provider: 'DIMO',
        connectionScope: null,
        connectionScopeKey: '',
        externalVehicleIdentity: 'a',
        sourceMirrorTable: null,
        sourceMirrorId: '1',
        provenanceAt: null,
        firstSeenAt: null,
        lastSeenAt: null,
        isPrimary: true,
        snapshotMetadataJson: {},
        snapshotMetadataVersion: 0,
        createdAt: new Date(),
      },
      {
        id: '2',
        onboardingCaseId: 'c',
        provider: 'DIMO',
        connectionScope: null,
        connectionScopeKey: '',
        externalVehicleIdentity: 'b',
        sourceMirrorTable: null,
        sourceMirrorId: '2',
        provenanceAt: null,
        firstSeenAt: null,
        lastSeenAt: null,
        isPrimary: false,
        snapshotMetadataJson: {},
        snapshotMetadataVersion: 0,
        createdAt: new Date(),
      },
    ]);
    expect(conflict).toContain('CONFLICTING_PROVIDER_IDENTITY:DIMO');
  });

  it('10. Duplicate provider identity conflict fails readiness assess', () => {
    const snapA = buildDimoOnboardingSourceSnapshot({
      id: 'd6a',
      externalId: '187361',
      vin: 'VIN',
      make: 'VW',
      model: 'Tiguan',
      year: 2022,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
    });
    const snapB = buildDimoOnboardingSourceSnapshot({
      id: 'd6b',
      externalId: '187784',
      vin: 'VIN',
      make: 'VW',
      model: 'Arteon',
      year: 2020,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
    });
    const verdict = assessTelemetryConnectionIdentityForActivation([
      refFromSnapshot(snapA, 'DIMO'),
      refFromSnapshot(snapB, 'DIMO'),
    ]);
    expect(verdict.ok).toBe(false);
  });

  it('11. Invalid snapshot fails readiness assess', () => {
    const verdict = assessTelemetryConnectionIdentityForActivation([
      {
        id: 'bad',
        onboardingCaseId: 'c',
        provider: 'DIMO',
        connectionScope: null,
        connectionScopeKey: '',
        externalVehicleIdentity: 'x',
        sourceMirrorTable: null,
        sourceMirrorId: '1',
        provenanceAt: null,
        firstSeenAt: null,
        lastSeenAt: null,
        isPrimary: true,
        snapshotMetadataJson: { version: 99 },
        snapshotMetadataVersion: 0,
        createdAt: new Date(),
      },
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reasonCode: 'SOURCE_SNAPSHOT_INVALID' });
  });

  it('12. Hardware device binding present passes activation guard', () => {
    const verdict = assertHardwareDeviceBindingForActivation({
      contractVersion: 'vo-connection-identity-v1',
      classifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
      provider: 'DIMO',
      providerVehicleReference: '192922',
      deviceBindingPresent: true,
    });
    expect(verdict.ok).toBe(true);
  });

  it('13. Tenant isolation remains data-access concern (classifier is org-agnostic)', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd7',
      externalId: '1',
      vin: 'VIN',
      make: 'Audi',
      model: 'A4',
      year: 2021,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
    });
    expect(assessTelemetryConnectionIdentityForActivation([refFromSnapshot(snap, 'DIMO')]).ok).toBe(
      true,
    );
  });

  it('14. Does not use Vehicle.hardwareType for modality (snapshot-only)', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd8',
      externalId: '186946',
      vin: 'VIN',
      make: 'Tesla',
      model: 'M3',
      year: 2024,
      fuelType: 'ELECTRIC',
      updatedAt: new Date(),
    });
    expect(proposeDefaultConnectionModality(snap)).not.toBe(VehicleConnectionModality.HARDWARE_DEVICE);
  });

  it('15. HM provider persisted contract constant matches schema intent', () => {
    const { HIGH_MOBILITY_DATA_SOURCE_PROVIDER } = require('../connection-identity/high-mobility-data-source-link.contract');
    expect(HIGH_MOBILITY_DATA_SOURCE_PROVIDER).toBe('HIGH_MOBILITY');
  });

  it('16. Idempotent backfill dry-run helper classifies HM UNKNOWN provider as SAFE_AUTOMATIC', () => {
    const { classifyLinkProviderRepair } = require('../../../../scripts/ops/vo-sig-01-backfill-dry-run.lib.cjs');
    expect(
      classifyLinkProviderRepair({
        provider: 'UNKNOWN',
        sourceType: 'HIGH_MOBILITY',
        isActive: true,
      }),
    ).toBe('SAFE_AUTOMATIC');
  });

  it('17. Sold vehicle tokens are manual review only (no connectivity repair)', () => {
    const { classifySoldVehicleRepair } = require('../../../../scripts/ops/vo-sig-01-backfill-dry-run.lib.cjs');
    expect(classifySoldVehicleRepair({ dimoExternalId: '187336', registryLifecycle: 'ACTIVE' })).toBe(
      'MANUAL_REVIEW_OFFBOARD',
    );
  });

  it('18. Readiness rule engine registers VO-RDY-CONN-001', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../readiness/readiness-rule-engine.ts'),
      'utf8',
    );
    expect(src).toContain('VO-RDY-CONN-001');
  });
});
