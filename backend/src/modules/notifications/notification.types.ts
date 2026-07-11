import type {
  NotificationActionType,
  NotificationDeliveryState,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationReadState,
  NotificationSeverity,
  NotificationSourceType,
  NotificationStatus,
} from './notification.enums';

// ─── Fingerprint ───────────────────────────────────────────────────

/** Decomposed identity parts — no localized or UI-derived fields. */
export interface NotificationFingerprintParts {
  organizationId: string;
  /** Stable producer event / insight type code (e.g. DRIVING_ASSESSMENT_DEVICE_QUALITY). */
  eventType: string;
  entityType: NotificationEntityType;
  entityId: string;
  /** Stable condition within the entity scope (e.g. driving_assessment_device_quality). */
  conditionCode: string;
  /**
   * Breaking schema/version boundary for the same logical condition.
   * Bump only when identity semantics change — not on severity escalation.
   */
  scopeVersion: number;
}

export interface NotificationFingerprint {
  parts: NotificationFingerprintParts;
  /** Locale-independent canonical serialization used for DB unique constraints. */
  canonical: string;
}

// ─── Templates ─────────────────────────────────────────────────────

/** i18n key references — never store rendered UI sentences as identity. */
export interface NotificationTemplate {
  titleKey: string;
  bodyKey: string;
}

/** Structured interpolation payload for title/body templates. */
export type NotificationTemplateParams = Record<string, string | number | boolean | null>;

// ─── Policies ──────────────────────────────────────────────────────

export interface NotificationReopenPolicy {
  /** Minimum time after RESOLVED before a flutter may reopen the same fingerprint. */
  cooldownMs: number;
  /** Optional observation window required before treating a STATE as cleared. */
  stabilityWindowMs?: number;
  /**
   * After this many reopen cycles on the same fingerprint, start a new lifecycle generation
   * instead of reopening the existing row.
   */
  maxReopensBeforeNewGeneration?: number;
}

export interface NotificationResolutionPolicy {
  eventKind: NotificationEventKind;
  /** STATE notifications auto-resolve when the underlying condition clears. */
  autoResolveWhenConditionClears: boolean;
  reopenPolicy?: NotificationReopenPolicy;
}

export interface NotificationDeliveryPolicy {
  channels: Array<'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS'>;
  respectUserPreferences: boolean;
  /** CRITICAL may bypass user mute settings when true. */
  criticalOverridesPreferences: boolean;
}

export interface NotificationActionTarget {
  type: NotificationActionType;
  vehicleId?: string;
  bookingId?: string;
  stationId?: string;
  customerId?: string;
  invoiceId?: string;
  tripId?: string;
  module?: string;
}

// ─── Candidate (ingest contract) ───────────────────────────────────

/**
 * Ephemeral ingest payload from producers (detectors, workflows, booking hooks).
 * Persisted notifications are materialized from validated candidates + fingerprint match.
 */
export interface NotificationCandidate {
  organizationId: string;
  /** Producer event type — aligns with InsightType or domain event codes. */
  eventType: string;
  eventKind: NotificationEventKind;
  domain: NotificationDomain;
  severity: NotificationSeverity;
  entityType: NotificationEntityType;
  entityId: string;
  conditionCode: string;
  scopeVersion?: number;
  sourceType: NotificationSourceType;
  /** Opaque producer reference (insight run id, detector row id, booking id, …). */
  sourceRef: string;
  /** When the underlying fact or state change occurred (producer clock). */
  occurredAt: Date;
  titleKey: string;
  bodyKey: string;
  templateParams: NotificationTemplateParams;
  actionType: NotificationActionType;
  actionTarget: NotificationActionTarget;
  resolutionPolicy: NotificationResolutionPolicy;
  deliveryPolicy?: NotificationDeliveryPolicy;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

// ─── Occurrence (state observation / event log input) ────────────────

/** Input for recording a new observation against an existing or new fingerprint. */
export interface NotificationOccurrenceInput {
  organizationId: string;
  fingerprint: NotificationFingerprint;
  occurredAt: Date;
  severity: NotificationSeverity;
  sourceType: NotificationSourceType;
  sourceRef: string;
  /** Optional producer metadata (metrics, evidence) — not used for identity. */
  metadata?: Record<string, unknown>;
}

// ─── Persisted shape (contract only — no Prisma model in this prompt) ─

export interface NotificationRecord {
  id: string;
  organizationId: string;
  fingerprint: NotificationFingerprint;
  generation: number;
  status: NotificationStatus;
  readState: NotificationReadState;
  deliveryState: NotificationDeliveryState;
  domain: NotificationDomain;
  severity: NotificationSeverity;
  eventKind: NotificationEventKind;
  titleKey: string;
  bodyKey: string;
  templateParams: NotificationTemplateParams;
  actionType: NotificationActionType;
  actionTarget: NotificationActionTarget;
  sourceType: NotificationSourceType;
  sourceRef: string;
  occurredAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt?: Date | null;
  archivedAt?: Date | null;
  snoozedUntil?: Date | null;
  reopenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of evaluating whether an occurrence reopens, updates, or creates a generation. */
export type NotificationMaterializeDecision =
  | { action: 'CREATE'; generation: number }
  | { action: 'UPDATE'; notificationId: string; generation: number }
  | { action: 'REOPEN'; notificationId: string; generation: number; reopenCount: number }
  | { action: 'IGNORE'; reason: 'COOLDOWN' | 'ARCHIVED' | 'DUPLICATE_OCCURRENCE' };
