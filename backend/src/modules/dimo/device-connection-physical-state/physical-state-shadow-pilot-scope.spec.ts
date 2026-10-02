import { DeviceConnectionPhysicalAuthorityMode } from '@prisma/client';
import { CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV } from '@config/connectivity-physical-state.config';
import {
  CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV,
  CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV,
  loadConnectivityPhysicalStateRuntimeFlagConfig,
  resolveEffectivePhysicalStateRuntimePolicy,
} from '@config/connectivity-physical-state-runtime.config';
import {
  evaluateShadowPilotScopeGate,
  isUnsafePilotShadowFlagConfiguration,
} from './physical-state-shadow-pilot-scope';

const scope = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  provider: 'DIMO',
};

const pilotConfig = {
  ok: true as const,
  scopes: [scope],
  configInvalid: false as const,
};

describe('physical-state-shadow-pilot-scope', () => {
  it('PSG-E allowlisted scope is allowed', () => {
    const decision = evaluateShadowPilotScopeGate({
      scope,
      authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      pilotConfig,
    });
    expect(decision).toEqual({ allowed: true, reason: 'ALLOWED' });
  });

  it('PSG-F different organization is denied', () => {
    const decision = evaluateShadowPilotScopeGate({
      scope: { ...scope, organizationId: 'org-2' },
      authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      pilotConfig,
    });
    expect(decision.reason).toBe('DENIED_SCOPE_NOT_ALLOWLISTED');
  });

  it('PSG-G different vehicle is denied', () => {
    const decision = evaluateShadowPilotScopeGate({
      scope: { ...scope, vehicleId: 'veh-2' },
      authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      pilotConfig,
    });
    expect(decision.reason).toBe('DENIED_SCOPE_NOT_ALLOWLISTED');
  });

  it('PSG-H different provider is denied', () => {
    const decision = evaluateShadowPilotScopeGate({
      scope: { ...scope, provider: 'OTHER' },
      authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      pilotConfig,
    });
    expect(decision.reason).toBe('DENIED_SCOPE_NOT_ALLOWLISTED');
  });

  it('PSG-P/Q PHYSICAL authority bypasses pilot gate', () => {
    const missingConfig = evaluateShadowPilotScopeGate({
      scope,
      authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
      pilotConfig: { ok: true, scopes: [], configInvalid: false },
    });
    expect(missingConfig).toEqual({ allowed: true, reason: 'BYPASSED_PHYSICAL_AUTHORITY' });

    const malformed = evaluateShadowPilotScopeGate({
      scope,
      authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
      pilotConfig: { ok: false, scopes: [], configInvalid: true, reason: 'MALFORMED_JSON' },
    });
    expect(malformed.allowed).toBe(true);
  });

  it('PSG-R/S unsafe sideEffects/authorityCutover flags are blocked', () => {
    expect(
      isUnsafePilotShadowFlagConfiguration({ sideEffectsEnabled: true, authorityCutoverEnabled: false }),
    ).toBe('DENIED_UNSAFE_SIDE_EFFECTS_FLAG');
    expect(
      isUnsafePilotShadowFlagConfiguration({ sideEffectsEnabled: false, authorityCutoverEnabled: true }),
    ).toBe('DENIED_UNSAFE_AUTHORITY_CUTOVER_FLAG');
  });

  it('statefulShadow requires pilotScopeAllowed', () => {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV]: 'false',
      [CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED_ENV]: 'false',
    });
    const denied = resolveEffectivePhysicalStateRuntimePolicy({
      authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      flags,
      pilotScopeAllowed: false,
      pilotGateReason: 'DENIED_SCOPE_NOT_ALLOWLISTED',
    });
    expect(denied.statefulShadow).toBe(false);
    const allowed = resolveEffectivePhysicalStateRuntimePolicy({
      authorityMode: DeviceConnectionPhysicalAuthorityMode.LEGACY,
      flags,
      pilotScopeAllowed: true,
      pilotGateReason: 'ALLOWED',
    });
    expect(allowed.statefulShadow).toBe(true);
  });
});
