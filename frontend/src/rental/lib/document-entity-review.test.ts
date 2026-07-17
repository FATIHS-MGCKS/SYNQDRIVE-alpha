import { describe, expect, it } from 'vitest';
import { readAcceptedEntityLinks } from './document-entity-links';
import { buildEntityReviewSections } from './document-entity-review';
import type { PublicDocumentExtraction } from './document-extraction.types';

function baseRecord(overrides: Partial<PublicDocumentExtraction> = {}): PublicDocumentExtraction {
  return {
    id: 'ext-1',
    vehicleId: null,
    organizationId: 'org-1',
    uploadContext: null,
    vehicleCandidates: null,
    bookingCandidates: null,
    customerCandidates: null,
    driverCandidates: null,
    partnerCandidates: null,
    partnerNewSuggestion: null,
    entityCandidateRanking: null,
    vehicle: null,
    status: 'READY_FOR_REVIEW',
    processingStage: 'REVIEW',
    sourceFileName: 'doc.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    requestedDocumentType: 'AUTO',
    detectedDocumentType: 'FINE',
    effectiveDocumentType: 'FINE',
    documentType: 'FINE',
    classificationMode: 'AUTO',
    classificationConfidence: 0.9,
    documentCategory: 'AUTHORITY',
    documentSubtype: 'FINE_NOTICE',
    documentTaxonomyVersion: '1.0.0',
    archiveRecommended: false,
    errorPhase: null,
    errorCode: null,
    errorMessage: null,
    processingAttempts: 1,
    extractedData: {},
    plausibility: {},
    confirmedData: {},
    fieldProvenance: null,
    fieldCorrectionCount: null,
    queuedAt: null,
    appliedAt: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    hasStoredFile: true,
    allowedActions: ['confirm', 'set_document_type'],
    ...overrides,
  };
}

describe('document-entity-review', () => {
  it('returns no visible sections when record is null', () => {
    expect(buildEntityReviewSections(null)).toEqual([]);
  });

  it('builds vehicle section with zero candidates and origin context', () => {
    const sections = buildEntityReviewSections(
      baseRecord({
        uploadContext: {
          entityType: 'VEHICLE',
          entityId: 'veh-ctx',
          sourceSurface: 'vehicle_detail',
          providedAt: '2026-07-17T00:00:00.000Z',
          providedByUserId: null,
          confirmationStatus: 'CANDIDATE',
          label: 'Aufgerufen aus Fahrzeugdetail – noch nicht bestaetigt',
          resolverStatus: 'PENDING',
          conflicts: [],
        },
        vehicleCandidates: [],
      }),
      { includeEmptySections: true },
    );
    const vehicle = sections.find((section) => section.id === 'vehicle');
    expect(vehicle?.candidates).toHaveLength(0);
    expect(vehicle?.bestCandidate).toBeNull();
    expect(vehicle?.originContextHint).toContain('noch nicht');
  });

  it('builds single-candidate customer section without confirmed link', () => {
    const sections = buildEntityReviewSections(
      baseRecord({
        customerCandidates: [
          {
            customerId: 'cust-1',
            confidence: 0.91,
            matchReasons: ['NAME_EXACT'],
            conflicts: [],
            rank: 1,
            confirmationRequired: true,
            displayLabel: 'Max Mustermann',
          },
        ],
      }),
    );
    const customer = sections.find((section) => section.id === 'customer');
    expect(customer?.bestCandidate?.displayLabel).toBe('Max Mustermann');
    expect(customer?.alternativeCandidates).toHaveLength(0);
    expect(customer?.confirmedLink).toBeNull();
  });

  it('splits best and alternative driver candidates and flags ambiguity', () => {
    const sections = buildEntityReviewSections(
      baseRecord({
        driverCandidates: [
          {
            driverCustomerId: 'driver-1',
            confidence: 0.62,
            matchReasons: ['NAME_EXACT'],
            conflicts: [],
            rank: 1,
            confirmationRequired: true,
            displayLabel: 'Alex A.',
            driverRole: 'UNKNOWN',
          },
          {
            driverCustomerId: 'driver-2',
            confidence: 0.58,
            matchReasons: ['EMAIL_EXACT'],
            conflicts: [],
            rank: 2,
            confirmationRequired: true,
            displayLabel: 'Alex B.',
            driverRole: 'ADDITIONAL',
          },
        ],
      }),
    );
    const driver = sections.find((section) => section.id === 'driver');
    expect(driver?.bestCandidate?.entityId).toBe('driver-1');
    expect(driver?.alternativeCandidates).toHaveLength(1);
    expect(driver?.driverAmbiguityHint).toBe('docUpload.entityReview.driverAmbiguousRole');
  });

  it('reads confirmed links separately from suggestions', () => {
    const record = baseRecord({
      confirmedData: {
        acceptedEntityLinks: [{ entityType: 'customer', entityId: 'cust-9', label: 'Bestaetigter Kunde' }],
      },
      customerCandidates: [
        {
          customerId: 'cust-1',
          confidence: 0.8,
          matchReasons: ['NAME_EXACT'],
          conflicts: [],
          rank: 1,
          confirmationRequired: true,
          displayLabel: 'Vorschlag Kunde',
        },
      ],
    });
    const links = readAcceptedEntityLinks(record.confirmedData);
    const customer = buildEntityReviewSections(record).find((section) => section.id === 'customer');
    expect(links).toHaveLength(1);
    expect(customer?.confirmedLink?.entityId).toBe('cust-9');
    expect(customer?.bestCandidate?.displayLabel).toBe('Vorschlag Kunde');
  });
});
