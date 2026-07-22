import { ConflictException } from '@nestjs/common';
import { Readable } from 'stream';
import { LegalDocumentsService } from './legal-documents.service';
import { DOCUMENT_TYPE, LEGAL_STATUS } from './documents.constants';
import { LEGAL_DOCUMENT_ERROR_CODES } from './legal-documents.errors';
import { createLegalDocumentActivationHarness } from './legal-documents-activation.integration.harness';
import { createNoopLegalDocumentEventsService } from './legal-document-events.test-utils';
import { createNoopLegalDocumentScopeService } from './legal-document-scope.test-utils';

const storage = {
  putObject: jest.fn(),
  getObjectStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('%PDF')])),
} as any;

const events = createNoopLegalDocumentEventsService();

function makeSvc(h: ReturnType<typeof createLegalDocumentActivationHarness>) {
  return new LegalDocumentsService(h.prisma as any, events, createNoopLegalDocumentScopeService(), storage);
}

describe('LegalDocumentsService.activate (integration — concurrent activation)', () => {
  it('never leaves two ACTIVE versions for the same org+type+language after sequential activations', async () => {
    const h = createLegalDocumentActivationHarness();
    h.seedApproved({
      id: 'v1',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: '2026-01',
    });
    h.seedApproved({
      id: 'v2',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: '2026-02',
    });
    const svc = makeSvc(h);

    await svc.activate('org-a', 'v1');
    await svc.activate('org-a', 'v2');

    expect(h.countActive('org-a', DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'de')).toBe(1);
    expect(h.rows.get('v1')?.status).toBe(LEGAL_STATUS.SUPERSEDED);
    expect(h.rows.get('v2')?.status).toBe(LEGAL_STATUS.ACTIVE);
  });

  it('returns exactly one winner and one ACTIVE_CONFLICT when two different versions activate concurrently', async () => {
    const h = createLegalDocumentActivationHarness();
    h.seedApproved({
      id: 'v-a',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
      versionLabel: 'A',
    });
    h.seedApproved({
      id: 'v-b',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
      versionLabel: 'B',
    });
    const svc = makeSvc(h);

    const results = await h.withConcurrentTransactions(() =>
      Promise.allSettled([svc.activate('org-a', 'v-a'), svc.activate('org-a', 'v-b')]),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const conflict = (rejected[0] as PromiseRejectedResult).reason;
    expect(conflict).toBeInstanceOf(ConflictException);
    expect(conflict.getResponse()).toEqual(
      expect.objectContaining({
        code: LEGAL_DOCUMENT_ERROR_CODES.ACTIVE_CONFLICT,
        organizationId: 'org-a',
        documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
        language: 'de',
      }),
    );

    expect(h.countActive('org-a', DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, 'de')).toBe(1);
  });

  it('is idempotent when activating the same already-active version twice in parallel', async () => {
    const h = createLegalDocumentActivationHarness();
    const seeded = h.seedApproved({
      id: 'v-same',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
      versionLabel: 'stable',
    });
    seeded.status = LEGAL_STATUS.ACTIVE;
    seeded.activatedAt = new Date('2026-01-01T00:00:00.000Z');

    const svc = makeSvc(h);
    const [a, b] = await h.withConcurrentTransactions(() =>
      Promise.all([svc.activate('org-a', 'v-same'), svc.activate('org-a', 'v-same')]),
    );

    expect(a.status).toBe(LEGAL_STATUS.ACTIVE);
    expect(b.status).toBe(LEGAL_STATUS.ACTIVE);
    expect(h.countActive('org-a', DOCUMENT_TYPE.PRIVACY_POLICY, 'de')).toBe(1);
    expect(h.rows.get('v-same')?.activatedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('preserves tenant isolation — activations in different orgs do not conflict', async () => {
    const h = createLegalDocumentActivationHarness();
    h.seedApproved({
      id: 'org1-v1',
      organizationId: 'org-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: '1',
    });
    h.seedApproved({
      id: 'org2-v1',
      organizationId: 'org-2',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: '1',
    });
    const svc = makeSvc(h);

    const [r1, r2] = await Promise.all([
      svc.activate('org-1', 'org1-v1'),
      svc.activate('org-2', 'org2-v1'),
    ]);

    expect(r1.status).toBe(LEGAL_STATUS.ACTIVE);
    expect(r2.status).toBe(LEGAL_STATUS.ACTIVE);
    expect(h.countActive('org-1', DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'de')).toBe(1);
    expect(h.countActive('org-2', DOCUMENT_TYPE.TERMS_AND_CONDITIONS, 'de')).toBe(1);
  });

  it('rejects activation from DRAFT without review/approval workflow', async () => {
    const h = createLegalDocumentActivationHarness();
    h.seedDraft({
      id: 'draft-only',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'draft',
    });
    const svc = makeSvc(h);
    await expect(svc.activate('org-a', 'draft-only')).rejects.toMatchObject({
      response: expect.objectContaining({ code: LEGAL_DOCUMENT_ERROR_CODES.NOT_ACTIVATABLE }),
    });
  });
});
