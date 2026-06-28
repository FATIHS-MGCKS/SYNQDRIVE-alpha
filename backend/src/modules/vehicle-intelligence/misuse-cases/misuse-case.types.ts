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
   * Event Context Assessments anchored inside the trip window — native behavior
   * events and RPM webhook candidates. Optional for backward compatibility;
   * defaults to an empty list when absent.
   */
  contextAnchors?: ContextAnchor[];
};

export type AttributionFields = {
  attributionScope: MisuseAttributionScope;
  bookingId: string | null;
  customerId: string | null;
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
  return `${organizationId}:${tripId}:${type}`;
}

export function resolveAttribution(
  trip: TripEvaluationContext['trip'],
): AttributionFields {
  const status = trip.assignmentStatus ?? TripAssignmentStatus.UNKNOWN_ASSIGNMENT;

  if (status === TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER) {
    return {
      attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
      bookingId: trip.assignedBookingId ?? null,
      customerId: trip.assignmentSubjectId ?? null,
      assignmentStatusSnapshot: status,
      assignmentSubjectTypeSnapshot: trip.assignmentSubjectType ?? null,
      assignmentSubjectIdSnapshot: trip.assignmentSubjectId ?? null,
      assignedBookingIdSnapshot: trip.assignedBookingId ?? null,
      isPrivateTripSnapshot: false,
    };
  }

  if (status === TripAssignmentStatus.ASSIGNED_DRIVER) {
    return {
      attributionScope: MisuseAttributionScope.ASSIGNED_DRIVER,
      bookingId: null,
      customerId: null,
      assignmentStatusSnapshot: status,
      assignmentSubjectTypeSnapshot: trip.assignmentSubjectType ?? null,
      assignmentSubjectIdSnapshot: trip.assignmentSubjectId ?? null,
      assignedBookingIdSnapshot: null,
      isPrivateTripSnapshot: false,
    };
  }

  if (status === TripAssignmentStatus.PRIVATE_UNASSIGNED || trip.isPrivateTrip) {
    return {
      attributionScope: MisuseAttributionScope.PRIVATE_UNASSIGNED,
      bookingId: null,
      customerId: null,
      assignmentStatusSnapshot: status,
      assignmentSubjectTypeSnapshot: null,
      assignmentSubjectIdSnapshot: null,
      assignedBookingIdSnapshot: null,
      isPrivateTripSnapshot: true,
    };
  }

  return {
    attributionScope: MisuseAttributionScope.UNKNOWN,
    bookingId: null,
    customerId: null,
    assignmentStatusSnapshot: status,
    assignmentSubjectTypeSnapshot: null,
    assignmentSubjectIdSnapshot: null,
    assignedBookingIdSnapshot: null,
    isPrivateTripSnapshot: Boolean(trip.isPrivateTrip),
  };
}
