import { describe, expect, it, vi, afterEach } from 'vitest';
import { evaluateMasterOffboardUiGate, isMasterOffboardUiEnabled } from './vo5c-release-gates';

const DEPLOYED_SHA = 'ab72f574014d6657cac158c253696b7237cdd3e6';

function stubGateEnv(overrides: Record<string, string | undefined>) {
  const base: Record<string, string> = {
    VITE_MASTER_VEHICLE_OFFBOARD_UI: '',
    VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED: '',
    VITE_SYNQDRIVE_DEPLOYED_GIT_SHA: '',
    VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA: '',
  };
  const merged = { ...base, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) {
      vi.stubEnv(key, '');
    } else {
      vi.stubEnv(key, value);
    }
  }
}

describe('evaluateMasterOffboardUiGate (VO5C-P4A dual gate)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('absent flags → OFF', () => {
    stubGateEnv({});
    expect(evaluateMasterOffboardUiGate()).toMatchObject({ enabled: false, uiFlagOn: false });
    expect(isMasterOffboardUiEnabled()).toBe(false);
  });

  it('UI on alone → OFF', () => {
    stubGateEnv({ VITE_MASTER_VEHICLE_OFFBOARD_UI: 'on' });
    expect(evaluateMasterOffboardUiGate().enabled).toBe(false);
  });

  it('malformed attestation SHA → OFF', () => {
    stubGateEnv({
      VITE_MASTER_VEHICLE_OFFBOARD_UI: 'on',
      VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED: 'YES',
      VITE_SYNQDRIVE_DEPLOYED_GIT_SHA: DEPLOYED_SHA,
      VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA: 'not-a-sha',
    });
    expect(evaluateMasterOffboardUiGate().releaseAttestationMatch).toBe(false);
    expect(isMasterOffboardUiEnabled()).toBe(false);
  });

  it('stale attestation SHA → OFF', () => {
    stubGateEnv({
      VITE_MASTER_VEHICLE_OFFBOARD_UI: 'on',
      VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED: 'YES',
      VITE_SYNQDRIVE_DEPLOYED_GIT_SHA: DEPLOYED_SHA,
      VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA: 'cccccccccccccccccccccccccccccccccccccccc',
    });
    expect(evaluateMasterOffboardUiGate().enabled).toBe(false);
  });

  it('valid dual gate → ON', () => {
    stubGateEnv({
      VITE_MASTER_VEHICLE_OFFBOARD_UI: 'on',
      VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED: 'YES',
      VITE_SYNQDRIVE_DEPLOYED_GIT_SHA: DEPLOYED_SHA,
      VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA: DEPLOYED_SHA,
    });
    expect(evaluateMasterOffboardUiGate().enabled).toBe(true);
    expect(isMasterOffboardUiEnabled()).toBe(true);
  });
});
