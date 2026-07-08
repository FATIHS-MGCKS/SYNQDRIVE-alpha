import { CustomerVerificationProvider } from '@prisma/client';
import { CustomerDocumentsService } from '../customers/customer-documents.service';
import { CustomerVerificationService } from './customer-verification.service';
import { PrismaService } from '@shared/database/prisma.service';
import { StorageService } from '@shared/storage/storage.service';
import { CustomerTimelineService } from '../customers/customer-timeline.service';

describe('CustomerDocumentsService.reviewDocument', () => {
  const prisma = {
    customer: { findFirst: jest.fn() },
    customerDocument: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const verificationService = {
    recordManualDocumentReview: jest.fn().mockResolvedValue({
      id: 'chk-1',
      provider: CustomerVerificationProvider.MANUAL,
      status: 'VERIFIED',
    }),
    syncCustomerReadModel: jest.fn(),
  } as unknown as CustomerVerificationService;

  const service = new CustomerDocumentsService(
    prisma,
    {} as StorageService,
    {} as CustomerTimelineService,
    verificationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.customerDocument.findFirst as jest.Mock).mockResolvedValue({
      id: 'doc-1',
      type: 'ID_FRONT',
    });
    (prisma.customerDocument.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'doc-1',
        organizationId: 'org1',
        customerId: 'c1',
        type: 'ID_FRONT',
        status: data.status,
        reviewedByUserId: data.reviewedByUserId,
        reviewedAt: data.reviewedAt,
        rejectedReason: data.rejectedReason,
      }),
    );
  });

  it('creates canonical manual verification check on review', async () => {
    await service.reviewDocument(
      'org1',
      'c1',
      'doc-1',
      { status: 'VERIFIED' },
      'u1',
    );

    expect(verificationService.recordManualDocumentReview).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org1',
        customerId: 'c1',
        status: 'VERIFIED',
        userId: 'u1',
      }),
    );
  });
});
