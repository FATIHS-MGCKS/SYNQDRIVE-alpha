import type { AuthorizationDecisionAction } from '../authorization-decision-engine/authorization-decision.constants';
import type { AuthorizationDecisionOutcome } from '../authorization-decision-engine/authorization-decision.constants';

export interface DrivingBehaviorGateContext {
  organizationId: string;
  vehicleId: string;
  action: AuthorizationDecisionAction;
  dataCategory: string;
  purpose: string;
  processingPath: string;
  serviceIdentity: string;
  correlationId: string;
  customerId?: string;
  bookingId?: string;
  tripId?: string;
  effectiveTimestamp?: Date | string | null;
  isReprocess?: boolean;
}

export interface DrivingBehaviorGateResult {
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
