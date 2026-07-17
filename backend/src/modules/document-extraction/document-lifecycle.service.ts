import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import documentRetentionConfig from '@config/document-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENT_STORAGE, DocumentStoragePort } from './storage/document-storage.interface';
import {
  appendExtractionActionAudit,
  readPipelinePayload,
} from './document-content-cache.util';
import {
  isDocumentLegalHoldActive,
  mergePipelineLifecycle,
  patchLegalHoldState,
  patchRetentionState,
  stripSensitiveOcrFromPlausibility,
} from './document-pipeline-lifecycle.util';
import type { DocumentStorageCapabilities } from './document-storage-lifecycle.types';

@Injectable()
export class DocumentLifecycleService {
  private readonly logger = new Logger(DocumentLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    @Inject(documentRetentionConfig.KEY)
    private readonly retentionConfig: ConfigType<typeof documentRetentionConfig>,
  ) {}

  buildStorageCapabilitiesSnapshot(): DocumentStorageCapabilities {
    return this.storage.getCapabilities();
  }

  assertNotOnLegalHold(plausibility: unknown): void {
    if (isDocumentLegalHoldActive(plausibility)) {
      throw new ForbiddenException({
        message: 'This document is under legal hold and cannot be modified',
        errorCode: 'DOCUMENT_LEGAL_HOLD_ACTIVE',
      });
    }
  }

  async softDeleteFile(params: {
    record: {
      id: string;
      objectKey?: string | null;
      plausibility?: unknown;
      fileDeletedAt?: Date | null;
    };
    userId?: string | null;
  }) {
    this.assertNotOnLegalHold(params.record.plausibility);
    if (params.record.fileDeletedAt) {
      return params.record;
    }

    if (params.record.objectKey) {
      await this.storage.deleteObject(params.record.objectKey).catch((err) => {
        this.logger.warn(
          `deleteObject(${params.record.objectKey}) failed: ${(err as Error).message}`,
        );
      });
    }

    const now = new Date().toISOString();
    let plausibility = appendExtractionActionAudit(params.record.plausibility, {
      action: 'delete_file',
      at: now,
      userId: params.userId ?? null,
      details: { mode: 'soft_delete' },
    }) as Record<string, unknown>;

    if (this.retentionConfig.stripOcrCacheOnManualDelete) {
      plausibility = stripSensitiveOcrFromPlausibility(plausibility);
      plausibility = patchRetentionState(plausibility, {
        policyVersion: this.retentionConfig.policyVersion,
        ocrCachePurgedAt: now,
        fileSoftDeletedAt: now,
        filePurgedAt: now,
      }) as Record<string, unknown>;
    } else {
      plausibility = patchRetentionState(plausibility, {
        policyVersion: this.retentionConfig.policyVersion,
        fileSoftDeletedAt: now,
        filePurgedAt: now,
      }) as Record<string, unknown>;
    }

    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: params.record.id },
      data: {
        objectKey: null,
        sizeBytes: null,
        mimeType: null,
        fileDeletedAt: new Date(now),
        fileDeletedById: params.userId ?? null,
        plausibility: plausibility as Prisma.InputJsonValue,
      },
    });
  }

  async setLegalHold(params: {
    record: { id: string; plausibility?: unknown };
    userId?: string | null;
    reason?: string;
  }) {
    const now = new Date().toISOString();
    const plausibility = appendExtractionActionAudit(
      patchLegalHoldState(params.record.plausibility, {
        active: true,
        reason: params.reason ?? null,
        setAt: now,
        setByUserId: params.userId ?? null,
        clearedAt: null,
        clearedByUserId: null,
      }),
      {
        action: 'legal_hold_set',
        at: now,
        userId: params.userId ?? null,
        details: { reason: params.reason ?? null },
      },
    );

    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: params.record.id },
      data: { plausibility: plausibility as Prisma.InputJsonValue },
    });
  }

  async clearLegalHold(params: {
    record: { id: string; plausibility?: unknown };
    userId?: string | null;
  }) {
    const now = new Date().toISOString();
    const plausibility = appendExtractionActionAudit(
      patchLegalHoldState(params.record.plausibility, {
        active: false,
        clearedAt: now,
        clearedByUserId: params.userId ?? null,
      }),
      {
        action: 'legal_hold_clear',
        at: now,
        userId: params.userId ?? null,
      },
    );

    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: params.record.id },
      data: { plausibility: plausibility as Prisma.InputJsonValue },
    });
  }

  async recordDownloadAudit(params: {
    record: { id: string; plausibility?: unknown };
    userId?: string | null;
  }) {
    const plausibility = appendExtractionActionAudit(params.record.plausibility, {
      action: 'download',
      at: new Date().toISOString(),
      userId: params.userId ?? null,
    });
    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: params.record.id },
      data: { plausibility: plausibility as Prisma.InputJsonValue },
    });
  }

  hasDownstreamLinks(record: {
    _count?: {
      fines?: number;
      orgInvoices?: number;
      damages?: number;
      serviceEvents?: number;
      batteryEvidence?: number;
      brakeEvidence?: number;
      tireTreadMeasurements?: number;
    };
  }): boolean {
    const counts = record._count;
    if (!counts) return false;
    return (
      (counts.fines ?? 0) > 0 ||
      (counts.orgInvoices ?? 0) > 0 ||
      (counts.damages ?? 0) > 0 ||
      (counts.serviceEvents ?? 0) > 0 ||
      (counts.batteryEvidence ?? 0) > 0 ||
      (counts.brakeEvidence ?? 0) > 0 ||
      (counts.tireTreadMeasurements ?? 0) > 0
    );
  }

  redactSensitiveExtractedData(extractedData: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) {
      return Prisma.DbNull;
    }
    const copy = { ...(extractedData as Record<string, unknown>) };
    for (const key of Object.keys(copy)) {
      if (typeof copy[key] === 'string' && copy[key].length > 0) {
        copy[key] = '[redacted]';
      }
    }
    return copy as Prisma.InputJsonValue;
  }

  seedLifecycleOnCreate(
    plausibility: unknown,
    storageCapabilities: DocumentStorageCapabilities,
  ): Record<string, unknown> {
    const current = readPipelinePayload(plausibility);
    if (current.lifecycle?.storage) {
      return plausibility as Record<string, unknown>;
    }
    return mergePipelineLifecycle(plausibility, {
      storage: storageCapabilities,
      retention: { policyVersion: this.retentionConfig.policyVersion },
      legalHold: { active: false },
      mistralTransfer: {
        provider: 'mistral',
        status: 'not_sent',
        includesDocumentBytes: false,
        includesImageBase64: false,
      },
    });
  }
}
