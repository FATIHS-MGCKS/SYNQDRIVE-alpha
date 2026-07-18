import type { TranslationKey } from '../i18n/translations/en';
import {
  DOCUMENT_ENTITY_LINK_TYPES,
  findAcceptedEntityLink,
  readAcceptedEntityLinks,
  type AcceptedEntityLink,
  type DocumentEntityLinkType,
} from './document-entity-links';
import type {
  PublicBookingCandidate,
  PublicCustomerCandidate,
  PublicDocumentExtraction,
  PublicDriverCandidate,
  PublicEntityCandidateRank,
  PublicPartnerCandidate,
  PublicPartnerNewSuggestion,
  PublicUploadContextDisplay,
  PublicVehicleCandidate,
  PublicVehicleDisplay,
} from './document-extraction.types';

export type EntityReviewSectionId =
  | 'vehicle'
  | 'booking'
  | 'customer'
  | 'driver'
  | 'vendor'
  | 'additional';

export type EntityReviewConflict = {
  code: string;
  field: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
};

export type EntityReviewCandidate = {
  entityId: string;
  displayLabel: string;
  confidence: number | null;
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  rank: number;
  matchReasons: string[];
  negativeReasons: string[];
  conflicts: EntityReviewConflict[];
  confirmationRequired: boolean;
  suggestionOnly: true;
  metadata: Record<string, string>;
};

export type EntityReviewSection = {
  id: EntityReviewSectionId;
  linkEntityType: DocumentEntityLinkType | null;
  titleKey: TranslationKey;
  candidates: EntityReviewCandidate[];
  bestCandidate: EntityReviewCandidate | null;
  alternativeCandidates: EntityReviewCandidate[];
  confirmedLink: AcceptedEntityLink | null;
  originContextHint: string | null;
  driverAmbiguityHint: string | null;
  emptyStateKey: TranslationKey;
};

export type VehicleLabelLookup = Map<
  string,
  { name: string; licensePlate?: string | null }
>;

const SECTION_ORDER: EntityReviewSectionId[] = [
  'vehicle',
  'booking',
  'customer',
  'driver',
  'vendor',
  'additional',
];

const SECTION_META: Record<
  Exclude<EntityReviewSectionId, 'additional'>,
  { titleKey: TranslationKey; linkEntityType: DocumentEntityLinkType; emptyStateKey: TranslationKey }
> = {
  vehicle: {
    titleKey: 'docUpload.entityReview.section.vehicle',
    linkEntityType: 'vehicle',
    emptyStateKey: 'docUpload.entityReview.empty.vehicle',
  },
  booking: {
    titleKey: 'docUpload.entityReview.section.booking',
    linkEntityType: 'booking',
    emptyStateKey: 'docUpload.entityReview.empty.booking',
  },
  customer: {
    titleKey: 'docUpload.entityReview.section.customer',
    linkEntityType: 'customer',
    emptyStateKey: 'docUpload.entityReview.empty.customer',
  },
  driver: {
    titleKey: 'docUpload.entityReview.section.driver',
    linkEntityType: 'driver',
    emptyStateKey: 'docUpload.entityReview.empty.driver',
  },
  vendor: {
    titleKey: 'docUpload.entityReview.section.vendor',
    linkEntityType: 'vendor',
    emptyStateKey: 'docUpload.entityReview.empty.vendor',
  },
};

function formatPublicVehicleDisplay(vehicle: PublicVehicleDisplay): string {
  const plate = vehicle.licensePlate?.trim();
  const name = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
  if (plate && name) return `${plate} · ${name}`;
  return plate || name || 'Fahrzeug';
}

function formatVehicleCandidateLabel(
  vehicleId: string,
  record: PublicDocumentExtraction,
  vehicleLookup?: VehicleLabelLookup,
  fallbackIndex?: number,
): string {
  if (record.vehicle?.id === vehicleId) {
    return formatPublicVehicleDisplay(record.vehicle);
  }
  const fromLookup = vehicleLookup?.get(vehicleId);
  if (fromLookup) {
    return fromLookup.licensePlate
      ? `${fromLookup.name} · ${fromLookup.licensePlate}`
      : fromLookup.name;
  }
  return fallbackIndex != null ? `Fahrzeugkandidat ${fallbackIndex}` : 'Fahrzeugkandidat';
}

function formatBookingCandidateLabel(bookingId: string, rank: number): string {
  return `Buchungskandidat ${rank}`;
}

function mapRankingByType(
  ranking: PublicEntityCandidateRank[] | null | undefined,
  entityType: string,
): Map<string, PublicEntityCandidateRank> {
  const map = new Map<string, PublicEntityCandidateRank>();
  for (const row of ranking ?? []) {
    if (row.entityType !== entityType) continue;
    map.set(row.entityId, row);
  }
  return map;
}

function toReviewCandidate(input: {
  entityId: string;
  displayLabel: string;
  confidence: number | null;
  rank: number;
  matchReasons: string[];
  conflicts: EntityReviewConflict[];
  confirmationRequired: boolean;
  ranking?: PublicEntityCandidateRank | null;
  metadata?: Record<string, string>;
}): EntityReviewCandidate {
  return {
    entityId: input.entityId,
    displayLabel: input.displayLabel,
    confidence: input.confidence,
    confidenceLevel: input.ranking?.confidenceLevel ?? null,
    rank: input.rank,
    matchReasons: input.matchReasons,
    negativeReasons: input.ranking?.negativeReasons ?? [],
    conflicts: input.conflicts,
    confirmationRequired: input.confirmationRequired,
    suggestionOnly: true,
    metadata: input.metadata ?? {},
  };
}

function buildVehicleSection(
  record: PublicDocumentExtraction,
  acceptedLinks: AcceptedEntityLink[],
  vehicleLookup?: VehicleLabelLookup,
): EntityReviewSection {
  const ranking = mapRankingByType(record.entityCandidateRanking?.candidates, 'VEHICLE');
  const candidates = (record.vehicleCandidates ?? []).map((candidate: PublicVehicleCandidate, index) =>
    toReviewCandidate({
      entityId: candidate.vehicleId,
      displayLabel: formatVehicleCandidateLabel(candidate.vehicleId, record, vehicleLookup, candidate.rank ?? index + 1),
      confidence: candidate.confidence,
      rank: candidate.rank ?? index + 1,
      matchReasons: candidate.matchReasons,
      conflicts: candidate.conflicts,
      confirmationRequired: candidate.confirmationRequired,
      ranking: ranking.get(candidate.vehicleId) ?? null,
    }),
  );
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
  const meta = SECTION_META.vehicle;
  return {
    id: 'vehicle',
    linkEntityType: meta.linkEntityType,
    titleKey: meta.titleKey,
    candidates: sorted,
    bestCandidate: sorted[0] ?? null,
    alternativeCandidates: sorted.slice(1),
    confirmedLink: findAcceptedEntityLink(acceptedLinks, 'vehicle'),
    originContextHint: buildOriginContextHint(record.uploadContext, 'VEHICLE', record.vehicleId),
    driverAmbiguityHint: null,
    emptyStateKey: meta.emptyStateKey,
  };
}

function buildBookingSection(record: PublicDocumentExtraction, acceptedLinks: AcceptedEntityLink[]): EntityReviewSection {
  const ranking = mapRankingByType(record.entityCandidateRanking?.candidates, 'BOOKING');
  const candidates = (record.bookingCandidates ?? []).map((candidate: PublicBookingCandidate, index) =>
    toReviewCandidate({
      entityId: candidate.bookingId,
      displayLabel: formatBookingCandidateLabel(candidate.bookingId, candidate.rank ?? index + 1),
      confidence: candidate.confidence,
      rank: candidate.rank ?? index + 1,
      matchReasons: candidate.matchReasons,
      conflicts: candidate.conflicts,
      confirmationRequired: candidate.confirmationRequired,
      ranking: ranking.get(candidate.bookingId) ?? null,
      metadata: candidate.temporalOverlap ? { temporalOverlap: 'true' } : {},
    }),
  );
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
  const meta = SECTION_META.booking;
  return {
    id: 'booking',
    linkEntityType: meta.linkEntityType,
    titleKey: meta.titleKey,
    candidates: sorted,
    bestCandidate: sorted[0] ?? null,
    alternativeCandidates: sorted.slice(1),
    confirmedLink: findAcceptedEntityLink(acceptedLinks, 'booking'),
    originContextHint: buildOriginContextHint(record.uploadContext, 'BOOKING'),
    driverAmbiguityHint: null,
    emptyStateKey: meta.emptyStateKey,
  };
}

function buildCustomerSection(record: PublicDocumentExtraction, acceptedLinks: AcceptedEntityLink[]): EntityReviewSection {
  const ranking = mapRankingByType(record.entityCandidateRanking?.candidates, 'CUSTOMER');
  const candidates = (record.customerCandidates ?? []).map((candidate: PublicCustomerCandidate, index) =>
    toReviewCandidate({
      entityId: candidate.customerId,
      displayLabel: candidate.displayLabel,
      confidence: candidate.confidence,
      rank: candidate.rank ?? index + 1,
      matchReasons: candidate.matchReasons,
      conflicts: candidate.conflicts,
      confirmationRequired: candidate.confirmationRequired,
      ranking: ranking.get(candidate.customerId) ?? null,
    }),
  );
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
  const meta = SECTION_META.customer;
  return {
    id: 'customer',
    linkEntityType: meta.linkEntityType,
    titleKey: meta.titleKey,
    candidates: sorted,
    bestCandidate: sorted[0] ?? null,
    alternativeCandidates: sorted.slice(1),
    confirmedLink: findAcceptedEntityLink(acceptedLinks, 'customer'),
    originContextHint: buildOriginContextHint(record.uploadContext, 'CUSTOMER'),
    driverAmbiguityHint: null,
    emptyStateKey: meta.emptyStateKey,
  };
}

function buildDriverSection(record: PublicDocumentExtraction, acceptedLinks: AcceptedEntityLink[]): EntityReviewSection {
  const ranking = mapRankingByType(record.entityCandidateRanking?.candidates, 'DRIVER');
  const candidates = (record.driverCandidates ?? []).map((candidate: PublicDriverCandidate, index) =>
    toReviewCandidate({
      entityId: candidate.driverCustomerId,
      displayLabel: candidate.displayLabel,
      confidence: candidate.confidence,
      rank: candidate.rank ?? index + 1,
      matchReasons: candidate.matchReasons,
      conflicts: candidate.conflicts,
      confirmationRequired: candidate.confirmationRequired,
      ranking: ranking.get(candidate.driverCustomerId) ?? null,
      metadata: { driverRole: candidate.driverRole },
    }),
  );
  const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
  const meta = SECTION_META.driver;
  return {
    id: 'driver',
    linkEntityType: meta.linkEntityType,
    titleKey: meta.titleKey,
    candidates: sorted,
    bestCandidate: sorted[0] ?? null,
    alternativeCandidates: sorted.slice(1),
    confirmedLink: findAcceptedEntityLink(acceptedLinks, 'driver'),
    originContextHint: buildOriginContextHint(record.uploadContext, 'DRIVER'),
    driverAmbiguityHint: resolveDriverAmbiguityHint(sorted),
    emptyStateKey: meta.emptyStateKey,
  };
}

function buildVendorSection(
  record: PublicDocumentExtraction,
  acceptedLinks: AcceptedEntityLink[],
): EntityReviewSection {
  const ranking = mapRankingByType(record.entityCandidateRanking?.candidates, 'PARTNER');
  const candidates = (record.partnerCandidates ?? []).map((candidate: PublicPartnerCandidate, index) =>
    toReviewCandidate({
      entityId: candidate.vendorId,
      displayLabel: candidate.displayLabel,
      confidence: candidate.confidence,
      rank: candidate.rank ?? index + 1,
      matchReasons: candidate.matchReasons,
      conflicts: candidate.conflicts,
      confirmationRequired: candidate.confirmationRequired,
      ranking: ranking.get(candidate.vendorId) ?? null,
      metadata: {
        partnerKind: candidate.partnerKind,
        vendorCategory: candidate.vendorCategory,
      },
    }),
  );

  const suggestion = record.partnerNewSuggestion;
  if (suggestion) {
    candidates.push(
      toReviewCandidate({
        entityId: `suggestion:${suggestion.sourceField}`,
        displayLabel: suggestion.displayLabel,
        confidence: null,
        rank: candidates.length + 1,
        matchReasons: ['PARTNER_NEW_SUGGESTION'],
        conflicts: [],
        confirmationRequired: true,
        metadata: { partnerKind: suggestion.partnerKind, suggestion: 'true' },
      }),
    );
  }

  const sorted = [...candidates].sort((a, b) => a.rank - b.rank);
  const meta = SECTION_META.vendor;
  return {
    id: 'vendor',
    linkEntityType: meta.linkEntityType,
    titleKey: meta.titleKey,
    candidates: sorted,
    bestCandidate: sorted[0] ?? null,
    alternativeCandidates: sorted.slice(1),
    confirmedLink: findAcceptedEntityLink(acceptedLinks, 'vendor'),
    originContextHint: buildOriginContextHint(record.uploadContext, 'VENDOR'),
    driverAmbiguityHint: null,
    emptyStateKey: meta.emptyStateKey,
  };
}

function buildAdditionalSection(
  record: PublicDocumentExtraction,
  acceptedLinks: AcceptedEntityLink[],
): EntityReviewSection {
  const knownTypes = new Set(DOCUMENT_ENTITY_LINK_TYPES);
  const additionalLinks = acceptedLinks.filter((link) => !knownTypes.has(link.entityType as DocumentEntityLinkType));
  const candidates: EntityReviewCandidate[] = additionalLinks.map((link, index) =>
    toReviewCandidate({
      entityId: link.entityId,
      displayLabel: link.label || `Link ${index + 1}`,
      confidence: null,
      rank: index + 1,
      matchReasons: [],
      conflicts: [],
      confirmationRequired: false,
    }),
  );

  return {
    id: 'additional',
    linkEntityType: null,
    titleKey: 'docUpload.entityReview.section.additional',
    candidates,
    bestCandidate: candidates[0] ?? null,
    alternativeCandidates: candidates.slice(1),
    confirmedLink: null,
    originContextHint: null,
    driverAmbiguityHint: null,
    emptyStateKey: 'docUpload.entityReview.empty.additional',
  };
}

function buildOriginContextHint(
  uploadContext: PublicUploadContextDisplay | null | undefined,
  entityType: string,
  scopedEntityId?: string | null,
): string | null {
  if (!uploadContext) return null;
  if (uploadContext.entityType !== entityType) return null;
  if (scopedEntityId && uploadContext.entityId !== scopedEntityId) return null;
  return uploadContext.label || null;
}

function resolveDriverAmbiguityHint(candidates: EntityReviewCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const unknownRoles = candidates.filter((candidate) => candidate.metadata.driverRole === 'UNKNOWN');
  if (unknownRoles.length > 0) return 'docUpload.entityReview.driverAmbiguousRole';
  if (candidates.length > 1) {
    const top = candidates[0];
    const second = candidates[1];
    if (
      top.confidence != null &&
      second.confidence != null &&
      Math.abs(top.confidence - second.confidence) <= 0.12
    ) {
      return 'docUpload.entityReview.driverAmbiguousMultiple';
    }
  }
  return null;
}

export function buildEntityReviewSections(
  record: PublicDocumentExtraction | null,
  options?: {
    vehicleLookup?: VehicleLabelLookup;
    includeEmptySections?: boolean;
  },
): EntityReviewSection[] {
  if (!record) return [];
  const acceptedLinks = readAcceptedEntityLinks(record.confirmedData);
  const sections: EntityReviewSection[] = [
    buildVehicleSection(record, acceptedLinks, options?.vehicleLookup),
    buildBookingSection(record, acceptedLinks),
    buildCustomerSection(record, acceptedLinks),
    buildDriverSection(record, acceptedLinks),
    buildVendorSection(record, acceptedLinks),
    buildAdditionalSection(record, acceptedLinks),
  ];

  if (options?.includeEmptySections) {
    return sections;
  }

  return sections.filter((section) => {
    if (section.id === 'additional') {
      return section.candidates.length > 0;
    }
    return (
      section.candidates.length > 0 ||
      section.confirmedLink != null ||
      section.originContextHint != null
    );
  });
}

export function formatEntityConfidencePercent(confidence: number | null): string | null {
  if (confidence == null || Number.isNaN(confidence)) return null;
  const pct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
  return `${Math.max(0, Math.min(100, pct))}%`;
}

export function entityReviewSectionOrder(): EntityReviewSectionId[] {
  return [...SECTION_ORDER];
}
