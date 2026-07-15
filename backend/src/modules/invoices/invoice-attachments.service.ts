import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { basename, join } from 'path';
import { Readable } from 'stream';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import {
  INVOICE_ATTACHMENT_DOCUMENT_TYPE,
  isLegacyLocalUploadUrl,
  isPrivateInvoiceAttachmentRef,
  parsePrivateInvoiceAttachmentKey,
  toPrivateInvoiceAttachmentRef,
} from './invoice-attachment.util';

export interface InvoiceAttachmentDownload {
  stream: Readable;
  mimeType: string;
  fileName: string;
}

@Injectable()
export class InvoiceAttachmentsService {
  constructor(
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly config: ConfigService,
  ) {}

  async storeUpload(orgId: string, file: Express.Multer.File): Promise<string> {
    const buffer = file.buffer ?? (await readFile(file.path));
    const stored = await this.storage.putObject({
      organizationId: orgId,
      documentType: INVOICE_ATTACHMENT_DOCUMENT_TYPE,
      originalName: file.originalname || file.filename,
      buffer,
      mimeType: file.mimetype || 'application/octet-stream',
    });
    if (file.path) {
      await unlink(file.path).catch(() => undefined);
    }
    return toPrivateInvoiceAttachmentRef(stored.objectKey);
  }

  async getDownload(imageUrl: string, fallbackName?: string | null): Promise<InvoiceAttachmentDownload> {
    if (isPrivateInvoiceAttachmentRef(imageUrl)) {
      const key = parsePrivateInvoiceAttachmentKey(imageUrl);
      const stream = await this.storage.getObjectStream(key);
      return {
        stream,
        mimeType: 'application/octet-stream',
        fileName: fallbackName || basename(key) || 'attachment',
      };
    }

    if (isLegacyLocalUploadUrl(imageUrl)) {
      const legacyUrl: string = imageUrl;
      const rel = legacyUrl.replace(/^\/uploads\//, '');
      const safe = rel
        .split('/')
        .filter(Boolean)
        .map((segment) => basename(segment))
        .join('/');
      const uploadsDir = this.config.get<string>('storage.uploadsDir', 'uploads');
      const fullPath = join(process.cwd(), uploadsDir, safe);
      const stream = createReadStream(fullPath);
      return {
        stream,
        mimeType: 'application/octet-stream',
        fileName: fallbackName || basename(safe) || 'attachment',
      };
    }

    throw new BadRequestException(
      'Anhang ist nicht über einen sicheren Download erreichbar — bitte erneut hochladen',
    );
  }

  hasDownloadableAttachment(imageUrl: string | null | undefined): boolean {
    if (!imageUrl) return false;
    return isPrivateInvoiceAttachmentRef(imageUrl) || isLegacyLocalUploadUrl(imageUrl);
  }
}
