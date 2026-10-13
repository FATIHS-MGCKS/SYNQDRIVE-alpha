import { buildDimoOnboardingSourceSnapshot } from '../adapters/dimo-onboarding-source.adapter';
import { buildHmOnboardingSourceSnapshot } from '../adapters/high-mobility-onboarding-source.adapter';
import { buildManualOnboardingSourceSnapshot } from '../adapters/manual-onboarding-source.adapter';
import {
  VehicleConnectionModality,
  assessTelemetryConnectionIdentityForActivation,
  assertHardwareDeviceBindingForActivation,
  detectConflictingProviderIdentity,
  getVerifiedModalityFromSnapshot,
  proposeDefaultConnectionModality,
  verifyDimoConnectionFromMirrorEvidence,
} from '../connection-identity';
import { assertHardwareDeviceBindingFromEvidence } from '../connection-identity/activation-connection-identity.assertions';
import type { VehicleOnboardingCaseSourceRef } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

const org = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const R1_JSON = { aftermarketDevice: { serial: 'R1-FLEET-001' } };
const TESLA_JSON = { syntheticDevice: { integration: 'tesla' } };

function refFromSnapshot(
  snap: ReturnType<typeof buildDimoOnboardingSourceSnapshot>,
  provider: string,
  id = 'ref-1',
): VehicleOnboardingCaseSourceRef {
  return {
    id,
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
    isPrimary: provider === 'DIMO',
    snapshotMetadataJson: snap as unknown as VehicleOnboardingCaseSourceRef['snapshotMetadataJson'],
    snapshotMetadataVersion: 1,
    createdAt: new Date(),
  };
}

describe('VO-SIG-01 P1 connection identity', () => {
  it('1. DIMO R1 with valid hardware binding verifies HARDWARE_DEVICE', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd1',
      externalId: '187361',
      vin: 'VIN',
      make: 'Audi',
      model: 'A4',
      year: 2021,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
      rawJson: R1_JSON,
    });
    expect(getVerifiedModalityFromSnapshot(snap)).toBe(VehicleConnectionModality.HARDWARE_DEVICE);
    expect(assessTelemetryConnectionIdentityForActivation([refFromSnapshot(snap, 'DIMO')]).ok).toBe(
      true,
    );
  });

  it('2. DIMO hardware without binding evidence fails verification', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd2',
      externalId: '999',
      vin: 'VIN',
      make: 'VW',
      model: 'Tiguan',
      year: 2022,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
      rawJson: null,
    });
    expect(getVerifiedModalityFromSnapshot(snap)).toBeNull();
    const verdict = assessTelemetryConnectionIdentityForActivation([refFromSnapshot(snap, 'DIMO')]);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reasonCode).toBe('CONNECTION_MODALITY_UNVERIFIED');
  });

  it('3. Tesla OEM/software verified via API_SYNTHETIC rawJson', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd3',
      externalId: '186946',
      vin: 'VIN',
      make: 'Tesla',
      model: 'Model 3',
      year: 2024,
      fuelType: 'ELECTRIC',
      updatedAt: new Date(),
      rawJson: TESLA_JSON,
    });
    expect(getVerifiedModalityFromSnapshot(snap)).toBe(
      VehicleConnectionModality.SOFTWARE_INTEGRATION,
    );
  });

  it('4. Tesla make-only inference does not verify (proposed UNKNOWN)', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd4',
      externalId: '186946',
      vin: 'VIN',
      make: 'Tesla',
      model: 'Model 3',
      year: 2024,
      fuelType: 'ELECTRIC',
      updatedAt: new Date(),
      rawJson: null,
    });
    expect(proposeDefaultConnectionModality(snap)).toBe(
      VehicleConnectionModality.UNKNOWN_REQUIRES_REVIEW,
    );
    expect(getVerifiedModalityFromSnapshot(snap)).toBeNull();
  });

  it('5. High Mobility with approved clearance verifies OEM_CLOUD', () => {
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
        organizationId: org,
      },
      org,
    );
    expect(getVerifiedModalityFromSnapshot(snap)).toBe(VehicleConnectionModality.OEM_CLOUD);
  });

  it('6. DIMO + HM retains distinct per-provider verified modalities', () => {
    const dimoSnap = buildDimoOnboardingSourceSnapshot({
      id: 'd5',
      externalId: '187784',
      vin: 'VIN',
      make: 'VW',
      model: 'Arteon',
      year: 2020,
      fuelType: 'DIESEL',
      updatedAt: new Date(),
      rawJson: R1_JSON,
    });
    const hmSnap = buildHmOnboardingSourceSnapshot(
      {
        id: 'hm-2',
        vin: 'VIN',
        brand: 'VW',
        hmVehicleReference: 'hm-ref-2',
        clearanceStatus: 'APPROVED',
        sourceMode: 'DIMO_PLUS_HM',
        packageType: 'HEALTH',
        appContainerType: 'HM_HEALTH_APP',
        updatedAt: new Date(),
        organizationId: org,
      },
      org,
    );
    const verdict = assessTelemetryConnectionIdentityForActivation([
      refFromSnapshot(dimoSnap, 'DIMO', 'r-dimo'),
      refFromSnapshot(hmSnap, 'HIGH_MOBILITY', 'r-hm'),
    ]);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.perProvider).toHaveLength(2);
      expect(verdict.perProvider.map((p) => p.provider).sort()).toEqual(['DIMO', 'HIGH_MOBILITY']);
    }
  });

  it('7. Conflicting DIMO source identities fail', () => {
    expect(
      detectConflictingProviderIdentity([
        refFromSnapshot(
          buildDimoOnboardingSourceSnapshot({
            id: 'a',
            externalId: '1',
            vin: null,
            make: null,
            model: null,
            year: null,
            fuelType: null,
            updatedAt: new Date(),
            rawJson: R1_JSON,
          }),
          'DIMO',
          'r1',
        ),
        refFromSnapshot(
          buildDimoOnboardingSourceSnapshot({
            id: 'b',
            externalId: '2',
            vin: null,
            make: null,
            model: null,
            year: null,
            fuelType: null,
            updatedAt: new Date(),
            rawJson: R1_JSON,
          }),
          'DIMO',
          'r2',
        ),
      ]),
    ).toContain('CONFLICTING_PROVIDER_IDENTITY:DIMO');
  });

  it('8. Unverified modality fails connected readiness assess', () => {
    const snap = buildDimoOnboardingSourceSnapshot({
      id: 'd6',
      externalId: 'x',
      vin: null,
      make: 'VW',
      model: 'x',
      year: 2020,
      fuelType: null,
      updatedAt: new Date(),
      rawJson: null,
    });
    const verdict = assessTelemetryConnectionIdentityForActivation([refFromSnapshot(snap, 'DIMO')]);
    expect(verdict.ok).toBe(false);
  });

  it('9. Manual non-telemetry registration passes', () => {
    const snap = buildManualOnboardingSourceSnapshot(
      { vin: 'M1', make: 'Ford', model: 'Van', year: 2019, fuelType: 'DIESEL' },
      org,
      'manual:1',
    );
    const verdict = assessTelemetryConnectionIdentityForActivation([
      refFromSnapshot(snap as ReturnType<typeof buildDimoOnboardingSourceSnapshot>, 'MANUAL'),
    ]);
    expect(verdict.ok).toBe(true);
  });

  it('10. Hardware binding requires telemetry source family evidence not JSON boolean', () => {
    expect(() =>
      assertHardwareDeviceBindingFromEvidence(null, refFromSnapshot(
        buildDimoOnboardingSourceSnapshot({
          id: 'd7',
          externalId: '187361',
          vin: 'V',
          make: 'A',
          model: 'B',
          year: 2020,
          fuelType: 'DIESEL',
          updatedAt: new Date(),
          rawJson: R1_JSON,
        }),
        'DIMO',
      ), org),
    ).toThrow(VehicleOnboardingError);
    const live = verifyDimoConnectionFromMirrorEvidence(R1_JSON, '187361');
    expect(live.ok).toBe(true);
    if (live.ok) {
      assertHardwareDeviceBindingFromEvidence(
        live.deviceBindingEvidence,
        refFromSnapshot(
          buildDimoOnboardingSourceSnapshot({
            id: 'd7',
            externalId: '187361',
            vin: 'V',
            make: 'A',
            model: 'B',
            year: 2020,
            fuelType: 'DIESEL',
            updatedAt: new Date(),
            rawJson: R1_JSON,
          }),
          'DIMO',
        ),
        org,
      );
    }
  });

  it('11. Deprecated boolean-only binding guard fails without evidence', () => {
    expect(
      assertHardwareDeviceBindingForActivation({
        contractVersion: 'vo-connection-identity-v1',
        proposedModality: VehicleConnectionModality.HARDWARE_DEVICE,
        verifiedModality: VehicleConnectionModality.HARDWARE_DEVICE,
        modalityVerification: 'VERIFIED_PROVIDER_EVIDENCE',
        provider: 'DIMO',
        providerVehicleReference: '1',
        deviceBindingPresent: true,
      }).ok,
    ).toBe(false);
  });

  it('12. Readiness rule VO-RDY-CONN-001 registered', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../readiness/readiness-rule-engine.ts'),
      'utf8',
    );
    expect(src).toContain('VO-RDY-CONN-001');
    expect(src).toContain('assessTelemetryConnectionIdentityForActivation');
    const classifierSrc = fs.readFileSync(
      path.join(__dirname, '../connection-identity/vehicle-connection-identity.classifier.ts'),
      'utf8',
    );
    expect(classifierSrc).toContain('CONNECTION_MODALITY_UNVERIFIED');
  });

  it('13. Activation service wires connection identity assert', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../services/vehicle-onboarding-activation.service.ts'),
      'utf8',
    );
    expect(src).toContain('assertTelemetryConnectionIdentityForActivationTx');
    expect(src).toContain('assertPersistedSourceLinksMatchSnapshots');
  });

  it('14. EXP021 telemetry source family unchanged (import-only reuse)', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../connection-identity/connection-modality-verification.ts'),
      'utf8',
    );
    expect(src).toContain('resolveTelemetrySourceFamily');
    expect(src).not.toContain('hardwareType');
  });

  it('15. HM provider constant', () => {
    const { HIGH_MOBILITY_DATA_SOURCE_PROVIDER } = require('../connection-identity/high-mobility-data-source-link.contract');
    expect(HIGH_MOBILITY_DATA_SOURCE_PROVIDER).toBe('HIGH_MOBILITY');
  });

  it('16. Backfill sold tokens offboard only', () => {
    const { classifySoldVehicleRepair } = require('../../../../scripts/ops/vo-sig-01-backfill-dry-run.lib.cjs');
    expect(classifySoldVehicleRepair({ dimoExternalId: '187336', registryLifecycle: 'ACTIVE' })).toBe(
      'MANUAL_REVIEW_OFFBOARD',
    );
  });

  it('17. HM provider UNKNOWN repair classification', () => {
    const { classifyLinkProviderRepair } = require('../../../../scripts/ops/vo-sig-01-backfill-dry-run.lib.cjs');
    expect(
      classifyLinkProviderRepair({ provider: 'UNKNOWN', sourceType: 'HIGH_MOBILITY', isActive: true }),
    ).toBe('SAFE_AUTOMATIC');
  });

  it('18. Legacy registration compatibility: unverified dimo mirror stays unverified', () => {
    const result = verifyDimoConnectionFromMirrorEvidence({}, 'ext');
    expect(result.ok).toBe(false);
  });
});
