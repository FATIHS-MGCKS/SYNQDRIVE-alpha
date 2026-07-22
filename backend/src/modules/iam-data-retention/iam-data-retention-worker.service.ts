import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  ActivityAction,
  IamAuditOutboxStatus,
  IamDataCategory,
  InviteEmailOutboxStatus,
  Prisma,
} from '@prisma/client';
import iamDataRetentionConfig from '@config/iam-data-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { UserAccessAuditAction } from '@modules/users/user-access-audit.service';
import { IamLegalHoldService } from './iam-legal-hold.service';
import {
  pseudonymizeValue,
  resolveRetentionPolicies,
  retentionCutoff,
  ResolvedIamRetentionPolicy,
} from './iam-data-retention.policy';
import { IAM_DATA_CATEGORY_DEFINITIONS } from './iam-data-retention.contract';
import { IamDataRetentionMetricsService } from './iam-data-retention.metrics';

export interface IamRetentionPhaseResult {
  category: IamDataCategory;
  candidates: number;
  affected: number;
  skipped: number;
  dryRun: boolean;
  errorMessage?: string;
}

export interface IamRetentionRunReport {
  trigger: string;
  dryRun: boolean;
  organizationId: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phases: IamRetentionPhaseResult[];
  totals: { candidates: number; affected: number; skipped: number };
}

export interface IamRetentionRunOptions {
  trigger?: string;
  dryRun?: boolean;
  organizationId?: string;
  categories?: IamDataCategory[];
  actorUserId?: string;
}

export interface IamRetentionRunResult extends IamRetentionRunReport {
  processed: number;
  errors: string[];
}

@Injectable()
export class IamDataRetentionWorkerService implements OnModuleInit {
  private readonly logger = new Logger(IamDataRetentionWorkerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly legalHold: IamLegalHoldService,
    private readonly iamAudit: IamAuditService,
    private readonly metrics: IamDataRetentionMetricsService,
    @Inject(iamDataRetentionConfig.KEY)
    private readonly config: ConfigType<typeof iamDataRetentionConfig>,
  ) {}

  async run(options: IamRetentionRunOptions = {}): Promise<IamRetentionRunResult> {
    const report = await this.runOnce(options);
    const errors = report.phases
      .filter((p) => p.errorMessage)
      .map((p) => `${p.category}: ${p.errorMessage}`);
    const processed = report.totals.affected;

    if (options.actorUserId && options.organizationId) {
      const outboxIds: string[] = [];
      await this.prisma.$transaction(async (tx) => {
        const outbox = await this.iamAudit.enqueueInTransaction(tx, {
          organizationId: options.organizationId!,
          idempotencyKey: `retention-run:${report.startedAt}:${options.organizationId}`,
          eventType: UserAccessAuditAction.IAM_RETENTION_RUN_COMPLETED,
          actorUserId: options.actorUserId,
          description: 'IAM Retention-Lauf abgeschlossen',
          metadata: {
            dryRun: report.dryRun,
            trigger: report.trigger,
            totals: report.totals,
            phaseCount: report.phases.length,
            errors,
          },
          level: errors.length > 0 ? 'WARN' : 'INFO',
        });
        outboxIds.push(outbox.id);
      });
      await this.iamAudit.processOutboxIds(outboxIds);
    }

    this.metrics.record('run_completed');
    return { ...report, processed, errors };
  }

  onModuleInit(): void {
    this.logger.log(
      `IAM data retention ${this.config.enabled ? 'ENABLED' : 'DISABLED'} — dryRun default=${this.config.dryRun}`,
    );
  }

  async runOnce(options: IamRetentionRunOptions = {}): Promise<IamRetentionRunReport> {
    const trigger = options.trigger ?? 'manual';
    const startedAtMs = Date.now();
    const dryRun = options.dryRun ?? this.config.dryRun;
    const organizationId = options.organizationId ?? null;

    if (!this.config.enabled) {
      this.metrics.record('skipped_disabled');
      return this.emptyReport(trigger, dryRun, organizationId, startedAtMs);
    }
    if (this.running) {
      this.logger.warn('IAM retention already running — skipping overlapping run.');
      return this.emptyReport(trigger, dryRun, organizationId, startedAtMs);
    }

    this.running = true;
    this.metrics.record('run_started');
    const phases: IamRetentionPhaseResult[] = [];

    try {
      let policies = await resolveRetentionPolicies(this.prisma, organizationId);
      if (options.categories?.length) {
        const allowed = new Set(options.categories);
        policies = policies.filter((p) => allowed.has(p.category));
      }

      for (const policy of policies) {
        if (!policy.enabled && !IAM_DATA_CATEGORY_DEFINITIONS[policy.category].immediateCleanup) {
          continue;
        }
        if (policy.retentionDays <= 0 && !IAM_DATA_CATEGORY_DEFINITIONS[policy.category].immediateCleanup) {
          continue;
        }

        let phase: IamRetentionPhaseResult | null = null;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
          try {
            phase = await this.executeCategory(policy, dryRun, organizationId, trigger);
            break;
          } catch (err: unknown) {
            const message = (err as Error).message;
            if (attempt === this.config.maxRetries) {
              phase = {
                category: policy.category,
                candidates: 0,
                affected: 0,
                skipped: 0,
                dryRun,
                errorMessage: message,
              };
              this.logger.error(`IAM retention ${policy.category} failed: ${message}`);
            } else {
              await new Promise((r) => setTimeout(r, attempt * 250));
            }
          }
        }
        if (phase) {
          phases.push(phase);
          await this.logRun(phase, trigger, organizationId);
          if (phase.errorMessage) {
            this.metrics.record('phase_failed', phase.category);
          } else {
            this.metrics.record('phase_completed', phase.category);
          }
        }
      }

      const totals = phases.reduce(
        (acc, p) => ({
          candidates: acc.candidates + p.candidates,
          affected: acc.affected + p.affected,
          skipped: acc.skipped + p.skipped,
        }),
        { candidates: 0, affected: 0, skipped: 0 },
      );

      const report: IamRetentionRunReport = {
        trigger,
        dryRun,
        organizationId,
        startedAt: new Date(startedAtMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        phases,
        totals,
      };
      this.logger.log(
        `IAM retention ${trigger} complete — dryRun=${dryRun} candidates=${totals.candidates} affected=${totals.affected} skipped=${totals.skipped}`,
      );
      return report;
    } finally {
      this.running = false;
    }
  }

  private async executeCategory(
    policy: ResolvedIamRetentionPolicy,
    dryRun: boolean,
    organizationId: string | null,
    _trigger: string,
  ): Promise<IamRetentionPhaseResult> {
    switch (policy.category) {
      case IamDataCategory.SESSION_REFRESH_TOKEN:
        return this.phaseSessions(policy, dryRun, organizationId);
      case IamDataCategory.INVITE:
        return this.phaseInvites(policy, dryRun, organizationId);
      case IamDataCategory.RESET_TOKEN:
        return this.phaseResetDeliveryMetadata(policy, dryRun, organizationId);
      case IamDataCategory.IP_USER_AGENT:
        return this.phaseIpUserAgent(policy, dryRun, organizationId);
      case IamDataCategory.LOGIN_FAILURE:
        return this.phaseLoginFailures(policy, dryRun, organizationId);
      case IamDataCategory.SECURITY_EVENT:
        return this.phaseSecurityEvents(policy, dryRun, organizationId);
      case IamDataCategory.MFA_DATA:
        return this.phaseMfaData(policy, dryRun, organizationId);
      default:
        return {
          category: policy.category,
          candidates: 0,
          affected: 0,
          skipped: 0,
          dryRun,
        };
    }
  }

  private async phaseSessions(
    policy: ResolvedIamRetentionPolicy,
    dryRun: boolean,
    organizationId: string | null,
  ): Promise<IamRetentionPhaseResult> {
    const graceDays = this.config.sessionGraceDays;
    const cutoff = retentionCutoff(policy.retentionDays + graceDays);
    if (!cutoff) {
      return { category: policy.category, candidates: 0, affected: 0, skipped: 0, dryRun };
    }

    let candidates = 0;
    let affected = 0;
    let skipped = 0;

    for (let batch = 0; batch < this.config.maxBatchesPerCategory; batch++) {
      const rows = await this.prisma.refreshToken.findMany({
        where: {
          expiresAt: { lt: cutoff },
          ...(organizationId
            ? { user: { memberships: { some: { organizationId } } } }
            : {}),
        },
        select: { id: true, userId: true },
        take: this.config.batchSize,
      });
      if (rows.length === 0) break;
      candidates += rows.length;

      const deletable: string[] = [];
      for (const row of rows) {
        if (await this.legalHold.isBlocked({ userId: row.userId, organizationId })) {
          skipped++;
          continue;
        }
        deletable.push(row.id);
      }

      if (!dryRun && deletable.length > 0) {
        const result = await this.prisma.refreshToken.deleteMany({
          where: { id: { in: deletable } },
        });
        affected += result.count;
      } else {
        affected += deletable.length;
      }

      if (rows.length < this.config.batchSize) break;
    }

    return { category: policy.category, candidates, affected, skipped, dryRun };
  }

  private async phaseInvites(
    policy: ResolvedIamRetentionPolicy,
    dryRun: boolean,
    organizationId: string | null,
  ): Promise<IamRetentionPhaseResult> {
    const cutoff = retentionCutoff(policy.retentionDays);
    if (!cutoff) {
      return { category: policy.category, candidates: 0, affected: 0, skipped: 0, dryRun };
    }

    const deliveryCutoff = retentionCutoff(this.config.inviteDeliveryMetadataDays);
    let candidates = 0;
    let affected = 0;
    const skipped = 0;

    const outboxRows = await this.prisma.inviteEmailOutbox.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: { in: [InviteEmailOutboxStatus.COMPLETED, InviteEmailOutboxStatus.DEAD_LETTER] },
        processedAt: deliveryCutoff ? { lt: deliveryCutoff } : undefined,
        tokenCiphertext: { not: null },
      },
      select: { id: true },
      take: this.config.batchSize,
    });
    candidates += outboxRows.length;

    if (!dryRun && outboxRows.length > 0) {
      const result = await this.prisma.inviteEmailOutbox.updateMany({
        where: { id: { in: outboxRows.map((r) => r.id) } },
        data: { tokenCiphertext: null },
      });
      affected += result.count;
    } else {
      affected += outboxRows.length;
    }

    const revokedInvites = await this.prisma.organizationUserInvite.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: 'REVOKED',
        revokedAt: { lt: cutoff },
      },
      select: { id: true },
      take: this.config.batchSize,
    });
    candidates += revokedInvites.length;

    if (!dryRun && revokedInvites.length > 0) {
      for (const invite of revokedInvites) {
        await this.prisma.organizationUserInvite.update({
          where: { id: invite.id },
          data: {
            tokenHash: 'redacted',
            tokenLookup: `redacted-${invite.id}`,
          },
        });
        affected++;
      }
    } else {
      affected += revokedInvites.length;
    }

    return { category: policy.category, candidates, affected, skipped, dryRun };
  }

  private async phaseResetDeliveryMetadata(
    policy: ResolvedIamRetentionPolicy,
    dryRun: boolean,
    organizationId: string | null,
  ): Promise<IamRetentionPhaseResult> {
    void organizationId;
    const cutoff = retentionCutoff(policy.retentionDays);
    if (!cutoff) {
      return { category: policy.category, candidates: 0, affected: 0, skipped: 0, dryRun };
    }

    const rows = await this.prisma.inviteEmailOutbox.findMany({
      where: {
        processedAt: { lt: cutoff },
        tokenCiphertext: { not: null },
        idempotencyKey: { contains: 'password-reset' },
      },
      select: { id: true },
      take: this.config.batchSize,
    });

    if (!dryRun && rows.length > 0) {
      await this.prisma.inviteEmailOutbox.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { tokenCiphertext: null },
      });
    }

    return {
      category: policy.category,
      candidates: rows.length,
      affected: rows.length,
      skipped: 0,
      dryRun,
    };
  }

  private async phaseIpUserAgent(
    policy: ResolvedIamRetentionPolicy,
    dryRun: boolean,
    organizationId: string | null,
  ): Promise<IamRetentionPhaseResult> {
    const cutoff = retentionCutoff(policy.retentionDays);
    if (!cutoff) {
      return { category: policy.category, candidates: 0, affected: 0, skipped: 0, dryRun };
    }

    const salt = this.config.pseudonymizationSalt || 'iam-retention-default-salt';
    let candidates = 0;
    let affected = 0;
    let skipped = 0;

    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        createdAt: { lt: cutoff },
        OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }],
        ...(organizationId
          ? { user: { memberships: { some: { organizationId } } } }
          : {}),
      },
      select: { id: true, userId: true, ipAddress: true, userAgent: true },
      take: this.config.batchSize,
    });
    candidates += sessions.length;

    for (const row of sessions) {
      if (await this.legalHold.isBlocked({ userId: row.userId, organizationId })) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        await this.prisma.refreshToken.update({
          where: { id: row.id },
          data: {
            ipAddress: pseudonymizeValue(row.ipAddress, salt),
            userAgent: row.userAgent ? '[redacted]' : null,
          },
        });
      }
      affected++;
    }

    const logs = await this.prisma.activityLog.findMany({
      where: {
        createdAt: { lt: cutoff },
        ...(organizationId ? { organizationId } : {}),
        OR: [{ ipAddress: { not: null } }, { userAgent: { not: null } }],
      },
      select: { id: true, ipAddress: true, userAgent: true, userId: true },
      take: this.config.batchSize,
    });
    candidates += logs.length;

    for (const row of logs) {
      if (row.userId && (await this.legalHold.isBlocked({ userId: row.userId, organizationId }))) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        await this.prisma.activityLog.update({
          where: { id: row.id },
          data: {
            ipAddress: pseudonymizeValue(row.ipAddress, salt),
            userAgent: row.userAgent ? '[redacted]' : null,
          },
        });
      }
      affected++;
    }

    return { category: policy.category, candidates, affected, skipped, dryRun };
  }

  private async phaseLoginFailures(
    policy: ResolvedIamRetentionPolicy,
    dryRun: boolean,
    organizationId: string | null,
  ): Promise<IamRetentionPhaseResult> {
    const cutoff = retentionCutoff(policy.retentionDays);
    if (!cutoff) {
      return { category: policy.category, candidates: 0, affected: 0, skipped: 0, dryRun };
    }

    const rows = await this.prisma.activityLog.findMany({
      where: {
        createdAt: { lt: cutoff },
        action: ActivityAction.AUTH_FAIL,
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true, userId: true },
      take: this.config.batchSize,
    });

    let skipped = 0;
    const deletable: string[] = [];
    for (const row of rows) {
      if (row.userId && (await this.legalHold.isBlocked({ userId: row.userId, organizationId }))) {
        skipped++;
        continue;
      }
      deletable.push(row.id);
    }

    if (!dryRun && deletable.length > 0) {
      await this.prisma.activityLog.deleteMany({ where: { id: { in: deletable } } });
    }

    return {
      category: policy.category,
      candidates: rows.length,
      affected: deletable.length,
      skipped,
      dryRun,
    };
  }

  private async phaseSecurityEvents(
    policy: ResolvedIamRetentionPolicy,
    dryRun: boolean,
    organizationId: string | null,
  ): Promise<IamRetentionPhaseResult> {
    const cutoff = retentionCutoff(policy.retentionDays);
    if (!cutoff) {
      return { category: policy.category, candidates: 0, affected: 0, skipped: 0, dryRun };
    }

    const rows = await this.prisma.iamAuditOutbox.findMany({
      where: {
        status: IamAuditOutboxStatus.DEAD_LETTER,
        createdAt: { lt: cutoff },
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true },
      take: this.config.batchSize,
    });

    if (!dryRun && rows.length > 0) {
      await this.prisma.iamAuditOutbox.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
    }

    return {
      category: policy.category,
      candidates: rows.length,
      affected: rows.length,
      skipped: 0,
      dryRun,
    };
  }

  private async phaseMfaData(
    policy: ResolvedIamRetentionPolicy,
    dryRun: boolean,
    organizationId: string | null,
  ): Promise<IamRetentionPhaseResult> {
    if (policy.retentionDays <= 0) {
      return { category: policy.category, candidates: 0, affected: 0, skipped: 0, dryRun };
    }
    const cutoff = retentionCutoff(policy.retentionDays);
    if (!cutoff) {
      return { category: policy.category, candidates: 0, affected: 0, skipped: 0, dryRun };
    }

    const inactiveUsers = await this.prisma.user.findMany({
      where: {
        status: { not: 'ACTIVE' },
        updatedAt: { lt: cutoff },
        ...(organizationId ? { memberships: { some: { organizationId } } } : {}),
      },
      select: { id: true },
      take: this.config.batchSize,
    });

    let affected = 0;
    let skipped = 0;
    for (const user of inactiveUsers) {
      if (await this.legalHold.isBlocked({ userId: user.id, organizationId })) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        await this.prisma.userMfaFactor.deleteMany({ where: { userId: user.id } });
        await this.prisma.userMfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      }
      affected++;
    }

    return {
      category: policy.category,
      candidates: inactiveUsers.length,
      affected,
      skipped,
      dryRun,
    };
  }

  private async logRun(
    phase: IamRetentionPhaseResult,
    trigger: string,
    organizationId: string | null,
  ) {
    await this.prisma.iamRetentionRunLog.create({
      data: {
        organizationId,
        category: phase.category,
        trigger,
        dryRun: phase.dryRun,
        candidates: phase.candidates,
        affected: phase.affected,
        skipped: phase.skipped,
        errorMessage: phase.errorMessage ?? null,
        metadata: Prisma.JsonNull,
      },
    });
  }

  private emptyReport(
    trigger: string,
    dryRun: boolean,
    organizationId: string | null,
    startedAtMs: number,
  ): IamRetentionRunReport {
    return {
      trigger,
      dryRun,
      organizationId,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
      phases: [],
      totals: { candidates: 0, affected: 0, skipped: 0 },
    };
  }
}
