import { Prisma, type PrismaClient } from '@prisma/client';
import { fingerprintLinkMetadata } from './stable-metadata-fingerprint';

export type LinkMetadataStorageState = 'SQL_ABSENT' | 'JSON_NULL' | 'OBJECT';

/** JSON values accepted for audit snapshot columns (object or JSON null sentinel). */
export type LinkMetadataAuditJsonValue = Prisma.InputJsonValue | typeof Prisma.JsonNull;

export function classifyLinkMetadataStorage(metadata: unknown): LinkMetadataStorageState {
  if (metadata === null || metadata === undefined) {
    return 'SQL_ABSENT';
  }
  if (metadata === Prisma.JsonNull) {
    return 'JSON_NULL';
  }
  return 'OBJECT';
}

/** Distinguish SQL NULL vs jsonb null when Prisma surfaces both as `null`. */
export async function resolveLinkMetadataStorageState(
  db: PrismaClient | Prisma.TransactionClient,
  linkId: string,
  metadata: unknown,
): Promise<LinkMetadataStorageState> {
  if (metadata !== null && metadata !== undefined && metadata !== Prisma.JsonNull) {
    return 'OBJECT';
  }
  if (metadata === Prisma.JsonNull) {
    return 'JSON_NULL';
  }
  return inspectLinkMetadataStorageFromDatabase(db as PrismaClient, linkId);
}

/** Classify metadata using PostgreSQL storage (SQL NULL vs jsonb null vs object). */
export async function inspectLinkMetadataStorageFromDatabase(
  prisma: PrismaClient,
  linkId: string,
): Promise<LinkMetadataStorageState> {
  const rows = await prisma.$queryRaw<{ sql_null: boolean; json_null: boolean }[]>`
    SELECT
      (metadata IS NULL) AS sql_null,
      (metadata IS NOT NULL AND metadata = 'null'::jsonb) AS json_null
    FROM vehicle_data_source_links
    WHERE id = ${linkId}::text
  `;
  const row = rows[0];
  if (!row || row.sql_null) {
    return 'SQL_ABSENT';
  }
  if (row.json_null) {
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
  /** Present when storageState is OBJECT or JSON_NULL. */
  metadataJson?: LinkMetadataAuditJsonValue;
};

export function snapshotLinkMetadataForAudit(
  metadata: unknown,
  storageStateOverride?: LinkMetadataStorageState,
): LinkMetadataAuditSnapshot {
  const storageState = storageStateOverride ?? classifyLinkMetadataStorage(metadata);
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
  connectionIdentity: Prisma.InputJsonValue,
): Prisma.InputJsonValue {
  const storageState = classifyLinkMetadataStorage(existing);
  if (storageState === 'SQL_ABSENT' || storageState === 'JSON_NULL') {
    return { connectionIdentity } as Prisma.InputJsonValue;
  }
  const base = existing as Prisma.JsonObject;
  return { ...base, connectionIdentity } as Prisma.InputJsonValue;
}

export function auditJsonValueForPrismaWrite(
  value: LinkMetadataAuditJsonValue | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === Prisma.JsonNull) {
    return Prisma.JsonNull;
  }
  return value;
}
