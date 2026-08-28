/**
 * Test fixture — minimal canonical runtime state for service-layer mocks.
 */
import type { VehicleConnectivityRuntimeState } from './domain/connectivity-domain.types';
import { CONNECTIVITY_RUNTIME_STATE_VERSION } from './domain/connectivity-domain.types';
import { classifyConnectivityDiagnostic } from './domain/connectivity-diagnostic-state';

export function mockConnectivityRuntime(
  overrides: Partial<VehicleConnectivityRuntimeState> = {},
): VehicleConnectivityRuntimeState {
  const state: Omit<VehicleConnectivityRuntimeState, 'diagnostic'> & {
    diagnostic?: VehicleConnectivityRuntimeState['diagnostic'];
  } = {
    vehicleId: 'v-1',
    organizationId: 'org-1',
    providerLinkState: 'ACTIVE',
    telemetryState: 'live',
    physicalDeviceState: 'PLUGGED_CONFIRMED',
    dataCoverageState: 'GOOD',
    attentionState: 'NONE',
    overallState: 'TELEMETRY_ACTIVE',
    reasonCodes: ['TELEMETRY_FRESH'],
    lastTelemetryAt: '2026-06-17T11:55:00.000Z',
    lastProviderObservedAt: '2026-06-17T11:55:00.000Z',
    lastReceivedAt: '2026-06-17T11:55:00.000Z',
    lastRecoveryEvidenceAt: null,
    lastRecoveryReceivedAt: null,
    lastRecoveryResolvedAt: null,
    deviceBindingId: 'binding-1',
    activeEpisodeId: null,
    requiresAction: false,
    recommendedAction: 'NONE',
    evidence: {},
    calculatedAt: '2026-06-17T12:00:00.000Z',
    stateVersion: CONNECTIVITY_RUNTIME_STATE_VERSION,
    ...overrides,
  };

  return { ...state, diagnostic: state.diagnostic ?? deriveFixtureDiagnostic(state) };
}

/** Keeps the fixture's diagnostic dimension consistent with its own timestamps. */
function deriveFixtureDiagnostic(
  state: Omit<VehicleConnectivityRuntimeState, 'diagnostic'>,
): VehicleConnectivityRuntimeState['diagnostic'] {
  return classifyConnectivityDiagnostic({
    providerLinkState: state.providerLinkState,
    telemetryState: state.telemetryState,
    lastObservationAt: state.lastTelemetryAt,
    lastProviderFetchAt: state.lastReceivedAt,
    nowMs: Date.parse(state.calculatedAt),
  });
}

export function mockConnectivityRuntimeMap(
  vehicleIds: string[],
  overrides: Partial<VehicleConnectivityRuntimeState> = {},
): Map<string, VehicleConnectivityRuntimeState> {
  const map = new Map<string, VehicleConnectivityRuntimeState>();
  for (const id of vehicleIds) {
    map.set(id, mockConnectivityRuntime({ vehicleId: id, organizationId: 'org-1', ...overrides }));
  }
  return map;
}
