import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import legalDocumentRetentionConfig from '@config/legal-document-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '../storage/document-storage.interface';
import { LegalDocumentEventsService } from '../legal-document-events.service';
import { LEGAL_DOCUMENT_EVENT_TYPE } from '../legal-document-events.constants';
import { LegalDocumentLegalHoldService } from './legal-document-legal-hold.service';
import { LegalDocumentRetentionPolicyService } from './legal-document-retention-policy.service';
import { LegalDocumentRetentionReferenceService } from './legal-document-retention-reference.service';
import {
  LEGAL_DOCUMENT_RETENTION_CLASS,
  LEGAL_DOCUMENT_RETENTION_PHASE,
  LEGAL_DOCUMENT_RETENTION_PURGE_RUN_STATUS,
  LEGAL_DOCUMENT_RETENTION_SKIP_REASON,
  LEGAL_MASTER_PURGEABLE_STATUSES,
} from './legal-document-retention.constants';
import type {
  LegalDocumentRetentionPhaseResult,
  LegalDocumentRetentionReport,
  LegalDocumentRetentionRunOptions,
} from './legal-document-retention.types';

const REDACTED_RECIPIENT_SNAPSHOT = {
  redacted: true,
  reason: 'retention_policy',
} as const;

@Injectable()
export class LegalDocumentRetentionService implements OnModuleInit {
  private readonly logger = new Logger(LegalDocumentRetentionService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(legalDocumentRetentionConfig.KEY)
    private readonly config: ConfigType<typeof legalDocumentRetentionConfig>,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly policy: LegalDocumentRetentionPolicyService,
    private readonly references: LegalDocumentRetentionReferenceService,
    private readonly legalHold: LegalDocumentLegalHoldService,
    private readonly events: LegalDocumentEventsService,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      `Legal document retention ${this.config.enabled ? 'ENABLED' : 'DISABLED'} — dryRun=${this.config.dryRun}`,
    );
  }

  async runOnce(options: LegalDocumentRetentionRunOptions = {}): Promise<LegalDocumentRetentionReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    const dryRun = options.dryRun ?? this.config.dryRun;

    if (!this.config.enabled) {
      return this.emptyReport(trigger, dryRun, startedAtMs);
    }
    if (this.running) {
      this.logger.warn('Legal document retention already running — skipping overlapping run.');
      return this.emptyReport(trigger, dryRun, startedAtMs);
    }

    this.running = true;
    let runId: string | undefined;

    try {
      const run = await this.prisma.legalDocumentRetentionPurgeRun.create({
        data: {
          organizationId: options.organizationId ?? null,
          trigger,
          dryRun,
          status: LEGAL_DOCUMENT_RETENTION_PURGE_RUN_STATUS.RUNNING,
          correlationId: options.correlationId ?? null,
          report: {},
        },
      });
      runId = run.id;

      const phases: LegalDocumentRetentionPhaseResult[] = [];
      phases.push(
        await this.phaseQuarantineTemp(dryRun, options.organizationId),
      );
      phases.push(
        await this.phaseLegalMasterStorage(dryRun, options.organizationId),
      );
      phases.push(
        await this.phaseBookingSnapshotStorage(dryRun, options.organizationId),
      );
      phases.push(
        await this.phaseDeliveryEvidenceRedaction(dryRun, options.organizationId),
      );

      const totals = phases.reduce(
        (acc, phase) => ({
          candidates: acc.candidates + phase.candidates,
          affected: acc.affected + phase.affected,
          skipped: acc.skipped + phase.skipped,
          failed: acc.failed + phase.failed,
        }),
        { candidates: 0, affected: 0, skipped: 0, failed: 0 },
      );

      const report: LegalDocumentRetentionReport = {
        runId,
        trigger,
        dryRun,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        phases,
        totals,
      };

      await this.prisma.legalDocumentRetentionPurgeRun.update({
        where: { id: runId },
        data: {
          status: LEGAL_DOCUMENT_RETENTION_PURGE_RUN_STATUS.COMPLETED,
          completedAt: new Date(),
          report: report as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(
        `Legal document retention ${trigger} complete — dryRun=${dryRun} affected=${totals.affected} failed=${totals.failed}`,
      );
      return report;
    } catch (err) {
      if (runId) {
        await this.prisma.legalDocumentRetentionPurgeRun.update({
          where: { id: runId },
          data: {
            status: LEGAL_DOCUMENT_RETENTION_PURGE_RUN_STATUS.FAILED,
            completedAt: new Date(),
            report: {
              error: err instanceof Error ? err.message : String(err),
            } as Prisma.InputJsonValue,
          },
        });
      }
      throw err;
    } finally {
      this.running = false;
    }
  }

  async refreshMasterDeletionEligibility(
    organizationId: string,
    legalDocumentId: string,
    anchorDate: Date,
  ): Promise<void> {
    const classPolicy = await this.policy.resolveClassPolicy(
      organizationId,
      LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER,
    );
    const deletionEligibleAt = this.policy.computeDeletionEligibleAt(
      LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER,
      anchorDate,
      classPolicy.retentionDays,
    );
    await this.prisma.organizationLegalDocument.update({
      where: { id: legalDocumentId },
      data: {
        retentionClass: LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER,
        deletionEligibleAt,
      },
    });
  }

  private emptyReport(
    trigger: LegalDocumentRetentionRunOptions['trigger'],
    dryRun: boolean,
    startedAtMs: number,
  ): LegalDocumentRetentionReport {
    return {
      trigger: trigger ?? 'manual',
      dryRun,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      phases: [],
      totals: { candidates: 0, affected: 0, skipped: 0, failed: 0 },
    };
  }

  private orgFilter<T extends { organizationId?: string }>(
    organizationId?: string,
  ): T {
    return (organizationId ? { organizationId } : {}) as T;
  }

  private takeLimit(): number {
    return this.config.batchSize * this.config.maxBatchesPerRun;
  }

  private async phaseQuarantineTemp(
    dryRun: boolean,
    organizationId?: string,
  ): Promise<LegalDocumentRetentionPhaseResult> {
    const classPolicy = organizationId
      ? await this.policy.resolveClassPolicy(
          organizationId,
          LEGAL_DOCUMENT_RETENTION_CLASS.QUARANTINE_TEMP,
        )
      : {
          retentionDays: this.config.days.quarantineTemp,
          anchor: 'created_at' as const,
        };

    if (!classPolicy.retentionDays || classPolicy.retentionDays <= 0) {
      return this.phaseResult(
        LEGAL_DOCUMENT_RETENTION_PHASE.QUARANTINE_TEMP,
        LEGAL_DOCUMENT_RETENTION_CLASS.QUARANTINE_TEMP,
        organizationId,
        0,
        0,
        0,
        0,
        dryRun,
        'disabled (days=0)',
      );
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - classPolicy.retentionDays);

    const rows = await this.prisma.organizationLegalDocument.findMany({
      where: {
        ...this.orgFilter(organizationId),
        quarantineObjectKey: { not: null },
        createdAt: { lte: cutoff },
        legalHold: false,
      },
      select: {
        id: true,
        organizationId: true,
        quarantineObjectKey: true,
        legalHold: true,
        retainUntil: true,
      },
      take: this.takeLimit(),
      orderBy: { createdAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    let failed = 0;
    const skipSamples: { id: string; reason: string }[] = [];
    const failureSamples: { id: string; objectKey?: string | null; error: string }[] = [];

    for (const row of rows) {
      if (this.legalHold.isRetentionBlockedByHold(row)) {
        skipped += 1;
        skipSamples.push({ id: row.id, reason: LEGAL_DOCUMENT_RETENTION_SKIP_REASON.LEGAL_HOLD });
        continue;
      }
      if (!row.quarantineObjectKey) {
        skipped += 1;
        continue;
      }

      affected += 1;
      if (dryRun) continue;

      try {
        await this.storage.deleteObject(row.quarantineObjectKey);
        await this.prisma.organizationLegalDocument.update({
          where: { id: row.id, organizationId: row.organizationId },
          data: {
            quarantineObjectKey: null,
            storagePurgedAt: new Date(),
            storagePurgeError: null,
          },
        });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        failureSamples.push({ id: row.id, objectKey: row.quarantineObjectKey, error: message });
        await this.prisma.organizationLegalDocument.update({
          where: { id: row.id, organizationId: row.organizationId },
          data: { storagePurgeError: message },
        });
      }
    }

    return this.phaseResult(
      LEGAL_DOCUMENT_RETENTION_PHASE.QUARANTINE_TEMP,
      LEGAL_DOCUMENT_RETENTION_CLASS.QUARANTINE_TEMP,
      organizationId,
      rows.length,
      affected - failed,
      skipped,
      failed,
      dryRun,
      undefined,
      skipSamples,
      failureSamples,
    );
  }

  private async phaseLegalMasterStorage(
    dryRun: boolean,
    organizationId?: string,
  ): Promise<LegalDocumentRetentionPhaseResult> {
    const now = new Date();
    const rows = await this.prisma.organizationLegalDocument.findMany({
      where: {
        ...this.orgFilter(organizationId),
        retentionClass: LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER,
        status: { in: [...LEGAL_MASTER_PURGEABLE_STATUSES] },
        objectKey: { not: '' },
        deletedAt: null,
        storagePurgedAt: null,
        legalHold: false,
        OR: [
          { deletionEligibleAt: { lte: now } },
          { retainUntil: { lte: now } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        objectKey: true,
        status: true,
        legalHold: true,
        retainUntil: true,
      },
      take: this.takeLimit(),
      orderBy: { deletionEligibleAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    let failed = 0;
    const skipSamples: { id: string; reason: string; detail?: string }[] = [];
    const failureSamples: { id: string; objectKey?: string | null; error: string }[] = [];

    for (const row of rows) {
      if (this.legalHold.isRetentionBlockedByHold(row)) {
        skipped += 1;
        skipSamples.push({ id: row.id, reason: LEGAL_DOCUMENT_RETENTION_SKIP_REASON.LEGAL_HOLD });
        continue;
      }

      const blockingRefs = await this.references.countMasterDocumentBlockingReferences(
        row.organizationId,
        row.id,
      );
      if (blockingRefs > 0) {
        skipped += 1;
        skipSamples.push({
          id: row.id,
          reason: LEGAL_DOCUMENT_RETENTION_SKIP_REASON.ACTIVE_REFERENCES,
          detail: `${blockingRefs} downstream references`,
        });
        continue;
      }

      affected += 1;
      if (dryRun) continue;

      const purgeResult = await this.purgeMasterStorage(row.organizationId, row.id, row.objectKey);
      if (purgeResult.ok) {
        await this.appendMasterPurgeAudit(row.organizationId, row.id, true);
      } else {
        failed += 1;
        failureSamples.push({
          id: row.id,
          objectKey: row.objectKey,
          error: purgeResult.error,
        });
        await this.appendMasterPurgeAudit(row.organizationId, row.id, false, purgeResult.error);
      }
    }

    return this.phaseResult(
      LEGAL_DOCUMENT_RETENTION_PHASE.LEGAL_MASTER_STORAGE,
      LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER,
      organizationId,
      rows.length,
      affected - failed,
      skipped,
      failed,
      dryRun,
      undefined,
      skipSamples,
      failureSamples,
    );
  }

  private async phaseBookingSnapshotStorage(
    dryRun: boolean,
    organizationId?: string,
  ): Promise<LegalDocumentRetentionPhaseResult> {
    const now = new Date();
    const rows = await this.prisma.generatedDocument.findMany({
      where: {
        ...this.orgFilter(organizationId),
        retentionClass: LEGAL_DOCUMENT_RETENTION_CLASS.BOOKING_SNAPSHOT,
        objectKey: { not: '' },
        deletedAt: null,
        storagePurgedAt: null,
        legalHold: false,
        OR: [
          { deletionEligibleAt: { lte: now } },
          { retainUntil: { lte: now } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        objectKey: true,
        legalHold: true,
        retainUntil: true,
      },
      take: this.takeLimit(),
      orderBy: { deletionEligibleAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;
    let failed = 0;
    const skipSamples: { id: string; reason: string; detail?: string }[] = [];
    const failureSamples: { id: string; objectKey?: string | null; error: string }[] = [];

    for (const row of rows) {
      if (this.legalHold.isRetentionBlockedByHold(row)) {
        skipped += 1;
        skipSamples.push({ id: row.id, reason: LEGAL_DOCUMENT_RETENTION_SKIP_REASON.LEGAL_HOLD });
        continue;
      }

      const refs = await this.references.summarizeGeneratedDocumentReferences(
        row.organizationId,
        row.id,
      );
      if (this.references.hasActiveGeneratedDocumentReferences(refs)) {
        skipped += 1;
        skipSamples.push({
          id: row.id,
          reason: LEGAL_DOCUMENT_RETENTION_SKIP_REASON.ACTIVE_REFERENCES,
          detail: JSON.stringify(refs),
        });
        continue;
      }

      affected += 1;
      if (dryRun) continue;

      try {
        await this.storage.deleteObject(row.objectKey);
        await this.prisma.generatedDocument.update({
          where: { id: row.id, organizationId: row.organizationId },
          data: {
            objectKey: '',
            deletedAt: new Date(),
            storagePurgedAt: new Date(),
            storagePurgeError: null,
          },
        });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        failureSamples.push({ id: row.id, objectKey: row.objectKey, error: message });
        await this.prisma.generatedDocument.update({
          where: { id: row.id, organizationId: row.organizationId },
          data: { storagePurgeError: message },
        });
      }
    }

    return this.phaseResult(
      LEGAL_DOCUMENT_RETENTION_PHASE.BOOKING_SNAPSHOT_STORAGE,
      LEGAL_DOCUMENT_RETENTION_CLASS.BOOKING_SNAPSHOT,
      organizationId,
      rows.length,
      affected - failed,
      skipped,
      failed,
      dryRun,
      undefined,
      skipSamples,
      failureSamples,
    );
  }

  private async phaseDeliveryEvidenceRedaction(
    dryRun: boolean,
    organizationId?: string,
  ): Promise<LegalDocumentRetentionPhaseResult> {
    const now = new Date();
    const rows = await this.prisma.legalDocumentDeliveryEvidence.findMany({
      where: {
        ...this.orgFilter(organizationId),
        retentionClass: LEGAL_DOCUMENT_RETENTION_CLASS.DELIVERY_EVIDENCE,
        recipientRedactedAt: null,
        deletedAt: null,
        legalHold: false,
        OR: [
          { deletionEligibleAt: { lte: now } },
          { retainUntil: { lte: now } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        legalHold: true,
        retainUntil: true,
      },
      take: this.takeLimit(),
      orderBy: { deletionEligibleAt: 'asc' },
    });

    let affected = 0;
    let skipped = 0;

    for (const row of rows) {
      if (this.legalHold.isRetentionBlockedByHold(row)) {
        skipped += 1;
        continue;
      }
      affected += 1;
      if (dryRun) continue;

      await this.prisma.legalDocumentDeliveryEvidence.update({
        where: { id: row.id, organizationId: row.organizationId },
        data: {
          recipientSnapshot: REDACTED_RECIPIENT_SNAPSHOT as Prisma.InputJsonValue,
          recipientRedactedAt: new Date(),
        },
      });
    }

    return this.phaseResult(
      LEGAL_DOCUMENT_RETENTION_PHASE.DELIVERY_EVIDENCE_REDACTION,
      LEGAL_DOCUMENT_RETENTION_CLASS.DELIVERY_EVIDENCE,
      organizationId,
      rows.length,
      affected,
      skipped,
      0,
      dryRun,
    );
  }

  private async purgeMasterStorage(
    organizationId: string,
    legalDocumentId: string,
    objectKey: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.storage.deleteObject(objectKey);
      await this.prisma.organizationLegalDocument.update({
        where: { id: legalDocumentId, organizationId },
        data: {
          objectKey: '',
          deletedAt: new Date(),
          storagePurgedAt: new Date(),
          storagePurgeError: null,
        },
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.organizationLegalDocument.update({
        where: { id: legalDocumentId, organizationId },
        data: { storagePurgeError: message },
      });
      return { ok: false, error: message };
    }
  }

  private async appendMasterPurgeAudit(
    organizationId: string,
    legalDocumentId: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    const doc = await this.prisma.organizationLegalDocument.findFirst({
      where: { id: legalDocumentId, organizationId },
    });
    if (!doc) return;

    await this.prisma.$transaction(async (tx) => {
      await this.events.appendInTransaction(tx, {
        organizationId,
        legalDocument: doc,
        eventType: success
          ? LEGAL_DOCUMENT_EVENT_TYPE.STORAGE_PURGED
          : LEGAL_DOCUMENT_EVENT_TYPE.STORAGE_PURGE_FAILED,
        previousStatus: doc.status,
        newStatus: doc.status,
        reason: success ? 'retention_purge' : error ?? 'retention_purge_failed',
      });
    });
  }

  private phaseResult(
    phase: LegalDocumentRetentionPhaseResult['phase'],
    retentionClass: LegalDocumentRetentionPhaseResult['retentionClass'],
    organizationId: string | undefined,
    candidates: number,
    affected: number,
    skipped: number,
    failed: number,
    dryRun: boolean,
    notes?: string,
    skipSamples?: LegalDocumentRetentionPhaseResult['skipSamples'],
    failureSamples?: LegalDocumentRetentionPhaseResult['failureSamples'],
  ): LegalDocumentRetentionPhaseResult {
    return {
      phase,
      retentionClass,
      organizationId: organizationId ?? null,
      candidates,
      affected,
      skipped,
      failed,
      dryRun,
      notes,
      skipSamples: skipSamples?.slice(0, 10),
      failureSamples: failureSamples?.slice(0, 10),
    };
  }
}
