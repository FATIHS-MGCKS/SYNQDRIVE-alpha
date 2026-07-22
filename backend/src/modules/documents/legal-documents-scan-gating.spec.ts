import { Readable } from 'stream';
import { LegalDocumentsService } from './legal-documents.service';
import { DOCUMENT_TYPE, LEGAL_STATUS } from './documents.constants';
import { createLegalDocumentActivationHarness } from './legal-documents-activation.integration.harness';
import { createNoopLegalDocumentEventsService } from './legal-document-events.test-utils';
import { createNoopLegalDocumentFourEyesService } from './legal-document-four-eyes.test-utils';
import { createNoopLegalDocumentScopeService } from './legal-document-scope.test-utils';
import { createNoopLegalDocumentIngestionService } from './legal-document-ingestion.test-utils';
import { LegalDocumentScanNotPassedError } from './legal-documents-api.errors';
import { LEGAL_DOCUMENT_ERROR_CODES } from './legal-documents.errors';

const storage = {
  putObject: jest.fn(),
  getObjectStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('%PDF')])),
} as any;

const events = createNoopLegalDocumentEventsService();

function makeSvc(h: ReturnType<typeof createLegalDocumentActivationHarness>) {
  return new LegalDocumentsService(
    h.prisma as any,
    events,
    createNoopLegalDocumentScopeService(),
    createNoopLegalDocumentFourEyesService() as any,
    createNoopLegalDocumentIngestionService() as any,
    storage,
  );
}

describe('LegalDocumentsService scan gating', () => {
  it('blocks submitForReview when scan has not passed', async () => {
    const h = createLegalDocumentActivationHarness();
    const row = h.seedDraft({
      id: 'draft-1',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'v1',
    });
    row.scanStatus = 'VALIDATION_FAILED';

    const svc = makeSvc(h);
    await expect(svc.submitForReview('org-a', 'draft-1')).rejects.toBeInstanceOf(
      LegalDocumentScanNotPassedError,
    );
  });

  it('blocks activate when scan has not passed', async () => {
    const h = createLegalDocumentActivationHarness();
    const row = h.seedApproved({
      id: 'approved-1',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'v1',
    });
    row.scanStatus = 'MALWARE_SCAN_PENDING';

    const svc = makeSvc(h);
    await expect(svc.activate('org-a', 'approved-1')).rejects.toMatchObject({
      name: 'LegalDocumentScanNotPassedError',
    });
    await expect(svc.activate('org-a', 'approved-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: LEGAL_DOCUMENT_ERROR_CODES.SCAN_NOT_PASSED,
        details: { scanStatus: 'MALWARE_SCAN_PENDING' },
      }),
    });
  });

  it('blocks activate when scan status is unknown', async () => {
    const h = createLegalDocumentActivationHarness();
    const row = h.seedApproved({
      id: 'approved-unknown',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'v1',
    });
    row.scanStatus = 'NOT_A_REAL_STATUS';

    const svc = makeSvc(h);
    await expect(svc.activate('org-a', 'approved-unknown')).rejects.toBeInstanceOf(
      LegalDocumentScanNotPassedError,
    );
  });

  it('allows activate when scan has passed', async () => {
    const h = createLegalDocumentActivationHarness();
    h.seedApproved({
      id: 'approved-ok',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'v1',
    });

    const svc = makeSvc(h);
    const activated = await svc.activate('org-a', 'approved-ok');
    expect(activated.status).toBe(LEGAL_STATUS.ACTIVE);
  });
});
