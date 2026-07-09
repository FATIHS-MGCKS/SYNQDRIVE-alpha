import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { EmailSendGuardService } from './email-send-guard.service';

describe('EmailSendGuardService', () => {
  let service: EmailSendGuardService;
  let prisma: { outboundEmail: { count: jest.Mock } };

  beforeEach(() => {
    prisma = {
      outboundEmail: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const config = {
      get: (key: string, fallback?: number) => {
        const map: Record<string, number> = {
          'email.maxRecipients': 20,
          'email.maxAttachments': 10,
          'email.maxAttachmentBytes': 1024,
          'email.maxTotalAttachmentBytes': 2048,
          'email.maxSendsPerOrgPerHour': 120,
        };
        return map[key] ?? fallback;
      },
    } as unknown as ConfigService;

    service = new EmailSendGuardService(
      config,
      prisma as unknown as PrismaService,
    );
  });

  it('blocks oversized attachments', async () => {
    await expect(
      service.assertCanSend('org-1', {
        to: 'customer@example.test',
        attachments: [
          {
            fileName: 'large.pdf',
            mimeType: 'application/pdf',
            content: Buffer.alloc(2048),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks invalid recipient addresses', async () => {
    await expect(
      service.assertCanSend('org-1', {
        to: 'not-an-email',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks dangerous file extensions', async () => {
    await expect(
      service.assertCanSend('org-1', {
        to: 'customer@example.test',
        attachments: [
          {
            fileName: 'malware.exe',
            mimeType: 'application/pdf',
            content: Buffer.from('x'),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
