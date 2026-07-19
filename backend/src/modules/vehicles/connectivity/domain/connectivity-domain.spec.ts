import type { TelemetryFreshness } from '../../vehicle-state-interpreter';
import {
  ATTENTION_STATES,
  CONNECTIVITY_REASON_CODES,
  CONNECTIVITY_RUNTIME_STATE_VERSION,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  DATA_COVERAGE_STATES,
  OVERALL_CONNECTIVITY_STATES,
  PHYSICAL_DEVICE_STATES,
  PROVIDER_LINK_STATES,
  ProviderLinkState,
  type VehicleConnectivityRuntimeState,
} from './connectivity-domain.types';
import {
  OVERALL_CONNECTIVITY_STATE_PRIORITY,
  overallConnectivityPriority,
  pickHighestPriorityOverallState,
} from './connectivity-domain.priority';
import {
  isDataCoverageNotApplicable,
  isPhysicalDeviceNotApplicable,
  isProviderLinkIndeterminate,
  validateConnectivityStateCombination,
} from './connectivity-domain.validation';

function baseRuntimeState(
  overrides: Partial<VehicleConnectivityRuntimeState> = {},
): VehicleConnectivityRuntimeState {
  return {
    vehicleId: 'veh-domain-1',
    organizationId: 'org-domain-1',
    providerLinkState: 'ACTIVE',
    telemetryState: 'live',
    physicalDeviceState: 'PLUGGED_CONFIRMED',
    dataCoverageState: 'GOOD',
    attentionState: 'NONE',
    overallState: 'TELEMETRY_ACTIVE',
    reasonCodes: [ConnectivityReasonCode.TELEMETRY_FRESH],
    lastTelemetryAt: '2026-07-18T12:00:00.000Z',
    lastProviderObservedAt: '2026-07-18T12:00:00.000Z',
    lastReceivedAt: '2026-07-18T12:00:01.000Z',
    deviceBindingId: 'binding-ref-1',
    activeEpisodeId: null,
    requiresAction: false,
    recommendedAction: ConnectivityRecommendedAction.NONE,
    evidence: {},
    calculatedAt: '2026-07-18T12:00:02.000Z',
    stateVersion: CONNECTIVITY_RUNTIME_STATE_VERSION,
    ...overrides,
  };
}

describe('connectivity domain types', () => {
  it('exports stable enum value sets', () => {
    expect(PROVIDER_LINK_STATES).toEqual([
      'ACTIVE',
      'REAUTH_REQUIRED',
      'REVOKED',
      'NO_LINK',
      'ERROR',
      'UNKNOWN',
    ]);
    expect(PHYSICAL_DEVICE_STATES).toContain('NOT_APPLICABLE');
    expect(DATA_COVERAGE_STATES).toContain('NOT_APPLICABLE');
    expect(ATTENTION_STATES).toEqual([
      'NONE',
      'WATCH',
      'ACTION_REQUIRED',
      'CRITICAL',
    ]);
    expect(OVERALL_CONNECTIVITY_STATES).toContain('DEVICE_UNPLUGGED');
    expect(OVERALL_CONNECTIVITY_STATES).toContain('SOFT_OFFLINE');
  });

  it('does not define a duplicate telemetry enum — uses TelemetryFreshness', () => {
    const telemetry: TelemetryFreshness = 'signal_delayed';
    const state = baseRuntimeState({ telemetryState: telemetry });
    expect(state.telemetryState).toBe('signal_delayed');
  });

  it('lists all required reason codes', () => {
    expect(CONNECTIVITY_REASON_CODES).toEqual(
      expect.arrayContaining([
        'TELEMETRY_FRESH',
        'TELEMETRY_SOFT_OFFLINE',
        'DEVICE_UNPLUG_WEBHOOK',
        'DEVICE_RECONNECTED_SNAPSHOT',
        'AUTHORIZATION_EXPIRED',
        'STATE_CONFLICT',
        'MANUAL_REVIEW_REQUIRED',
      ]),
    );
    expect(CONNECTIVITY_REASON_CODES).toHaveLength(19);
  });

  it('stores machine codes only — no user-facing label fields on runtime state', () => {
    const state = baseRuntimeState();
    const keys = Object.keys(state);
    expect(keys).not.toContain('label');
    expect(keys).not.toContain('statusNote');
    expect(keys).not.toContain('message');
    expect(keys).not.toContain('description');
  });

  it('separates state, reason codes, recommended action, and evidence', () => {
    const state = baseRuntimeState({
      reasonCodes: [
        ConnectivityReasonCode.TELEMETRY_FRESH,
        ConnectivityReasonCode.DATA_COVERAGE_PARTIAL,
      ],
      recommendedAction: ConnectivityRecommendedAction.MONITOR,
      evidence: { signalCoveragePercent: 72, openUnpluggedEpisode: false },
    });
    expect(state.overallState).toBe('TELEMETRY_ACTIVE');
    expect(state.reasonCodes).toHaveLength(2);
    expect(state.recommendedAction).toBe('MONITOR');
    expect(state.evidence.signalCoveragePercent).toBe(72);
  });
});

describe('connectivity domain priority', () => {
  it('ranks integration error above authorization and unplug', () => {
    expect(overallConnectivityPriority('INTEGRATION_ERROR')).toBeLessThan(
      overallConnectivityPriority('AUTHORIZATION_REQUIRED'),
    );
    expect(overallConnectivityPriority('AUTHORIZATION_REQUIRED')).toBeLessThan(
      overallConnectivityPriority('DEVICE_UNPLUGGED'),
    );
    expect(overallConnectivityPriority('DEVICE_UNPLUGGED')).toBeLessThan(
      overallConnectivityPriority('OFFLINE'),
    );
    expect(overallConnectivityPriority('OFFLINE')).toBeLessThan(
      overallConnectivityPriority('SOFT_OFFLINE'),
    );
    expect(overallConnectivityPriority('SOFT_OFFLINE')).toBeLessThan(
      overallConnectivityPriority('UNKNOWN'),
    );
    expect(overallConnectivityPriority('UNKNOWN')).toBeLessThan(
      overallConnectivityPriority('STANDBY'),
    );
    expect(overallConnectivityPriority('STANDBY')).toBeLessThan(
      overallConnectivityPriority('TELEMETRY_ACTIVE'),
    );
  });

  it('documents full priority map for all overall states', () => {
    for (const state of OVERALL_CONNECTIVITY_STATES) {
      expect(typeof OVERALL_CONNECTIVITY_STATE_PRIORITY[state]).toBe('number');
    }
  });

  it('pickHighestPriorityOverallState selects critical integration over standby', () => {
    expect(
      pickHighestPriorityOverallState(['STANDBY', 'INTEGRATION_ERROR', 'TELEMETRY_ACTIVE']),
    ).toBe('INTEGRATION_ERROR');
  });

  it('pickHighestPriorityOverallState returns UNKNOWN for empty input', () => {
    expect(pickHighestPriorityOverallState([])).toBe('UNKNOWN');
  });
});

describe('connectivity domain validation', () => {
  it('accepts coherent telemetry-active snapshot', () => {
    const result = validateConnectivityStateCombination(baseRuntimeState());
    expect(result.valid).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('flags DEVICE_UNPLUGGED with NOT_APPLICABLE physical device', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        overallState: 'DEVICE_UNPLUGGED',
        physicalDeviceState: 'NOT_APPLICABLE',
        reasonCodes: [ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.conflicts).toContain(ConnectivityReasonCode.STATE_CONFLICT);
  });

  it('flags DEVICE_UNPLUGGED with plugged physical state', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        overallState: 'DEVICE_UNPLUGGED',
        physicalDeviceState: 'PLUGGED_CONFIRMED',
      }),
    );
    expect(result.conflicts).toContain(ConnectivityReasonCode.STATE_CONFLICT);
  });

  it('flags TELEMETRY_ACTIVE with offline telemetry', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        overallState: 'TELEMETRY_ACTIVE',
        telemetryState: 'offline',
        reasonCodes: [ConnectivityReasonCode.TELEMETRY_OFFLINE],
      }),
    );
    expect(result.conflicts).toContain(ConnectivityReasonCode.STATE_CONFLICT);
  });

  it('flags NO_LINK provider with TELEMETRY_ACTIVE overall', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        providerLinkState: 'NO_LINK',
        overallState: 'TELEMETRY_ACTIVE',
        reasonCodes: [ConnectivityReasonCode.NO_ACTIVE_PROVIDER_LINK],
      }),
    );
    expect(result.conflicts).toContain(ConnectivityReasonCode.STATE_CONFLICT);
  });

  it('flags unplug webhook reason when physical device is NOT_APPLICABLE', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        physicalDeviceState: 'NOT_APPLICABLE',
        reasonCodes: [ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK],
      }),
    );
    expect(result.conflicts).toContain(ConnectivityReasonCode.STATE_CONFLICT);
  });

  it('requires auth reason when provider is REAUTH_REQUIRED', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        providerLinkState: 'REAUTH_REQUIRED',
        reasonCodes: [ConnectivityReasonCode.TELEMETRY_FRESH],
      }),
    );
    expect(result.conflicts).toContain(
      ConnectivityReasonCode.MANUAL_REVIEW_REQUIRED,
    );
  });

  it('allows multiple reason codes when dimensions are coherent', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        telemetryState: 'signal_delayed',
        overallState: 'SOFT_OFFLINE',
        dataCoverageState: 'PARTIAL',
        attentionState: 'WATCH',
        requiresAction: false,
        reasonCodes: [
          ConnectivityReasonCode.TELEMETRY_SOFT_OFFLINE,
          ConnectivityReasonCode.DATA_COVERAGE_PARTIAL,
        ],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('flags attention ACTION_REQUIRED without requiresAction', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        attentionState: 'CRITICAL',
        requiresAction: false,
      }),
    );
    expect(result.conflicts).toContain(ConnectivityReasonCode.STATE_CONFLICT);
  });
});

describe('connectivity domain helpers', () => {
  it('isPhysicalDeviceNotApplicable identifies OEM-only paths', () => {
    expect(isPhysicalDeviceNotApplicable('NOT_APPLICABLE')).toBe(true);
    expect(isPhysicalDeviceNotApplicable('UNKNOWN')).toBe(false);
  });

  it('isDataCoverageNotApplicable identifies skipped coverage', () => {
    expect(isDataCoverageNotApplicable('NOT_APPLICABLE')).toBe(true);
    expect(isDataCoverageNotApplicable('GOOD')).toBe(false);
  });

  it('isProviderLinkIndeterminate covers UNKNOWN and ERROR', () => {
    expect(isProviderLinkIndeterminate('UNKNOWN')).toBe(true);
    expect(isProviderLinkIndeterminate('ERROR')).toBe(true);
    expect(isProviderLinkIndeterminate('ACTIVE')).toBe(false);
  });
});

describe('unknown dimension handling', () => {
  it('supports UNKNOWN provider link with UNKNOWN overall', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        providerLinkState: 'UNKNOWN',
        telemetryState: 'no_signal',
        physicalDeviceState: 'UNKNOWN',
        dataCoverageState: 'UNKNOWN',
        overallState: 'UNKNOWN',
        reasonCodes: [ConnectivityReasonCode.NO_TELEMETRY_TIMESTAMP],
      }),
    );
    expect(result.valid).toBe(true);
  });

  it('supports NOT_APPLICABLE physical + data coverage for non-OBD vehicle', () => {
    const result = validateConnectivityStateCombination(
      baseRuntimeState({
        physicalDeviceState: 'NOT_APPLICABLE',
        dataCoverageState: 'NOT_APPLICABLE',
        overallState: 'STANDBY',
        telemetryState: 'standby',
        reasonCodes: [ConnectivityReasonCode.TELEMETRY_STANDBY],
      }),
    );
    expect(result.valid).toBe(true);
    expect(isPhysicalDeviceNotApplicable('NOT_APPLICABLE')).toBe(true);
    expect(isDataCoverageNotApplicable('NOT_APPLICABLE')).toBe(true);
  });
});
