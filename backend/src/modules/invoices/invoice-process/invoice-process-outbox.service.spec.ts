import {
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessStatus,
  OrgInvoiceProcessType,
} from '@prisma/client';
import { InvoiceProcessOutboxService } from './invoice-process-outbox.service';
import { InvoiceProcessRepository } from './invoice-process.repository';

describe('InvoiceProcessOutboxService', () => {
  const config = { enabled: true, maxAttempts: 2, backoffMs: 1000 };
  const repo = {
    findByIdempotencyKey: jest.fn(),
    createIdempotent: jest.fn(),
    claimForProcessing: jest.fn(),
    markRetryScheduled: jest.fn(),
    markManualReview: jest.fn(),
    findById: jest.fn(),
  };

  let service: InvoiceProcessOutboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvoiceProcessOutboxService(
      config as never,
      repo as unknown as InvoiceProcessRepository,
    );
  });

  it('records retryable failure with scheduled retry', async () => {
    repo.findByIdempotencyKey.mockResolvedValue(null);
    repo.createIdempotent.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      attemptCount: 0,
      status: OrgInvoiceProcessStatus.PENDING,
    });
    repo.markRetryScheduled.mockResolvedValue({ id: 'p1' });

    await service.recordFailure({
      organizationId: 'org-a',
      processType: OrgInvoiceProcessType.BOOKING_FINANCE_SYNC,
      entityType: OrgInvoiceProcessEntityType.BOOKING,
      entityId: 'bk-1',
      error: new Error('ECONNRESET'),
    });

    expect(repo.markRetryScheduled).toHaveBeenCalled();
  });

  it('escalates to manual review after max attempts', async () => {
    repo.findByIdempotencyKey.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
      attemptCount: 2,
      status: OrgInvoiceProcessStatus.RETRY_SCHEDULED,
    });
    repo.claimForProcessing.mockResolvedValue({ id: 'p1' });
    repo.markManualReview.mockResolvedValue({ id: 'p1' });

    await service.recordFailure({
      organizationId: 'org-a',
      processType: OrgInvoiceProcessType.INVOICE_DOCUMENT_GENERATE,
      entityType: OrgInvoiceProcessEntityType.BOOKING,
      entityId: 'bk-1',
      error: new Error('timeout'),
    });

    expect(repo.markManualReview).toHaveBeenCalled();
  });
});
