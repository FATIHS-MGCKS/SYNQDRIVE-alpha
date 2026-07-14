import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceDetailReadService } from './invoice-detail-read.service';
import { InvoiceDocumentEmailService } from '@modules/outbound-email/invoice-document-email.service';
import { InvoiceExternalSendService } from './invoice-external-send.service';
import { StorageService } from '@shared/storage/storage.service';
import { InvoiceExternalSendChannel } from '@prisma/client';

describe('InvoicesController — record-external-send', () => {
  const externalSend = { recordExternalSend: jest.fn(), recordLegacyMarkSent: jest.fn() };
  let controller: InvoicesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InvoicesController(
      {} as InvoicesService,
      {} as InvoiceDetailReadService,
      {} as InvoiceDocumentEmailService,
      externalSend as unknown as InvoiceExternalSendService,
      {} as StorageService,
    );
  });

  it('delegates record-external-send with correlation id', async () => {
    externalSend.recordExternalSend.mockResolvedValue({
      externalSend: { id: 'ext-1' },
      invoice: { id: 'inv-1', status: 'SENT', sentAt: '2026-07-14T11:00:00.000Z' },
      idempotentReplay: false,
    });

    const result = await controller.recordExternalSend(
      'org-1',
      'inv-1',
      'user-1',
      { requestId: 'req-1' } as never,
      {
        channel: InvoiceExternalSendChannel.EXTERNAL_EMAIL,
        sentAt: '2026-07-14T11:00:00.000Z',
        recipient: 'a@test.de',
      },
    );

    expect(externalSend.recordExternalSend).toHaveBeenCalledWith(
      'org-1',
      'inv-1',
      'user-1',
      expect.objectContaining({
        channel: InvoiceExternalSendChannel.EXTERNAL_EMAIL,
        correlationId: 'req-1',
      }),
    );
    expect(result.externalSend.id).toBe('ext-1');
  });

  it('delegates deprecated mark-sent to legacy recorder', async () => {
    externalSend.recordLegacyMarkSent.mockResolvedValue({ idempotentReplay: false });
    await controller.markSent('org-1', 'inv-1', 'user-1');
    expect(externalSend.recordLegacyMarkSent).toHaveBeenCalledWith('org-1', 'inv-1', 'user-1');
  });
});
