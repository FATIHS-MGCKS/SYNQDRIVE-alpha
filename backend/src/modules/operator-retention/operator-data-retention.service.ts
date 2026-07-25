import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DocumentExtractionStatus, Prisma } from '@prisma/client';
import operatorDataRetentionConfig from '@config/operator-data-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { DocumentLifecycleService } from '@modules/document-extraction/document-lifecycle.service';
import {
  isDocumentLegalHoldActive,
  stripSensitiveOcrFromPlausibility,
} from '@modules/document-extraction/document-pipeline-lifecycle.util';
import { readPipelinePayload } from '@modules/document-extraction/document-content-cache.util';
import { OperatorEvidenceLegalHoldService } from './operator-evidence-legal-hold.service';
import type {
  OperatorDataRetentionDaysConfig,
  OperatorRetentionPhaseResult,
  OperatorRetentionReport,
  OperatorRetentionRunOptions,
} from './operator-data-retention.types';
import { OPERATOR_EXTRACTION_SOURCE_SURFACES } from './operator-data-retention.types';

function retentionCutoff(days: number): Date | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}

function isOperatorSourceSurface(plausibility: unknown): boolean {
  const surface = readPipelinePayload(plausibility).uploadContext?.candidate?.sourceSurface;
  if (!surface || typeof surface !== 'string') return false;
  return OPERATOR_EXTRACTION_SOURCE_SURFACES.some(
    (prefix) => surface === prefix || surface.startsWith(`${prefix}_`),
  );
}

@Injectable()
export class OperatorDataRetentionService implements OnModuleInit {
  private readonly logger = new Logger(OperatorDataRetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(operatorDataRetentionConfig.KEY)
    private readonly config: ConfigType<typeof operatorDataRetentionConfig>,
    private readonly legalHold: OperatorEvidenceLegalHoldService,
    private readonly documentLifecycle: DocumentLifecycleService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Operator data retention ${this.config.enabled ? 'ENABLED' : 'DISABLED'} — dryRun=${this.config.dryRun}`,
    );
  }

  async runOnce(options: OperatorRetentionRunOptions = {}): Promise<OperatorRetentionReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    if (!this.config.enabled) {
      return this.emptyReport(trigger, true, startedAtMs);
    }
    if (this.running) {
      this.logger.warn('Operator data retention already running — skipping overlapping run.');
      return this.emptyReport(trigger, this.resolveDryRun(options), startedAtMs);
    }

    this.running = true;
    const dryRun = this.resolveDryRun(options);
    const days = this.config.days as OperatorDataRetentionDaysConfig;
    const phases: OperatorRetentionPhaseResult[] = [];

    try {
      phases.push(
        await this.phaseAbandonedHandoverDrafts(dryRun, days.abandonedHandoverDraft, options.organizationId),
      );
      phases.push(
        await this.phaseHandoverSignatureBitmap(dryRun, days.handoverSignatureBitmap, options.organizationId),
      );
      phases.push(
        await this.phaseOperatorOrphanExtractions(dryRun, days.operatorOrphanExtraction, options.organizationId),
      );
      phases.push(
        await this.phaseOperatorExtractionOcrCache(dryRun, days.operatorExtractionOcrCache, options.organizationId),
      );

      const totals = phases.reduce(
        (acc, phase) => ({
          candidates: acc.candidates + phase.candidates,
          affected: acc.affected + phase.affected,
          skipped: acc.skipped + phase.skipped,
        }),
        { candidates: 0, affected: 0, skipped: 0 },
      );

      const report: OperatorRetentionReport = {
        trigger,
        dryRun,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        phases,
        totals,
      };
      this.logger.log(
        `Operator retention ${trigger} complete — dryRun=${dryRun} candidates=${totals.candidates} affected=${totals.affected} skipped=${totals.skipped}`,
      );
      return report;
    } finally {
      this.running = false;
    }
  }

  private resolveDryRun(options: OperatorRetentionRunOptions): boolean {
    return options.dryRun ?? this.config.dryRun;
  }

  private emptyReport(
    trigger: OperatorRetentionRunOptions['trigger'],
    dryRun: boolean,
    startedAtMs: number,
  ): OperatorRetentionReport {
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

  private orgFilter(organizationId?: string): { organizationId?: string } {
    return organizationId ? { organizationId } : {};
  }

  private async phaseAbandonedHandoverDrafts(
    dryRun: boolean,
    staleDays: number,
    organizationId?: string,
  ): Promise<OperatorRetentionPhaseResult> {
    const now = new Date();
    const staleCutoff = retentionCutoff(staleDays);
    const orClauses: Prisma.OperatorHandoverDraftWhereInput[] = [{ expiresAt: { lte: now } }];
    if (staleCutoff) {
      orClauses.push({ updatedAt: { lte: staleCutoff } });
    }

    const rows = await this.prisma.operatorHandoverDraft.findMany({
      where: {
        ...this.orgFilter(organizationId),
        OR: orClauses,
      },
      select: { id: true, organizationId: true, bookingId: true },
      take: this.config.batchSize * this.config.maxBatchesPerRun,
      orderBy: { expiresAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    for (const row of rows) {
      if (await this.legalHold.isActive(row.organizationId, row.bookingId)) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (!dryRun) {
        await this.prisma.operatorHandoverDraft.delete({ where: { id: row.id } });
      }
    }

    return {
      phase: 'abandoned_handover_draft',
      organizationId: organizationId ?? null,
      candidates: rows.length,
      affected,
      skipped,
      dryRun,
      notes: staleDays > 0 ? `TTL expiry + stale>${staleDays}d` : 'TTL expiry only',
    };
  }

  private async phaseHandoverSignatureBitmap(
    dryRun: boolean,
    days: number,
    organizationId?: string,
  ): Promise<OperatorRetentionPhaseResult> {
    const cutoff = retentionCutoff(days);
    if (!cutoff) {
      return this.disabledPhase('handover_signature_bitmap', dryRun, organizationId);
    }

    const rows = await this.prisma.bookingHandoverProtocol.findMany({
      where: {
        ...this.orgFilter(organizationId),
        performedAt: { lte: cutoff },
        OR: [
          { customerSignatureDataUrl: { not: null } },
          { staffSignatureDataUrl: { not: null } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        bookingId: true,
      },
      take: this.config.batchSize * this.config.maxBatchesPerRun,
      orderBy: { performedAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    for (const row of rows) {
      if (await this.legalHold.isActive(row.organizationId, row.bookingId)) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (!dryRun) {
        await this.prisma.bookingHandoverProtocol.update({
          where: { id: row.id },
          data: {
            customerSignatureDataUrl: null,
            staffSignatureDataUrl: null,
          },
        });
      }
    }

    return {
      phase: 'handover_signature_bitmap',
      organizationId: organizationId ?? null,
      candidates: rows.length,
      affected,
      skipped,
      dryRun,
    };
  }

  private async phaseOperatorOrphanExtractions(
    dryRun: boolean,
    days: number,
    organizationId?: string,
  ): Promise<OperatorRetentionPhaseResult> {
    const cutoff = retentionCutoff(days);
    if (!cutoff) {
      return this.disabledPhase('operator_orphan_extraction', dryRun, organizationId);
    }

    const statuses: DocumentExtractionStatus[] = ['REJECTED', 'FAILED', 'CANCELLED'];
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        ...this.orgFilter(organizationId),
        status: { in: statuses },
        appliedAt: null,
        createdAt: { lte: cutoff },
      },
      select: {
        id: true,
        organizationId: true,
        plausibility: true,
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
      if (!isOperatorSourceSurface(row.plausibility)) {
        skipped += 1;
        continue;
      }
      if (isDocumentLegalHoldActive(row.plausibility)) {
        skipped += 1;
        continue;
      }
      if (this.documentLifecycle.hasDownstreamLinks(row)) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (!dryRun) {
        await this.prisma.vehicleDocumentExtraction.delete({ where: { id: row.id } });
      }
    }

    return {
      phase: 'operator_orphan_extraction',
      organizationId: organizationId ?? null,
      candidates: rows.length,
      affected,
      skipped,
      dryRun,
      notes: 'Filters operator upload surfaces only',
    };
  }

  private async phaseOperatorExtractionOcrCache(
    dryRun: boolean,
    days: number,
    organizationId?: string,
  ): Promise<OperatorRetentionPhaseResult> {
    const cutoff = retentionCutoff(days);
    if (!cutoff) {
      return this.disabledPhase('operator_extraction_ocr_cache', dryRun, organizationId);
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
      if (!isOperatorSourceSurface(row.plausibility)) {
        skipped += 1;
        continue;
      }
      if (isDocumentLegalHoldActive(row.plausibility)) {
        skipped += 1;
        continue;
      }
      const pipeline = readPipelinePayload(row.plausibility);
      if (!pipeline.contentCache) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (!dryRun) {
        const plausibility = stripSensitiveOcrFromPlausibility(row.plausibility);
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: row.id },
          data: { plausibility: plausibility as Prisma.InputJsonValue },
        });
      }
    }

    return {
      phase: 'operator_extraction_ocr_cache',
      organizationId: organizationId ?? null,
      candidates: rows.length,
      affected,
      skipped,
      dryRun,
    };
  }

  private disabledPhase(
    phase: OperatorRetentionPhaseResult['phase'],
    dryRun: boolean,
    organizationId?: string,
  ): OperatorRetentionPhaseResult {
    return {
      phase,
      organizationId: organizationId ?? null,
      candidates: 0,
      affected: 0,
      skipped: 0,
      dryRun,
      notes: 'disabled (days=0)',
    };
  }
}
