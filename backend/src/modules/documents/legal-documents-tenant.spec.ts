import { LegalDocumentNotFoundError } from './legal-documents-api.errors';
import { LegalDocumentsService } from './legal-documents.service';
import { createNoopLegalDocumentEventsService } from './legal-document-events.test-utils';
import { createNoopLegalDocumentScopeService } from './legal-document-scope.test-utils';

describe('LegalDocumentsService tenant isolation', () => {
  const storage = { putObject: jest.fn(), getObjectStream: jest.fn() } as any;
  const events = createNoopLegalDocumentEventsService();

  function makeSvc(prisma: any) {
    return new LegalDocumentsService(prisma, events, createNoopLegalDocumentScopeService(), storage);
  }

  it('returns structured 404 when document belongs to another organization', async () => {
    const prisma = {
      organizationLegalDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
    const svc = makeSvc(prisma);

    await expect(svc.getDetail('org-a', 'doc-in-org-b')).rejects.toBeInstanceOf(
      LegalDocumentNotFoundError,
    );
    expect(prisma.organizationLegalDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-in-org-b', organizationId: 'org-a' },
      }),
    );
  });

  it('scopes list queries to the requested organization', async () => {
    const prisma = {
      organizationLegalDocument: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      generatedDocument: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
    } as any;
    const svc = makeSvc(prisma);

    await svc.listPaginated('org-a', {});

    expect(prisma.organizationLegalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
  });
});
