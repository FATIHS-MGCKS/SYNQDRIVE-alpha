import { Prisma } from '@prisma/client';
import {
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessStatus,
  OrgInvoiceProcessType,
} from '@prisma/client';
import { InvoiceProcessRepository } from './invoice-process.repository';

describe('InvoiceProcessRepository', () => {
  const prisma = {
    orgInvoiceProcess: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };

  let repo: InvoiceProcessRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new InvoiceProcessRepository(prisma as never);
  });

  it('createIdempotent returns existing row on duplicate key', async () => {
    const existing = {
      id: 'p1',
      organizationId: 'org-a',
      idempotencyKey: 'k1',
      status: OrgInvoiceProcessStatus.PENDING,
    };
    prisma.orgInvoiceProcess.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.orgInvoiceProcess.findFirst.mockResolvedValue(existing);

    const row = await repo.createIdempotent({
      organizationId: 'org-a',
      processType: OrgInvoiceProcessType.PAYMENT_SYNC,
      entityType: OrgInvoiceProcessEntityType.INVOICE,
      entityId: 'inv-1',
      idempotencyKey: 'k1',
    });

    expect(row).toEqual(existing);
  });

  it('claimForProcessing is atomic', async () => {
    prisma.orgInvoiceProcess.updateMany.mockResolvedValue({ count: 1 });
    prisma.orgInvoiceProcess.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      status: OrgInvoiceProcessStatus.PROCESSING,
    });

    const claimed = await repo.claimForProcessing('p1', 'org-a');
    expect(claimed?.id).toBe('p1');
    expect(prisma.orgInvoiceProcess.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'p1', organizationId: 'org-a' }),
      }),
    );
  });
});
