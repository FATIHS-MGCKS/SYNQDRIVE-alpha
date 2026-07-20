/**
 * Documented overall-state precedence for Fleet Connectivity runtime synthesis.
 *
 * Higher rank = wins when multiple dimensions would suggest different overall states.
 * Builder implementation (Prompt 4+) must follow this order.
 *
 * Priority (highest first):
 *  1. Active critical safety / integration errors
 *  2. Authorization required
 *  3. Confirmed device unplug
 *  4. Offline telemetry
 *  5. Soft-offline telemetry
 *  6. Unknown / indeterminate
 *  7. Standby telemetry
 *  8. Telemetry active (healthy default)
 */
import type { OverallConnectivityState } from './connectivity-domain.types';

/** Lower number = higher priority (wins). */
export const OVERALL_CONNECTIVITY_STATE_PRIORITY: Readonly<
  Record<OverallConnectivityState, number>
> = {
  INTEGRATION_ERROR: 10,
  AUTHORIZATION_REQUIRED: 20,
  DEVICE_UNPLUGGED: 30,
  OFFLINE: 40,
  SOFT_OFFLINE: 50,
  UNKNOWN: 60,
  NO_ACTIVE_DATA_SOURCE: 65,
  STANDBY: 70,
  TELEMETRY_ACTIVE: 80,
};

export function overallConnectivityPriority(
  state: OverallConnectivityState,
): number {
  return OVERALL_CONNECTIVITY_STATE_PRIORITY[state];
}

/**
 * Pick the winning overall state from competing candidates (builder helper).
 * Ties preserve the first highest-priority candidate in input order.
 */
export function pickHighestPriorityOverallState(
  candidates: OverallConnectivityState[],
): OverallConnectivityState {
  if (candidates.length === 0) {
    return 'UNKNOWN';
  }
  return candidates.reduce((best, current) =>
    overallConnectivityPriority(current) < overallConnectivityPriority(best)
      ? current
      : best,
  );
}
