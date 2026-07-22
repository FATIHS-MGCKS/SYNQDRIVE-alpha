import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMetricsService } from './iam-metrics.service';

/**
 * Refreshes IAM gauges that require periodic DB/config scans.
 */
@Injectable()
export class IamMetricsRefreshService implements OnModuleInit {
  private readonly logger = new Logger(IamMetricsRefreshService.name);

  constructor(
    private readonly metrics: IamMetricsService,
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  onModuleInit(): void {
    this.refreshSeedAdminGauge();
  }

  @Cron('*/5 * * * *')
  async refreshIamGauges(): Promise<void> {
    this.refreshSeedAdminGauge();
    if (!this.prisma) return;

    try {
      const now = new Date();
      const overdue = await this.prisma.accessReviewCampaign.count({
        where: {
          status: 'ACTIVE',
          dueAt: { lt: now },
        },
      });
      this.metrics.setAccessReviewOverdue(overdue);

      const orgsWithoutAdmin = await this.countOrganizationsWithoutAdmin();
      this.metrics.setOrganizationsWithoutAdmin(orgsWithoutAdmin);
    } catch (err) {
      this.logger.warn(
        `IAM metrics gauge refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private refreshSeedAdminGauge(): void {
    const enabled = this.config.get<boolean>('app.enableSeedAdmin', false);
    this.metrics.setSeedAdminEnabled(enabled);
  }

  private async countOrganizationsWithoutAdmin(): Promise<number> {
    const orgs = await this.prisma!.organization.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: { id: true },
    });
    if (orgs.length === 0) return 0;

    const adminCounts = await this.prisma!.organizationMembership.groupBy({
      by: ['organizationId'],
      where: {
        status: MembershipStatus.ACTIVE,
        role: MembershipRole.ORG_ADMIN,
        organizationId: { in: orgs.map((o) => o.id) },
      },
      _count: { _all: true },
    });

    const withAdmin = new Set(adminCounts.map((row) => row.organizationId));
    return orgs.filter((org) => !withAdmin.has(org.id)).length;
  }
}
