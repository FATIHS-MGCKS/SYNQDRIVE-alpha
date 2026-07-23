import type { AuthorizationDecisionAction } from '../authorization-decision-engine/authorization-decision.constants';
import type { AuthorizationDecisionOutcome } from '../authorization-decision-engine/authorization-decision.constants';
import type { PolicyResolverSourceSystem } from '../policy-resolver/policy-resolver.constants';

export interface TripLocationGateContext {
  organizationId: string;
  vehicleId: string;
  action: AuthorizationDecisionAction;
  dataCategory: string;
  purpose: string;
  processingPath: string;
  serviceIdentity: string;
  correlationId: string;
  sourceSystem?: PolicyResolverSourceSystem | 'HIGH_MOBILITY';
  bookingId?: string | null;
  customerId?: string | null;
  effectiveTimestamp?: Date | string | null;
  isReplay?: boolean;
  isBackfill?: boolean;
}

export interface TripLocationGateResult {
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

export interface TripCoordinateSummary {
  id?: string;
  vehicleId?: string;
  startLatitude?: number | null;
  startLongitude?: number | null;
  endLatitude?: number | null;
  endLongitude?: number | null;
  speedingSectionsJson?: unknown;
}
