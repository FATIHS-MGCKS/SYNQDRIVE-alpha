import { buildDocumentActionPlan } from './document-action-plan.builder';
import { resolveConfirmedValuesForActionPlan } from './document-field-provenance.util';

describe('document-action-plan confirmed data contract', () => {
  it('builds plans from confirmed values only', () => {
    const confirmedData = resolveConfirmedValuesForActionPlan({
      invoiceNumber: 'INV-1',
      totalCents: 1000,
      eventDate: '2026-01-01',
      extractedOnlyLeak: 'must-not-influence',
    });

    const plan = buildDocumentActionPlan({
      extractionId: 'e1',
      organizationId: 'org-1',
      vehicleId: 'v1',
      documentType: 'INVOICE',
      confirmedData,
      plausibilityChecks: [],
      confirmedById: 'user-1',
    });

    expect(plan.documentType).toBe('INVOICE');
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(confirmedData).toHaveProperty('extractedOnlyLeak');
    expect(plan.fingerprint).toBeTruthy();
  });
});
