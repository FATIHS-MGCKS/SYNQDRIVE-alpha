import { Prisma } from '@prisma/client';
import { fingerprintLinkMetadata } from './stable-metadata-fingerprint';

export type LinkMetadataStorageState = 'SQL_ABSENT' | 'JSON_NULL' | 'OBJECT';

export function classifyLinkMetadataStorage(metadata: unknown): LinkMetadataStorageState {
  if (metadata === null || metadata === undefined) {
    return 'SQL_ABSENT';
  }
  if (metadata === Prisma.JsonNull) {
    return 'JSON_NULL';
  }
  return 'OBJECT';
}

export function fingerprintLinkMetadataStorage(
  metadata: unknown,
  storageState: LinkMetadataStorageState,
): string {
  if (storageState === 'SQL_ABSENT') {
    return fingerprintLinkMetadata(null);
  }
  if (storageState === 'JSON_NULL') {
    return fingerprintLinkMetadata(null);
  }
  return fingerprintLinkMetadata(metadata);
}

export type LinkMetadataAuditSnapshot = {
  storageState: LinkMetadataStorageState;
  /** JSON column value when storageState is OBJECT or JSON_NULL; omitted when SQL_ABSENT. */
  metadataJson?: Prisma.InputJsonValue;
};

export function snapshotLinkMetadataForAudit(metadata: unknown): LinkMetadataAuditSnapshot {
  const storageState = classifyLinkMetadataStorage(metadata);
  if (storageState === 'SQL_ABSENT') {
    return { storageState };
  }
  if (storageState === 'JSON_NULL') {
    return { storageState, metadataJson: Prisma.JsonNull };
  }
  return { storageState, metadataJson: metadata as Prisma.InputJsonValue };
}

export function metadataUpdateValueFromSnapshot(
  snapshot: LinkMetadataAuditSnapshot,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (snapshot.storageState === 'SQL_ABSENT') {
    return Prisma.DbNull;
  }
  if (snapshot.storageState === 'JSON_NULL') {
    return Prisma.JsonNull;
  }
  return snapshot.metadataJson ?? Prisma.JsonNull;
}

export function mergeConnectionIdentityIntoMetadata(
  existing: unknown,
  connectionIdentity: Record<string, unknown>,
): Prisma.InputJsonValue {
  const storageState = classifyLinkMetadataStorage(existing);
  if (storageState === 'SQL_ABSENT' || storageState === 'JSON_NULL') {
    return { connectionIdentity };
  }
  const base = existing as Record<string, unknown>;
  return { ...base, connectionIdentity };
}
