import type { MembershipRole, NotificationCategory } from '@prisma/client';
import type {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
} from '../notification.enums';
import type {
  NotificationActionTarget,
  NotificationDeliveryPolicy,
  NotificationExpiryPolicy,
  NotificationReopenPolicy,
  NotificationResolutionPolicy,
  NotificationTemplateParams,
} from '../notification.types';

/** Context passed to actionTargetBuilder — adapters supply entity ids only. */
export interface NotificationActionTargetContext {
  entityType: NotificationEntityType;
  entityId: string;
  vehicleId?: string;
  bookingId?: string;
  stationId?: string;
  customerId?: string;
  invoiceId?: string;
  tripId?: string;
  module?: string;
}

export type NotificationActionTargetBuilder = (
  ctx: NotificationActionTargetContext,
) => NotificationActionTarget;

/** Stable kebab-case slug for docs and adapter routing. */
export type NotificationEventSlug = string;

/**
 * Canonical event-type configuration — single source of truth per `eventType`.
 * Producers must not invent fingerprints or template keys outside this registry.
 */
export interface NotificationEventTypeDefinition {
  /** Unique kebab-case identifier (documentation / routing). */
  slug: NotificationEventSlug;
  /** Unique uppercase canonical code — DB + fingerprint identity. */
  eventType: string;
  domain: NotificationDomain;
  defaultEntityType: NotificationEntityType;
  /** Stable condition code within entity scope (fingerprint component). */
  conditionCode: string;
  fingerprintVersion: number;
  eventKind: NotificationEventKind;
  defaultSeverity: NotificationSeverity;
  /** Severities allowed when escalating (excludes SUCCESS unless listed). */
  allowedSeverityEscalations: readonly NotificationSeverity[];
  titleKey: string;
  bodyKey: string;
  requiredTemplateParams: readonly string[];
  actionType: NotificationActionType;
  actionTargetBuilder: NotificationActionTargetBuilder;
  sourceType: NotificationSourceType;
  resolutionPolicy: NotificationResolutionPolicy;
  reopenPolicy?: NotificationReopenPolicy;
  expiryPolicy?: NotificationExpiryPolicy;
  deliveryPolicy: NotificationDeliveryPolicy;
  preferenceCategory: NotificationCategory;
  supportedRoles: readonly MembershipRole[];
  /** Optional grouping key field name in templateParams/metadata. */
  groupingRule?: { groupKeyParam?: string; maxGroupSize?: number };
  /** When true, entity + action target must be complete before ingest. */
  requiresNavigation: boolean;
  /**
   * When true, adapter may emit to core engine in NOTIFICATIONS_V2 shadow mode.
   * Default false — no uncontrolled producer activation.
   */
  shadowModeEnabled: boolean;
  /** Owning SynqDrive module (detector stays there). */
  producerModule: string;
}

export interface RegistryCandidateBuildInput {
  organizationId: string;
  eventType: string;
  entityId: string;
  entityType?: NotificationEntityType;
  /** Appended to registry conditionCode as `{base}:{variant}` for per-entity sub-states. */
  conditionCodeVariant?: string;
  sourceRef: string;
  occurredAt: Date;
  severity?: NotificationSeverity;
  templateParams: NotificationTemplateParams;
  actionTargetContext?: Partial<NotificationActionTargetContext>;
  sourceType?: NotificationSourceType;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}
