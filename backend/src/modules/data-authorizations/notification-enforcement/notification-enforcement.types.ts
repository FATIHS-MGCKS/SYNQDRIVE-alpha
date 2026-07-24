import type { AuthorizationDecisionOutcome } from '../authorization-decision-engine/authorization-decision.constants';
import type { NotificationGateKind } from './notification-enforcement.constants';

export interface NotificationAuthGateSpec {
  gateKind: NotificationGateKind;
  dataCategory?: string;
  purpose?: string;
  processingPath: string;
  serviceIdentity: string;
  /** Params stripped from preview/email when READ scope not granted. */
  sensitivePreviewParams?: readonly string[];
}

export interface NotificationAuthContext {
  organizationId: string;
  eventType: string;
  vehicleId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  tripId?: string | null;
  entityType?: string;
  entityId?: string;
  correlationId: string;
  effectiveTimestamp?: Date | string | null;
  /** Upstream authorization decision from derive/profile — referenced, not re-decided. */
  upstreamDecisionId?: string | null;
  upstreamAllowed?: boolean;
}

export interface NotificationAuthDecisionResult {
  mayProceed: boolean;
  gateKind: NotificationGateKind;
  decision: AuthorizationDecisionOutcome;
  enforced: boolean;
  isShadowMode: boolean;
  isAuthorizationDeny: boolean;
  reasonCode: string;
  reasonCodes: string[];
  correlationId: string;
  auditEventId: string | null;
  decisionEventId: string | null;
  /** True when decision was served from in-process cache. */
  fromCache: boolean;
}

export interface NotificationAuthCache {
  get(key: string): NotificationAuthDecisionResult | undefined;
  set(key: string, value: NotificationAuthDecisionResult): void;
}

export function createNotificationAuthCache(): NotificationAuthCache {
  const map = new Map<string, NotificationAuthDecisionResult>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => map.set(key, value),
  };
}

export function buildNotificationAuthCacheKey(ctx: NotificationAuthContext): string {
  return [
    ctx.organizationId,
    ctx.eventType,
    ctx.vehicleId ?? '',
    ctx.entityId ?? '',
    ctx.bookingId ?? '',
  ].join(':');
}
