import type { AuthorizationDecisionAction } from '../authorization-decision-engine/authorization-decision.constants';
import type { AuthorizationDecisionOutcome } from '../authorization-decision-engine/authorization-decision.constants';
import type {
  VEHICLE_HEALTH_OBSERVATION_SOURCE,
} from './vehicle-health-enforcement.constants';

export interface VehicleHealthGateContext {
  organizationId: string;
  vehicleId: string;
  action: AuthorizationDecisionAction;
  dataCategory: string;
  purpose: string;
  processingPath: string;
  serviceIdentity: string;
  correlationId: string;
  /** Distinguish manual entry vs telemetry-derived observations. */
  observationSource?: (typeof VEHICLE_HEALTH_OBSERVATION_SOURCE)[keyof typeof VEHICLE_HEALTH_OBSERVATION_SOURCE];
  effectiveTimestamp?: Date | string | null;
  isBackfill?: boolean;
}

export interface VehicleHealthGateResult {
  mayProceed: boolean;
  decision: AuthorizationDecisionOutcome;
  enforced: boolean;
  isShadowMode: boolean;
  shouldRetry: boolean;
  isAuthorizationDeny: boolean;
  reasonCode: string;
  reasonCodes: string[];
  correlationId: string;
  auditEventId: string | null;
}
