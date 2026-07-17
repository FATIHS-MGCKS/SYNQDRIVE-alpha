import { AUTHORITY_LETTER } from './__fixtures__/document-archive-fixtures';
import { TUV_NO_DEFECT } from './__fixtures__/document-inspection-fixtures';
import { DAMAGE_COMPLETE } from './__fixtures__/document-damage-fixtures';
import { FINE_COMPLETE, FINE_MISSING_EVENT_DATE } from './__fixtures__/document-fine-fixtures';
import { INVOICE_COMPLETE_19 } from './__fixtures__/document-invoice-fixtures';
import { SERVICE_COMPLETE } from './__fixtures__/document-service-fixtures';
import { TIRE_COMPLETE } from './__fixtures__/document-tire-fixtures';
import {
  assertExecutableActionPlan,
  buildDocumentActionPlan,
} from './document-action-plan.builder';
import { DOCUMENT_ACTION_PLAN_STATUSES } from './document-action.types';
import { DocumentActionPlanError } from './document-action.errors';

const baseInput = {
  extractionId: 'ext-builder-1',
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  plausibilityChecks: [],
  confirmedById: 'user-1',
};

describe('document-action-plan.builder', () => {
  it('builds archive plan with fingerprint and sequences', () => {
    const plan = buildDocumentActionPlan({
      ...baseInput,
      documentType: 'OTHER',
      confirmedData: AUTHORITY_LETTER,
    });

    expect(plan.planOutcome).toBe('ARCHIVE_ONLY');
    expect(plan.status).toBe(DOCUMENT_ACTION_PLAN_STATUSES.CONFIRMED);
    expect(plan.fingerprint).toEqual(expect.any(String));
    expect(plan.actions.map((row) => row.semanticAction)).toContain('ARCHIVE_DOCUMENT');
    expect(plan.actions.every((row, index) => row.sequence === index + 1)).toBe(true);
  });

  it('builds fine plan and blocks when required fields are missing', () => {
    const ready = buildDocumentActionPlan({
      ...baseInput,
      extractionId: 'ext-fine-ready',
      documentType: 'FINE',
      confirmedData: FINE_COMPLETE,
    });
    expect(ready.planOutcome).toBe('READY');
    expect(ready.actions.some((row) => row.semanticAction === 'CREATE_FINE_DRAFT')).toBe(true);

    const blocked = buildDocumentActionPlan({
      ...baseInput,
      extractionId: 'ext-fine-blocked',
      documentType: 'FINE',
      confirmedData: FINE_MISSING_EVENT_DATE,
    });
    expect(blocked.planOutcome).toBe('BLOCKED');
    expect((blocked.metadata?.missingRequirements as unknown[])?.length ?? 0).toBeGreaterThan(0);
  });

  it('builds invoice, service, inspection, damage and technical plans', () => {
    const invoice = buildDocumentActionPlan({
      ...baseInput,
      extractionId: 'ext-invoice',
      documentType: 'INVOICE',
      confirmedData: INVOICE_COMPLETE_19,
    });
    expect(invoice.planOutcome).toBe('READY');
    expect(invoice.actions.some((row) => row.semanticAction === 'CREATE_INVOICE_DRAFT')).toBe(true);

    const service = buildDocumentActionPlan({
      ...baseInput,
      extractionId: 'ext-service',
      documentType: 'SERVICE',
      confirmedData: SERVICE_COMPLETE,
    });
    expect(service.actions.some((row) => row.semanticAction === 'CREATE_SERVICE_EVENT')).toBe(true);

    const inspection = buildDocumentActionPlan({
      ...baseInput,
      extractionId: 'ext-tuv',
      documentType: 'TUV_REPORT',
      confirmedData: TUV_NO_DEFECT,
    });
    expect(
      inspection.actions.some((row) => row.semanticAction === 'UPDATE_VEHICLE_COMPLIANCE_DATES'),
    ).toBe(true);

    const damage = buildDocumentActionPlan({
      ...baseInput,
      extractionId: 'ext-damage',
      documentType: 'DAMAGE',
      confirmedData: DAMAGE_COMPLETE,
    });
    expect(damage.actions.some((row) => row.semanticAction === 'CREATE_DAMAGE_DRAFT')).toBe(true);

    const tire = buildDocumentActionPlan({
      ...baseInput,
      extractionId: 'ext-tire',
      documentType: 'TIRE',
      confirmedData: TIRE_COMPLETE,
    });
    expect(tire.actions.some((row) => row.semanticAction === 'APPLY_TIRE_MEASUREMENT')).toBe(true);
  });

  it('returns UNSUPPORTED for unknown document types', () => {
    const plan = buildDocumentActionPlan({
      ...baseInput,
      documentType: 'UNSUPPORTED_TYPE' as 'FINE',
      confirmedData: {},
    });
    expect(plan.planOutcome).toBe('UNSUPPORTED');
    expect(plan.actions).toHaveLength(0);
  });

  describe('assertExecutableActionPlan', () => {
    it('rejects blocked plans', () => {
      const plan = buildDocumentActionPlan({
        ...baseInput,
        documentType: 'FINE',
        confirmedData: FINE_MISSING_EVENT_DATE,
      });

      expect(() => assertExecutableActionPlan(plan)).toThrow(DocumentActionPlanError);
    });

    it('allows retry when lifecycle is PARTIALLY_APPLIED', () => {
      const plan = buildDocumentActionPlan({
        ...baseInput,
        documentType: 'FINE',
        confirmedData: FINE_COMPLETE,
      });

      expect(() =>
        assertExecutableActionPlan(plan, {
          status: 'PARTIALLY_APPLIED',
          updatedAt: new Date().toISOString(),
        }),
      ).not.toThrow();
    });

    it('rejects invalidated plans', () => {
      const plan = buildDocumentActionPlan({
        ...baseInput,
        documentType: 'FINE',
        confirmedData: FINE_COMPLETE,
      });
      plan.status = DOCUMENT_ACTION_PLAN_STATUSES.INVALIDATED;

      expect(() => assertExecutableActionPlan(plan)).toThrow(DocumentActionPlanError);
    });
  });
});
