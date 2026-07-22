import type { Readable } from 'stream';

export interface DocumentPrivateS3PutObjectParams {
  bucket: string;
  key: string;
  body: Buffer | Readable;
  contentType: string;
  metadata: Record<string, string>;
  serverSideEncryption?: string;
  ssekmsKeyId?: string;
}

export interface DocumentPrivateS3GetObjectResult {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
  etag?: string;
}

export interface DocumentPrivateS3HeadObjectResult {
  contentLength?: number;
  contentType?: string;
  metadata?: Record<string, string>;
  etag?: string;
}

/**
 * Narrow S3 operations port for private document storage. Enables contract tests
 * without a live bucket and keeps the AWS SDK lazy-loaded in production.
 */
export interface DocumentPrivateS3Operations {
  putObject(params: DocumentPrivateS3PutObjectParams): Promise<{ etag?: string }>;
  getObject(params: { bucket: string; key: string }): Promise<DocumentPrivateS3GetObjectResult>;
  headObject(params: { bucket: string; key: string }): Promise<DocumentPrivateS3HeadObjectResult>;
  copyObject(params: {
    bucket: string;
    sourceKey: string;
    destinationKey: string;
    metadataDirective?: 'COPY' | 'REPLACE';
    metadata?: Record<string, string>;
    contentType?: string;
    serverSideEncryption?: string;
    ssekmsKeyId?: string;
  }): Promise<void>;
  deleteObject(params: { bucket: string; key: string }): Promise<void>;
  headBucket(params: { bucket: string }): Promise<void>;
}
