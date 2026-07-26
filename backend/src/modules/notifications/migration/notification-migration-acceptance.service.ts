import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MIGRATABLE_INSIGHT_TYPES } from '../insight-candidate.mapper';
import {
  isMigratableInsightType,
  resolveInsightFingerprint,
} from './notification-migration-insight.util';
import type {
  NotificationMigrationAcceptanceCheck,
  NotificationMigrationAcceptanceReport,
} from './notification-migration.types';

const BACKLOG_THRESHOLD = 500;

@Injectable()
export class NotificationMigrationAcceptanceService {
  constructor(private readonly prisma: PrismaService) {}

  async run(organizationId?: string): Promise<NotificationMigrationAcceptanceReport> {
    const checks: NotificationMigrationAcceptanceCheck[] = [];

    checks.push(await this.checkDuplicateActiveFingerprints(organizationId));
    checks.push(await this.checkNotificationsHaveEntityIds(organizationId));
    checks.push(await this.checkOrphanOccurrences(organizationId));
    checks.push(await this.checkOrphanReceipts(organizationId));
    checks.push(await this.checkInvalidEntityReferences(organizationId));
    checks.push(await this.checkMigrationCountConsistency(organizationId));
    checks.push(await this.checkUnresolvedMappingErrors(organizationId));
    checks.push(await this.checkDeliveryDeadLetter(organizationId));
    checks.push(await this.checkDeliveryBacklog(organizationId));
    checks.push(await this.checkOrphanOutboxRows(organizationId));
    checks.push(await this.checkOutboxOrgMismatch(organizationId));

    const passed = checks
      .filter((c) => c.severity !== 'info')
      .every((c) => c.passed);

    return {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      organizationId: organizationId ?? null,
      passed,
      checks,
    };
  }

  private async checkDuplicateActiveFingerprints(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
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

    return {
      name: 'no_duplicate_active_fingerprints',
      severity: 'critical',
      passed: duplicateActive.length === 0,
      detail:
        duplicateActive.length === 0
          ? 'No duplicate active fingerprints'
          : `Found ${duplicateActive.length} duplicate active fingerprint groups`,
      count: duplicateActive.length,
      samples: duplicateActive.slice(0, 5).map((r) => `${r.organization_id}:${r.fingerprint}`),
    };
  }

  private async checkNotificationsHaveEntityIds(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const missingEntity = await this.prisma.notification.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        OR: [{ entityId: '' }, { entityId: { equals: 'unknown' } }],
      },
    });

    return {
      name: 'notifications_have_entity_ids',
      severity: 'critical',
      passed: missingEntity === 0,
      detail:
        missingEntity === 0
          ? 'All notifications have entity IDs'
          : `${missingEntity} notifications with missing/unknown entityId`,
      count: missingEntity,
    };
  }

  private async checkOrphanOccurrences(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const orphanOccurrences = organizationId
      ? await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notification_occurrences o
          LEFT JOIN notifications n ON n.id = o.notification_id
          WHERE n.id IS NULL
            AND o.organization_id = ${organizationId}
        `
      : await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notification_occurrences o
          LEFT JOIN notifications n ON n.id = o.notification_id
          WHERE n.id IS NULL
        `;

    const orphanCount = Number(orphanOccurrences[0]?.count ?? 0);
    return {
      name: 'no_orphan_occurrences',
      severity: 'critical',
      passed: orphanCount === 0,
      detail:
        orphanCount === 0
          ? 'All occurrences reference notifications'
          : `${orphanCount} orphan occurrence rows`,
      count: orphanCount,
    };
  }

  private async checkOrphanReceipts(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const orphanReceipts = organizationId
      ? await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notification_receipts r
          LEFT JOIN notifications n ON n.id = r.notification_id
          WHERE n.id IS NULL
            AND r.organization_id = ${organizationId}
        `
      : await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notification_receipts r
          LEFT JOIN notifications n ON n.id = r.notification_id
          WHERE n.id IS NULL
        `;

    const orphanCount = Number(orphanReceipts[0]?.count ?? 0);
    return {
      name: 'no_orphan_receipts',
      severity: 'critical',
      passed: orphanCount === 0,
      detail:
        orphanCount === 0
          ? 'All receipts reference notifications'
          : `${orphanCount} orphan receipt rows`,
      count: orphanCount,
    };
  }

  private async checkInvalidEntityReferences(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const invalidRows = organizationId
      ? await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notifications n
          LEFT JOIN vehicles v
            ON n.entity_type = 'VEHICLE'
           AND n.entity_id = v.id
           AND v.organization_id = n.organization_id
          LEFT JOIN stations s
            ON n.entity_type = 'STATION'
           AND n.entity_id = s.id
           AND s.organization_id = n.organization_id
          WHERE n.organization_id = ${organizationId}
            AND (
              (n.entity_type = 'VEHICLE' AND v.id IS NULL)
              OR (n.entity_type = 'STATION' AND s.id IS NULL)
            )
        `
      : await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notifications n
          LEFT JOIN vehicles v
            ON n.entity_type = 'VEHICLE'
           AND n.entity_id = v.id
           AND v.organization_id = n.organization_id
          LEFT JOIN stations s
            ON n.entity_type = 'STATION'
           AND n.entity_id = s.id
           AND s.organization_id = n.organization_id
          WHERE (
            (n.entity_type = 'VEHICLE' AND v.id IS NULL)
            OR (n.entity_type = 'STATION' AND s.id IS NULL)
          )
        `;

    const invalidCount = Number(invalidRows[0]?.count ?? 0);
    return {
      name: 'no_invalid_entity_references',
      severity: 'critical',
      passed: invalidCount === 0,
      detail:
        invalidCount === 0
          ? 'All vehicle/station entity references resolve in tenant'
          : `${invalidCount} notifications reference missing vehicle/station in org`,
      count: invalidCount,
    };
  }

  private async checkMigrationCountConsistency(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const activeMigratable = await this.prisma.dashboardInsight.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        isActive: true,
        type: { in: [...MIGRATABLE_INSIGHT_TYPES] },
      },
      select: { id: true },
    });

    const bridgedByLegacy = await this.prisma.notification.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        legacyInsightId: { not: null },
      },
      select: { legacyInsightId: true },
    });

    const migratableTypeList = Prisma.join(MIGRATABLE_INSIGHT_TYPES);
    const occurrenceBridges = organizationId
      ? await this.prisma.$queryRaw<Array<{ source_ref: string }>>`
          SELECT DISTINCT o.source_ref
          FROM notification_occurrences o
          INNER JOIN dashboard_insights i ON i.id = o.source_ref
          WHERE i.is_active = true
            AND i.type IN (${migratableTypeList})
            AND o.organization_id = ${organizationId}
            AND i.organization_id = ${organizationId}
        `
      : await this.prisma.$queryRaw<Array<{ source_ref: string }>>`
          SELECT DISTINCT o.source_ref
          FROM notification_occurrences o
          INNER JOIN dashboard_insights i ON i.id = o.source_ref
          WHERE i.is_active = true
            AND i.type IN (${migratableTypeList})
        `;

    const covered = new Set<string>();
    for (const row of bridgedByLegacy) {
      if (row.legacyInsightId) covered.add(row.legacyInsightId);
    }
    for (const row of occurrenceBridges) {
      covered.add(row.source_ref);
    }

    const unbridged = activeMigratable.filter((i) => !covered.has(i.id)).length;
    return {
      name: 'migration_count_consistent',
      severity: organizationId ? 'critical' : 'warning',
      passed: unbridged === 0,
      detail:
        unbridged === 0
          ? 'All active migratable insights are bridged to V2'
          : `${unbridged} active migratable insights without legacy bridge or occurrence source_ref`,
      count: unbridged,
    };
  }

  private async checkUnresolvedMappingErrors(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const activeInsights = await this.prisma.dashboardInsight.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: organizationId ? undefined : 5000,
    });

    const unresolved: string[] = [];
    for (const row of activeInsights) {
      if (!isMigratableInsightType(row.type)) continue;
      const resolved = resolveInsightFingerprint(row.organizationId, row);
      if (!resolved) {
        unresolved.push(row.id);
      }
    }

    return {
      name: 'no_unresolved_mapping_errors',
      severity: 'critical',
      passed: unresolved.length === 0,
      detail:
        unresolved.length === 0
          ? 'All active migratable insights map to registry candidates'
          : `${unresolved.length} active insights failed registry mapping`,
      count: unresolved.length,
      samples: unresolved.slice(0, 10),
    };
  }

  private async checkDeliveryDeadLetter(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const deadLetter = await this.prisma.notificationDeliveryOutbox.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: 'DEAD_LETTER',
      },
    });

    return {
      name: 'delivery_dead_letter_reviewed',
      severity: 'critical',
      passed: deadLetter === 0,
      detail:
        deadLetter === 0
          ? 'No dead-letter delivery rows'
          : `${deadLetter} dead-letter rows require ops review`,
      count: deadLetter,
    };
  }

  private async checkDeliveryBacklog(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const backlog = await this.prisma.notificationDeliveryOutbox.count({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: { in: ['PENDING', 'FAILED'] },
      },
    });

    return {
      name: 'delivery_backlog_acceptable',
      severity: 'warning',
      passed: backlog < BACKLOG_THRESHOLD,
      detail: `Pending/retryable outbox rows: ${backlog}`,
      count: backlog,
    };
  }

  private async checkOrphanOutboxRows(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const orphanOutbox = organizationId
      ? await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notification_delivery_outbox o
          LEFT JOIN notifications n ON n.id = o.notification_id
          WHERE n.id IS NULL
            AND o.organization_id = ${organizationId}
        `
      : await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notification_delivery_outbox o
          LEFT JOIN notifications n ON n.id = o.notification_id
          WHERE n.id IS NULL
        `;

    const orphanCount = Number(orphanOutbox[0]?.count ?? 0);
    return {
      name: 'no_orphan_outbox_rows',
      severity: 'critical',
      passed: orphanCount === 0,
      detail:
        orphanCount === 0
          ? 'All outbox rows reference notifications'
          : `${orphanCount} orphan outbox rows`,
      count: orphanCount,
    };
  }

  private async checkOutboxOrgMismatch(
    organizationId?: string,
  ): Promise<NotificationMigrationAcceptanceCheck> {
    const mismatch = organizationId
      ? await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notification_delivery_outbox o
          INNER JOIN notifications n ON n.id = o.notification_id
          WHERE o.organization_id <> n.organization_id
            AND o.organization_id = ${organizationId}
        `
      : await this.prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM notification_delivery_outbox o
          INNER JOIN notifications n ON n.id = o.notification_id
          WHERE o.organization_id <> n.organization_id
        `;

    const mismatchCount = Number(mismatch[0]?.count ?? 0);
    return {
      name: 'no_outbox_org_mismatch',
      severity: 'critical',
      passed: mismatchCount === 0,
      detail:
        mismatchCount === 0
          ? 'Outbox rows match notification tenant'
          : `${mismatchCount} outbox rows with cross-tenant notification reference`,
      count: mismatchCount,
    };
  }
}
