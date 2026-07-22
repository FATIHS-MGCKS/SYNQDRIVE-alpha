import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { resolve, sep, dirname, extname, basename } from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import {
  DocumentStoragePort,
  PutDocumentInput,
  PutDocumentResult,
} from './document-storage.interface';

const STORAGE_PROVIDER = 'local';

/**
 * Local-disk implementation of {@link DocumentStoragePort}.
 *
 * Files are written under `documents.localStorageDir` (default
 * `./storage/documents`), which is NOT registered as a static asset directory —
 * generated PDFs and legal documents are never publicly reachable.
 *
 * Quarantined legal uploads are written under `documents.localQuarantineStorageDir`
 * until PDF validation and malware scanning promote them to clean storage.
 */
@Injectable()
export class LocalDocumentStorageService implements DocumentStoragePort {
  private readonly logger = new Logger(LocalDocumentStorageService.name);
  private readonly baseDir: string;
  private readonly quarantineBaseDir: string;

  constructor(private readonly config: ConfigService) {
    const configured = this.config.get<string>(
      'documents.localStorageDir',
      './storage/documents',
    );
    this.baseDir = resolve(process.cwd(), configured);
    const quarantineConfigured = this.config.get<string>(
      'documents.localQuarantineStorageDir',
      './storage/documents-quarantine',
    );
    this.quarantineBaseDir = resolve(process.cwd(), quarantineConfigured);
  }

  async putObject(input: PutDocumentInput): Promise<PutDocumentResult> {
    return this.writeObject(input, this.baseDir, 'organizations');
  }

  async putQuarantineObject(input: PutDocumentInput): Promise<PutDocumentResult> {
    return this.writeObject(input, this.quarantineBaseDir, 'quarantine/organizations');
  }

  async promoteQuarantineToClean(input: {
    quarantineObjectKey: string;
    organizationId: string;
    documentType: string;
    originalName: string;
    mimeType: string;
  }): Promise<PutDocumentResult> {
    const quarantinePath = this.resolveKeyInBase(this.quarantineBaseDir, input.quarantineObjectKey);
    const buffer = await readFile(quarantinePath);
    const stored = await this.putObject({
      organizationId: input.organizationId,
      bookingId: null,
      documentType: input.documentType,
      originalName: input.originalName,
      buffer,
      mimeType: input.mimeType,
    });
    await unlink(quarantinePath).catch(() => undefined);
    return stored;
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const absPath = this.resolveKey(objectKey);
    return readFile(absPath);
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    const absPath = this.resolveKey(objectKey);
    return createReadStream(absPath);
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      const absPath = this.resolveKey(objectKey);
      await unlink(absPath).catch(() => undefined);
    } catch (err) {
      this.logger.debug(`deleteObject(${objectKey}) skipped: ${(err as Error).message}`);
    }
  }

  getInternalPath(objectKey: string): string | null {
    if (objectKey.startsWith('quarantine/')) {
      return this.resolveKeyInBase(this.quarantineBaseDir, objectKey);
    }
    return this.resolveKeyInBase(this.baseDir, objectKey);
  }

  private async writeObject(
    input: PutDocumentInput,
    baseDir: string,
    keyPrefix: string,
  ): Promise<PutDocumentResult> {
    const orgSeg = this.safeSegment(input.organizationId);
    const typeSeg = this.safeSegment(input.documentType) || 'document';
    if (!orgSeg) {
      throw new BadRequestException('organizationId is required for storage');
    }

    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const safeName = this.sanitizeFileName(input.originalName);

    const bookingSeg = input.bookingId ? this.safeSegment(input.bookingId) : '';
    const scope = bookingSeg
      ? ['bookings', bookingSeg, typeSeg]
      : ['legal', typeSeg];

    const objectKey = [keyPrefix, orgSeg, ...scope, yyyy, mm, `${randomUUID()}-${safeName}`].join(
      '/',
    );

    const absPath = this.resolveKeyInBase(baseDir, objectKey);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, input.buffer);

    return {
      objectKey,
      storageProvider: STORAGE_PROVIDER,
      sizeBytes: input.buffer.length,
      mimeType: input.mimeType,
    };
  }

  private resolveKey(objectKey: string): string {
    if (objectKey.startsWith('quarantine/')) {
      return this.resolveKeyInBase(this.quarantineBaseDir, objectKey);
    }
    return this.resolveKeyInBase(this.baseDir, objectKey);
  }

  private resolveKeyInBase(baseDir: string, objectKey: string): string {
    if (typeof objectKey !== 'string' || objectKey.length === 0) {
      throw new BadRequestException('Invalid object key');
    }
    if (objectKey.includes('\0') || objectKey.includes('..')) {
      throw new BadRequestException('Invalid object key');
    }
    const normalized = objectKey.replace(/\\/g, '/').replace(/^\/+/, '');
    if (/^[a-zA-Z]:/.test(normalized)) {
      throw new BadRequestException('Invalid object key');
    }
    const abs = resolve(baseDir, normalized);
    const baseWithSep = baseDir.endsWith(sep) ? baseDir : baseDir + sep;
    if (abs !== baseDir && !abs.startsWith(baseWithSep)) {
      throw new BadRequestException('Invalid object key (path traversal)');
    }
    return abs;
  }

  private safeSegment(value: string): string {
    if (!value) return '';
    return basename(String(value)).replace(/[^a-zA-Z0-9_-]/g, '');
  }

  private sanitizeFileName(originalName: string): string {
    const base = basename(String(originalName || 'document'));
    const ext = extname(base).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const stem =
      base
        .slice(0, base.length - extname(base).length)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60) || 'document';
    const safeExt = ext && ext.length <= 6 ? ext : '';
    return `${stem}${safeExt}`;
  }
}
