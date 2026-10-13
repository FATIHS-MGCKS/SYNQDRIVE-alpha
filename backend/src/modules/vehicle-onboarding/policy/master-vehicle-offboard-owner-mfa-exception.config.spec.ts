import {
  evaluateMasterVehicleOffboardOwnerMfaException,
  MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_MAX_TTL_MS,
} from './master-vehicle-offboard-owner-mfa-exception.config';

const OWNER_ID = '51cf9144-8aa5-4a19-994a-dc8c9efa6ccb';
const OTHER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('evaluateMasterVehicleOffboardOwnerMfaException', () => {
  const nowMs = 1_760_000_000_000;
  const activatedAtMs = nowMs - 60_000;
  const expiresAtMs = nowMs + 60 * 60 * 1000;

  it('default inactive when flag off', () => {
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: false,
      configuredOwnerUserId: OWNER_ID,
      activatedAtMs,
      expiresAtMs,
      actorUserId: OWNER_ID,
      nowMs,
    });
    expect(result.active).toBe(false);
    expect(result.inactiveReason).toBe('DISABLED');
  });

  it('active for configured owner within 24h activation window', () => {
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: true,
      configuredOwnerUserId: OWNER_ID,
      activatedAtMs,
      expiresAtMs,
      actorUserId: OWNER_ID,
      nowMs,
    });
    expect(result.active).toBe(true);
    expect(MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_MAX_TTL_MS).toBe(86_400_000);
  });

  it('rejects other master admin user id', () => {
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: true,
      configuredOwnerUserId: OWNER_ID,
      activatedAtMs,
      expiresAtMs,
      actorUserId: OTHER_ID,
      nowMs,
    });
    expect(result.active).toBe(false);
    expect(result.inactiveReason).toBe('ACTOR_USER_MISMATCH');
  });

  it('rejects expired window', () => {
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: true,
      configuredOwnerUserId: OWNER_ID,
      activatedAtMs: nowMs - 120_000,
      expiresAtMs: nowMs - 1,
      actorUserId: OWNER_ID,
      nowMs,
    });
    expect(result.inactiveReason).toBe('EXPIRED');
  });

  it('rejects expiry beyond 24h after activation', () => {
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: true,
      configuredOwnerUserId: OWNER_ID,
      activatedAtMs,
      expiresAtMs: activatedAtMs + MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_MAX_TTL_MS + 1,
      actorUserId: OWNER_ID,
      nowMs,
    });
    expect(result.inactiveReason).toBe('EXPIRES_AT_BEYOND_MAX_TTL');
  });

  it('rejects invalid activation timestamp from env', () => {
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED = 'true';
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID = OWNER_ID;
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT = 'not-a-date';
    process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT =
      new Date(expiresAtMs).toISOString();

    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      actorUserId: OWNER_ID,
      nowMs,
    });
    expect(result.inactiveReason).toBe('ACTIVATED_AT_INVALID');

    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ENABLED;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_USER_ID;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ACTIVATED_AT;
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_EXPIRES_AT;
  });
});
