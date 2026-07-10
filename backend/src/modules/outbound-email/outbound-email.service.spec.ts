import { Test, TestingModule } from '@nestjs/testing';
import { OutboundEmailEventType, OutboundEmailStatus } from '@prisma/client';
import { OutboundEmailService } from './outbound-email.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('OutboundEmailService', () => {
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
    });
    prisma.outboundEmailEvent.findFirst.mockResolvedValue(null);
    prisma.outboundEmailEvent.create.mockResolvedValue({ id: 'evt-1' });
    prisma.outboundEmail.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [OutboundEmailService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(OutboundEmailService);
  });

  it('updates parent status to FAILED on bounce webhook', async () => {
    await service.applyWebhookEvent('em_1', OutboundEmailEventType.BOUNCED, {
      bounce: { message: 'Mailbox full' },
    });

    expect(prisma.outboundEmail.update).toHaveBeenCalledWith({
      where: { id: 'mail-1' },
      data: {
        status: OutboundEmailStatus.FAILED,
        errorCode: 'BOUNCED',
        errorMessage: 'Mailbox full',
      },
    });
  });

  it('skips duplicate webhook events of the same type', async () => {
    prisma.outboundEmailEvent.findFirst.mockResolvedValueOnce({ id: 'existing' });

    const result = await service.applyWebhookEvent('em_1', OutboundEmailEventType.DELIVERED);

    expect(result).toBe('mail-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('promotes SENDING to SENT on delivered webhook', async () => {
    prisma.outboundEmail.findFirst.mockResolvedValueOnce({
      id: 'mail-2',
      status: OutboundEmailStatus.SENDING,
    });

    await service.applyWebhookEvent('em_2', OutboundEmailEventType.DELIVERED);

    expect(prisma.outboundEmail.update).toHaveBeenCalledWith({
      where: { id: 'mail-2' },
      data: { status: OutboundEmailStatus.SENT },
    });
  });
});
