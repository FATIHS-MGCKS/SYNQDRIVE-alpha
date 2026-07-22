import documentsConfig from '@config/documents.config';
import type { ConfigType } from '@nestjs/config';
import { DOCUMENT_STORAGE_PROVIDERS } from '../storage/document-storage.constants';

export interface DocumentStorageConfigValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateDocumentStorageConfig(
  config: ConfigType<typeof documentsConfig>,
  env: NodeJS.ProcessEnv = process.env,
): DocumentStorageConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  const provider = config.storageProvider;

  if (provider === DOCUMENT_STORAGE_PROVIDERS.LOCAL) {
    if (isProd && !config.allowLocalStorageInProduction) {
      errors.push(
        'DOCUMENT_STORAGE_PROVIDER=local is not allowed in production unless DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true',
      );
    } else if (isProd && config.allowLocalStorageInProduction) {
      warnings.push(
        'DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true — private documents stored on local disk in production',
      );
    }
  } else if (provider === DOCUMENT_STORAGE_PROVIDERS.S3) {
    const s3 = config.privateS3;
    if (!s3.bucket) {
      errors.push('DOCUMENT_PRIVATE_S3_BUCKET is required when DOCUMENT_STORAGE_PROVIDER=s3');
    }
    if (!s3.accessKeyId || !s3.secretAccessKey) {
      errors.push(
        'DOCUMENT_PRIVATE_S3_ACCESS_KEY_ID and DOCUMENT_PRIVATE_S3_SECRET_ACCESS_KEY are required for s3 provider',
      );
    }
    const sse = (s3.sseAlgorithm || '').toUpperCase();
    if (sse === 'AWS:KMS' && !s3.kmsKeyId) {
      errors.push('DOCUMENT_PRIVATE_S3_KMS_KEY_ID is required when DOCUMENT_PRIVATE_S3_SSE=aws:kms');
    }
  } else {
    errors.push(
      `DOCUMENT_STORAGE_PROVIDER=${provider} is unsupported — use local or s3`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}
