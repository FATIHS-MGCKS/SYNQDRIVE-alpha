/**
 * Fail-closed policy for automatic (non-operator) LIVE_FSM split admission.
 * Operator recovery CLI is not gated by this module.
 */
import {
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
} from '../../driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';

export const TRIP_DI_BOUNDARY_ADMISSION_LIVE_FSM_AUTO_ACTIVATED_AT_UTC_ENV =
  'TRIP_DI_BOUNDARY_ADMISSION_LIVE_FSM_AUTO_ACTIVATED_AT_UTC';

/** Safety cap per reconciliation tick (vehicle + bounded window). */
export const LIVE_FSM_AUTO_RECONCILIATION_MAX_TRIPS_PER_VEHICLE = 32;

export interface LiveFsmAutomaticAdmissionPolicy {
  s4: DiV0S4ControlPlaneConfig;
  /** When null, reconciliation must not auto-admit LIVE_FSM splits (finalize path still allowed for current pair). */
  reconciliationActivationHorizonUtc: Date | null;
}

export function parseLiveFsmAutomaticAdmissionActivationHorizon(
  value: string | undefined,
): Date | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed);
}

export function readLiveFsmAutomaticAdmissionPolicyFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LiveFsmAutomaticAdmissionPolicy {
  return {
    s4: parseDiV0S4ControlPlaneConfig(env),
    reconciliationActivationHorizonUtc: parseLiveFsmAutomaticAdmissionActivationHorizon(
      env[TRIP_DI_BOUNDARY_ADMISSION_LIVE_FSM_AUTO_ACTIVATED_AT_UTC_ENV],
    ),
  };
}

/**
 * Automatic admission requires S4 master + explicit non-empty org/vehicle allowlists and membership.
 */
export function isAutomaticLiveFsmAdmissionCohort(
  policy: LiveFsmAutomaticAdmissionPolicy,
  scope: { organizationId: string; vehicleId: string; vehicleOrganizationId: string },
): boolean {
  const { s4 } = policy;
  if (!s4.masterEnabled) return false;
  if (s4.organizationAllowlist.size === 0 || s4.vehicleAllowlist.size === 0) return false;
  if (!s4.organizationAllowlist.has(scope.organizationId)) return false;
  if (!s4.vehicleAllowlist.has(scope.vehicleId)) return false;
  if (scope.vehicleOrganizationId !== scope.organizationId) return false;
  return true;
}
