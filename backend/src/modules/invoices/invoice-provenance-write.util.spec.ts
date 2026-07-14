import {
  provenanceForApiInvoice,
  provenanceForBookingWizardInvoice,
  provenanceForBundlePipelineInvoice,
  provenanceForDocumentExtractionInvoice,
  provenanceForManualUiInvoice,
  provenanceForSystemMigration,
  provenanceForWorkflowAutomation,
  provenanceToPrismaFields,
} from './invoice-provenance-write.util';

describe('invoice-provenance-write.util', () => {
  it('booking wizard preset: user trigger + booking source', () => {
    const p = provenanceForBookingWizardInvoice({
      bookingId: 'bk-1',
      userId: 'user-1',
      correlationId: 'corr-1',
    });
    expect(p.creationChannel).toBe('BOOKING_WIZARD');
    expect(p.triggeredByType).toBe('USER');
    expect(p.sourceType).toBe('BOOKING');
    expect(p.sourceId).toBe('bk-1');
    expect(p.createdByUserId).toBe('user-1');
  });

  it('booking wizard without user falls back to SYSTEM trigger', () => {
    const p = provenanceForBookingWizardInvoice({ bookingId: 'bk-1' });
    expect(p.triggeredByType).toBe('SYSTEM');
    expect(p.createdByUserId).toBeNull();
  });

  it('manual UI preset uses MANUAL source when no links', () => {
    const p = provenanceForManualUiInvoice({ userId: 'u1' });
    expect(p.creationChannel).toBe('MANUAL_UI');
    expect(p.sourceType).toBe('MANUAL');
  });

  it('API preset uses API_CLIENT trigger', () => {
    const p = provenanceForApiInvoice({ userId: 'u1', bookingId: 'bk-1' });
    expect(p.creationChannel).toBe('API');
    expect(p.triggeredByType).toBe('API_CLIENT');
    expect(p.sourceType).toBe('BOOKING');
  });

  it('document extraction preset links extraction id', () => {
    const p = provenanceForDocumentExtractionInvoice({
      extractionId: 'ext-1',
      userId: 'u1',
    });
    expect(p.creationChannel).toBe('DOCUMENT_EXTRACTION');
    expect(p.sourceType).toBe('DOCUMENT');
    expect(p.sourceId).toBe('ext-1');
  });

  it('bundle pipeline separates generator from user trigger', () => {
    const p = provenanceForBundlePipelineInvoice({
      bookingId: 'bk-1',
      userId: 'u1',
      variant: 'FINAL_INVOICE',
    });
    expect(p.creationChannel).toBe('AUTOMATION');
    expect(p.triggeredByType).toBe('USER');
    expect(p.automationId).toBe('booking-final-invoice');
  });

  it('workflow automation preset', () => {
    const p = provenanceForWorkflowAutomation({
      automationId: 'wf-1',
      sourceType: 'SERVICE',
      sourceId: 'svc-1',
    });
    expect(p.triggeredByType).toBe('AUTOMATION');
    expect(p.automationId).toBe('wf-1');
  });

  it('system migration preset has no createdByUserId', () => {
    const p = provenanceForSystemMigration({ correlationId: 'mig-1' });
    expect(p.creationChannel).toBe('SYSTEM_MIGRATION');
    expect(p.triggeredByType).toBe('MIGRATION');
    expect(p.createdByUserId).toBeNull();
  });

  it('provenanceToPrismaFields maps all columns', () => {
    const fields = provenanceToPrismaFields(
      provenanceForBookingWizardInvoice({ bookingId: 'bk-1', userId: 'u1' }),
    );
    expect(fields.creationChannel).toBe('BOOKING_WIZARD');
    expect(fields.sourceId).toBe('bk-1');
    expect(fields.createdByUserId).toBe('u1');
  });
});
