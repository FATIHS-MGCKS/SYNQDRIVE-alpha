import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  isMigratableInsightType,
  resolveInsightFingerprint,
} from './notification-migration-insight.util';
import type {
  NotificationMigrationAnalysisReport,
  NotificationMigrationMode,
  NotificationMigrationStats,
} from './notification-migration.types';

@Injectable()
export class NotificationMigrationAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async analyze(options: {
    organizationId?: string;
    mode?: NotificationMigrationMode;
    staleDays?: number;
    sampleLimit?: number;
  } = {}): Promise<NotificationMigrationAnalysisReport> {
    const organizationId = options.organizationId ?? null;
    const mode = options.mode ?? 'dry_run';
    const staleDays = options.staleDays ?? 90;
    const sampleLimit = options.sampleLimit ?? 50;
    const staleBefore = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    const orgFilter = organizationId ? { organizationId } : {};

    const [
      insights,
      complaintsActive,
      complaintsResolved,
      notifications,
      preferences,
      alreadyMigrated,
    ] = await Promise.all([
      this.prisma.dashboardInsight.findMany({
        where: orgFilter,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.vehicleComplaint.count({
        where: { ...orgFilter, status: 'ACTIVE' },
      }),
      this.prisma.vehicleComplaint.count({
        where: { ...orgFilter, status: { in: ['RESOLVED', 'DISMISSED', 'CONVERTED'] } },
      }),
      this.prisma.notification.findMany({
        where: orgFilter,
        select: {
          id: true,
          organizationId: true,
          fingerprint: true,
          status: true,
          legacyInsightId: true,
          eventType: true,
          entityId: true,
          entityType: true,
        },
      }),
      this.prisma.userNotificationPreference.count({
        where: orgFilter,
      }),
      this.prisma.notification.findMany({
        where: {
          ...orgFilter,
          legacyInsightId: { not: null },
        },
        select: { legacyInsightId: true },
      }),
    ]);

    const migratedInsightIds = new Set(
      alreadyMigrated.map((n) => n.legacyInsightId).filter(Boolean) as string[],
    );

    const activeInsights = insights.filter((i) => i.isActive);
    const inactiveInsights = insights.filter((i) => !i.isActive);

    const fingerprintGroups = new Map<string, typeof insights>();
    const missingEntityIds: NotificationMigrationAnalysisReport['missingEntityIds'] = [];
    const unmigratable: NotificationMigrationAnalysisReport['unmigratable'] = [];
    const skipSamples: NotificationMigrationAnalysisReport['skipSamples'] = [];
    const projected: NotificationMigrationStats = {
      analyzed: 0,
      migrated: 0,
      merged: 0,
      skipped: 0,
      unresolved: 0,
      failed: 0,
    };

    for (const row of insights) {
      projected.analyzed += 1;

      if (migratedInsightIds.has(row.id)) {
        projected.skipped += 1;
        if (skipSamples.length < sampleLimit) {
          skipSamples.push({ insightId: row.id, reason: 'ALREADY_MIGRATED' });
        }
        continue;
      }

      if (!isMigratableInsightType(row.type)) {
        projected.unresolved += 1;
        unmigratable.push({
          insightId: row.id,
          type: row.type,
          reason: 'UNMAPPED_INSIGHT_TYPE',
        });
        continue;
      }

      const entityIds = Array.isArray(row.entityIds) ? row.entityIds : [];
      if (entityIds.length === 0) {
        projected.unresolved += 1;
        missingEntityIds.push({
          insightId: row.id,
          type: row.type,
          dedupeKey: row.dedupeKey,
        });
        continue;
      }

      const resolved = resolveInsightFingerprint(row.organizationId, row);
      if (!resolved) {
        projected.unresolved += 1;
        unmigratable.push({
          insightId: row.id,
          type: row.type,
          reason: 'CANDIDATE_MAPPING_FAILED',
        });
        continue;
      }

      const group = fingerprintGroups.get(resolved.fingerprint) ?? [];
      group.push(row);
      fingerprintGroups.set(resolved.fingerprint, group);

      const existingV2 = notifications.find(
        (n) =>
          n.organizationId === row.organizationId
          && n.fingerprint === resolved.fingerprint
          && ['OPEN', 'ACKNOWLEDGED', 'SNOOZED'].includes(n.status),
      );

      if (existingV2) {
        projected.merged += 1;
      } else if (!row.isActive) {
        projected.skipped += 1;
        if (skipSamples.length < sampleLimit) {
          skipSamples.push({
            insightId: row.id,
            reason: 'INACTIVE_RESOLVED',
            detail: 'Inactive insight — historical only unless merge target exists',
          });
        }
      } else {
        projected.migrated += 1;
      }
    }

    const duplicates = [...fingerprintGroups.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([fingerprint, rows]) => ({
        organizationId: rows[0].organizationId,
        fingerprint,
        insightIds: rows.map((r) => r.id),
        eventTypes: [...new Set(rows.map((r) => r.type))],
        entityIds: rows.flatMap((r) =>
          Array.isArray(r.entityIds) ? (r.entityIds as string[]) : [],
        ),
      }));

    const entityGroups = new Map<string, Set<string>>();
    for (const [fp, rows] of fingerprintGroups) {
      const row = rows[0];
      const entityIds = Array.isArray(row.entityIds) ? (row.entityIds as string[]) : [];
      const entityId = entityIds[0];
      if (!entityId) continue;
      const key = `${row.organizationId}|${row.entityScope}|${entityId}`;
      const set = entityGroups.get(key) ?? new Set<string>();
      set.add(fp);
      entityGroups.set(key, set);
    }

    const sameEntityDifferentCause = [...entityGroups.entries()]
      .filter(([, fps]) => fps.size > 1)
      .map(([key, fps]) => {
        const [org, entityType, entityId] = key.split('|');
        return {
          organizationId: org,
          entityType,
          entityId,
          fingerprints: [...fps],
        };
      });

    const sameCauseDifferentText = duplicates
      .filter((d) => {
        const titles = insights
          .filter((i) => d.insightIds.includes(i.id))
          .map((i) => i.title);
        return new Set(titles).size > 1;
      })
      .map((d) => ({
        organizationId: d.organizationId,
        fingerprint: d.fingerprint,
        titles: insights.filter((i) => d.insightIds.includes(i.id)).map((i) => i.title),
        insightIds: d.insightIds,
      }));

    const stale = insights
      .filter((i) => i.updatedAt < staleBefore && i.isActive)
      .slice(0, sampleLimit)
      .map((i) => ({
        insightId: i.id,
        updatedAt: i.updatedAt.toISOString(),
        isActive: i.isActive,
      }));

    const activeV2 = notifications.filter((n) =>
      ['OPEN', 'ACKNOWLEDGED', 'SNOOZED'].includes(n.status),
    );

    return {
      generatedAt: new Date().toISOString(),
      organizationId,
      mode,
      sources: {
        dashboardInsights: {
          total: insights.length,
          active: activeInsights.length,
          inactive: inactiveInsights.length,
        },
        vehicleComplaints: {
          active: complaintsActive,
          resolved: complaintsResolved,
        },
        notificationsV2: {
          total: notifications.length,
          active: activeV2.length,
          withLegacyInsightId: migratedInsightIds.size,
        },
        userNotificationPreferences: preferences,
      },
      duplicates,
      sameEntityDifferentCause,
      sameCauseDifferentText,
      stale,
      missingEntityIds,
      unmigratable,
      alreadyMigrated: [...migratedInsightIds],
      projected,
      skipSamples,
    };
  }
}
