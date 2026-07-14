import { BadRequestException } from '@nestjs/common';
import {
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessStatus,
  OrgInvoiceProcessType,
} from '@prisma/client';
import { InvoiceProcessRepository } from './invoice-process.repository';
import { InvoiceProcessProcessorService } from './invoice-process-processor.service';
import { InvoiceProcessExecutorService } from './invoice-process-executor.service';

describe('InvoiceProcessProcessorService', () => {
  const config = { maxAttempts: 3, backoffMs: 1000 };
  const repo = {
    claimForProcessing: jest.fn(),
    markCompleted: jest.fn(),
    markRetryScheduled: jest.fn(),
    markManualReview: jest.fn(),
  };
  const executor = { execute: jest.fn() };

  let service: InvoiceProcessProcessorService;

  const baseRow = {
    id: 'proc-1',
    organizationId: 'org-a',
    processType: OrgInvoiceProcessType.BOOKING_INVOICE_CREATE,
    entityType: OrgInvoiceProcessEntityType.BOOKING,
    entityId: 'bk-1',
    attemptCount: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvoiceProcessProcessorService(
      config as never,
      repo as unknown as InvoiceProcessRepository,
      executor as unknown as InvoiceProcessExecutorService,
    );
    repo.claimForProcessing.mockResolvedValue(baseRow);
  });

  it('marks completed on success', async () => {
    executor.execute.mockResolvedValue(undefined);
    const outcome = await service.processById('proc-1', 'org-a');
    expect(outcome).toBe('completed');
    expect(repo.markCompleted).toHaveBeenCalledWith('proc-1');
  });

  it('schedules retry for transient failures under max attempts', async () => {
    executor.execute.mockRejectedValue(new Error('ECONNRESET'));
    const outcome = await service.processById('proc-1', 'org-a');
    expect(outcome).toBe('retry');
    expect(repo.markRetryScheduled).toHaveBeenCalled();
  });

  it('routes to manual review after max attempts', async () => {
    repo.claimForProcessing.mockResolvedValue({ ...baseRow, attemptCount: 3 });
    executor.execute.mockRejectedValue(new Error('ECONNRESET'));
    const outcome = await service.processById('proc-1', 'org-a');
    expect(outcome).toBe('manual_review');
    expect(repo.markManualReview).toHaveBeenCalled();
  });

  it('does not retry validation errors', async () => {
    executor.execute.mockRejectedValue(new BadRequestException('bad'));
    const outcome = await service.processById('proc-1', 'org-a');
    expect(outcome).toBe('manual_review');
    expect(repo.markRetryScheduled).not.toHaveBeenCalled();
  });

  it('skips when claim fails (idempotent)', async () => {
    repo.claimForProcessing.mockResolvedValue(null);
    const outcome = await service.processById('proc-1', 'org-a');
    expect(outcome).toBe('skipped');
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
