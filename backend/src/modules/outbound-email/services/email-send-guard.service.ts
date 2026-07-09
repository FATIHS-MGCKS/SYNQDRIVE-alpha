import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { isValidEmail } from '../utils/email-domain.util';

const BLOCKED_MIME_PREFIXES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/javascript',
  'text/javascript',
  'application/vnd.microsoft.portable-executable',
];

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.js',
  '.jar',
  '.vbs',
  '.ps1',
  '.scr',
  '.dll',
  '.sh',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/html',
]);

export interface ValidatedAttachmentInput {
  fileName: string;
  mimeType: string;
  content: Buffer;
  sizeBytes?: number;
  generatedDocumentId?: string;
  documentType?: string;
}

@Injectable()
export class EmailSendGuardService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async assertCanSend(organizationId: string, input: {
    to: string;
    cc?: string[];
    bcc?: string[];
    attachments?: ValidatedAttachmentInput[];
  }): Promise<void> {
    this.assertRecipients(input.to, input.cc, input.bcc);
    this.assertAttachments(input.attachments ?? []);
    await this.assertRateLimit(organizationId);
  }

  private assertRecipients(to: string, cc?: string[], bcc?: string[]): void {
    const all = [to, ...(cc ?? []), ...(bcc ?? [])];
    const maxRecipients = this.config.get<number>('email.maxRecipients', 20);
    if (all.length > maxRecipients) {
      throw new BadRequestException(
        `Maximal ${maxRecipients} Empfänger pro E-Mail erlaubt`,
      );
    }

    for (const address of all) {
      if (!isValidEmail(address)) {
        throw new BadRequestException(`Ungültige E-Mail-Adresse: ${address}`);
      }
    }
  }

  private assertAttachments(attachments: ValidatedAttachmentInput[]): void {
    const maxCount = this.config.get<number>('email.maxAttachments', 10);
    const maxBytes = this.config.get<number>('email.maxAttachmentBytes', 10 * 1024 * 1024);
    const maxTotalBytes = this.config.get<number>(
      'email.maxTotalAttachmentBytes',
      25 * 1024 * 1024,
    );

    if (attachments.length > maxCount) {
      throw new BadRequestException(`Maximal ${maxCount} Anhänge pro E-Mail erlaubt`);
    }

    let totalBytes = 0;
    for (const attachment of attachments) {
      const size = attachment.sizeBytes ?? attachment.content.length;
      totalBytes += size;

      if (size > maxBytes) {
        throw new BadRequestException(
          `Anhang ${attachment.fileName} überschreitet die maximale Größe von ${Math.round(maxBytes / (1024 * 1024))} MB`,
        );
      }

      const lowerName = attachment.fileName.toLowerCase();
      for (const ext of BLOCKED_EXTENSIONS) {
        if (lowerName.endsWith(ext)) {
          throw new BadRequestException(
            `Dateityp nicht erlaubt: ${attachment.fileName}`,
          );
        }
      }

      const mime = attachment.mimeType.toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(mime)) {
        throw new BadRequestException(
          `Anhang-Typ nicht erlaubt: ${attachment.mimeType}`,
        );
      }
      if (BLOCKED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
        throw new BadRequestException(
          `MIME-Typ nicht erlaubt: ${attachment.mimeType}`,
        );
      }
    }

    if (totalBytes > maxTotalBytes) {
      throw new BadRequestException(
        `Gesamtgröße der Anhänge überschreitet ${Math.round(maxTotalBytes / (1024 * 1024))} MB`,
      );
    }
  }

  private async assertRateLimit(organizationId: string): Promise<void> {
    const maxPerHour = this.config.get<number>('email.maxSendsPerOrgPerHour', 120);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.prisma.outboundEmail.count({
      where: {
        organizationId,
        createdAt: { gte: since },
        status: {
          in: ['QUEUED', 'SENDING', 'SENT', 'SENT_SIMULATED'],
        },
      },
    });

    if (count >= maxPerHour) {
      throw new BadRequestException(
        'Stündliches E-Mail-Limit für diese Organisation erreicht',
      );
    }
  }
}
