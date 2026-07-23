export const DOCUMENT_STORAGE_PROVIDERS = {
  LOCAL: 'local',
  S3: 's3',
} as const;

export type DocumentStorageProvider =
  (typeof DOCUMENT_STORAGE_PROVIDERS)[keyof typeof DOCUMENT_STORAGE_PROVIDERS];

export const DOCUMENT_STORAGE_METADATA_KEYS = {
  CONTENT_SHA256: 'content-sha256',
  ORIGINAL_NAME: 'original-name',
  ORGANIZATION_ID: 'organization-id',
  DOCUMENT_TYPE: 'document-type',
} as const;
