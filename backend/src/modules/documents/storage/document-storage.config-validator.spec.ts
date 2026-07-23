import documentsConfig from '@config/documents.config';
import type { ConfigType } from '@nestjs/config';
import { validateDocumentStorageConfig } from './document-storage.config-validator';

function baseConfig(
  overrides: Partial<ConfigType<typeof documentsConfig>> = {},
): ConfigType<typeof documentsConfig> {
  return {
    storageProvider: 'local',
    allowLocalStorageInProduction: false,
    localStorageDir: './storage/documents',
    localQuarantineStorageDir: './storage/documents-quarantine',
    privateS3: {
      bucket: '',
      region: 'auto',
      endpoint: '',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: true,
      keyPrefix: '',
      sseAlgorithm: 'aes256',
      kmsKeyId: '',
    },
    storageHealthAlertThreshold: 5,
    ...overrides,
  } as ConfigType<typeof documentsConfig>;
}

describe('validateDocumentStorageConfig', () => {
  it('rejects local storage in production by default', () => {
    const result = validateDocumentStorageConfig(baseConfig(), { NODE_ENV: 'production' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('DOCUMENT_STORAGE_ALLOW_LOCAL_IN_PRODUCTION');
  });

  it('allows local storage in production when explicitly enabled', () => {
    const result = validateDocumentStorageConfig(
      baseConfig({ allowLocalStorageInProduction: true }),
      { NODE_ENV: 'production' },
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('requires private S3 credentials in production when provider is s3', () => {
    const result = validateDocumentStorageConfig(
      baseConfig({
        storageProvider: 's3',
        privateS3: {
          bucket: 'docs',
          region: 'auto',
          endpoint: '',
          accessKeyId: '',
          secretAccessKey: '',
          forcePathStyle: true,
          keyPrefix: '',
          sseAlgorithm: 'aes256',
          kmsKeyId: '',
        },
      }),
      { NODE_ENV: 'production' },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('DOCUMENT_PRIVATE_S3_ACCESS_KEY_ID');
  });

  it('accepts valid s3 configuration', () => {
    const result = validateDocumentStorageConfig(
      baseConfig({
        storageProvider: 's3',
        privateS3: {
          bucket: 'synqdrive-private-docs',
          region: 'eu-central-1',
          endpoint: 'https://s3.eu-central-1.amazonaws.com',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          forcePathStyle: false,
          keyPrefix: 'prod',
          sseAlgorithm: 'aes256',
          kmsKeyId: '',
        },
      }),
      { NODE_ENV: 'production' },
    );
    expect(result.ok).toBe(true);
  });
});
