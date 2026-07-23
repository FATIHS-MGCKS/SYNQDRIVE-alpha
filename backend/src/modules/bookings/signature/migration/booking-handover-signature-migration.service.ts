import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BookingHandoverSignatureStorageStatus,
  HandoverSignatureRole,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import type { DocumentStoragePort } from '@modules/documents/storage/document-storage.interface';
import { sha256Hex } from '@modules/documents/storage/document-storage-content-hash.util';
import {
  HANDOVER_SIGNATURE_DOCUMENT_TYPE,
  HANDOVER_SIGNATURE_MIGRATION_EVENT,
  HANDOVER_SIGNATURE_RETENTION_CLASS,
} from './booking-handover-signature.constants';
import {
  parseAndValidateSignatureDataUrl,
  signatureDataUrlPresent,
} from './booking-handover-signature-data-url.util';

export type HandoverSignatureMigrationMode = 'dry_run' | 'apply';

export interface HandoverSignatureMigrationCheckpoint {
  organizationId: string;
  lastProtocolId: string | null;
  processedCount: number;
  updatedAt: string;
}

export interface HandoverSignatureMigrationFailure {
  protocolId: string;
  role: HandoverSignatureRole;
  error: string;
}

export interface HandoverSignatureMigrationResult {
  migrationRunId: string;
  mode: HandoverSignatureMigrationMode;
  analyzed: number;
  migrated: number;
  skipped: number;
  failed: number;
  legacyCleared: number;
  failures: HandoverSignatureMigrationFailure[];
  checkpoint: HandoverSignatureMigrationCheckpoint;
}

@Injectable()
export class BookingHandoverSignatureMigrationService {
  private readonly logger = new Logger(BookingHandoverSignatureMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENTS_STORAGE)
    private readonly storage: DocumentStoragePort,
  ) {}

  async run(input: {
    organizationId: string;
    mode: HandoverSignatureMigrationMode;
    checkpoint?: HandoverSignatureMigrationCheckpoint | null;
    batchSize?: number;
  }): Promise<HandoverSignatureMigrationResult> {
    const migrationRunId = randomUUID();
    const batchSize = input.batchSize ?? 50;
    const failures: HandoverSignatureMigrationFailure[] = [];
    let analyzed = 0;
    let migrated = 0;
    let skipped = 0;
    let legacyCleared = 0;
    let lastProtocolId = input.checkpoint?.lastProtocolId ?? null;

    while (true) {
      const protocols = await this.prisma.bookingHandoverProtocol.findMany({
        where: {
          organizationId: input.organizationId,
          OR: [
            { customerSignatureDataUrl: { not: null } },
            { staffSignatureDataUrl: { not: null } },
          ],
          ...(lastProtocolId ? { id: { gt: lastProtocolId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
      });

      if (protocols.length === 0) break;

      for (const protocol of protocols) {
        analyzed += 1;
        lastProtocolId = protocol.id;

        const roles: Array<{
          role: HandoverSignatureRole;
          dataUrl: string | null;
          signerName: string | null;
          legacyColumn: 'customerSignatureDataUrl' | 'staffSignatureDataUrl';
        }> = [
          {
            role: 'CUSTOMER',
            dataUrl: protocol.customerSignatureDataUrl,
            signerName: protocol.customerSignatureName,
            legacyColumn: 'customerSignatureDataUrl',
          },
          {
            role: 'STAFF',
            dataUrl: protocol.staffSignatureDataUrl,
            signerName: protocol.staffSignatureName,
            legacyColumn: 'staffSignatureDataUrl',
          },
        ];

        for (const entry of roles) {
          if (!signatureDataUrlPresent(entry.dataUrl)) continue;

          try {
            const existing = await this.prisma.bookingHandoverSignature.findUnique({
              where: {
                protocolId_role: { protocolId: protocol.id, role: entry.role },
              },
            });

            if (
              existing &&
              (existing.storageStatus === BookingHandoverSignatureStorageStatus.STORED ||
                existing.storageStatus === BookingHandoverSignatureStorageStatus.LEGACY_CLEARED)
            ) {
              skipped += 1;
              if (
                input.mode === 'apply' &&
                protocol[entry.legacyColumn] &&
                existing.storageStatus === BookingHandoverSignatureStorageStatus.LEGACY_CLEARED
              ) {
                await this.clearLegacyColumn(protocol.id, entry.legacyColumn);
                legacyCleared += 1;
              }
              continue;
            }

            if (input.mode === 'dry_run') {
              parseAndValidateSignatureDataUrl(entry.dataUrl!);
              migrated += 1;
              continue;
            }

            await this.migrateOne({
              migrationRunId,
              organizationId: input.organizationId,
              protocol,
              role: entry.role,
              dataUrl: entry.dataUrl!,
              signerName: entry.signerName,
              legacyColumn: entry.legacyColumn,
            });
            migrated += 1;
            legacyCleared += 1;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            failures.push({ protocolId: protocol.id, role: entry.role, error: message });
            await this.recordEvent({
              migrationRunId,
              organizationId: input.organizationId,
              protocolId: protocol.id,
              role: entry.role,
              eventType: HANDOVER_SIGNATURE_MIGRATION_EVENT.FAILED,
              detail: { error: message },
            });
          }
        }
      }

      if (protocols.length < batchSize) break;
    }

    const checkpoint: HandoverSignatureMigrationCheckpoint = {
      organizationId: input.organizationId,
      lastProtocolId,
      processedCount: (input.checkpoint?.processedCount ?? 0) + analyzed,
      updatedAt: new Date().toISOString(),
    };

    return {
      migrationRunId,
      mode: input.mode,
      analyzed,
      migrated,
      skipped,
      failed: failures.length,
      legacyCleared,
      failures,
      checkpoint,
    };
  }

  private async migrateOne(input: {
    migrationRunId: string;
    organizationId: string;
    protocol: {
      id: string;
      bookingId: string;
      performedAt: Date;
    };
    role: HandoverSignatureRole;
    dataUrl: string;
    signerName: string | null;
    legacyColumn: 'customerSignatureDataUrl' | 'staffSignatureDataUrl';
  }): Promise<void> {
    await this.recordEvent({
      migrationRunId: input.migrationRunId,
      organizationId: input.organizationId,
      protocolId: input.protocol.id,
      role: input.role,
      eventType: HANDOVER_SIGNATURE_MIGRATION_EVENT.STARTED,
    });

    const parsed = parseAndValidateSignatureDataUrl(input.dataUrl);
    const stored = await this.storage.putObject({
      organizationId: input.organizationId,
      bookingId: input.protocol.bookingId,
      documentType: `${HANDOVER_SIGNATURE_DOCUMENT_TYPE}_${input.role}`,
      originalName: `${input.role.toLowerCase()}-signature.png`,
      buffer: parsed.buffer,
      mimeType: parsed.mimeType,
    });

    await this.recordEvent({
      migrationRunId: input.migrationRunId,
      organizationId: input.organizationId,
      protocolId: input.protocol.id,
      role: input.role,
      eventType: HANDOVER_SIGNATURE_MIGRATION_EVENT.STORAGE_WRITTEN,
      detail: { objectKey: stored.objectKey, contentHash: stored.contentHash },
    });

    const verifyBuffer = await this.storage.getObject(stored.objectKey);
    const verifyHash = sha256Hex(verifyBuffer);
    if (verifyHash !== stored.contentHash || verifyBuffer.length !== parsed.sizeBytes) {
      throw new Error('Storage verification failed after write');
    }

    const signature = await this.prisma.$transaction(async (tx) => {
      const row = await tx.bookingHandoverSignature.upsert({
        where: {
          protocolId_role: { protocolId: input.protocol.id, role: input.role },
        },
        create: {
          organizationId: input.organizationId,
          bookingId: input.protocol.bookingId,
          protocolId: input.protocol.id,
          role: input.role,
          signerName: input.signerName?.trim() || null,
          signedAt: input.protocol.performedAt,
          objectKey: stored.objectKey,
          storageProvider: stored.storageProvider,
          contentHash: stored.contentHash,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageStatus: BookingHandoverSignatureStorageStatus.STORED,
          migratedAt: new Date(),
          migrationRunId: input.migrationRunId,
          retentionClass: HANDOVER_SIGNATURE_RETENTION_CLASS,
        },
        update: {
          objectKey: stored.objectKey,
          storageProvider: stored.storageProvider,
          contentHash: stored.contentHash,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageStatus: BookingHandoverSignatureStorageStatus.STORED,
          migratedAt: new Date(),
          migrationRunId: input.migrationRunId,
        },
      });

      await tx.bookingHandoverProtocol.update({
        where: { id: input.protocol.id },
        data: { [input.legacyColumn]: null },
      });

      await tx.bookingHandoverSignature.update({
        where: { id: row.id },
        data: {
          storageStatus: BookingHandoverSignatureStorageStatus.LEGACY_CLEARED,
          legacyClearedAt: new Date(),
        },
      });

      return row;
    });

    await this.recordEvent({
      migrationRunId: input.migrationRunId,
      organizationId: input.organizationId,
      protocolId: input.protocol.id,
      signatureId: signature.id,
      role: input.role,
      eventType: HANDOVER_SIGNATURE_MIGRATION_EVENT.VERIFIED,
    });

    await this.recordEvent({
      migrationRunId: input.migrationRunId,
      organizationId: input.organizationId,
      protocolId: input.protocol.id,
      signatureId: signature.id,
      role: input.role,
      eventType: HANDOVER_SIGNATURE_MIGRATION_EVENT.LEGACY_CLEARED,
    });
  }

  private async clearLegacyColumn(
    protocolId: string,
    legacyColumn: 'customerSignatureDataUrl' | 'staffSignatureDataUrl',
  ): Promise<void> {
    await this.prisma.bookingHandoverProtocol.update({
      where: { id: protocolId },
      data: { [legacyColumn]: null },
    });
  }

  private async recordEvent(input: {
    migrationRunId: string;
    organizationId: string;
    protocolId: string;
    signatureId?: string;
    role: HandoverSignatureRole;
    eventType: string;
    detail?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.bookingHandoverSignatureMigrationEvent.create({
      data: {
        organizationId: input.organizationId,
        protocolId: input.protocolId,
        signatureId: input.signatureId ?? null,
        role: input.role,
        migrationRunId: input.migrationRunId,
        eventType: input.eventType,
        detail: input.detail ?? undefined,
      },
    });
  }
}
