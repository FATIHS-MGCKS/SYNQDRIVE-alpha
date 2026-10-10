import {
  CANONICAL_TINY_VEHICLE_ID,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import {
  DI_S4_GATE6_DRY_RUN_AUTHORIZED_ENV,
  DI_S4_GATE6_PILOT_VEHICLE_CONFIRM_ENV,
  DI_S4_GATE6_TEST_OS_ROOT_ENV,
  DI_S4_GATE6_WRAPPER_ATTESTATION_ENV,
  DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE,
  DI_S4_GATE6_WRAPPER_ACTION_ENV,
  evaluateGate6OsAuthorizationForAction,
} from './di-v0-s4-gate6-os-authorization.lib';

const baseWrapper = {
  [DI_S4_GATE6_WRAPPER_ATTESTATION_ENV]: DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE,
};

describe('Gate-6 OS authorization', () => {
  it('blocks live-open without wrapper attestation', () => {
    const r = evaluateGate6OsAuthorizationForAction('LIVE_OPEN', {
      [DI_S4_GATE6_WRAPPER_ACTION_ENV]: 'LIVE_OPEN',
      [DI_S4_GATE6_PILOT_VEHICLE_CONFIRM_ENV]: CANONICAL_TINY_VEHICLE_ID,
      DI_S4F7AS_TEST_MODE: '1',
      [DI_S4_GATE6_TEST_OS_ROOT_ENV]: '1',
    });
    expect(r.ok).toBe(false);
  });

  it('requires root euid for live-open unless engineering test root flag set', () => {
    const withoutTestRoot = evaluateGate6OsAuthorizationForAction('LIVE_OPEN', {
      ...baseWrapper,
      [DI_S4_GATE6_WRAPPER_ACTION_ENV]: 'LIVE_OPEN',
      [DI_S4_GATE6_PILOT_VEHICLE_CONFIRM_ENV]: CANONICAL_TINY_VEHICLE_ID,
      DI_S4F7AS_TEST_MODE: '0',
    });
    const isRoot = typeof process.geteuid === 'function' && process.geteuid() === 0;
    expect(withoutTestRoot.ok).toBe(isRoot);

    const withTestRoot = evaluateGate6OsAuthorizationForAction('LIVE_OPEN', {
      ...baseWrapper,
      [DI_S4_GATE6_WRAPPER_ACTION_ENV]: 'LIVE_OPEN',
      [DI_S4_GATE6_PILOT_VEHICLE_CONFIRM_ENV]: CANONICAL_TINY_VEHICLE_ID,
      DI_S4F7AS_TEST_MODE: '1',
      [DI_S4_GATE6_TEST_OS_ROOT_ENV]: '1',
    });
    expect(withTestRoot.ok).toBe(true);
  });

  it('accepts dry-run with wrapper + dry authorization', () => {
    const r = evaluateGate6OsAuthorizationForAction('DRY_RUN', {
      ...baseWrapper,
      [DI_S4_GATE6_WRAPPER_ACTION_ENV]: 'DRY_RUN',
      [DI_S4_GATE6_DRY_RUN_AUTHORIZED_ENV]: 'YES',
    });
    expect(r.ok).toBe(true);
  });

  it('env ack alone does not satisfy live-open os check', () => {
    const r = evaluateGate6OsAuthorizationForAction('LIVE_OPEN', {
      ...baseWrapper,
      [DI_S4_GATE6_WRAPPER_ACTION_ENV]: 'LIVE_OPEN',
      DI_S4_GATE6_OPEN_ACK: 'YES',
      DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
    });
    expect(r.ok).toBe(false);
  });
});
