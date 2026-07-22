import type { ConfigType } from '@nestjs/config';
import documentsConfig from '@config/documents.config';
import type { DocumentPrivateS3Operations } from './document-private-s3.operations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type S3SdkModule = any;

let cachedSdk: S3SdkModule | null = null;

async function loadS3Sdk(): Promise<S3SdkModule> {
  if (cachedSdk) return cachedSdk;
  try {
    const sdkModule: string = '@aws-sdk/client-s3';
    cachedSdk = await import(sdkModule);
    return cachedSdk;
  } catch {
    throw new Error(
      'DOCUMENT_STORAGE_PROVIDER=s3 requires @aws-sdk/client-s3. Install it: npm i @aws-sdk/client-s3',
    );
  }
}

export async function createDocumentPrivateS3Operations(
  config: ConfigType<typeof documentsConfig>,
): Promise<DocumentPrivateS3Operations> {
  const sdk = await loadS3Sdk();
  const s3 = config.privateS3;
  const client = new sdk.S3Client({
    region: s3.region,
    endpoint: s3.endpoint || undefined,
    forcePathStyle: s3.forcePathStyle,
    credentials: {
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    },
  });

  return {
    async putObject(params) {
      const result = await client.send(
        new sdk.PutObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
          Metadata: params.metadata,
          ServerSideEncryption: params.serverSideEncryption,
          SSEKMSKeyId: params.ssekmsKeyId,
          ACL: undefined,
        }),
      );
      return { etag: result.ETag?.replace(/"/g, '') ?? undefined };
    },
    async getObject(params) {
      const result = await client.send(
        new sdk.GetObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
        }),
      );
      if (!result.Body) {
        throw new Error(`S3 object body missing for key ${params.key}`);
      }
      return {
        body: result.Body as import('stream').Readable,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        metadata: result.Metadata,
        etag: result.ETag?.replace(/"/g, ''),
      };
    },
    async headObject(params) {
      const result = await client.send(
        new sdk.HeadObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
        }),
      );
      return {
        contentLength: result.ContentLength,
        contentType: result.ContentType,
        metadata: result.Metadata,
        etag: result.ETag?.replace(/"/g, ''),
      };
    },
    async copyObject(params) {
      await client.send(
        new sdk.CopyObjectCommand({
          Bucket: params.bucket,
          CopySource: `${params.bucket}/${params.sourceKey}`,
          Key: params.destinationKey,
          MetadataDirective: params.metadataDirective ?? 'COPY',
          Metadata: params.metadata,
          ContentType: params.contentType,
          ServerSideEncryption: params.serverSideEncryption,
          SSEKMSKeyId: params.ssekmsKeyId,
          ACL: undefined,
        }),
      );
    },
    async deleteObject(params) {
      await client.send(
        new sdk.DeleteObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
        }),
      );
    },
    async headBucket(params) {
      await client.send(
        new sdk.HeadBucketCommand({
          Bucket: params.bucket,
        }),
      );
    },
    async listObjectKeys(params) {
      const result = await client.send(
        new sdk.ListObjectsV2Command({
          Bucket: params.bucket,
          Prefix: params.prefix,
          MaxKeys: params.limit,
          ContinuationToken: params.cursor || undefined,
        }),
      );
      const keys = (result.Contents ?? [])
        .map((item: { Key?: string }) => item.Key)
        .filter((key: string | undefined): key is string => Boolean(key));
      return {
        keys,
        nextCursor: result.IsTruncated ? result.NextContinuationToken : undefined,
      };
    },
  };
}
