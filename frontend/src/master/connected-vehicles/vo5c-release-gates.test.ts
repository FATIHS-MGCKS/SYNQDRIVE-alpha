import { describe, expect, it, vi, afterEach } from 'vitest';
import { evaluateMasterOffboardUiGate, isMasterOffboardUiEnabled } from './vo5c-release-gates';

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('isMasterOffboardUiEnabled (fail-closed)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('absent flags are OFF', () => {
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', '');
    expect(isMasterOffboardUiEnabled()).toBe(false);
  });

  it('UI flag alone is OFF without attestation', () => {
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', 'on');
    expect(isMasterOffboardUiEnabled()).toBe(false);
  });

  it('full attestation enables', () => {
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_UI', 'on');
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED', 'YES');
    vi.stubEnv('VITE_SYNQDRIVE_DEPLOYED_GIT_SHA', SHA_A);
    vi.stubEnv('VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA', SHA_A);
    expect(isMasterOffboardUiEnabled()).toBe(true);
  });

  it('evaluateMasterOffboardUiGate reports mismatch', () => {
    const gate = evaluateMasterOffboardUiGate({
      VITE_MASTER_VEHICLE_OFFBOARD_UI: 'on',
      VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ROUTE_VERIFIED: 'YES',
      VITE_SYNQDRIVE_DEPLOYED_GIT_SHA: SHA_A,
      VITE_MASTER_VEHICLE_OFFBOARD_BACKEND_ATTESTED_SHA: SHA_B,
    });
    expect(gate.enabled).toBe(false);
    expect(gate.releaseAttestationMatch).toBe(false);
  });
});
