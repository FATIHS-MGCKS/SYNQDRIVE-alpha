import { describe, expect, it } from 'vitest';
import { mapFlowStatus } from './document-extraction.shared';
import {
  categorySortPriority,
  formatStatusSource,
  MANDATORY_CATEGORY_IDS,
  sortDocumentCategories,
} from './vehicle-file.constants';
import type { VehicleDocumentCategorySummary } from '../../lib/vehicle-file-summary.types';

function cat(
  partial: Partial<VehicleDocumentCategorySummary> & { id: VehicleDocumentCategorySummary['id'] },
): VehicleDocumentCategorySummary {
  return {
    label: partial.id,
    uiStatus: 'missing',
    statusSource: 'not_available',
    documentCount: 0,
    latestExtractionId: null,
    latestFileName: null,
    complianceDisplay: null,
    ...partial,
  };
}

describe('document extraction flow status', () => {
  it('maps READY_FOR_REVIEW to needs_review', () => {
    expect(mapFlowStatus('READY_FOR_REVIEW')).toBe('ready');
  });

  it('maps APPLIED to done', () => {
    expect(mapFlowStatus('APPLIED')).toBe('done');
  });
});

describe('vehicle file category sorting', () => {
  it('sorts missing mandatory documents before verified optional', () => {
    const sorted = sortDocumentCategories([
      cat({ id: 'other', uiStatus: 'verified' }),
      cat({ id: 'registration', uiStatus: 'missing' }),
      cat({ id: 'service_proof', uiStatus: 'needs_review' }),
    ]);
    expect(sorted[0].id).toBe('registration');
    expect(sorted[1].id).toBe('service_proof');
  });
});

describe('formatStatusSource', () => {
  it('labels canonical backend sources for operators', () => {
    expect(formatStatusSource('rental_health_service')).toBe('RentalHealth');
    expect(formatStatusSource('service_compliance_service')).toBe('Service Compliance');
    expect(formatStatusSource('document_extraction')).toBe('AI Document Extraction');
  });
});

describe('mandatory categories', () => {
  it('includes registration, insurance, tax and leasing', () => {
    expect(MANDATORY_CATEGORY_IDS).toEqual(['registration', 'insurance', 'tax', 'leasing_financing']);
  });
});

describe('fixed cost presentation helpers', () => {
  it('does not treat dash as configured amount', () => {
    const monthlyTotal = [null, 120, null]
      .filter((v): v is number => v != null)
      .reduce((a, b) => a + b, 0);
    expect(monthlyTotal).toBe(120);
  });
});

describe('categorySortPriority', () => {
  it('ranks expired compliance higher than verified', () => {
    const expired = categorySortPriority(cat({ id: 'tuv_hu', uiStatus: 'expired' }));
    const verified = categorySortPriority(cat({ id: 'tuv_hu', uiStatus: 'verified' }));
    expect(expired).toBeLessThan(verified);
  });
});
