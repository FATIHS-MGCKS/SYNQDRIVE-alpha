import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentNotFoundError } from './legal-documents-api.errors';

describe('LegalDocumentsController', () => {
  const orgId = 'org-1';
  const docId = 'doc-1';
  const userId = 'user-1';
  const userName = 'Admin User';

  const legalService = {
    listPaginated: jest.fn(),
    getDetail: jest.fn(),
    upload: jest.fn(),
    submitForReview: jest.fn(),
    approve: jest.fn(),
    schedule: jest.fn(),
    updateApplicationScope: jest.fn(),
    activate: jest.fn(),
    revoke: jest.fn(),
    archive: jest.fn(),
    getDownload: jest.fn(),
  };

  const eventsService = {
    listForOrganization: jest.fn(),
    listForDocument: jest.fn(),
  };

  const controller = new LegalDocumentsController(
    legalService as any,
    eventsService as any,
  );

  const req = { requestId: 'corr-1' } as any;
  const detail = { id: docId, documentType: 'TERMS_AND_CONDITIONS', snapshotCount: 0 };

  beforeEach(() => {
    jest.clearAllMocks();
    legalService.getDetail.mockResolvedValue(detail);
    legalService.listPaginated.mockResolvedValue([detail]);
    eventsService.listForOrganization.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    eventsService.listForDocument.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } });
  });

  it('applies OrgScopingGuard and RolesGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, LegalDocumentsController);
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, RolesGuard]));
  });

  it('delegates list to listPaginated with query DTO', async () => {
    const query = { status: 'ACTIVE', page: 2, limit: 10 };
    await controller.list(orgId, query as any);
    expect(legalService.listPaginated).toHaveBeenCalledWith(orgId, query);
  });

  it('delegates getOne to getDetail', async () => {
    await controller.getOne(orgId, docId);
    expect(legalService.getDetail).toHaveBeenCalledWith(orgId, docId);
  });

  it('returns enriched detail after lifecycle mutations', async () => {
    legalService.activate.mockResolvedValue({ id: docId });
    await controller.activate(orgId, docId, userId, userName, req);
    expect(legalService.activate).toHaveBeenCalledWith(
      orgId,
      docId,
      expect.objectContaining({ userId, displayName: userName, correlationId: 'corr-1' }),
    );
    expect(legalService.getDetail).toHaveBeenCalledWith(orgId, docId);
  });

  it('delegates organization events with query DTO', async () => {
    const query = { page: 1, limit: 20, eventType: 'ACTIVATED' };
    await controller.listOrganizationEvents(orgId, query as any);
    expect(eventsService.listForOrganization).toHaveBeenCalledWith(orgId, query);
  });

  it('delegates document events with query DTO', async () => {
    const query = { page: 2, limit: 5 };
    await controller.listDocumentEvents(orgId, docId, query as any);
    expect(eventsService.listForDocument).toHaveBeenCalledWith(orgId, docId, query);
  });

  it('propagates tenant-safe not-found from detail lookup', async () => {
    legalService.getDetail.mockRejectedValue(new LegalDocumentNotFoundError());
    await expect(controller.getOne('org-a', 'foreign-doc')).rejects.toBeInstanceOf(
      LegalDocumentNotFoundError,
    );
  });
});
