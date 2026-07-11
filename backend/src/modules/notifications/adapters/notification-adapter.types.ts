import type { NotificationCandidate } from '../notification.types';

/** Shared context for all producer adapters. */
export interface NotificationAdapterContext {
  organizationId: string;
  sourceRef: string;
  occurredAt: Date;
  runId?: string;
}

/**
 * Base contract: adapters translate domain facts → NotificationCandidate.
 * Detectors remain owners of business logic; adapters only map shapes.
 */
export interface NotificationProducerAdapter<TSource = unknown> {
  readonly adapterId: string;
  /** Registered event types this adapter may emit. */
  readonly supportedEventTypes: readonly string[];
  /** Whether adapter is allowed to write in NOTIFICATIONS_V2 shadow mode. */
  readonly shadowModeOnly: boolean;
  canHandle(source: TSource): boolean;
  toCandidate(source: TSource, context: NotificationAdapterContext): NotificationCandidate | null;
}

export interface DashboardInsightAdapterSource {
  insightType: string;
  entityIds: string[];
  dedupeKey: string;
  severity: string;
  metrics?: Record<string, unknown>;
}

export interface RuntimeStateAdapterSource {
  eventType: string;
  vehicleId: string;
  label: string;
  severity?: string;
  module?: string;
}

export interface VehicleHealthAdapterSource {
  eventType: string;
  vehicleId: string;
  label: string;
  code?: string;
}

export interface BookingAdapterSource {
  eventType: string;
  bookingId: string;
  bookingRef: string;
  label: string;
}

export interface TechnicalObservationAdapterSource {
  vehicleId: string;
  label: string;
  complaintId: string;
}

export interface DrivingAssessmentAdapterSource {
  vehicleId: string;
  label: string;
  degraded: boolean;
  sourceRef: string;
}
