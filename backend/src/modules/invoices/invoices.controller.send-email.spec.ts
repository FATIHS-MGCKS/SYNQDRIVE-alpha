import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceDetailReadService } from './invoice-detail-read.service';
import { InvoiceDocumentEmailService } from '@modules/outbound-email/invoice-document-email.service';
import { StorageService } from '@shared/storage/storage.service';

describe('InvoicesController — send-email', () => {
  const invoiceEmail = { sendInvoiceEmail: jest.fn() };
  let controller: InvoicesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InvoicesController(
      {} as InvoicesService,
      {} as InvoiceDetailReadService,
      invoiceEmail as unknown as InvoiceDocumentEmailService,
      {} as StorageService,
    );
  });

  it('delegates POST send-email to InvoiceDocumentEmailService', async () => {
    invoiceEmail.sendInvoiceEmail.mockResolvedValue({ id: 'mail-1', status: 'SENT' });

    const result = await controller.sendEmail(
      'org-1',
      'inv-1',
      'user-1',
      { recipient: 'payee@test.com', idempotencyKey: 'key-1' },
    );

    expect(invoiceEmail.sendInvoiceEmail).toHaveBeenCalledWith(
      'org-1',
      'inv-1',
      'user-1',
      { recipient: 'payee@test.com', idempotencyKey: 'key-1' },
    );
    expect(result).toEqual({ id: 'mail-1', status: 'SENT' });
  });
});
