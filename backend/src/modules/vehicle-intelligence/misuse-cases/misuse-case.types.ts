import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
  MisuseEvidenceSourceType,
  TripAssignmentStatus,
  TripAssignmentSubjectType,
} from '@prisma/client';
import type { DimoVehicleEventRecord } from '../../dimo/dimo-segments.service';
import type { TripBehaviorEvent, DrivingEvent, VehicleTrip, VehicleDtcEvent } from '@prisma/client';
import type { EventContextAssessment } from '../event-context/event-context-assessment.types';
import { resolveDrivingAttributionRoles } from '../trips/driving-attribution-roles/driving-attribution-roles';
import type { DrivingAttributionType } from '../trips/driving-attribution-roles/driving-attribution-roles.types';
import { DrivingAttributionType as DrivingAttributionTypeEnum } from '../trips/driving-attribution-roles/driving-attribution-roles.types';

export type EvidenceCandidate = {
  sourceType: MisuseEvidenceSourceType;
  sourceId?: string | null;
  eventType: string;
  severity?: MisuseCaseSeverity;
  confidence?: MisuseCaseConfidence;
  occurredAt: Date;
  snapshotJson?: Record<string, unknown> | null;
};

export type CaseCandidate = {
  type: MisuseCaseType;
  category: MisuseCaseCategory;
  severity: MisuseCaseSeverity;
  confidence: MisuseCaseConfidence;
  title: string;
  description: string;
  recommendedAction?: string;
  evidence: EvidenceCandidate[];
  eventCount: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  /**
   * Optional structured evidence block merged into MisuseCase.evidenceSummary.
   * Used by context-derived (LTE_R1/ICE) rules to surface source anchors,
   * classifications, evidence grade/confidence, signals and key values.
   */
  evidenceSummary?: Record<string, unknown>;
};

/**
 * A trustworthy anchor enriched with an Event Context Assessment, normalised for
 * the misuse aggregator. `source` records where the anchor came from:
 *   - DRIVING_EVENT : native DIMO behavior event (DrivingEvent.metadataJson.contextAssessment)
 */
export type ContextAnchor = {
  source: 'DRIVING_EVENT';
  anchorId: string;
  occurredAt: Date;
  assessment: EventContextAssessment;
};

export type TripEvaluationContext = {
  trip: Pick<
    VehicleTrip,
    | 'id'
    | 'vehicleId'
    | 'startTime'
    | 'endTime'
    | 'assignmentStatus'
    | 'assignmentSubjectType'
    | 'assignmentSubjectId'
    | 'assignedBookingId'
    | 'bookingLinkSource'
    | 'bookingCustomerId'
    | 'assignedDriverId'
    | 'actualDriverId'
    | 'isPrivateTrip'
    | 'kickdownCount'
    | 'possibleImpactCount'
    | 'coldEngineAbuseCount'
    | 'hardAccelerationCount'
    | 'hardBrakingCount'
    | 'fullBrakingCount'
    | 'abuseEvents'
  > & { organizationId: string };
  behaviorEvents: TripBehaviorEvent[];
  drivingEvents: DrivingEvent[];
  dimoSafetyEvents: DimoVehicleEventRecord[];
  dtcEvents: VehicleDtcEvent[];
  /**
   * Event Context Assessments anchored inside the trip window — native DIMO
   * behavior events only (`DrivingEvent.metadataJson.contextAssessment`).
   */
  contextAnchors?: ContextAnchor[];
};

export type AttributionFields = {
  attributionScope: MisuseAttributionScope;
  bookingId: string | null;
  /** Contract holder (Vertragspartner) — booking customer only, never mirrored driver ID. */
  customerId: string | null;
  bookingCustomerId: string | null;
  assignedDriverId: string | null;
  actualDriverId: string | null;
  customerDecisionEligible: boolean;
  driverDecisionEligible: boolean;
  assignmentStatusSnapshot: TripAssignmentStatus | null;
  assignmentSubjectTypeSnapshot: TripAssignmentSubjectType | null;
  assignmentSubjectIdSnapshot: string | null;
  assignedBookingIdSnapshot: string | null;
  isPrivateTripSnapshot: boolean;
};

export const CASE_TYPE_LABELS: Record<MisuseCaseType, string> = {
  AGGRESSIVE_DRIVING_PATTERN: 'Aggressives Fahrmuster',
  COLD_ENGINE_ABUSE: 'Kaltmotor-Missbrauch',
  REPEATED_ENGINE_REV_IN_IDLE: 'Wiederholtes Hochdrehen im Stand',
  LAUNCH_ABUSE_PATTERN: 'Launch-ähnliches Beschleunigungsmuster',
  BRAKE_ABUSE_PATTERN: 'Auffälliges Bremsverhalten',
  POSSIBLE_COLLISION_OR_IMPACT: 'Möglicher Aufprall',
  DIMO_COLLISION_REPORTED: 'DIMO-Kollision gemeldet',
  OVERHEATING_DAMAGE_RISK: 'Überhitzungsrisiko',
  DTC_AFTER_ABUSE_OR_IMPACT: 'Fehlercode nach Auffälligkeit',
  TELEMETRY_INTEGRITY_ISSUE: 'Telemetrie-Integritätsproblem',
  TAMPERING_SUSPECTED: 'Manipulationsverdacht',
  EV_BATTERY_STRESS_PATTERN: 'EV-Batteriestress',
  RENTAL_GEOFENCE_VIOLATION: 'Geofence-Verletzung',
};

export const CATEGORY_LABELS: Record<MisuseCaseCategory, string> = {
  USAGE_ANOMALY: 'Nutzungsauffälligkeit',
  MISUSE_SUSPICION: 'Missbrauchsverdacht',
  TECHNICAL_RISK: 'Technisches Risikoereignis',
  DAMAGE_SUSPICION: 'Schadensverdacht',
  TAMPERING_DATA_INTEGRITY: 'Manipulations-/Datenintegritätsverdacht',
};

const SEVERITY_RANK: Record<MisuseCaseSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  SEVERE: 2,
  CRITICAL: 3,
};

const CONFIDENCE_RANK: Record<MisuseCaseConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export function maxSeverity(
  a: MisuseCaseSeverity,
  b: MisuseCaseSeverity,
): MisuseCaseSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function maxConfidence(
  a: MisuseCaseConfidence,
  b: MisuseCaseConfidence,
): MisuseCaseConfidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

export function buildCaseFingerprint(
  organizationId: string,
  tripId: string,
  type: MisuseCaseType,
): string {
  /** @deprecated P48 — legacy colon format; do not use for new writes. */
  return `${organizationId}:${tripId}:${type}`;
}

export function resolveAttribution(
  trip: TripEvaluationContext['trip'],
  bookingContext?: {
    bookingCustomerId?: string | null;
    assignedDriverId?: string | null;
    customerType?: import('@prisma/client').CustomerType | null;
  },
): AttributionFields {
  const status = trip.assignmentStatus ?? TripAssignmentStatus.UNKNOWN_ASSIGNMENT;

  const roles = resolveDrivingAttributionRoles({
    isPrivateTrip: trip.isPrivateTrip === true,
    assignmentStatus: status,
    assignmentSubjectType: trip.assignmentSubjectType,
    assignmentSubjectId: trip.assignmentSubjectId,
    assignedBookingId: trip.assignedBookingId,
    bookingLinkSource: trip.bookingLinkSource ?? null,
    bookingCustomerId: bookingContext?.bookingCustomerId,
    bookingAssignedDriverId: bookingContext?.assignedDriverId,
    bookingCustomerType: bookingContext?.customerType,
    tripBookingCustomerId: trip.bookingCustomerId,
    tripAssignedDriverId: trip.assignedDriverId,
    tripActualDriverId: trip.actualDriverId,
  });

  const attributionScope = mapAttributionTypeToMisuseScope(roles.attributionType, status);

  return {
    attributionScope,
    bookingId: trip.assignedBookingId ?? null,
    customerId: roles.bookingCustomerId,
    bookingCustomerId: roles.bookingCustomerId,
    assignedDriverId: roles.assignedDriverId,
    actualDriverId: roles.actualDriverId,
    customerDecisionEligible: roles.customerDecisionEligible,
    driverDecisionEligible: roles.driverDecisionEligible,
    assignmentStatusSnapshot: status,
    assignmentSubjectTypeSnapshot: trip.assignmentSubjectType ?? null,
    assignmentSubjectIdSnapshot: trip.assignmentSubjectId ?? null,
    assignedBookingIdSnapshot: trip.assignedBookingId ?? null,
    isPrivateTripSnapshot: trip.isPrivateTrip === true,
  };
}

function mapAttributionTypeToMisuseScope(
  type: DrivingAttributionType,
  status: TripAssignmentStatus,
): MisuseAttributionScope {
  if (
    status === TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER ||
    type === DrivingAttributionTypeEnum.BOOKING_CUSTOMER ||
    type === DrivingAttributionTypeEnum.CONFIRMED_DRIVER
  ) {
    return MisuseAttributionScope.BOOKING_CUSTOMER;
  }
  switch (type) {
    case DrivingAttributionTypeEnum.ASSIGNED_DRIVER:
      return MisuseAttributionScope.ASSIGNED_DRIVER;
    case DrivingAttributionTypeEnum.PRIVATE_UNASSIGNED:
      return MisuseAttributionScope.PRIVATE_UNASSIGNED;
    case DrivingAttributionTypeEnum.VEHICLE_ONLY:
      return MisuseAttributionScope.VEHICLE_ONLY;
    case DrivingAttributionTypeEnum.UNKNOWN:
    default:
      return MisuseAttributionScope.UNKNOWN;
  }
}
