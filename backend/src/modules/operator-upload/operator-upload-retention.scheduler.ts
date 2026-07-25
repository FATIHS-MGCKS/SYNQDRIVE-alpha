import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OperatorUploadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENTS_STORAGE, type DocumentStoragePort } from '@modules/documents/storage/document-storage.interface';
import { Inject } from '@nestjs/common';
import { OPERATOR_UPLOAD_RETENTION_MS } from './operator-upload.constants';
import { assertOperatorUploadObjectKeyForOrg } from './operator-upload-storage.util';

@Injectable()
export class OperatorUploadRetentionScheduler {
  private readonly logger = new Logger(OperatorUploadRetentionScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
  ) {}

  /** Purges expired operator upload bytes from private storage and DB metadata. */
  @Cron('15 */6 * * *')
  async purgeExpiredUploads(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.operatorUpload.findMany({
      where: {
        expiresAt: { lt: now },
        OR: [
          { storageObjectKey: { not: null } },
          { storagePayload: { not: Prisma.DbNull } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        storageObjectKey: true,
      },
      take: 200,
    });

    if (expired.length === 0) return;

    for (const row of expired) {
      await this.deleteStoredObject(row.organizationId, row.storageObjectKey).catch((err) => {
        this.logger.warn(
          `Failed to delete expired operator upload object uploadId=${row.id}: ${(err as Error).message}`,
        );
      });
    }

    await this.prisma.operatorUpload.updateMany({
      where: { id: { in: expired.map((row) => row.id) } },
      data: {
        storageObjectKey: null,
        storageProvider: null,
        storagePayload: Prisma.DbNull,
        status: OperatorUploadStatus.CANCELLED,
        cancelledAt: now,
        errorCode: 'OPERATOR_UPLOAD_EXPIRED',
        errorMessage: 'Upload retention expired',
      },
    });

    this.logger.log(`Purged ${expired.length} expired operator uploads`);
  }

  async deleteStoredObject(organizationId: string, storageObjectKey: string | null): Promise<void> {
    if (!storageObjectKey) return;
    assertOperatorUploadObjectKeyForOrg(storageObjectKey, organizationId);
    await this.storage.deleteObject(storageObjectKey);
  }
}
