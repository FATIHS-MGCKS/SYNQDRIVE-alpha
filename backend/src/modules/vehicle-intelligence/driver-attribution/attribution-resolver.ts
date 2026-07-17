import {
  CustomerType,
  DriverAttributionSource,
  DriverAttributionType,
  DrivingAttributionConfidence,
  TripAssignmentStatus,
} from '@prisma/client';
import { resolveDrivingAttributionRoles } from '../trips/driving-attribution-roles/driving-attribution-roles';
import {
  ATTRIBUTION_RESOLVER_VERSION,
  type AttributionConflict,
  type AttributionResolverInput,
  type ResolvedTripAttribution,
} from './attribution-resolver.types';

type CandidateTier = {
  tier: number;
  attributionType: DriverAttributionType;
  confidence: DrivingAttributionConfidence;
  driverId: string | null;
  customerId: string | null;
  bookingId: string | null;
  source: DriverAttributionSource;
  reason: string;
  customerEligibility: boolean;
  driverEligibility: boolean;
};

const TIER_PRIVATE = 0;
const TIER_MANUAL_CONFIRMED = 1;
const TIER_STAFF_MOVEMENT = 2;
const TIER_ASSIGNED_DRIVER = 3;
const TIER_HANDOVER_PROOF = 4;
const TIER_BOOKING_CUSTOMER = 5;
const TIER_TIME_WINDOW = 6;
const TIER_VEHICLE_ONLY = 7;
const TIER_UNKNOWN = 8;

function hasCustomerHandoverSignature(input: AttributionResolverInput): boolean {
  return Boolean(input.handoverProof?.customerSignatureName?.trim());
}

function hasStaffHandoverSignature(input: AttributionResolverInput): boolean {
  return Boolean(input.handoverProof?.staffSignatureName?.trim());
}

function isStaffMovement(input: AttributionResolverInput): boolean {
  if (input.staffMovementHint) return true;
  if (input.isPrivateTrip) return false;
  if (input.assignedBookingId) return false;
  return hasStaffHandoverSignature(input) && !hasCustomerHandoverSignature(input);
}

function mapTripConfidence(
  confidence: AttributionResolverInput['tripAttributionConfidence'],
  capHigh = false,
): DrivingAttributionConfidence {
  if (capHigh && confidence === 'HIGH') {
    return DrivingAttributionConfidence.MEDIUM;
  }
  switch (confidence) {
    case 'HIGH':
      return DrivingAttributionConfidence.HIGH;
    case 'MEDIUM':
      return DrivingAttributionConfidence.MEDIUM;
    default:
      return DrivingAttributionConfidence.LOW;
  }
}

function buildRoles(input: AttributionResolverInput) {
  return resolveDrivingAttributionRoles({
    isPrivateTrip: input.isPrivateTrip,
    assignmentStatus: input.assignmentStatus,
    assignmentSubjectType: input.assignmentSubjectType,
    assignmentSubjectId: input.assignmentSubjectId,
    assignedBookingId: input.assignedBookingId,
    bookingLinkSource: input.bookingLinkSource,
    bookingCustomerId: input.bookingCustomerId,
    bookingAssignedDriverId: input.bookingAssignedDriverId,
    bookingCustomerType: input.bookingCustomerType,
    tripBookingCustomerId: input.tripBookingCustomerId,
    tripAssignedDriverId: input.tripAssignedDriverId,
    tripActualDriverId: input.tripActualDriverId,
  });
}

function collectCandidates(input: AttributionResolverInput): CandidateTier[] {
  const roles = buildRoles(input);
  const candidates: CandidateTier[] = [];

  if (input.isPrivateTrip || input.assignmentStatus === TripAssignmentStatus.PRIVATE_UNASSIGNED) {
    candidates.push({
      tier: TIER_PRIVATE,
      attributionType: DriverAttributionType.PRIVATE,
      confidence: DrivingAttributionConfidence.HIGH,
      driverId: null,
      customerId: null,
      bookingId: input.assignedBookingId,
      source: DriverAttributionSource.PIPELINE_SNAPSHOT,
      reason: 'Privatfahrt — nicht kundenbelastbar',
      customerEligibility: false,
      driverEligibility: false,
    });
  }

  if (isStaffMovement(input)) {
    candidates.push({
      tier: input.staffMovementHint ? TIER_STAFF_MOVEMENT : TIER_VEHICLE_ONLY,
      attributionType: DriverAttributionType.STAFF_MOVEMENT,
      confidence: DrivingAttributionConfidence.MEDIUM,
      driverId: null,
      customerId: null,
      bookingId: null,
      source: DriverAttributionSource.TRIP_ASSIGNMENT,
      reason: 'Mitarbeiterfahrt — nicht dem Kunden anlasten',
      customerEligibility: false,
      driverEligibility: false,
    });
  }

  if (input.manualOverride) {
    candidates.push({
      tier: TIER_MANUAL_CONFIRMED,
      attributionType: DriverAttributionType.CONFIRMED_DRIVER,
      confidence: DrivingAttributionConfidence.HIGH,
      driverId: input.manualOverride.driverId,
      customerId: roles.bookingCustomerId,
      bookingId: input.assignedBookingId,
      source: DriverAttributionSource.MANUAL_RESOLUTION,
      reason: 'Manuell bestätigter Fahrer',
      customerEligibility: roles.customerDecisionEligible,
      driverEligibility: true,
    });
  } else if (roles.actualDriverId) {
    candidates.push({
      tier: TIER_MANUAL_CONFIRMED,
      attributionType: DriverAttributionType.CONFIRMED_DRIVER,
      confidence: DrivingAttributionConfidence.HIGH,
      driverId: roles.actualDriverId,
      customerId: roles.bookingCustomerId,
      bookingId: input.assignedBookingId,
      source: DriverAttributionSource.EXPLICIT_BOOKING_LINK,
      reason: 'Bestätigter Fahrer aus expliziter Zuordnung',
      customerEligibility: roles.customerDecisionEligible,
      driverEligibility: true,
    });
  }

  if (roles.assignedDriverId && roles.assignedDriverId !== roles.actualDriverId) {
    candidates.push({
      tier: TIER_ASSIGNED_DRIVER,
      attributionType: DriverAttributionType.ASSIGNED_DRIVER,
      confidence: DrivingAttributionConfidence.HIGH,
      driverId: roles.assignedDriverId,
      customerId: roles.bookingCustomerId,
      bookingId: input.assignedBookingId,
      source: DriverAttributionSource.EXPLICIT_BOOKING_LINK,
      reason: 'Explizit zugewiesener Fahrer',
      customerEligibility: roles.customerDecisionEligible,
      driverEligibility: true,
    });
  }

  if (input.handoverProof && hasCustomerHandoverSignature(input)) {
    const handoverDriverId =
      roles.assignedDriverId ??
      (input.bookingCustomerType !== CustomerType.CORPORATE ? roles.bookingCustomerId : null);
    candidates.push({
      tier: TIER_HANDOVER_PROOF,
      attributionType: DriverAttributionType.CONFIRMED_DRIVER,
      confidence: DrivingAttributionConfidence.MEDIUM,
      driverId: handoverDriverId,
      customerId: roles.bookingCustomerId,
      bookingId: input.handoverProof.bookingId,
      source: DriverAttributionSource.TRIP_ASSIGNMENT,
      reason: 'Digitaler Handover-/Fahrernachweis (Kundenunterschrift)',
      customerEligibility: roles.customerDecisionEligible && Boolean(handoverDriverId),
      driverEligibility: Boolean(handoverDriverId),
    });
  }

  if (
    roles.bookingCustomerId &&
    input.tripAttributionScope === 'BOOKING_ASSIGNED' &&
    input.bookingLinkSource === 'EXPLICIT'
  ) {
    candidates.push({
      tier: TIER_BOOKING_CUSTOMER,
      attributionType: DriverAttributionType.BOOKING_CUSTOMER_ONLY,
      confidence: DrivingAttributionConfidence.MEDIUM,
      driverId: null,
      customerId: roles.bookingCustomerId,
      bookingId: input.assignedBookingId,
      source: DriverAttributionSource.EXPLICIT_BOOKING_LINK,
      reason: 'Buchungskunde als möglicher Fahrer (begrenzte Confidence)',
      customerEligibility: roles.customerDecisionEligible,
      driverEligibility: false,
    });
  } else if (
    roles.bookingCustomerId &&
    !roles.actualDriverId &&
    !roles.assignedDriverId &&
    input.bookingCustomerType !== CustomerType.CORPORATE &&
    input.tripAttributionScope !== 'BOOKING_TIME_WINDOW_MATCH'
  ) {
    candidates.push({
      tier: TIER_BOOKING_CUSTOMER,
      attributionType: DriverAttributionType.BOOKING_CUSTOMER_ONLY,
      confidence: DrivingAttributionConfidence.LOW,
      driverId: null,
      customerId: roles.bookingCustomerId,
      bookingId: input.assignedBookingId,
      source: DriverAttributionSource.EXPLICIT_BOOKING_LINK,
      reason: 'Buchungskunde als möglicher Fahrer ohne Fahrerzuordnung',
      customerEligibility: false,
      driverEligibility: false,
    });
  }

  if (input.tripAttributionScope === 'BOOKING_TIME_WINDOW_MATCH') {
    candidates.push({
      tier: TIER_TIME_WINDOW,
      attributionType: DriverAttributionType.TIME_WINDOW_MATCH,
      confidence: mapTripConfidence(input.tripAttributionConfidence, true),
      driverId: roles.assignedDriverId,
      customerId: roles.bookingCustomerId,
      bookingId: input.assignedBookingId,
      source: DriverAttributionSource.TIME_WINDOW_OVERLAP,
      reason:
        input.tripAttributionReason ??
        'Zeitfensterzuordnung — allein nicht als HIGH bewertet',
      customerEligibility: false,
      driverEligibility: Boolean(roles.assignedDriverId),
    });
  }

  if (input.tripAttributionScope === 'UNASSIGNED' && !isStaffMovement(input)) {
    candidates.push({
      tier: TIER_VEHICLE_ONLY,
      attributionType: DriverAttributionType.VEHICLE_ONLY,
      confidence: DrivingAttributionConfidence.LOW,
      driverId: null,
      customerId: null,
      bookingId: null,
      source: DriverAttributionSource.PIPELINE_SNAPSHOT,
      reason: 'Nur Fahrzeug bekannt — kein Fahrer',
      customerEligibility: false,
      driverEligibility: false,
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      tier: TIER_UNKNOWN,
      attributionType: DriverAttributionType.UNKNOWN,
      confidence: DrivingAttributionConfidence.LOW,
      driverId: null,
      customerId: null,
      bookingId: input.assignedBookingId,
      source: DriverAttributionSource.PIPELINE_SNAPSHOT,
      reason: 'Keine belastbare Attribution',
      customerEligibility: false,
      driverEligibility: false,
    });
  }

  return candidates;
}

function detectConflicts(
  input: AttributionResolverInput,
  winner: CandidateTier,
  candidates: CandidateTier[],
): AttributionConflict[] {
  const conflicts: AttributionConflict[] = [];
  const roles = buildRoles(input);
  const types = new Set(candidates.map((c) => c.attributionType));

  if (
    (input.isPrivateTrip || input.assignmentStatus === TripAssignmentStatus.PRIVATE_UNASSIGNED) &&
    (input.assignedBookingId || input.tripAttributionScope !== 'PRIVATE')
  ) {
    conflicts.push({
      code: 'PRIVATE_VS_BOOKING_LINK',
      message: 'Privatfahrt kollidiert mit Buchungs-/Zeitfenster-Hinweis',
      competingTypes: [DriverAttributionType.PRIVATE, winner.attributionType],
    });
  }

  if (
    roles.assignedDriverId &&
    input.handoverProof &&
    hasCustomerHandoverSignature(input) &&
    winner.attributionType === DriverAttributionType.CONFIRMED_DRIVER &&
    winner.tier === TIER_HANDOVER_PROOF &&
    roles.assignedDriverId !== winner.driverId
  ) {
    conflicts.push({
      code: 'ASSIGNED_DRIVER_VS_HANDOVER',
      message: 'Zugewiesener Fahrer weicht vom Handover-Nachweis ab',
      competingTypes: [DriverAttributionType.ASSIGNED_DRIVER, DriverAttributionType.CONFIRMED_DRIVER],
    });
  }

  if (
    input.tripAttributionScope === 'BOOKING_TIME_WINDOW_MATCH' &&
    input.bookingLinkSource === 'EXPLICIT'
  ) {
    conflicts.push({
      code: 'TIME_WINDOW_VS_EXPLICIT_ASSIGNMENT',
      message: 'Zeitfenster-Hinweis bei gleichzeitiger expliziter Buchungsverknüpfung',
      competingTypes: [DriverAttributionType.TIME_WINDOW_MATCH, winner.attributionType],
    });
  }

  if (
    input.bookingCustomerType === CustomerType.CORPORATE &&
    roles.bookingCustomerId &&
    !roles.assignedDriverId &&
    !roles.actualDriverId &&
    types.has(DriverAttributionType.BOOKING_CUSTOMER_ONLY)
  ) {
    conflicts.push({
      code: 'CORPORATE_WITHOUT_DRIVER',
      message: 'Firmenkunde ohne zugewiesenen Fahrer — nicht kundenentscheidungsfähig',
      competingTypes: [DriverAttributionType.BOOKING_CUSTOMER_ONLY, winner.attributionType],
    });
  }

  if (input.manualOverride) {
    const pipelineDriver = roles.actualDriverId ?? roles.assignedDriverId;
    if (pipelineDriver && pipelineDriver !== input.manualOverride.driverId) {
      conflicts.push({
        code: 'MANUAL_OVERRIDE_VS_PIPELINE',
        message: 'Manuelle Korrektur überschreibt Pipeline-Signal',
        competingTypes: [DriverAttributionType.CONFIRMED_DRIVER, winner.attributionType],
      });
    }
  }

  if (isStaffMovement(input) && (roles.bookingCustomerId || input.tripAttributionScope === 'BOOKING_TIME_WINDOW_MATCH')) {
    conflicts.push({
      code: 'STAFF_MOVEMENT_VS_CUSTOMER_HINT',
      message: 'Mitarbeiterfahrt kollidiert mit Kunden-/Zeitfenster-Hinweis',
      competingTypes: [DriverAttributionType.STAFF_MOVEMENT, winner.attributionType],
    });
  }

  return conflicts;
}

function pickWinner(candidates: CandidateTier[]): CandidateTier {
  return [...candidates].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const confidenceRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    return confidenceRank[b.confidence] - confidenceRank[a.confidence];
  })[0]!;
}

/**
 * Central attribution resolver (P55) — priority stack with eligibility + conflict surfacing.
 */
export function resolveTripAttribution(input: AttributionResolverInput): ResolvedTripAttribution {
  if (input.isPrivateTrip || input.assignmentStatus === TripAssignmentStatus.PRIVATE_UNASSIGNED) {
    const roles = buildRoles(input);
    const conflicts: AttributionConflict[] = [];
    if (input.assignedBookingId || input.tripAttributionScope !== 'PRIVATE') {
      conflicts.push({
        code: 'PRIVATE_VS_BOOKING_LINK',
        message: 'Privatfahrt kollidiert mit Buchungs-/Zeitfenster-Hinweis',
        competingTypes: [DriverAttributionType.PRIVATE, DriverAttributionType.TIME_WINDOW_MATCH],
      });
    }
    return {
      resolverVersion: ATTRIBUTION_RESOLVER_VERSION,
      attributionType: DriverAttributionType.PRIVATE,
      confidence: DrivingAttributionConfidence.HIGH,
      customerEligibility: false,
      driverEligibility: false,
      reasons: ['Privatfahrt — nicht kundenbelastbar', 'Nicht dem Kunden anlastbar', ...conflicts.map((c) => `Konflikt: ${c.message}`)],
      conflicts,
      bookingId: input.assignedBookingId,
      customerId: null,
      driverId: null,
      source: DriverAttributionSource.PIPELINE_SNAPSHOT,
      bookingCustomerId: roles.bookingCustomerId,
      assignedDriverId: roles.assignedDriverId,
      actualDriverId: roles.actualDriverId,
    };
  }

  const roles = buildRoles(input);
  const candidates = collectCandidates(input);
  const winner = pickWinner(candidates);
  const conflicts = detectConflicts(input, winner, candidates);

  const reasons = [
    winner.reason,
    ...conflicts.map((c) => `Konflikt: ${c.message}`),
  ];

  if (winner.attributionType === DriverAttributionType.TIME_WINDOW_MATCH) {
    reasons.push('TIME_WINDOW_MATCH allein nicht als HIGH bewertet');
  }

  if (
    winner.attributionType === DriverAttributionType.PRIVATE ||
    winner.attributionType === DriverAttributionType.STAFF_MOVEMENT
  ) {
    reasons.push('Nicht dem Kunden anlastbar');
  }

  return {
    resolverVersion: ATTRIBUTION_RESOLVER_VERSION,
    attributionType: winner.attributionType,
    confidence: winner.confidence,
    customerEligibility: winner.customerEligibility,
    driverEligibility: winner.driverEligibility,
    reasons,
    conflicts,
    bookingId: winner.bookingId,
    customerId: winner.customerId,
    driverId: winner.driverId,
    source: winner.source,
    bookingCustomerId: roles.bookingCustomerId,
    assignedDriverId: roles.assignedDriverId,
    actualDriverId: input.manualOverride?.driverId ?? roles.actualDriverId,
  };
}
