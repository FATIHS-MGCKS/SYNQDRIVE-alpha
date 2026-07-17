import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentEntityReview } from './DocumentEntityReview';

const t = (key: string, vars?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    'docUpload.entityReview.title': 'Zuordnungen',
    'docUpload.entityReview.subtitle': 'Nur Vorschlaege',
    'docUpload.entityReview.section.customer': 'Kunde',
    'docUpload.entityReview.section.vehicle': 'Fahrzeug',
    'docUpload.entityReview.unconfirmedBadge': 'Nicht bestaetigt',
    'docUpload.entityReview.empty.customer': 'Keine Kundenkandidaten',
    'docUpload.entityReview.empty.vehicle': 'Keine Fahrzeugkandidaten',
    'docUpload.entityReview.bestCandidate': 'Bester Kandidat',
    'docUpload.entityReview.suggestionBadge': 'Vorschlag',
    'docUpload.entityReview.matchReasons': 'Match-Gruende',
    'docUpload.entityReview.reason.NAME_EXACT': 'Namens-Treffer',
    'docUpload.entityReview.select': 'Auswaehlen',
    'docUpload.entityReview.search': 'Suche',
    'docUpload.entityReview.notAssignable': 'Nicht zuordnen',
    'docUpload.entityReview.confidence.HIGH': 'Hohe Sicherheit',
  };
  const value = map[key] ?? key;
  if (!vars) return value;
  return Object.entries(vars).reduce(
    (acc, [name, val]) => acc.replace(`{${name}}`, String(val)),
    value,
  );
};

describe('DocumentEntityReview UI', () => {
  it('renders empty customer section without raw UUIDs', () => {
    const html = renderToStaticMarkup(
      <DocumentEntityReview
        record={{
          id: 'ext-1',
          vehicleId: null,
          organizationId: 'org-1',
          uploadContext: null,
          vehicleCandidates: [],
          bookingCandidates: [],
          customerCandidates: [],
          driverCandidates: [],
          partnerCandidates: [],
          partnerNewSuggestion: null,
          entityCandidateRanking: null,
          vehicle: null,
          status: 'READY_FOR_REVIEW',
          processingStage: 'REVIEW',
          sourceFileName: 'doc.pdf',
          mimeType: null,
          sizeBytes: null,
          requestedDocumentType: 'AUTO',
          detectedDocumentType: 'FINE',
          effectiveDocumentType: 'FINE',
          documentType: 'FINE',
          classificationMode: 'AUTO',
          classificationConfidence: 0.9,
          documentCategory: null,
          documentSubtype: null,
          documentTaxonomyVersion: null,
          archiveRecommended: false,
          errorPhase: null,
          errorCode: null,
          errorMessage: null,
          processingAttempts: 1,
          extractedData: {},
          plausibility: {},
          confirmedData: {},
          queuedAt: null,
          appliedAt: null,
          createdAt: '2026-07-17T00:00:00.000Z',
          updatedAt: '2026-07-17T00:00:00.000Z',
          hasStoredFile: true,
          allowedActions: ['confirm'],
        }}
        orgId="org-1"
        extractionId="ext-1"
        t={t}
      />,
    );
    expect(html).toContain('Keine Kundenkandidaten');
    expect(html).not.toContain('cust-');
  });

  it('renders single customer candidate as suggestion', () => {
    const html = renderToStaticMarkup(
      <DocumentEntityReview
        record={{
          id: 'ext-1',
          vehicleId: null,
          organizationId: 'org-1',
          uploadContext: null,
          vehicleCandidates: [],
          bookingCandidates: [],
          customerCandidates: [
            {
              customerId: 'cust-hidden',
              confidence: 0.91,
              matchReasons: ['NAME_EXACT'],
              conflicts: [],
              rank: 1,
              confirmationRequired: true,
              displayLabel: 'Max Mustermann',
            },
          ],
          driverCandidates: [],
          partnerCandidates: [],
          partnerNewSuggestion: null,
          entityCandidateRanking: null,
          vehicle: null,
          status: 'READY_FOR_REVIEW',
          processingStage: 'REVIEW',
          sourceFileName: 'doc.pdf',
          mimeType: null,
          sizeBytes: null,
          requestedDocumentType: 'AUTO',
          detectedDocumentType: 'FINE',
          effectiveDocumentType: 'FINE',
          documentType: 'FINE',
          classificationMode: 'AUTO',
          classificationConfidence: 0.9,
          documentCategory: null,
          documentSubtype: null,
          documentTaxonomyVersion: null,
          archiveRecommended: false,
          errorPhase: null,
          errorCode: null,
          errorMessage: null,
          processingAttempts: 1,
          extractedData: {},
          plausibility: {},
          confirmedData: {},
          queuedAt: null,
          appliedAt: null,
          createdAt: '2026-07-17T00:00:00.000Z',
          updatedAt: '2026-07-17T00:00:00.000Z',
          hasStoredFile: true,
          allowedActions: ['confirm'],
        }}
        orgId="org-1"
        extractionId="ext-1"
        t={t}
      />,
    );
    expect(html).toContain('Max Mustermann');
    expect(html).toContain('Vorschlag');
    expect(html).not.toContain('cust-hidden');
  });
});
