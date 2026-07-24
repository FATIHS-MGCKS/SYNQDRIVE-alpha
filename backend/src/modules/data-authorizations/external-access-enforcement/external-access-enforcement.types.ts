import type { AuthorizationDecisionOutcome } from '../authorization-decision-engine/authorization-decision.constants';
import type { ExternalAccessChannel } from './external-access-enforcement.constants';

export interface ExternalAccessGateContext {
  organizationId: string;
  channel: ExternalAccessChannel;
  action: string;
  dataCategories: string[];
  purpose: string;
  processingPath: string;
  serviceIdentity: string;
  correlationId: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  resourceType?: string;
  resourceId?: string;
  /** Partner / webhook recipient identifier. */
  externalRecipient?: string | null;
  transferCountry?: string | null;
  processorType?: string;
  processorId?: string;
  supportAccess?: boolean;
  bulkExport?: boolean;
  /** MCP / agent — fixed scope from server, never client-selected. */
  mcpToolName?: string;
  conversationId?: string;
  tokenNonce?: string;
}

export interface ExternalAccessGateResult {
  mayProceed: boolean;
  decision: AuthorizationDecisionOutcome;
  enforced: boolean;
  isShadowMode: boolean;
  isAuthorizationDeny: boolean;
  reasonCode: string;
  reasonCodes: string[];
  correlationId: string;
  auditEventId: string | null;
  deniedCategories?: string[];
}

export interface ExternalAccessMinimizationSpec {
  allowedFields?: readonly string[];
  deniedFields?: readonly string[];
}

/** Public request for registry-backed channel gates (purpose/categories from server registry). */
export interface ExternalAccessChannelRequest {
  organizationId: string;
  channelKey: string;
  correlationId: string;
  vehicleId?: string;
  customerId?: string;
  bookingId?: string;
  resourceId?: string;
  bulkExport?: boolean;
}
