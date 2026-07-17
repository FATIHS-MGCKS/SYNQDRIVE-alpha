import { Injectable, Logger } from '@nestjs/common';
import {
  BrakeHealthAlertResolutionReason,
  BrakeHealthAlertStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { VehicleHealthAdapterSource } from '@modules/notifications/adapters/notification-adapter.types';
import { buildBrakeAlertNotificationCode } from './brake-health-alert.registry';
import type {
  BrakeAlertSyncResult,
  StructuredBrakeAlertCandidate,
} from './brake-health-alert.types';

@Injectable()
export class BrakeHealthAlertService {
  private readonly logger = new Logger(BrakeHealthAlertService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncAlerts(args: {
    organizationId: string;
    vehicleId: string;
    candidates: StructuredBrakeAlertCandidate[];
    inputFingerprint?: string | null;
    modelSnapshotId?: string | null;
    emitNotifications?: boolean;
  }): Promise<BrakeAlertSyncResult> {
    const now = new Date();
    const candidateByKey = new Map(args.candidates.map((c) => [c.dedupeKey, c]));

    const openRows = await this.prisma.brakeHealthAlert.findMany({
      where: {
        vehicleId: args.vehicleId,
        organizationId: args.organizationId,
        status: BrakeHealthAlertStatus.OPEN,
      },
    });

    const newlyOpened: string[] = [];
    const resolved: string[] = [];
    const notificationsToEmit: StructuredBrakeAlertCandidate[] = [];

    for (const row of openRows) {
      if (!candidateByKey.has(row.dedupeKey)) {
        await this.prisma.brakeHealthAlert.update({
          where: { id: row.id },
          data: {
            status: BrakeHealthAlertStatus.RESOLVED,
            resolutionReason: BrakeHealthAlertResolutionReason.EVIDENCE_CLEARED,
            resolvedAt: now,
          },
        });
        resolved.push(row.dedupeKey);
      }
    }

    for (const candidate of args.candidates) {
      const existing = openRows.find((r) => r.dedupeKey === candidate.dedupeKey);
      const notify =
        args.emitNotifications !== false &&
        candidate.notifyEligible &&
        existing?.lastNotifiedFingerprint !== candidate.evidenceFingerprint;

      if (existing) {
        await this.prisma.brakeHealthAlert.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: now,
            severity: candidate.severity,
            evidenceFingerprint: candidate.evidenceFingerprint,
            modelSnapshotId: args.modelSnapshotId ?? existing.modelSnapshotId,
            inputFingerprint: args.inputFingerprint ?? existing.inputFingerprint,
            templateParamsJson: candidate.templateParams,
            ...(notify ? { lastNotifiedFingerprint: candidate.evidenceFingerprint } : {}),
          },
        });
        if (notify) notificationsToEmit.push(candidate);
        continue;
      }

      try {
        await this.prisma.brakeHealthAlert.create({
          data: {
            organizationId: args.organizationId,
            vehicleId: args.vehicleId,
            componentInstallationId: candidate.componentInstallationId ?? null,
            alertType: candidate.alertType,
            category: candidate.category,
            reasonCode: candidate.reasonCode,
            severity: candidate.severity,
            axle: candidate.axle ?? null,
            displayMode: candidate.displayMode,
            evidenceFingerprint: candidate.evidenceFingerprint,
            dedupeKey: candidate.dedupeKey,
            modelSnapshotId: args.modelSnapshotId ?? null,
            status: BrakeHealthAlertStatus.OPEN,
            inputFingerprint: args.inputFingerprint ?? null,
            lastNotifiedFingerprint:
              args.emitNotifications !== false && candidate.notifyEligible
                ? candidate.evidenceFingerprint
                : null,
            templateParamsJson: candidate.templateParams,
          },
        });
      } catch (error) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : (error as { code?: string } | null)?.code;
        if (code === 'P2002') continue;
        throw error;
      }

      newlyOpened.push(candidate.dedupeKey);
      if (args.emitNotifications !== false && candidate.notifyEligible) {
        notificationsToEmit.push(candidate);
      }
    }

    return {
      openAlerts: args.candidates,
      newlyOpened,
      resolved,
      notificationsToEmit,
    };
  }

  async resolveOpenAlerts(
    vehicleId: string,
    reason: BrakeHealthAlertResolutionReason,
    filter?: { alertType?: string; dedupeKeyPrefix?: string },
  ): Promise<number> {
    const result = await this.prisma.brakeHealthAlert.updateMany({
      where: {
        vehicleId,
        status: BrakeHealthAlertStatus.OPEN,
        ...(filter?.alertType ? { alertType: filter.alertType } : {}),
        ...(filter?.dedupeKeyPrefix
          ? { dedupeKey: { startsWith: filter.dedupeKeyPrefix } }
          : {}),
      },
      data: {
        status: BrakeHealthAlertStatus.RESOLVED,
        resolutionReason: reason,
        resolvedAt: new Date(),
      },
    });
    return result.count;
  }

  async resolveForComponentInstallation(
    componentInstallationId: string,
    reason: BrakeHealthAlertResolutionReason = BrakeHealthAlertResolutionReason.COMPONENT_REPLACED,
  ): Promise<number> {
    const result = await this.prisma.brakeHealthAlert.updateMany({
      where: {
        componentInstallationId,
        status: BrakeHealthAlertStatus.OPEN,
      },
      data: {
        status: BrakeHealthAlertStatus.RESOLVED,
        resolutionReason: reason,
        resolvedAt: new Date(),
      },
    });
    return result.count;
  }

  async listOpenAlertNotificationSources(args: {
    organizationId: string;
    vehicleId: string;
    label: string;
  }): Promise<VehicleHealthAdapterSource[]> {
    const rows = await this.prisma.brakeHealthAlert.findMany({
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        status: BrakeHealthAlertStatus.OPEN,
      },
    });

    return rows
      .filter((row) => row.severity === 'warning' || row.severity === 'critical')
      .map((row) => ({
        eventType: 'BRAKE_CRITICAL' as const,
        vehicleId: args.vehicleId,
        label: args.label,
        code: buildBrakeAlertNotificationCode(
          row.reasonCode as Parameters<typeof buildBrakeAlertNotificationCode>[0],
          row.dedupeKey,
        ),
        reason: String(
          (row.templateParamsJson as Record<string, string> | null)?.messageDe ?? row.reasonCode,
        ),
        severity: row.severity === 'critical' ? 'critical' : 'warning',
      }));
  }

  async listOpenAlertsForVehicle(vehicleId: string) {
    return this.prisma.brakeHealthAlert.findMany({
      where: { vehicleId, status: BrakeHealthAlertStatus.OPEN },
      orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
    });
  }
}
