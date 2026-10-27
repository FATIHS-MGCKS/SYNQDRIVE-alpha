import { validateVehicleIdentityFieldConfirmations } from './vehicle-identity-confirm.util';
import { buildVehicleIdentityReviewSnapshot } from './vehicle-identity-reconcile.util';

describe('vehicle-identity-confirm.util', () => {
  const capabilities = {
    p2Enabled: true,
    zb1UploadEnabled: false,
    documentStoragePolicyAcknowledged: false,
  };

  it('rejects confirmation when VIN mismatch is not acknowledged', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      dimo: {
        vin: '1HGCM82633A004352',
        make: 'VW',
        model: 'Golf',
        year: 2020,
        fuelType: 'Gasoline',
        motorPowerKw: null,
        displacementCc: null,
      },
      zb1: null,
      manual: null,
      documentExtractionId: null,
      capabilities,
      vinMismatchAcknowledged: false,
    });
    snapshot.vinMismatchBlocked = true;

    const result = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: [{ fieldCode: 'd1Manufacturer', confirmed: true }],
      vinMismatchAcknowledged: false,
      acceptP2AsSystemPower: false,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'VIN_MISMATCH_UNACKNOWLEDGED')).toBe(true);
  });

  it('rejects P.2 as system power', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      dimo: {
        vin: null,
        make: null,
        model: null,
        year: null,
        fuelType: null,
        motorPowerKw: null,
        displacementCc: null,
      },
      zb1: null,
      manual: { motorPowerKw: 110 },
      documentExtractionId: null,
      capabilities,
    });
    const result = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: [{ fieldCode: 'p2NominalPowerKw', confirmed: true }],
      vinMismatchAcknowledged: false,
      acceptP2AsSystemPower: true,
    });
    expect(result.errors.some((e) => e.code === 'P2_SYSTEM_POWER_NOT_ALLOWED')).toBe(true);
  });
});
