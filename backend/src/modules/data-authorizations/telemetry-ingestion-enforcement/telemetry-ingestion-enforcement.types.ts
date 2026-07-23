import type {
  TelemetryIngestPath,
  TelemetryIngestServiceIdentity,
} from './telemetry-ingestion-enforcement.constants';
import type { PolicyResolverSourceSystem } from '../policy-resolver/policy-resolver.constants';
import type { AuthorizationDecisionOutcome } from '../authorization-decision-engine/authorization-decision.constants';

export interface TelemetryIngestGateContext {
  organizationId: string;
  vehicleId: string;
  sourceSystem: PolicyResolverSourceSystem | 'HIGH_MOBILITY';
  dataCategory: string;
  purpose: string;
  ingestionPath: TelemetryIngestPath | string;
  serviceIdentity: TelemetryIngestServiceIdentity | string;
  correlationId: string;
  /** Historical evaluation for replay/backfill — must not invent past grants. */
  effectiveTimestamp?: Date | string | null;
  isReplay?: boolean;
  isBackfill?: boolean;
}

export interface TelemetryIngestGateResult {
  /** True when raw/derived persistence may proceed. */
  mayPersist: boolean;
  decision: AuthorizationDecisionOutcome;
  enforced: boolean;
  isShadowMode: boolean;
  /** False for authorization DENY — queue must not retry to bypass policy. */
  shouldRetry: boolean;
  /** True when skip is due to authorization, not provider failure. */
  isAuthorizationDeny: boolean;
  reasonCode: string;
  reasonCodes: string[];
  correlationId: string;
  auditEventId: string | null;
}
