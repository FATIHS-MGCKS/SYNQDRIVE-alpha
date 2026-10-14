import {
  computeMasterDimoRegistrationPayloadFingerprint,
  mergeMasterDimoPayloadFingerprintIntoReadinessSnapshot,
  readMasterDimoPayloadFingerprintFromReadinessSnapshot,
} from '../master-dimo-registration-payload-fingerprint';
import { assertMasterDimoRegistrationInputSupported } from '../master-dimo-registration-input.policy';
import { VehicleOnboardingError } from '../../errors/vehicle-onboarding.errors';

describe('master-dimo registration payload fingerprint', () => {
  const base = {
    organizationId: 'org-1',
    stationId: null,
    dimoVehicleId: 'dimo-1',
    actorUserId: null,
  };

  it('is stable for equivalent payloads', () => {
    const a = computeMasterDimoRegistrationPayloadFingerprint({
      ...base,
      extraData: { mileageKm: 1000, hardwareType: 'UNKNOWN' },
    });
    const b = computeMasterDimoRegistrationPayloadFingerprint({
      ...base,
      extraData: { hardwareType: 'UNKNOWN', mileageKm: 1000 },
    });
    expect(a).toBe(b);
  });

  it('changes when mileage changes', () => {
    const a = computeMasterDimoRegistrationPayloadFingerprint({
      ...base,
      extraData: { mileageKm: 1000 },
    });
    const b = computeMasterDimoRegistrationPayloadFingerprint({
      ...base,
      extraData: { mileageKm: 2000 },
    });
    expect(a).not.toBe(b);
  });

  it('reads fingerprint extension from readiness snapshot json', () => {
    const fp = computeMasterDimoRegistrationPayloadFingerprint({ ...base });
    expect(
      readMasterDimoPayloadFingerprintFromReadinessSnapshot({
        masterDimoPayloadFingerprintV1: fp,
      }),
    ).toBe(fp);
  });

  it('merges fingerprint into existing readiness snapshot without dropping fields', () => {
    const fp = computeMasterDimoRegistrationPayloadFingerprint({ ...base });
    const merged = mergeMasterDimoPayloadFingerprintIntoReadinessSnapshot(
      { decision: 'READY', blockingFailureCount: 0 },
      fp,
    ) as { decision?: string; masterDimoPayloadFingerprintV1?: string };
    expect(merged.decision).toBe('READY');
    expect(merged.masterDimoPayloadFingerprintV1).toBe(fp);
  });
});

describe('assertMasterDimoRegistrationInputSupported', () => {
  it('rejects engine displacement and cylinder count', () => {
    expect(() =>
      assertMasterDimoRegistrationInputSupported({
        organizationId: 'org-1',
        stationId: null,
        dimoVehicleId: 'dimo-1',
        actorUserId: null,
        extraData: { engineDisplacementCc: 1998, cylinderCount: 4 },
      }),
    ).toThrow(VehicleOnboardingError);
  });
});
