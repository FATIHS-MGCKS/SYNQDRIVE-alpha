import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MIGRATABLE_INSIGHT_TYPES } from '../insight-candidate.mapper';
import type { NotificationMigrationAcceptanceReport } from './notification-migration.types';

@Injectable()
export class NotificationMigrationAcceptanceService {
  constructor(private readonly prisma: PrismaService) {}

  async run(organizationId?: string): Promise<NotificationMigrationAcceptanceReport> {
    const checks: NotificationMigrationAcceptanceReport['checks'] = [];

    const duplicateActive = organizationId
      ? await this.prisma.$queryRaw<
          Array<{ organization_id: string; fingerprint: string; count: bigint }>
        >`
          SELECT organization_id, fingerprint, COUNT(*)::bigint AS count
          FROM notifications
          WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
            AND organization_id = ${organizationId}
          GROUP BY organization_id, fingerprint
          HAVING COUNT(*) > 1
        `
      : await this.prisma.$queryRaw<
          Array<{ organization_id: string; fingerprint: string; count: bigint }>
        >`
          SELECT organization_id, fingerprint, COUNT(*)::bigint AS count
          FROM notifications
          WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED')
          GROUP BY organization_id, fingerprint
          HAVING COUNT(*) > 1
        `;

    checks.push({
      name: 'no_duplicate_active_fingerprints',
      passed: duplicateActive.length === 0,
      detail:
        duplicateActive.length === 0
          ? 'No duplicate active fingerprints'
          : `Found ${duplicateActive.length} duplicate active fingerprint groups`,
      count: duplicateActive.length,
    });

    const missingEntity = await this.prisma.notification.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        OR: [{ entityId: '' }, { entityId: { equals: 'unknown' } }],
      },
    });

    checks.push({
      name: 'notifications_have_entity_ids',
      passed: missingEntity === 0,
      detail:
        missingEntity === 0
          ? 'All notifications have entity IDs'
          : `${missingEntity} notifications with missing/unknown entityId`,
      count: missingEntity,
    });

    const orphanOccurrences = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM notification_occurrences o
      LEFT JOIN notifications n ON n.id = o.notification_id
      WHERE n.id IS NULL
    `;

    const orphanCount = Number(orphanOccurrences[0]?.count ?? 0);
    checks.push({
      name: 'no_orphan_occurrences',
      passed: orphanCount === 0,
      detail:
        orphanCount === 0
          ? 'All occurrences reference notifications'
          : `${orphanCount} orphan occurrence rows`,
      count: orphanCount,
    });

    const deadLetter = await this.prisma.notificationDeliveryOutbox.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: 'DEAD_LETTER',
      },
    });

    checks.push({
      name: 'delivery_dead_letter_reviewed',
      passed: deadLetter === 0,
      detail:
        deadLetter === 0
          ? 'No dead-letter delivery rows'
          : `${deadLetter} dead-letter rows require ops review`,
      count: deadLetter,
    });

    const backlog = await this.prisma.notificationDeliveryOutbox.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: { in: ['PENDING', 'FAILED'] },
      },
    });

    checks.push({
      name: 'delivery_backlog_acceptable',
      passed: backlog < 500,
      detail: `Pending/retryable outbox rows: ${backlog}`,
      count: backlog,
    });

    const bridgedIds = await this.prisma.notification.findMany({
      where: {
        legacyInsightId: { not: null },
        ...(organizationId ? { organizationId } : {}),
      },
      select: { legacyInsightId: true },
    });
    const bridgedSet = new Set(
      bridgedIds.map((r) => r.legacyInsightId).filter(Boolean) as string[],
    );

    const activeMigratable = await this.prisma.dashboardInsight.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        isActive: true,
        type: {
          in: [...MIGRATABLE_INSIGHT_TYPES],
        },
      },
      select: { id: true },
    });

    const unbridged = activeMigratable.filter((i) => !bridgedSet.has(i.id)).length;
    checks.push({
      name: 'active_migratable_insights_bridged_or_pending',
      passed: true,
      detail: `${unbridged} active migratable insights without legacy_insight_id bridge (informational pre-cutover)`,
      count: unbridged,
    });

    const passed = checks
      .filter((c) => c.name !== 'active_migratable_insights_bridged_or_pending')
      .every((c) => c.passed);

    return {
      generatedAt: new Date().toISOString(),
      passed,
      checks,
    };
  }
}
