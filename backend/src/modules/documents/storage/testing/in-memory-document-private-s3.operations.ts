import { Readable } from 'stream';
import type {
  DocumentPrivateS3GetObjectResult,
  DocumentPrivateS3HeadObjectResult,
  DocumentPrivateS3Operations,
  DocumentPrivateS3PutObjectParams,
} from '../document-private-s3.operations';

interface StoredObject {
  body: Buffer;
  contentType: string;
  metadata: Record<string, string>;
  etag: string;
}

/**
 * In-memory S3 operations double for contract tests — no live bucket required.
 */
export class InMemoryDocumentPrivateS3Operations implements DocumentPrivateS3Operations {
  private readonly objects = new Map<string, StoredObject>();

  private key(bucket: string, key: string): string {
    return `${bucket}::${key}`;
  }

  async putObject(params: DocumentPrivateS3PutObjectParams): Promise<{ etag?: string }> {
    const chunks: Buffer[] = [];
    if (Buffer.isBuffer(params.body)) {
      chunks.push(params.body);
    } else {
      for await (const chunk of params.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    }
    const body = Buffer.concat(chunks);
    const etag = `mock-etag-${body.length}`;
    this.objects.set(this.key(params.bucket, params.key), {
      body,
      contentType: params.contentType,
      metadata: { ...params.metadata },
      etag,
    });
    return { etag };
  }

  async getObject(params: {
    bucket: string;
    key: string;
  }): Promise<DocumentPrivateS3GetObjectResult> {
    const stored = this.objects.get(this.key(params.bucket, params.key));
    if (!stored) {
      const err = new Error('NoSuchKey');
      (err as { name: string }).name = 'NoSuchKey';
      throw err;
    }
    return {
      body: Readable.from(stored.body),
      contentType: stored.contentType,
      contentLength: stored.body.length,
      metadata: stored.metadata,
      etag: stored.etag,
    };
  }

  async headObject(params: {
    bucket: string;
    key: string;
  }): Promise<DocumentPrivateS3HeadObjectResult> {
    const stored = this.objects.get(this.key(params.bucket, params.key));
    if (!stored) {
      const err = new Error('NotFound');
      (err as { name: string }).name = 'NotFound';
      throw err;
    }
    return {
      contentLength: stored.body.length,
      contentType: stored.contentType,
      metadata: stored.metadata,
      etag: stored.etag,
    };
  }

  async copyObject(params: {
    bucket: string;
    sourceKey: string;
    destinationKey: string;
    metadataDirective?: 'COPY' | 'REPLACE';
    metadata?: Record<string, string>;
    contentType?: string;
  }): Promise<void> {
    const source = this.objects.get(this.key(params.bucket, params.sourceKey));
    if (!source) {
      const err = new Error('NoSuchKey');
      (err as { name: string }).name = 'NoSuchKey';
      throw err;
    }
    const metadata =
      params.metadataDirective === 'REPLACE' && params.metadata
        ? { ...params.metadata }
        : { ...source.metadata };
    this.objects.set(this.key(params.bucket, params.destinationKey), {
      body: Buffer.from(source.body),
      contentType: params.contentType ?? source.contentType,
      metadata,
      etag: `mock-etag-copy-${source.body.length}`,
    });
  }

  async deleteObject(params: { bucket: string; key: string }): Promise<void> {
    this.objects.delete(this.key(params.bucket, params.key));
  }

  async headBucket(_params: { bucket: string }): Promise<void> {
    return;
  }
}
