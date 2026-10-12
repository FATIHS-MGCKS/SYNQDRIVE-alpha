import { evaluateMasterVehicleOffboardHttpAdmission } from './master-vehicle-offboard-admission.config';

const TEST_SHA = 'ab72f574014d6657cac158c253696b7237cdd3e6';

describe('evaluateMasterVehicleOffboardHttpAdmission', () => {
  it('default-off when admission flag false', () => {
    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: false,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: true,
    });
    expect(result.admitted).toBe(false);
    expect(result.blockReason).toBe('ADMISSION_DISABLED');
  });

  it('requires route verified attestation', () => {
    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: false,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: true,
    });
    expect(result.blockReason).toBe('ROUTE_NOT_VERIFIED');
  });

  it('requires matching release SHA', () => {
    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: 'cccccccccccccccccccccccccccccccccccccccc',
      mfaMasterAdminEnabled: true,
    });
    expect(result.blockReason).toBe('RELEASE_ATTESTATION_MISMATCH');
  });

  it('requires master admin MFA rollout', () => {
    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: false,
    });
    expect(result.blockReason).toBe('MFA_ROLLOUT_NOT_ENABLED');
  });

  it('admits when all gates satisfied', () => {
    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: true,
    });
    expect(result.admitted).toBe(true);
    expect(result.blockReason).toBeNull();
  });
});
