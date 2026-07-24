import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ComplianceEvidenceReportStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ComplianceEvidenceExportService } from './compliance-evidence-export.service';
import { COMPLIANCE_EVIDENCE } from './compliance-evidence.constants';

@Injectable()
export class ComplianceEvidenceSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComplianceEvidenceSchedulerService.name);
  private processTimer: ReturnType<typeof setInterval> | null = null;
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly exports: ComplianceEvidenceExportService,
  ) {}

  onModuleInit(): void {
    if (process.env.COMPLIANCE_EVIDENCE_ENABLED === 'false') return;

    const processMs = Number(process.env.COMPLIANCE_EVIDENCE_PROCESS_MS ?? 30_000);
    this.processTimer = setInterval(() => {
      void this.processPending().catch((err) => {
        this.logger.error('Compliance evidence process poll failed', err instanceof Error ? err.stack : String(err));
      });
    }, processMs);
    this.processTimer.unref?.();

    if (process.env.COMPLIANCE_EVIDENCE_PURGE_ENABLED !== 'false') {
      const purgeMs = Number(process.env.COMPLIANCE_EVIDENCE_PURGE_MS ?? 3_600_000);
      this.purgeTimer = setInterval(() => {
        void this.exports.purgeExpiredExports().catch((err) => {
          this.logger.error('Compliance evidence purge failed', err instanceof Error ? err.stack : String(err));
        });
      }, purgeMs);
      this.purgeTimer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.processTimer) clearInterval(this.processTimer);
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  async processPending(): Promise<{ processed: number }> {
    const pending = await this.prisma.complianceEvidenceReport.findMany({
      where: { status: ComplianceEvidenceReportStatus.PLANNED },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    let processed = 0;
    for (const row of pending) {
      await this.exports.processReport(row.id, row.generatedByUserId ?? undefined);
      processed++;
    }

    if (processed > 0) {
      this.logger.log(`Compliance evidence async processed=${processed} ttlHours=${COMPLIANCE_EVIDENCE.exportTtlHours}`);
    }

    return { processed };
  }
}
