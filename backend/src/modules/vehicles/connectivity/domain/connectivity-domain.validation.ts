/**
 * Connectivity domain invariants — impossible / conflicting dimension combinations.
 *
 * Returns machine-readable reason codes; never user-facing strings.
 */
import {
  AttentionState,
  ConnectivityReasonCode,
  DataCoverageState,
  OverallConnectivityState,
  PhysicalDeviceState,
  ProviderLinkState,
  type VehicleConnectivityRuntimeState,
} from './connectivity-domain.types';

export interface ConnectivityStateValidationResult {
  valid: boolean;
  conflicts: ConnectivityReasonCode[];
}

const PLUGGED_PHYSICAL: ReadonlySet<PhysicalDeviceState> = new Set([
  'PLUGGED_CONFIRMED',
  'PLUGGED_INFERRED',
]);

const ACTION_ATTENTION: ReadonlySet<AttentionState> = new Set([
  'ACTION_REQUIRED',
  'CRITICAL',
]);

/**
 * Validate cross-dimension consistency for a runtime state snapshot.
 * Does not mutate input; safe for builder unit tests and pre-publish gates.
 */
export function validateConnectivityStateCombination(
  state: Pick<
    VehicleConnectivityRuntimeState,
    | 'providerLinkState'
    | 'telemetryState'
    | 'physicalDeviceState'
    | 'dataCoverageState'
    | 'attentionState'
    | 'overallState'
    | 'reasonCodes'
    | 'requiresAction'
    | 'recommendedAction'
  >,
): ConnectivityStateValidationResult {
  const conflicts: ConnectivityReasonCode[] = [];

  if (
    state.overallState === 'DEVICE_UNPLUGGED' &&
    state.physicalDeviceState === 'NOT_APPLICABLE'
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    state.overallState === 'DEVICE_UNPLUGGED' &&
    PLUGGED_PHYSICAL.has(state.physicalDeviceState)
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    state.overallState === 'TELEMETRY_ACTIVE' &&
    (state.telemetryState === 'offline' || state.telemetryState === 'no_signal')
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    state.overallState === 'SOFT_OFFLINE' &&
    state.telemetryState !== 'signal_delayed'
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    state.overallState === 'STANDBY' &&
    state.telemetryState !== 'standby'
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    state.providerLinkState === 'NO_LINK' &&
    state.overallState === 'TELEMETRY_ACTIVE'
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    state.providerLinkState === 'REVOKED' &&
    state.overallState === 'TELEMETRY_ACTIVE'
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    state.physicalDeviceState === 'NOT_APPLICABLE' &&
    state.reasonCodes.includes(ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK)
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    ACTION_ATTENTION.has(state.attentionState) &&
    !state.requiresAction
  ) {
    conflicts.push(ConnectivityReasonCode.STATE_CONFLICT);
  }

  if (
    state.providerLinkState === 'REAUTH_REQUIRED' &&
    !state.reasonCodes.includes(ConnectivityReasonCode.AUTHORIZATION_EXPIRED) &&
    !state.reasonCodes.includes(ConnectivityReasonCode.CONSENT_MISSING) &&
    !state.reasonCodes.includes(ConnectivityReasonCode.TOKEN_MISSING)
  ) {
    conflicts.push(ConnectivityReasonCode.MANUAL_REVIEW_REQUIRED);
  }

  if (
    state.providerLinkState === 'REVOKED' &&
    !state.reasonCodes.includes(ConnectivityReasonCode.PROVIDER_REVOKED) &&
    !state.reasonCodes.includes(ConnectivityReasonCode.AUTHORIZATION_EXPIRED)
  ) {
    conflicts.push(ConnectivityReasonCode.MANUAL_REVIEW_REQUIRED);
  }

  const unique = [...new Set(conflicts)];
  return { valid: unique.length === 0, conflicts: unique };
}

/** True when physical OBD semantics do not apply (OEM-only / synthetic path). */
export function isPhysicalDeviceNotApplicable(
  physicalDeviceState: PhysicalDeviceState,
): boolean {
  return physicalDeviceState === 'NOT_APPLICABLE';
}

/** True when data-coverage scoring is intentionally skipped. */
export function isDataCoverageNotApplicable(
  dataCoverageState: DataCoverageState,
): boolean {
  return dataCoverageState === 'NOT_APPLICABLE';
}

export function isProviderLinkIndeterminate(
  providerLinkState: ProviderLinkState,
): boolean {
  return (
    providerLinkState === 'UNKNOWN' || providerLinkState === 'ERROR'
  );
}
