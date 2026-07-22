import type { OrganizationLegalDocument, OrganizationLegalDocumentStation } from '@prisma/client';
import type { LegalDocumentScopeShape } from './legal-document-scope.conflicts';

export type LegalDocumentWithStations = OrganizationLegalDocument & {
  stations?: Pick<OrganizationLegalDocumentStation, 'stationId'>[];
};

export function toLegalDocumentScopeShape(
  doc: LegalDocumentWithStations,
): LegalDocumentScopeShape {
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    documentType: doc.documentType,
    legalVariant: doc.legalVariant,
    language: doc.language,
    jurisdictionCountry: doc.jurisdictionCountry,
    customerSegment: doc.customerSegment,
    bookingChannel: doc.bookingChannel,
    productScope: doc.productScope,
    stationScopeMode: doc.stationScopeMode,
    stationIds: (doc.stations ?? []).map((s) => s.stationId),
    priority: doc.priority,
    noticePurpose: doc.noticePurpose,
    validFrom: doc.validFrom,
    validUntil: doc.validUntil,
    status: doc.status,
  };
}

export interface LegalDocumentApplicationScopeDto {
  language: string;
  jurisdictionCountry: string;
  customerSegment: string;
  bookingChannel: string;
  productScope: string | null;
  stationScopeMode: string;
  stationIds: string[];
  priority: number;
  isMandatory: boolean;
  noticePurpose: string;
  validFrom: string | null;
  validUntil: string | null;
}

export function scopeToDto(
  doc: LegalDocumentWithStations,
): LegalDocumentApplicationScopeDto {
  return {
    language: doc.language,
    jurisdictionCountry: doc.jurisdictionCountry,
    customerSegment: doc.customerSegment,
    bookingChannel: doc.bookingChannel,
    productScope: doc.productScope,
    stationScopeMode: doc.stationScopeMode,
    stationIds: (doc.stations ?? []).map((s) => s.stationId),
    priority: doc.priority,
    isMandatory: doc.isMandatory,
    noticePurpose: doc.noticePurpose,
    validFrom: doc.validFrom ? doc.validFrom.toISOString() : null,
    validUntil: doc.validUntil ? doc.validUntil.toISOString() : null,
  };
}
