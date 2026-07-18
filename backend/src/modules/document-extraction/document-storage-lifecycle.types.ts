export const DOCUMENT_STORAGE_ZONES = {
  QUARANTINE: 'quarantine',
  CLEAN: 'clean',
} as const;

export type DocumentStorageZone =
  (typeof DOCUMENT_STORAGE_ZONES)[keyof typeof DOCUMENT_STORAGE_ZONES];

export type DocumentEncryptionAtRestProvider = 'none' | 'local-disk' | 's3-sse' | 's3-kms';

export interface DocumentStorageEncryptionCapabilities {
  declared: boolean;
  provider: DocumentEncryptionAtRestProvider;
  kmsKeyId?: string | null;
}

export interface DocumentStorageTransportCapabilities {
  /** API upload/download uses HTTPS in production deployments. */
  apiTransport: 'https';
  /** Object provider transport (e.g. TLS to S3). */
  providerTransport: 'local-filesystem' | 'tls';
}

export interface DocumentStorageBackupCapabilities {
  strategy: 'vps-pre-deploy-db' | 'manual' | 'none';
  documentObjectsIncluded: boolean;
  lastVerifiedAt?: string | null;
  note?: string | null;
}

export interface DocumentStorageCapabilities {
  provider: string;
  zones: DocumentStorageZone[];
  transport: DocumentStorageTransportCapabilities;
  encryptionAtRest: DocumentStorageEncryptionCapabilities;
  backup: DocumentStorageBackupCapabilities;
}

export interface DocumentLegalHoldState {
  active: boolean;
  reason?: string | null;
  setAt?: string | null;
  setByUserId?: string | null;
  clearedAt?: string | null;
  clearedByUserId?: string | null;
}

export interface DocumentRetentionState {
  policyVersion: string;
  fileSoftDeletedAt?: string | null;
  filePurgedAt?: string | null;
  ocrCachePurgedAt?: string | null;
  sensitiveDataPurgedAt?: string | null;
  rowFinalDeletedAt?: string | null;
}

export type DocumentMistralTransferStatus = 'not_sent' | 'sent' | 'completed' | 'failed';

export interface DocumentMistralDataTransferState {
  provider: 'mistral';
  status: DocumentMistralTransferStatus;
  sentAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  includesDocumentBytes: boolean;
  includesImageBase64: boolean;
  model?: string | null;
  pageCount?: number | null;
}

export interface DocumentPipelineLifecyclePayload {
  storage?: DocumentStorageCapabilities;
  retention?: DocumentRetentionState;
  legalHold?: DocumentLegalHoldState;
  mistralTransfer?: DocumentMistralDataTransferState;
}
