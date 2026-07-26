import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { NotificationCoreService } from '@modules/notifications/notification-core.service';
import { InvoiceOperationalNotificationService } from './invoice-operational-notification.service';

describe('InvoiceOperationalNotificationService', () => {
  const ingestCandidate = jest.fn();

  let service: InvoiceOperationalNotificationService;
  let orgInvoiceFindFirst: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    ingestCandidate.mockResolvedValue({ enabled: true, operation: 'created' });
    orgInvoiceFindFirst = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        InvoiceOperationalNotificationService,
        {
          provide: NotificationCoreService,
          useValue: {
            isEnabled: () => true,
            ingestCandidate,
          },
        },
        {
          provide: PrismaService,
          useValue: {
            orgInvoice: { findFirst: orgInvoiceFindFirst },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(InvoiceOperationalNotificationService);
  });

  it('ingests INVOICE_OVERDUE for rental org invoices', async () => {
    orgInvoiceFindFirst.mockResolvedValue({
      id: 'rental-inv-1',
      invoiceNumberDisplay: 'RE-2026-001',
      status: 'OVERDUE',
    });

    await service.syncOverdueInvoice('org-1', 'rental-inv-1');

    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    const candidate = ingestCandidate.mock.calls[0][0];
    expect(candidate.eventType).toBe('INVOICE_OVERDUE');
    expect(candidate.entityType).toBe('INVOICE');
    expect(candidate.entityId).toBe('rental-inv-1');
    expect(candidate.sourceEventId).toBe('rental-invoice:overdue:rental-inv-1');
    expect(candidate.templateParams.invoiceRef).toBe('RE-2026-001');
  });

  it('skips overdue ingest when invoice is not OVERDUE', async () => {
    orgInvoiceFindFirst.mockResolvedValue({
      id: 'rental-inv-2',
      invoiceNumberDisplay: 'RE-2026-002',
      status: 'SENT',
    });

    await service.syncOverdueInvoice('org-1', 'rental-inv-2');

    expect(ingestCandidate).not.toHaveBeenCalled();
  });

  it('resolves INVOICE_OVERDUE when invoice is fully paid', async () => {
    orgInvoiceFindFirst.mockResolvedValue({
      id: 'rental-inv-3',
      invoiceNumberDisplay: 'RE-2026-003',
    });

    await service.resolvePaidInvoice('org-1', 'rental-inv-3');

    expect(ingestCandidate).toHaveBeenCalledTimes(1);
    const candidate = ingestCandidate.mock.calls[0][0];
    expect(candidate.severity).toBe('SUCCESS');
    expect(candidate.metadata.cleared).toBe(true);
    expect(candidate.sourceEventId).toBe('rental-invoice:paid:rental-inv-3');
  });
});
