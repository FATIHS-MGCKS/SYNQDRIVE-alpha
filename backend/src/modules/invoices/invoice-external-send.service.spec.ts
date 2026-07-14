import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoiceExternalSendChannel, OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoiceExternalSendService } from './invoice-external-send.service';

const ORG = 'org-a';
const INV = 'inv-1';
const USER = 'user-1';

describe('InvoiceExternalSendService', () => {
  let service: InvoiceExternalSendService;

  const prisma: {
    orgInvoice: { findFirst: jest.Mock; update: jest.Mock };
    orgInvoiceExternalSend: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  } = {
    orgInvoice: { findFirst: jest.fn(), update: jest.fn() },
    orgInvoiceExternalSend: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  };
  const activityLog = { log: jest.fn() };

  const baseInvoice = {
    id: INV,
    organizationId: ORG,
    type: OrgInvoiceType.OUTGOING_MANUAL,
    status: OrgInvoiceStatus.ISSUED,
    sequenceNumber: 12,
    issuedAt: new Date('2026-07-01T10:00:00.000Z'),
    sentAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.orgInvoice.findFirst.mockResolvedValue(baseInvoice);
    prisma.orgInvoice.findFirst.mockImplementation(async () => ({
      ...baseInvoice,
      status: OrgInvoiceStatus.SENT,
      sentAt: new Date('2026-07-14T11:00:00.000Z'),
    }));
    prisma.orgInvoice.update.mockResolvedValue({});
    prisma.orgInvoiceExternalSend.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      id: USER,
      firstName: 'Max',
      lastName: 'Admin',
      name: null,
      email: 'max@test.de',
    });
    prisma.orgInvoiceExternalSend.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'ext-1',
          ...data,
          duplicateOfId: data.duplicateOfId ?? null,
          createdAt: new Date('2026-07-14T12:00:00.000Z'),
        }),
    );
    service = new InvoiceExternalSendService(
      prisma as unknown as PrismaService,
      activityLog as unknown as ActivityLogService,
    );
  });

  it('records external email delivery with audit proof', async () => {
    const sentAt = '2026-07-14T11:00:00.000Z';
    const result = await service.recordExternalSend(ORG, INV, USER, {
      channel: InvoiceExternalSendChannel.EXTERNAL_EMAIL,
      sentAt,
      recipient: 'kunde@test.de',
      note: 'Manuell versendet',
      externalReference: 'MAIL-99',
    });

    expect(result.externalSend.channel).toBe('EXTERNAL_EMAIL');
    expect(result.externalSend.recipient).toBe('kunde@test.de');
    expect(result.externalSend.source).toBe('EXTERNAL_RECORDED');
    expect(result.invoice.status).toBe('SENT');
    expect(prisma.orgInvoiceExternalSend.create).toHaveBeenCalled();
    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: INV,
        description: expect.stringContaining('Externe E-Mail'),
      }),
    );
  });

  it('records postal mail channel', async () => {
    const result = await service.recordExternalSend(ORG, INV, USER, {
      channel: InvoiceExternalSendChannel.POSTAL_MAIL,
      sentAt: '2026-07-14T11:00:00.000Z',
    });
    expect(result.externalSend.channelLabel).toBe('Postversand');
  });

  it('records in-person channel', async () => {
    const result = await service.recordExternalSend(ORG, INV, USER, {
      channel: InvoiceExternalSendChannel.IN_PERSON,
      sentAt: '2026-07-14T11:00:00.000Z',
    });
    expect(result.externalSend.channelLabel).toBe('Persönliche Übergabe');
  });

  it('marks duplicate when same channel/sentAt/recipient recorded twice', async () => {
    prisma.orgInvoiceExternalSend.findFirst.mockResolvedValueOnce({
      id: 'ext-first',
      channel: InvoiceExternalSendChannel.EXTERNAL_EMAIL,
      sentAt: new Date('2026-07-14T11:00:00.000Z'),
      recipient: 'dup@test.de',
    });

    const result = await service.recordExternalSend(ORG, INV, USER, {
      channel: InvoiceExternalSendChannel.EXTERNAL_EMAIL,
      sentAt: '2026-07-14T11:00:00.000Z',
      recipient: 'dup@test.de',
    });

    expect(prisma.orgInvoiceExternalSend.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ duplicateOfId: 'ext-first' }),
      }),
    );
    expect(result.externalSend.possibleDuplicate).toBe(true);
    expect(result.externalSend.duplicateOfId).toBe('ext-first');
  });

  it('returns idempotent replay for same idempotency key', async () => {
    prisma.orgInvoiceExternalSend.findFirst.mockResolvedValueOnce({
      id: 'ext-prior',
      invoiceId: INV,
      organizationId: ORG,
      channel: InvoiceExternalSendChannel.OTHER,
      sentAt: new Date('2026-07-14T11:00:00.000Z'),
      recipient: null,
      note: null,
      externalReference: null,
      duplicateOfId: null,
      recordedByUserId: USER,
      idempotencyKey: 'key-1',
      correlationId: null,
      createdAt: new Date(),
    });

    const result = await service.recordExternalSend(ORG, INV, USER, {
      channel: InvoiceExternalSendChannel.POSTAL_MAIL,
      sentAt: '2026-07-15T11:00:00.000Z',
      idempotencyKey: 'key-1',
    });

    expect(result.idempotentReplay).toBe(true);
    expect(result.externalSend.id).toBe('ext-prior');
    expect(prisma.orgInvoiceExternalSend.create).not.toHaveBeenCalled();
  });

  it('rejects draft invoice status', async () => {
    prisma.orgInvoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      status: OrgInvoiceStatus.DRAFT,
      sequenceNumber: null,
    });

    await expect(
      service.recordExternalSend(ORG, INV, USER, {
        channel: InvoiceExternalSendChannel.OTHER,
        sentAt: '2026-07-14T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cross-tenant invoice', async () => {
    prisma.orgInvoice.findFirst.mockResolvedValue(null);
    await expect(
      service.recordExternalSend('org-b', INV, USER, {
        channel: InvoiceExternalSendChannel.OTHER,
        sentAt: '2026-07-14T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects idempotency key reused for different invoice', async () => {
    prisma.orgInvoiceExternalSend.findFirst.mockResolvedValue({
      id: 'ext-other',
      invoiceId: 'other-inv',
    });

    await expect(
      service.recordExternalSend(ORG, INV, USER, {
        channel: InvoiceExternalSendChannel.OTHER,
        sentAt: '2026-07-14T11:00:00.000Z',
        idempotencyKey: 'shared-key',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
