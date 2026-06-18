import { DocumentExtractionStatus, DocumentExtractionType } from '@prisma/client';
import {
  buildDocumentCategories,
  extractionToUiStatus,
  toExtractionSummary,
} from './vehicle-file-category.mapper';
import type { VehicleDocumentExtraction } from '@prisma/client';

function ext(
  partial: Partial<VehicleDocumentExtraction> & { documentType: DocumentExtractionType; status: DocumentExtractionStatus },
): VehicleDocumentExtraction {
  return {
    id: partial.id ?? `ext-${partial.documentType}`,
    vehicleId: 'v1',
    organizationId: 'org1',
    sourceFileName: partial.sourceFileName ?? 'file.pdf',
    sourceFileUrl: null,
    objectKey: null,
    storageProvider: null,
    mimeType: 'application/pdf',
    sizeBytes: 100,
    extractedData: null,
    plausibility: null,
    confirmedData: null,
    errorMessage: null,
    queuedAt: null,
    processedAt: null,
    appliedAt: null,
    createdById: null,
    serviceEventId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...partial,
  };
}

describe('extractionToUiStatus', () => {
  it('maps lifecycle statuses to UI statuses', () => {
    expect(extractionToUiStatus('READY_FOR_REVIEW')).toBe('needs_review');
    expect(extractionToUiStatus('APPLIED')).toBe('applied');
    expect(extractionToUiStatus('FAILED')).toBe('error');
    expect(extractionToUiStatus('PROCESSING')).toBe('processing');
  });
});

describe('buildDocumentCategories', () => {
  const baseInput = {
    hasInsuranceRecords: false,
    hasLeasingMasterData: false,
    hasTaxMasterData: false,
    complianceCategoryStatus: {},
  };

  it('routes document types to expected categories', () => {
    const categories = buildDocumentCategories({
      ...baseInput,
      extractions: [
        ext({ documentType: 'TUV_REPORT', status: 'APPLIED' }),
        ext({ documentType: 'BOKRAFT_REPORT', status: 'APPLIED' }),
        ext({ documentType: 'SERVICE', status: 'APPLIED' }),
        ext({ documentType: 'TIRE', status: 'APPLIED' }),
        ext({ documentType: 'BRAKE', status: 'APPLIED' }),
        ext({ documentType: 'BATTERY', status: 'APPLIED' }),
        ext({ documentType: 'DAMAGE', status: 'APPLIED' }),
        ext({ documentType: 'INVOICE', status: 'APPLIED' }),
      ],
    });
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    expect(byId.tuv_hu.documentCount).toBe(1);
    expect(byId.bokraft.documentCount).toBe(1);
    expect(byId.service_proof.documentCount).toBe(1);
    expect(byId.tire_proof.documentCount).toBe(1);
    expect(byId.brake_proof.documentCount).toBe(1);
    expect(byId.battery_proof.documentCount).toBe(1);
    expect(byId.damage_accident.documentCount).toBe(1);
    expect(byId.repair_proof.documentCount).toBe(1);
  });

  it('marks insurance verified from insurance module records', () => {
    const categories = buildDocumentCategories({
      ...baseInput,
      hasInsuranceRecords: true,
      extractions: [],
    });
    const insurance = categories.find((c) => c.id === 'insurance');
    expect(insurance?.uiStatus).toBe('verified');
    expect(insurance?.statusSource).toBe('insurance_module');
  });

  it('prioritizes needs_review over applied in category status', () => {
    const categories = buildDocumentCategories({
      ...baseInput,
      extractions: [
        ext({ id: 'a1', documentType: 'SERVICE', status: 'APPLIED' }),
        ext({ id: 'a2', documentType: 'SERVICE', status: 'READY_FOR_REVIEW' }),
      ],
    });
    const service = categories.find((c) => c.id === 'service_proof');
    expect(service?.uiStatus).toBe('needs_review');
  });

  it('uses canonical compliance status for TÜV category', () => {
    const categories = buildDocumentCategories({
      ...baseInput,
      extractions: [],
      complianceCategoryStatus: {
        tuv_hu: {
          label: 'TÜV / HU',
          status: 'warning',
          uiStatus: 'expiring_soon',
          validTill: '2026-07-01',
          lastDate: null,
          source: 'service_compliance_service',
          detail: '10 days remaining',
        },
      },
    });
    const tuv = categories.find((c) => c.id === 'tuv_hu');
    expect(tuv?.uiStatus).toBe('expiring_soon');
    expect(tuv?.statusSource).toBe('service_compliance_service');
  });
});

describe('toExtractionSummary', () => {
  it('surfaces error status from failed extractions', () => {
    const summary = toExtractionSummary(
      ext({ documentType: 'SERVICE', status: 'FAILED', errorMessage: 'OCR failed' }),
    );
    expect(summary.uiStatus).toBe('error');
    expect(summary.errorMessage).toBe('OCR failed');
  });
});
