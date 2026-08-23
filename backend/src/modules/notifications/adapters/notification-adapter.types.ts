import type { NotificationCandidate } from '../notification.types';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';

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
  reason?: string;
  cleared?: boolean;
  severity?: 'warning' | 'critical';
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
  resolved?: boolean;
}

export interface DrivingAssessmentAdapterSource {
  vehicleId: string;
  label: string;
  degraded: boolean;
  sourceRef: string;
}

export interface StationShortageAdapterSource {
  stationId: string;
  stationName: string;
  available: number;
  totalVehicles: number;
  bookedOut: number;
  threshold: number;
  cleared?: boolean;
  expiresAt?: Date;
}

export interface LowUtilizationAdapterSource {
  vehicleId: string;
  label: string;
  idleDays: number;
  lostRevenueEur: number;
  cleared?: boolean;
}

export interface ServiceComplianceAdapterSource {
  eventType: 'TUV_OVERDUE' | 'BOKRAFT_OVERDUE' | 'SERVICE_OVERDUE';
  vehicleId: string;
  label: string;
  reason?: string;
  cleared?: boolean;
  severity: 'warning' | 'critical';
  blocksRental: boolean;
}

export interface VehicleAlertsNotificationAdapterSource {
  eventType: 'LIMP_MODE_ACTIVE' | 'ENGINE_OIL_LEVEL_LOW' | 'ENGINE_OIL_LEVEL_HIGH';
  vehicleId: string;
  label: string;
  reason?: string;
  cleared?: boolean;
  severity: 'warning' | 'critical';
  blocksRental: boolean;
  telltaleKey: 'engine_limp_mode' | 'engine_oil_level';
  canonicalState: 'ACTIVE' | 'CLEARED';
}

export interface VehicleReadinessNotificationAdapterSource {
  eventType: 'VEHICLE_NOT_READY';
  vehicleId: string;
  label: string;
  condition: 'NOT_READY' | 'READY';
  cleared?: boolean;
  blockingReasonCount?: number;
  rentalReadiness?: 'ready' | 'not_ready' | 'unevaluable';
  projectionVersion?: string;
}

export interface VehicleReadinessEvaluabilityNotificationAdapterSource {
  eventType: 'VEHICLE_READINESS_UNEVALUABLE';
  vehicleId: string;
  label: string;
  condition: 'UNEVALUABLE' | 'EVALUABLE';
  cleared?: boolean;
  rentalReadiness?: 'ready' | 'not_ready' | 'unevaluable';
  availability?: VehicleHealth['availability'];
  projectionVersion?: string;
}

export interface VehicleDamageNotificationAdapterSource {
  eventType: 'VEHICLE_DAMAGE_BLOCKING';
  vehicleId: string;
  label: string;
  damageId: string;
  rentalImpact: string;
  reason?: string;
  severity: 'warning' | 'critical';
  cleared?: boolean;
}

export interface CommunicationHandoffAdapterSource {
  conversationId: string;
  communicationEventId: string;
  channel: import('@prisma/client').CommunicationChannel;
  stationId?: string | null;
  contactDisplay: string;
  handoffReasonCode?: string | null;
}
