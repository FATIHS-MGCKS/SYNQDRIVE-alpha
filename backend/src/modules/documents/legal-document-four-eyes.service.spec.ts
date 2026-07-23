import { LegalDocumentForbiddenError } from './legal-documents-api.errors';
import { LegalDocumentFourEyesService } from './legal-document-four-eyes.service';

describe('LegalDocumentFourEyesService', () => {
  const prisma = {
    organization: {
      findUnique: jest.fn(),
    },
  };

  let svc: LegalDocumentFourEyesService;

  beforeEach(() => {
    svc = new LegalDocumentFourEyesService(prisma as never);
    jest.clearAllMocks();
  });

  it('skips separation when four-eyes is disabled', async () => {
    prisma.organization.findUnique.mockResolvedValue({ legalDocumentFourEyesEnabled: false });
    await expect(
      svc.assertSeparation(
        'org-1',
        { uploadedByUserId: 'user-1', submittedForReviewByUserId: null, approvedByUserId: null },
        'user-1',
        'approve',
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks approver when same as uploader under four-eyes', async () => {
    prisma.organization.findUnique.mockResolvedValue({ legalDocumentFourEyesEnabled: true });
    await expect(
      svc.assertSeparation(
        'org-1',
        { uploadedByUserId: 'user-1', submittedForReviewByUserId: 'user-2', approvedByUserId: null },
        'user-1',
        'approve',
      ),
    ).rejects.toBeInstanceOf(LegalDocumentForbiddenError);
  });

  it('blocks approver when same as submitter under four-eyes', async () => {
    prisma.organization.findUnique.mockResolvedValue({ legalDocumentFourEyesEnabled: true });
    await expect(
      svc.assertSeparation(
        'org-1',
        { uploadedByUserId: 'user-9', submittedForReviewByUserId: 'user-2', approvedByUserId: null },
        'user-2',
        'approve',
      ),
    ).rejects.toBeInstanceOf(LegalDocumentForbiddenError);
  });

  it('allows different approver under four-eyes', async () => {
    prisma.organization.findUnique.mockResolvedValue({ legalDocumentFourEyesEnabled: true });
    await expect(
      svc.assertSeparation(
        'org-1',
        { uploadedByUserId: 'user-1', submittedForReviewByUserId: 'user-2', approvedByUserId: null },
        'user-3',
        'approve',
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks when four-eyes is enabled and actor is missing', async () => {
    prisma.organization.findUnique.mockResolvedValue({ legalDocumentFourEyesEnabled: true });
    await expect(
      svc.assertSeparation(
        'org-1',
        { uploadedByUserId: 'user-1', submittedForReviewByUserId: null, approvedByUserId: null },
        null,
        'approve',
      ),
    ).rejects.toBeInstanceOf(LegalDocumentForbiddenError);
  });
});
