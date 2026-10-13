import { evaluateMasterVehicleOffboardOwnerMfaException } from './master-vehicle-offboard-owner-mfa-exception.config';

const OWNER_ID = '51cf9144-8aa5-4a19-994a-dc8c9efa6ccb';
const OTHER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('evaluateMasterVehicleOffboardOwnerMfaException', () => {
  const futureMs = Date.now() + 60_000;

  it('default inactive when flag off', () => {
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: false,
      configuredOwnerUserId: OWNER_ID,
      expiresAtMs: futureMs,
      actorUserId: OWNER_ID,
    });
    expect(result.active).toBe(false);
    expect(result.inactiveReason).toBe('DISABLED');
  });

  it('active for configured owner before expiry', () => {
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: true,
      configuredOwnerUserId: OWNER_ID,
      expiresAtMs: futureMs,
      actorUserId: OWNER_ID,
      nowMs: futureMs - 1,
    });
    expect(result.active).toBe(true);
  });

  it('rejects other master admin user id', () => {
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: true,
      configuredOwnerUserId: OWNER_ID,
      expiresAtMs: futureMs,
      actorUserId: OTHER_ID,
      nowMs: futureMs - 1,
    });
    expect(result.active).toBe(false);
    expect(result.inactiveReason).toBe('ACTOR_USER_MISMATCH');
  });

  it('rejects expired window', () => {
    const expiresAtMs = 1_700_000_000_000;
    const result = evaluateMasterVehicleOffboardOwnerMfaException({
      exceptionEnabled: true,
      configuredOwnerUserId: OWNER_ID,
      expiresAtMs,
      actorUserId: OWNER_ID,
      nowMs: expiresAtMs,
    });
    expect(result.inactiveReason).toBe('EXPIRED');
  });
});
