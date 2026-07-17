import type { BookingCandidateMatch } from './booking-candidate-resolver.types';
import type { CustomerCandidateMatch } from './customer-candidate-resolver.types';
import type { DriverCandidateMatch } from './driver-candidate-resolver.types';
import type { PartnerCandidateMatch } from './partner-candidate-resolver.types';
import {
  ENTITY_CANDIDATE_TYPES,
  type EntityCandidateRankingInputItem,
  type EntityCandidateType,
} from './entity-candidate-ranking.types';
import type { VehicleCandidateMatch } from './vehicle-candidate-resolver.types';

const WEAK_VEHICLE_REASONS = new Set(['MAKE_MODEL', 'LICENSE_PLATE_FUZZY']);
const WEAK_BOOKING_REASONS = new Set(['CUSTOMER_NAME', 'VEHICLE_ANCHOR', 'INVOICE_REFERENCE', 'FINE_REFERENCE']);
const WEAK_CUSTOMER_REASONS = new Set(['NAME_EXACT', 'DOCUMENT_REFERENCE', 'ADDRESS_MATCH']);
const WEAK_DRIVER_REASONS = new Set(['NAME_EXACT']);
const WEAK_PARTNER_REASONS = new Set(['NAME_NORMALIZED']);

function isWeakSignalOnly(entityType: EntityCandidateType, positiveReasons: string[]): boolean {
  if (positiveReasons.length === 0) return true;
  const weakSets: Record<EntityCandidateType, Set<string>> = {
    [ENTITY_CANDIDATE_TYPES.VEHICLE]: WEAK_VEHICLE_REASONS,
    [ENTITY_CANDIDATE_TYPES.BOOKING]: WEAK_BOOKING_REASONS,
    [ENTITY_CANDIDATE_TYPES.CUSTOMER]: WEAK_CUSTOMER_REASONS,
    [ENTITY_CANDIDATE_TYPES.DRIVER]: WEAK_DRIVER_REASONS,
    [ENTITY_CANDIDATE_TYPES.PARTNER]: WEAK_PARTNER_REASONS,
  };
  const weak = weakSets[entityType];
  return positiveReasons.every((reason) => weak.has(reason));
}

function toInputItem(
  entityType: EntityCandidateType,
  entityId: string,
  candidate: {
    confidence: number;
    matchReasons: string[];
    conflicts: Array<{
      code: string;
      field: string;
      message: string;
      severity: 'BLOCKER' | 'WARNING';
    }>;
  },
): EntityCandidateRankingInputItem {
  return {
    entityType,
    entityId,
    baseScore: candidate.confidence,
    positiveReasons: [...candidate.matchReasons],
    conflicts: candidate.conflicts.map((conflict) => ({ ...conflict })),
    weakSignalOnly: isWeakSignalOnly(entityType, candidate.matchReasons),
  };
}

export function adaptVehicleCandidatesForRanking(
  candidates: VehicleCandidateMatch[],
): EntityCandidateRankingInputItem[] {
  return candidates.map((candidate) =>
    toInputItem(ENTITY_CANDIDATE_TYPES.VEHICLE, candidate.vehicleId, candidate),
  );
}

export function adaptBookingCandidatesForRanking(
  candidates: BookingCandidateMatch[],
): EntityCandidateRankingInputItem[] {
  return candidates.map((candidate) =>
    toInputItem(ENTITY_CANDIDATE_TYPES.BOOKING, candidate.bookingId, candidate),
  );
}

export function adaptCustomerCandidatesForRanking(
  candidates: CustomerCandidateMatch[],
): EntityCandidateRankingInputItem[] {
  return candidates.map((candidate) =>
    toInputItem(ENTITY_CANDIDATE_TYPES.CUSTOMER, candidate.customerId, candidate),
  );
}

export function adaptDriverCandidatesForRanking(
  candidates: DriverCandidateMatch[],
): EntityCandidateRankingInputItem[] {
  return candidates.map((candidate) =>
    toInputItem(ENTITY_CANDIDATE_TYPES.DRIVER, candidate.driverCustomerId, candidate),
  );
}

export function adaptPartnerCandidatesForRanking(
  candidates: PartnerCandidateMatch[],
): EntityCandidateRankingInputItem[] {
  return candidates.map((candidate) =>
    toInputItem(ENTITY_CANDIDATE_TYPES.PARTNER, candidate.vendorId, candidate),
  );
}

export function collectRankingInputItems(input: {
  vehicleCandidates?: VehicleCandidateMatch[];
  bookingCandidates?: BookingCandidateMatch[];
  customerCandidates?: CustomerCandidateMatch[];
  driverCandidates?: DriverCandidateMatch[];
  partnerCandidates?: PartnerCandidateMatch[];
}): EntityCandidateRankingInputItem[] {
  return [
    ...adaptVehicleCandidatesForRanking(input.vehicleCandidates ?? []),
    ...adaptBookingCandidatesForRanking(input.bookingCandidates ?? []),
    ...adaptCustomerCandidatesForRanking(input.customerCandidates ?? []),
    ...adaptDriverCandidatesForRanking(input.driverCandidates ?? []),
    ...adaptPartnerCandidatesForRanking(input.partnerCandidates ?? []),
  ];
}
