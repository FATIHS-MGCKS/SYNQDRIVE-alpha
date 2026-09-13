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
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import {
  authorityModeSurvivesBindingReplacement,
  defaultAuthorityMode,
  isLegacyAuthorityMode,
  isPhysicalAuthorityMode,
  resolveCanonicalGate,
  validateAuthorityTransition,
} from './physical-state-authority.state-machine';

describe('physical-state authority state machine', () => {
  const LEGACY = DeviceConnectionPhysicalAuthorityMode.LEGACY;
  const PHYSICAL = DeviceConnectionPhysicalAuthorityMode.PHYSICAL;

  it('A. default authority mode is LEGACY', () => {
    expect(defaultAuthorityMode()).toBe(LEGACY);
  });

  it('B. LEGACY remains canonical when master=false', () => {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'false',
      [CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV]: 'true',
    });
    const policy = resolveEffectivePhysicalStateRuntimePolicy({ authorityMode: LEGACY, flags });
    expect(policy.canonicalGate).toBe(PhysicalStateCanonicalGate.LEGACY);
    expect(policy.shadowCompareEnabled).toBe(false);
    expect(policy.legacyGateAuthoritative).toBe(true);
  });

  it('C. LEGACY remains canonical with shadow=true (sub-flag gated by master)', () => {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV]: 'true',
    });
    const policy = resolveEffectivePhysicalStateRuntimePolicy({ authorityMode: LEGACY, flags });
    expect(policy.canonicalGate).toBe(PhysicalStateCanonicalGate.LEGACY);
    expect(policy.shadowCompareEnabled).toBe(true);
    expect(policy.authorityMode).toBe(LEGACY);
  });

  it('D. enabling authority-cutover capability does NOT transition authority mode', () => {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED_ENV]: 'true',
    });
    const policy = resolveEffectivePhysicalStateRuntimePolicy({ authorityMode: LEGACY, flags });
    expect(policy.authorityCutoverEnabled).toBe(true);
    expect(policy.authorityMode).toBe(LEGACY);
    expect(policy.canonicalGate).toBe(PhysicalStateCanonicalGate.LEGACY);
  });

  it('E. PHYSICAL authority selects physical canonical gate', () => {
    expect(resolveCanonicalGate(PHYSICAL)).toBe(PhysicalStateCanonicalGate.PHYSICAL);
    expect(isPhysicalAuthorityMode(PHYSICAL)).toBe(true);
    expect(isLegacyAuthorityMode(PHYSICAL)).toBe(false);
  });

  it('F. master=false under PHYSICAL does NOT restore LEGACY gate', () => {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'false',
    });
    const policy = resolveEffectivePhysicalStateRuntimePolicy({ authorityMode: PHYSICAL, flags });
    expect(policy.canonicalGate).toBe(PhysicalStateCanonicalGate.PHYSICAL);
    expect(policy.legacyGateAuthoritative).toBe(false);
    expect(policy.physicalGateAuthoritative).toBe(true);
  });

  it('G. authorityCutover=false under PHYSICAL does NOT restore LEGACY gate', () => {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED_ENV]: 'false',
    });
    const policy = resolveEffectivePhysicalStateRuntimePolicy({ authorityMode: PHYSICAL, flags });
    expect(policy.canonicalGate).toBe(PhysicalStateCanonicalGate.PHYSICAL);
    expect(policy.authorityCutoverEnabled).toBe(false);
  });

  it('H. attempted PHYSICAL -> LEGACY transition rejected', () => {
    const result = validateAuthorityTransition(PHYSICAL, LEGACY);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('PHYSICAL_TO_LEGACY_FORBIDDEN');
    }
  });

  it('I. device/binding replacement semantics do not reset authority mode', () => {
    expect(authorityModeSurvivesBindingReplacement(PHYSICAL)).toBe(PHYSICAL);
    expect(authorityModeSurvivesBindingReplacement(LEGACY)).toBe(LEGACY);
  });

  it('allows LEGACY -> PHYSICAL forward transition', () => {
    const result = validateAuthorityTransition(LEGACY, PHYSICAL);
    expect(result.allowed).toBe(true);
  });

  it('statefulShadow requires LEGACY + projection + shadow + no side effects', () => {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV]: 'false',
    });
    const policy = resolveEffectivePhysicalStateRuntimePolicy({ authorityMode: LEGACY, flags });
    expect(policy.statefulShadow).toBe(true);
  });
});

describe('effective flag resolver truth table', () => {
  const LEGACY = DeviceConnectionPhysicalAuthorityMode.LEGACY;

  it('J. sub-flags are gated by master', () => {
    const off = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'false',
      [CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV]: 'true',
    });
    expect(off.projectionWriteEnabled).toBe(false);
    expect(off.shadowCompareEnabled).toBe(false);
    expect(off.authorityCutoverEnabled).toBe(false);
    expect(off.sideEffectsEnabled).toBe(false);

    const on = loadConnectivityPhysicalStateRuntimeFlagConfig({
      [CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_AUTHORITY_CUTOVER_ENABLED_ENV]: 'true',
      [CONNECTIVITY_PHYSICAL_STATE_SIDE_EFFECTS_ENABLED_ENV]: 'true',
    });
    const policy = resolveEffectivePhysicalStateRuntimePolicy({ authorityMode: LEGACY, flags: on });
    expect(policy.projectionWriteEnabled).toBe(true);
    expect(policy.shadowCompareEnabled).toBe(true);
    expect(policy.authorityCutoverEnabled).toBe(true);
    expect(policy.sideEffectsEnabled).toBe(true);
  });

  it('V. flags OFF preserve current production behavior (all auxiliary off)', () => {
    const flags = loadConnectivityPhysicalStateRuntimeFlagConfig({});
    const policy = resolveEffectivePhysicalStateRuntimePolicy({ authorityMode: LEGACY, flags });
    expect(flags.masterEnabled).toBe(false);
    expect(policy.projectionWriteEnabled).toBe(false);
    expect(policy.shadowCompareEnabled).toBe(false);
    expect(policy.canonicalGate).toBe(PhysicalStateCanonicalGate.LEGACY);
  });
});
