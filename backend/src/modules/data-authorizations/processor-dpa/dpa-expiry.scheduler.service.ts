import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataProcessingAgreementStatus, DpaAuditEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DpaAuditService } from './dpa-audit.service';
import { PROCESSOR_DPA_CONFIG } from './processor-dpa.config';

const DEFAULT_POLL_MS = 60 * 60 * 1000;

@Injectable()
export class DpaExpirySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DpaExpirySchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DpaAuditService,
  ) {}

  onModuleInit(): void {
    if (process.env.DPA_EXPIRY_POLL_ENABLED === 'false') return;
    const intervalMs = Number(process.env.DPA_EXPIRY_POLL_MS ?? DEFAULT_POLL_MS);
    this.timer = setInterval(() => {
      void this.processExpired().catch((err) => {
        this.logger.error('DPA expiry poll failed', err instanceof Error ? err.stack : String(err));
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processExpired(): Promise<{ expired: number }> {
    const now = new Date();
    const due = await this.prisma.dataProcessingAgreement.findMany({
      where: {
        isCurrentVersion: true,
        status: DataProcessingAgreementStatus.ACTIVE,
        effectiveUntil: { lte: now },
      },
      take: 100,
    });

    let expired = 0;
    for (const row of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.dataProcessingAgreement.update({
          where: { id: row.id },
          data: { status: DataProcessingAgreementStatus.EXPIRED },
        });
        await this.audit.record(tx, {
          organizationId: row.organizationId,
          agreementId: row.id,
          eventType: DpaAuditEventType.EXPIRED,
          summary: 'DPA expired by scheduler',
          metadata: { effectiveUntil: row.effectiveUntil?.toISOString() },
        });
      });
      expired++;
    }

    if (expired > 0) {
      this.logger.log(`DPA expiry: marked=${expired} mode=${PROCESSOR_DPA_CONFIG.expiredContractMode}`);
    }

    return { expired };
  }
}
