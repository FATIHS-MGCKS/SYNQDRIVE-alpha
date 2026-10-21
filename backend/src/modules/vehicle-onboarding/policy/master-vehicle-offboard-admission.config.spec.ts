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

  it('requires master admin MFA rollout when owner exception inactive', () => {
    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: false,
      actorUserId: '51cf9144-8aa5-4a19-994a-dc8c9efa6ccb',
    });
    expect(result.blockReason).toBe('MFA_ROLLOUT_NOT_ENABLED');
  });

  it('admits via standard MFA rollout path', () => {
    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: true,
    });
    expect(result.admitted).toBe(true);
    expect(result.blockReason).toBeNull();
    expect(result.admissionPath).toBe('STANDARD_MFA_ROLLOUT');
  });

  it('admits owner via temporary MFA exception when rollout off', () => {
    const ownerId = '51cf9144-8aa5-4a19-994a-dc8c9efa6ccb';
    const nowMs = 1_760_000_000_000;
    const activatedAtMs = nowMs - 60_000;
    const expiresAtMs = nowMs + 60 * 60 * 1000;
    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: false,
      actorUserId: ownerId,
      nowMs,
    });
    expect(result.admitted).toBe(false);
    expect(result.blockReason).toBe('MFA_ROLLOUT_NOT_ENABLED');

    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED = 'true';
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID = ownerId;
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT =
      new Date(activatedAtMs).toISOString();
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT =
      new Date(expiresAtMs).toISOString();

    const withException = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: false,
      actorUserId: ownerId,
      nowMs,
    });
    expect(withException.admitted).toBe(true);
    expect(withException.admissionPath).toBe('OWNER_MFA_EXCEPTION');
    expect(withException.ownerMfaExceptionActive).toBe(true);

    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT;
  });

  it('rejects non-owner master admin when exception configured', () => {
    const ownerId = '51cf9144-8aa5-4a19-994a-dc8c9efa6ccb';
    const nowMs = 1_760_000_000_000;
    const activatedAtMs = nowMs - 60_000;
    const expiresAtMs = nowMs + 60 * 60 * 1000;
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED = 'true';
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID = ownerId;
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT =
      new Date(activatedAtMs).toISOString();
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT =
      new Date(expiresAtMs).toISOString();

    const result = evaluateMasterVehicleOffboardHttpAdmission({
      httpAdmissionEnabled: true,
      routeVerified: true,
      attestedReleaseSha: TEST_SHA,
      deployedReleaseSha: TEST_SHA,
      mfaMasterAdminEnabled: false,
      actorUserId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      nowMs,
    });
    expect(result.admitted).toBe(false);
    expect(result.blockReason).toBe('OWNER_MFA_EXCEPTION_USER_MISMATCH');

    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT;
  });
});
