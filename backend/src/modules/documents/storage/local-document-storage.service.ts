import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { access, mkdir, readFile, readdir, unlink, writeFile } from 'fs/promises';
import { constants } from 'fs';
import { dirname, resolve } from 'path';
import { Readable } from 'stream';
import {
  DocumentStoragePort,
  PutDocumentInput,
  PutDocumentResult,
  DocumentObjectMetadata,
  DocumentStorageHealthStatus,
} from './document-storage.interface';
import {
  buildDocumentObjectKey,
  resolveLocalObjectKeyPath,
  safeStorageSegment,
} from './document-storage-key.util';
import { sha256Hex } from './document-storage-content-hash.util';
import { DOCUMENT_STORAGE_PROVIDERS } from './document-storage.constants';

/**
 * Local-disk implementation of {@link DocumentStoragePort}.
 *
 * Development and test only — production startup rejects this provider unless
 * explicitly overridden via DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION.
 */
@Injectable()
export class LocalDocumentStorageService implements DocumentStoragePort {
  readonly provider = DOCUMENT_STORAGE_PROVIDERS.LOCAL;

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
    const quarantinePath = resolveLocalObjectKeyPath(
      this.quarantineBaseDir,
      input.quarantineObjectKey,
    );
    let buffer: Buffer;
    try {
      buffer = await readFile(quarantinePath);
    } catch {
      throw new NotFoundException('Quarantined object not found');
    }
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
    try {
      return await readFile(absPath);
    } catch {
      throw new NotFoundException('Object not found');
    }
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    const absPath = this.resolveKey(objectKey);
    try {
      await access(absPath, constants.R_OK);
    } catch {
      throw new NotFoundException('Object not found');
    }
    return createReadStream(absPath);
  }

  async getObjectMetadata(objectKey: string): Promise<DocumentObjectMetadata> {
    const buffer = await this.getObject(objectKey);
    const contentHash = sha256Hex(buffer);
    return {
      objectKey,
      sizeBytes: buffer.length,
      mimeType: null,
      contentHash,
      etag: contentHash,
    };
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
      return resolveLocalObjectKeyPath(this.quarantineBaseDir, objectKey);
    }
    return resolveLocalObjectKeyPath(this.baseDir, objectKey);
  }

  async listObjectKeysForOrganization(input: {
    organizationId: string;
    cursor?: string | null;
    limit: number;
    zone?: 'clean' | 'quarantine' | 'all';
  }): Promise<import('./document-storage.interface').DocumentStorageListKeysResult> {
    const orgSeg = safeStorageSegment(input.organizationId);
    const limit = Math.max(1, Math.min(input.limit, 500));
    const zones: Array<{ base: string; prefix: string }> = [];

    if (!input.zone || input.zone === 'clean' || input.zone === 'all') {
      zones.push({ base: this.baseDir, prefix: `organizations/${orgSeg}/` });
    }
    if (!input.zone || input.zone === 'quarantine' || input.zone === 'all') {
      zones.push({
        base: this.quarantineBaseDir,
        prefix: `quarantine/organizations/${orgSeg}/`,
      });
    }

    const allKeys: string[] = [];
    for (const zone of zones) {
      const keys = await this.collectLocalKeys(zone.base, zone.prefix);
      allKeys.push(...keys);
    }
    allKeys.sort();

    const startIndex = input.cursor
      ? allKeys.findIndex((key) => key > input.cursor!) + 1 || allKeys.length
      : 0;
    const slice = allKeys.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < allKeys.length ? slice[slice.length - 1] ?? null : null;

    return { keys: slice, nextCursor };
  }

  private async collectLocalKeys(baseDir: string, prefix: string): Promise<string[]> {
    const absPrefix = resolveLocalObjectKeyPath(baseDir, prefix.replace(/\/$/, ''));
    try {
      await access(absPrefix);
    } catch {
      return [];
    }
    const keys: string[] = [];
    await this.walkLocalDir(baseDir, prefix.replace(/\/$/, ''), absPrefix, keys);
    return keys;
  }

  private async walkLocalDir(
    baseDir: string,
    keyPrefix: string,
    absDir: string,
    keys: string[],
  ): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = `${absDir}/${entry.name}`;
      const objectKey = `${keyPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await this.walkLocalDir(baseDir, objectKey, absPath, keys);
      } else if (entry.isFile()) {
        keys.push(objectKey);
      }
    }
  }

  async checkHealth(): Promise<DocumentStorageHealthStatus> {
    const checkedAt = new Date();
    try {
      await mkdir(this.baseDir, { recursive: true });
      await mkdir(this.quarantineBaseDir, { recursive: true });
      await access(this.baseDir, constants.W_OK | constants.R_OK);
      await access(this.quarantineBaseDir, constants.W_OK | constants.R_OK);
      return {
        healthy: true,
        provider: this.provider,
        detail: `Local storage writable at ${this.baseDir}`,
        checkedAt,
      };
    } catch (err) {
      return {
        healthy: false,
        provider: this.provider,
        detail: (err as Error).message,
        checkedAt,
      };
    }
  }

  private async writeObject(
    input: PutDocumentInput,
    baseDir: string,
    keyPrefix: string,
  ): Promise<PutDocumentResult> {
    const objectKey = buildDocumentObjectKey({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      documentType: input.documentType,
      originalName: input.originalName,
      keyPrefix,
    });
    const contentHash = sha256Hex(input.buffer);
    const absPath = resolveLocalObjectKeyPath(baseDir, objectKey);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, input.buffer);

    return {
      objectKey,
      storageProvider: this.provider,
      sizeBytes: input.buffer.length,
      mimeType: input.mimeType,
      contentHash,
      etag: contentHash,
    };
  }

  private resolveKey(objectKey: string): string {
    if (objectKey.startsWith('quarantine/')) {
      return resolveLocalObjectKeyPath(this.quarantineBaseDir, objectKey);
    }
    return resolveLocalObjectKeyPath(this.baseDir, objectKey);
  }
}
