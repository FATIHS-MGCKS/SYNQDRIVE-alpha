import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Readable } from 'stream';
import documentsConfig from '@config/documents.config';
import {
  DocumentStoragePort,
  PutDocumentInput,
  PutDocumentResult,
  DocumentObjectMetadata,
  DocumentStorageHealthStatus,
} from './document-storage.interface';
import {
  buildDocumentObjectKey,
  assertSafeDocumentObjectKey,
  safeStorageSegment,
} from './document-storage-key.util';
import { sha256Hex } from './document-storage-content-hash.util';
import {
  DOCUMENT_STORAGE_METADATA_KEYS,
  DOCUMENT_STORAGE_PROVIDERS,
} from './document-storage.constants';
import type { DocumentPrivateS3Operations } from './document-private-s3.operations';
import { createDocumentPrivateS3Operations } from './document-private-s3.client';

const DOCUMENT_PRIVATE_S3_OPS = Symbol('DOCUMENT_PRIVATE_S3_OPS');

export { DOCUMENT_PRIVATE_S3_OPS };

@Injectable()
export class S3PrivateDocumentStorageService implements DocumentStoragePort {
  readonly provider = DOCUMENT_STORAGE_PROVIDERS.S3;

  private readonly logger = new Logger(S3PrivateDocumentStorageService.name);
  private s3Ops: DocumentPrivateS3Operations | null = null;

  constructor(
    @Inject(documentsConfig.KEY)
    private readonly config: ConfigType<typeof documentsConfig>,
    @Optional()
    @Inject(DOCUMENT_PRIVATE_S3_OPS)
    private readonly injectedS3Ops?: DocumentPrivateS3Operations,
  ) {}

  async putObject(input: PutDocumentInput): Promise<PutDocumentResult> {
    return this.writeObject(input, 'organizations');
  }

  async putQuarantineObject(input: PutDocumentInput): Promise<PutDocumentResult> {
    return this.writeObject(input, 'quarantine/organizations');
  }

  async promoteQuarantineToClean(input: {
    quarantineObjectKey: string;
    organizationId: string;
    documentType: string;
    originalName: string;
    mimeType: string;
  }): Promise<PutDocumentResult> {
    assertSafeDocumentObjectKey(input.quarantineObjectKey);
    const s3 = await this.getS3Ops();
    const bucket = this.bucket;
    const sourceKey = this.prefixedKey(input.quarantineObjectKey);

    let head;
    try {
      head = await s3.headObject({ bucket, key: sourceKey });
    } catch {
      throw new NotFoundException('Quarantined object not found');
    }

    const cleanKeyRelative = buildDocumentObjectKey({
      organizationId: input.organizationId,
      bookingId: null,
      documentType: input.documentType,
      originalName: input.originalName,
      keyPrefix: 'organizations',
    });
    const destinationKey = this.prefixedKey(cleanKeyRelative);
    const sourceHash =
      head.metadata?.[DOCUMENT_STORAGE_METADATA_KEYS.CONTENT_SHA256] ??
      head.metadata?.['content-sha256'] ??
      sha256Hex(await this.getObjectBytesFromS3(sourceKey));

    const metadata = this.buildMetadata({
      organizationId: input.organizationId,
      documentType: input.documentType,
      originalName: input.originalName,
      contentHash: sourceHash,
      buffer: null,
    });

    const encryption = this.encryptionParams();
    await s3.copyObject({
      bucket,
      sourceKey,
      destinationKey,
      metadataDirective: 'REPLACE',
      metadata,
      contentType: input.mimeType,
      ...encryption,
    });
    await s3.deleteObject({ bucket, key: sourceKey }).catch((err) => {
      this.logger.warn(
        `Failed to delete quarantine object ${sourceKey}: ${(err as Error).message}`,
      );
    });

    const contentHash =
      metadata[DOCUMENT_STORAGE_METADATA_KEYS.CONTENT_SHA256] || sourceHash;

    return {
      objectKey: cleanKeyRelative,
      storageProvider: this.provider,
      sizeBytes: head.contentLength ?? 0,
      mimeType: input.mimeType,
      contentHash,
      etag: head.etag ?? null,
    };
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const stream = await this.getObjectStream(objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    assertSafeDocumentObjectKey(objectKey);
    const s3 = await this.getS3Ops();
    try {
      const result = await s3.getObject({
        bucket: this.bucket,
        key: this.prefixedKey(objectKey),
      });
      return result.body;
    } catch (err) {
      if (this.isNotFoundError(err)) {
        throw new NotFoundException('Object not found');
      }
      throw err;
    }
  }

  async getObjectMetadata(objectKey: string): Promise<DocumentObjectMetadata> {
    assertSafeDocumentObjectKey(objectKey);
    const s3 = await this.getS3Ops();
    try {
      const head = await s3.headObject({
        bucket: this.bucket,
        key: this.prefixedKey(objectKey),
      });
      const meta = head.metadata ?? {};
      return {
        objectKey,
        sizeBytes: head.contentLength ?? 0,
        mimeType: head.contentType ?? null,
        contentHash:
          meta[DOCUMENT_STORAGE_METADATA_KEYS.CONTENT_SHA256] ??
          meta['content-sha256'] ??
          null,
        etag: head.etag ?? null,
      };
    } catch (err) {
      if (this.isNotFoundError(err)) {
        throw new NotFoundException('Object not found');
      }
      throw err;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      assertSafeDocumentObjectKey(objectKey);
      const s3 = await this.getS3Ops();
      await s3.deleteObject({
        bucket: this.bucket,
        key: this.prefixedKey(objectKey),
      });
    } catch (err) {
      this.logger.debug(`deleteObject(${objectKey}) skipped: ${(err as Error).message}`);
    }
  }

  getInternalPath(_objectKey: string): string | null {
    return null;
  }

  async listObjectKeysForOrganization(input: {
    organizationId: string;
    cursor?: string | null;
    limit: number;
    zone?: 'clean' | 'quarantine' | 'all';
  }): Promise<import('./document-storage.interface').DocumentStorageListKeysResult> {
    const orgSeg = safeStorageSegment(input.organizationId);
    const limit = Math.max(1, Math.min(input.limit, 500));
    const s3 = await this.getS3Ops();
    const bucket = this.bucket;
    const keyPrefix = this.config.privateS3.keyPrefix;
    const prefixes: string[] = [];

    if (!input.zone || input.zone === 'clean' || input.zone === 'all') {
      prefixes.push(
        keyPrefix ? `${keyPrefix}/organizations/${orgSeg}/` : `organizations/${orgSeg}/`,
      );
    }
    if (!input.zone || input.zone === 'quarantine' || input.zone === 'all') {
      prefixes.push(
        keyPrefix
          ? `${keyPrefix}/quarantine/organizations/${orgSeg}/`
          : `quarantine/organizations/${orgSeg}/`,
      );
    }

    const allKeys: string[] = [];
    for (const prefix of prefixes) {
      let cursor = input.cursor ?? undefined;
      let hasMore = true;
      while (hasMore && allKeys.length < limit) {
        const page = await s3.listObjectKeys({
          bucket,
          prefix,
          cursor,
          limit: Math.min(limit - allKeys.length, 200),
        });
        for (const key of page.keys) {
          const relative = keyPrefix && key.startsWith(`${keyPrefix}/`)
            ? key.slice(keyPrefix.length + 1)
            : key;
          allKeys.push(relative);
        }
        cursor = page.nextCursor;
        hasMore = Boolean(page.nextCursor);
        if (!page.keys.length) break;
      }
    }

    allKeys.sort();
    const slice = allKeys.slice(0, limit);
    const nextCursor = allKeys.length > limit ? slice[slice.length - 1] ?? null : null;
    return { keys: slice, nextCursor };
  }

  async checkHealth(): Promise<DocumentStorageHealthStatus> {
    const checkedAt = new Date();
    try {
      const s3 = await this.getS3Ops();
      await s3.headBucket({ bucket: this.bucket });
      return {
        healthy: true,
        provider: this.provider,
        detail: `S3 bucket reachable: ${this.bucket}`,
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
    const metadata = this.buildMetadata({
      organizationId: input.organizationId,
      documentType: input.documentType,
      originalName: input.originalName,
      contentHash,
      buffer: input.buffer,
    });

    const s3 = await this.getS3Ops();
    const putResult = await s3.putObject({
      bucket: this.bucket,
      key: this.prefixedKey(objectKey),
      body: Readable.from(input.buffer),
      contentType: input.mimeType,
      metadata,
      ...this.encryptionParams(),
    });

    return {
      objectKey,
      storageProvider: this.provider,
      sizeBytes: input.buffer.length,
      mimeType: input.mimeType,
      contentHash,
      etag: putResult.etag ?? null,
    };
  }

  private buildMetadata(input: {
    organizationId: string;
    documentType: string;
    originalName: string;
    contentHash: string | null;
    buffer: Buffer | null;
  }): Record<string, string> {
    const contentHash =
      input.contentHash || (input.buffer ? sha256Hex(input.buffer) : '');
    if (!contentHash) {
      throw new Error('contentHash is required when buffer is not provided');
    }
    return {
      [DOCUMENT_STORAGE_METADATA_KEYS.CONTENT_SHA256]: contentHash,
      [DOCUMENT_STORAGE_METADATA_KEYS.ORGANIZATION_ID]: input.organizationId,
      [DOCUMENT_STORAGE_METADATA_KEYS.DOCUMENT_TYPE]: input.documentType,
      [DOCUMENT_STORAGE_METADATA_KEYS.ORIGINAL_NAME]: input.originalName.slice(0, 200),
    };
  }

  private encryptionParams(): {
    serverSideEncryption?: string;
    ssekmsKeyId?: string;
  } {
    const sse = this.config.privateS3.sseAlgorithm;
    if (sse === 'AWS:KMS' || sse === 'aws:kms') {
      return {
        serverSideEncryption: 'aws:kms',
        ssekmsKeyId: this.config.privateS3.kmsKeyId || undefined,
      };
    }
    return { serverSideEncryption: 'AES256' };
  }

  private get bucket(): string {
    return this.config.privateS3.bucket;
  }

  private prefixedKey(objectKey: string): string {
    const prefix = this.config.privateS3.keyPrefix;
    return prefix ? `${prefix}/${objectKey}` : objectKey;
  }

  private async getS3Ops(): Promise<DocumentPrivateS3Operations> {
    if (this.injectedS3Ops) return this.injectedS3Ops;
    if (!this.s3Ops) {
      this.s3Ops = await createDocumentPrivateS3Operations(this.config);
    }
    return this.s3Ops;
  }

  private async getObjectBytesFromS3(key: string): Promise<Buffer> {
    const s3 = await this.getS3Ops();
    const result = await s3.getObject({ bucket: this.bucket, key });
    const chunks: Buffer[] = [];
    for await (const chunk of result.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private isNotFoundError(err: unknown): boolean {
    const name = (err as { name?: string })?.name ?? '';
    const code = (err as { Code?: string; code?: string })?.Code ??
      (err as { code?: string })?.code;
    return (
      name === 'NotFound' ||
      name === 'NoSuchKey' ||
      code === 'NotFound' ||
      code === 'NoSuchKey' ||
      code === '404'
    );
  }
}
