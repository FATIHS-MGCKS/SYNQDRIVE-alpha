import { Test, TestingModule } from '@nestjs/testing';
import {
  OutboundEmailDeliveryStatus,
  OutboundEmailEventType,
  OutboundEmailStatus,
} from '@prisma/client';
import { OutboundEmailService } from './outbound-email.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('OutboundEmailService — invoice audit webhooks', () => {
  let service: OutboundEmailService;

  const prisma = {
    outboundEmail: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    outboundEmailEvent: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.outboundEmail.findFirst.mockResolvedValue({
      id: 'mail-1',
      status: OutboundEmailStatus.SENT,
      deliveryStatus: OutboundEmailDeliveryStatus.ACCEPTED,
      acceptedAt: new Date('2026-07-14T10:00:00.000Z'),
      sentAt: new Date('2026-07-14T10:00:00.000Z'),
    });
    prisma.outboundEmailEvent.findFirst.mockResolvedValue(null);
    prisma.outboundEmailEvent.create.mockResolvedValue({ id: 'evt-1' });
    prisma.outboundEmail.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [OutboundEmailService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(OutboundEmailService);
  });

  it('updates deliveryStatus and deliveredAt on delivered webhook', async () => {
    await service.applyWebhookEvent('em_1', OutboundEmailEventType.DELIVERED);

    expect(prisma.outboundEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mail-1' },
        data: expect.objectContaining({
          deliveryStatus: OutboundEmailDeliveryStatus.DELIVERED,
          deliveredAt: expect.any(Date),
        }),
      }),
    );
  });

  it('updates bounce audit fields on bounced webhook', async () => {
    await service.applyWebhookEvent('em_1', OutboundEmailEventType.BOUNCED, {
      bounce: { message: 'Mailbox full' },
    });

    expect(prisma.outboundEmail.update).toHaveBeenCalledWith({
      where: { id: 'mail-1' },
      data: expect.objectContaining({
        status: OutboundEmailStatus.FAILED,
        deliveryStatus: OutboundEmailDeliveryStatus.BOUNCED,
        errorCode: 'BOUNCED',
        errorMessage: 'Mailbox full',
        failedAt: expect.any(Date),
      }),
    });
  });

  it('skips duplicate webhook events of the same type', async () => {
    prisma.outboundEmailEvent.findFirst.mockResolvedValueOnce({ id: 'existing' });

    const result = await service.applyWebhookEvent('em_1', OutboundEmailEventType.DELIVERED);

    expect(result).toBe('mail-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
