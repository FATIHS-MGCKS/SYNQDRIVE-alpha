import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import documentRetentionConfig from '@config/document-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { DocumentLifecycleService } from './document-lifecycle.service';
import {
  isDocumentLegalHoldActive,
  patchRetentionState,
  stripSensitiveOcrFromPlausibility,
} from './document-pipeline-lifecycle.util';
import type {
  DocumentRetentionDaysConfig,
  DocumentRetentionPhaseResult,
  DocumentRetentionReport,
  DocumentRetentionRunOptions,
} from './document-retention.types';

function retentionCutoff(days: number): Date | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}

@Injectable()
export class DocumentRetentionService implements OnModuleInit {
  private readonly logger = new Logger(DocumentRetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(documentRetentionConfig.KEY)
    private readonly config: ConfigType<typeof documentRetentionConfig>,
    private readonly lifecycle: DocumentLifecycleService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Document retention ${this.config.enabled ? 'ENABLED' : 'DISABLED'} — dryRun=${this.config.dryRun} — no run on deploy`,
    );
  }

  async runOnce(options: DocumentRetentionRunOptions = {}): Promise<DocumentRetentionReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    if (!this.config.enabled) {
      return this.emptyReport(trigger, true, startedAtMs);
    }
    if (this.running) {
      this.logger.warn('Document retention already running — skipping overlapping run.');
      return this.emptyReport(trigger, this.resolveDryRun(options), startedAtMs);
    }

    this.running = true;
    const dryRun = this.resolveDryRun(options);
    const days = this.config.days as DocumentRetentionDaysConfig;
    const phases: DocumentRetentionPhaseResult[] = [];

    try {
      phases.push(
        await this.phaseOcrCacheAfterSoftDelete(dryRun, days.ocrCacheAfterSoftDelete, options.organizationId),
      );
      phases.push(
        await this.phaseSensitiveExtractedDataAfterSoftDelete(
          dryRun,
          days.sensitiveExtractedDataAfterSoftDelete,
          options.organizationId,
        ),
      );
      phases.push(
        await this.phaseFinalRowAfterSoftDelete(
          dryRun,
          days.extractionRowAfterSoftDelete,
          options.organizationId,
        ),
      );
      phases.push(
        await this.phaseRejectedWithoutFile(dryRun, days.rejectedWithoutFile, options.organizationId),
      );

      const totals = phases.reduce(
        (acc, phase) => ({
          candidates: acc.candidates + phase.candidates,
          affected: acc.affected + phase.affected,
          skipped: acc.skipped + phase.skipped,
        }),
        { candidates: 0, affected: 0, skipped: 0 },
      );

      const report: DocumentRetentionReport = {
        trigger,
        dryRun,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        phases,
        totals,
      };
      this.logger.log(
        `Document retention ${trigger} complete — dryRun=${dryRun} candidates=${totals.candidates} affected=${totals.affected} skipped=${totals.skipped}`,
      );
      return report;
    } finally {
      this.running = false;
    }
  }

  private resolveDryRun(options: DocumentRetentionRunOptions): boolean {
    return options.dryRun ?? this.config.dryRun;
  }

  private emptyReport(
    trigger: DocumentRetentionRunOptions['trigger'],
    dryRun: boolean,
    startedAtMs: number,
  ): DocumentRetentionReport {
    return {
      trigger: trigger ?? 'manual',
      dryRun,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      phases: [],
      totals: { candidates: 0, affected: 0, skipped: 0 },
    };
  }

  private orgFilter(organizationId?: string): Prisma.VehicleDocumentExtractionWhereInput {
    return organizationId ? { organizationId } : {};
  }

  private async phaseOcrCacheAfterSoftDelete(
    dryRun: boolean,
    days: number,
    organizationId?: string,
  ): Promise<DocumentRetentionPhaseResult> {
    const cutoff = retentionCutoff(days);
    if (!cutoff) {
      return {
        phase: 'ocr_cache_after_soft_delete',
        organizationId: organizationId ?? null,
        candidates: 0,
        affected: 0,
        skipped: 0,
        dryRun,
        notes: 'disabled (days=0)',
      };
    }

    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        ...this.orgFilter(organizationId),
        fileDeletedAt: { lte: cutoff },
        plausibility: { not: Prisma.DbNull },
      },
      select: { id: true, plausibility: true, organizationId: true },
      take: this.config.batchSize * this.config.maxBatchesPerRun,
      orderBy: { fileDeletedAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    for (const row of rows) {
      if (isDocumentLegalHoldActive(row.plausibility)) {
        skipped += 1;
        continue;
      }
      const pipeline = row.plausibility as Record<string, unknown>;
      const hasCache = Boolean(
        (pipeline?._pipeline as Record<string, unknown> | undefined)?.contentCache,
      );
      if (!hasCache) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (!dryRun) {
        const now = new Date().toISOString();
        let plausibility = stripSensitiveOcrFromPlausibility(row.plausibility);
        plausibility = patchRetentionState(plausibility, {
          policyVersion: this.config.policyVersion,
          ocrCachePurgedAt: now,
        });
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: row.id },
          data: { plausibility: plausibility as Prisma.InputJsonValue },
        });
      }
    }

    return {
      phase: 'ocr_cache_after_soft_delete',
      organizationId: organizationId ?? null,
      candidates: rows.length,
      affected,
      skipped,
      dryRun,
    };
  }

  private async phaseSensitiveExtractedDataAfterSoftDelete(
    dryRun: boolean,
    days: number,
    organizationId?: string,
  ): Promise<DocumentRetentionPhaseResult> {
    const cutoff = retentionCutoff(days);
    if (!cutoff) {
      return {
        phase: 'sensitive_extracted_data_after_soft_delete',
        organizationId: organizationId ?? null,
        candidates: 0,
        affected: 0,
        skipped: 0,
        dryRun,
        notes: 'disabled (days=0)',
      };
    }

    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        ...this.orgFilter(organizationId),
        fileDeletedAt: { lte: cutoff },
        extractedData: { not: Prisma.DbNull },
      },
      select: { id: true, plausibility: true, extractedData: true, organizationId: true },
      take: this.config.batchSize * this.config.maxBatchesPerRun,
      orderBy: { fileDeletedAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    for (const row of rows) {
      if (isDocumentLegalHoldActive(row.plausibility)) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (!dryRun) {
        const now = new Date().toISOString();
        const plausibility = patchRetentionState(row.plausibility, {
          policyVersion: this.config.policyVersion,
          sensitiveDataPurgedAt: now,
        });
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: row.id },
          data: {
            extractedData: this.lifecycle.redactSensitiveExtractedData(row.extractedData),
            plausibility: plausibility as Prisma.InputJsonValue,
          },
        });
      }
    }

    return {
      phase: 'sensitive_extracted_data_after_soft_delete',
      organizationId: organizationId ?? null,
      candidates: rows.length,
      affected,
      skipped,
      dryRun,
    };
  }

  private async phaseFinalRowAfterSoftDelete(
    dryRun: boolean,
    days: number,
    organizationId?: string,
  ): Promise<DocumentRetentionPhaseResult> {
    const cutoff = retentionCutoff(days);
    if (!cutoff) {
      return {
        phase: 'final_row_after_soft_delete',
        organizationId: organizationId ?? null,
        candidates: 0,
        affected: 0,
        skipped: 0,
        dryRun,
        notes: 'disabled (days=0)',
      };
    }

    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        ...this.orgFilter(organizationId),
        fileDeletedAt: { lte: cutoff },
        objectKey: null,
      },
      select: {
        id: true,
        plausibility: true,
        organizationId: true,
        _count: {
          select: {
            fines: true,
            orgInvoices: true,
            damages: true,
            serviceEvents: true,
            batteryEvidence: true,
            brakeEvidence: true,
            tireTreadMeasurements: true,
          },
        },
      },
      take: this.config.batchSize * this.config.maxBatchesPerRun,
      orderBy: { fileDeletedAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    for (const row of rows) {
      if (isDocumentLegalHoldActive(row.plausibility)) {
        skipped += 1;
        continue;
      }
      if (this.lifecycle.hasDownstreamLinks(row)) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (!dryRun) {
        await this.prisma.vehicleDocumentExtraction.delete({ where: { id: row.id } });
      }
    }

    return {
      phase: 'final_row_after_soft_delete',
      organizationId: organizationId ?? null,
      candidates: rows.length,
      affected,
      skipped,
      dryRun,
    };
  }

  private async phaseRejectedWithoutFile(
    dryRun: boolean,
    days: number,
    organizationId?: string,
  ): Promise<DocumentRetentionPhaseResult> {
    const cutoff = retentionCutoff(days);
    if (!cutoff) {
      return {
        phase: 'rejected_without_file',
        organizationId: organizationId ?? null,
        candidates: 0,
        affected: 0,
        skipped: 0,
        dryRun,
        notes: 'disabled (days=0)',
      };
    }

    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        ...this.orgFilter(organizationId),
        status: 'REJECTED',
        objectKey: null,
        createdAt: { lte: cutoff },
      },
      select: {
        id: true,
        plausibility: true,
        organizationId: true,
        _count: {
          select: {
            fines: true,
            orgInvoices: true,
            damages: true,
            serviceEvents: true,
            batteryEvidence: true,
            brakeEvidence: true,
            tireTreadMeasurements: true,
          },
        },
      },
      take: this.config.batchSize * this.config.maxBatchesPerRun,
      orderBy: { createdAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    for (const row of rows) {
      if (isDocumentLegalHoldActive(row.plausibility)) {
        skipped += 1;
        continue;
      }
      if (this.lifecycle.hasDownstreamLinks(row)) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (!dryRun) {
        await this.prisma.vehicleDocumentExtraction.delete({ where: { id: row.id } });
      }
    }

    return {
      phase: 'rejected_without_file',
      organizationId: organizationId ?? null,
      candidates: rows.length,
      affected,
      skipped,
      dryRun,
    };
  }
}
