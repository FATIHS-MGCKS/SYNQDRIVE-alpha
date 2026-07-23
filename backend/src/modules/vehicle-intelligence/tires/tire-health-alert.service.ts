import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  Prisma,
  TireHealthAlertResolutionReason,
  TireHealthAlertStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleHealthEnforcementService } from '@modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.service';
import {
  VEHICLE_HEALTH_DATA_CATEGORY,
  VEHICLE_HEALTH_PATH,
  VEHICLE_HEALTH_PURPOSE,
  VEHICLE_HEALTH_SERVICE_IDENTITY,
} from '@modules/data-authorizations/vehicle-health-enforcement/vehicle-health-enforcement.constants';
import type { VehicleHealthAdapterSource } from '@modules/notifications/adapters/notification-adapter.types';
import type {
  StructuredTireAlertCandidate,
  TireAlertSyncResult,
} from './tire-health-alert.types';
import { buildTireAlertNotificationCode } from './tire-health-alert.registry';
import { TireHealthObservabilityService } from './tire-health-observability.service';

@Injectable()
export class TireHealthAlertService {
  private readonly logger = new Logger(TireHealthAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly observability?: TireHealthObservabilityService,
    @Optional() private readonly healthEnforcement?: VehicleHealthEnforcementService,
  ) {}

  async syncAlerts(args: {
    organizationId: string;
    vehicleId: string;
    tireSetupId: string;
    candidates: StructuredTireAlertCandidate[];
    inputFingerprint?: string | null;
    emitNotifications?: boolean;
  }): Promise<TireAlertSyncResult> {
    if (
      args.emitNotifications &&
      args.candidates.length > 0 &&
      this.healthEnforcement
    ) {
      const mayDerive = await this.healthEnforcement.mayDerive({
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.HEALTH_SIGNALS,
        purpose: VEHICLE_HEALTH_PURPOSE.ALERTS,
        processingPath: VEHICLE_HEALTH_PATH.TIRE_ALERT,
        serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.HEALTH_ALERT,
        correlationId: `tire-alert:${args.vehicleId}:${Date.now()}`,
      });
      if (!mayDerive) {
        this.logger.warn(`Tire alert derive denied vehicle=${args.vehicleId}`);
        return {
          openAlerts: [],
          newlyOpened: [],
          resolved: [],
          notificationsToEmit: [],
          suppressedByPolicy: true,
        };
      }
    }

    const now = new Date();
    const candidateByKey = new Map(
      args.candidates.map((c) => [c.dedupeKey, c]),
    );

    await this.resolveAlertsForOtherSetups(
      args.organizationId,
      args.vehicleId,
      args.tireSetupId,
      now,
    );

    const openRows = await this.prisma.tireHealthAlert.findMany({
      where: {
        vehicleId: args.vehicleId,
        tireSetupId: args.tireSetupId,
        status: TireHealthAlertStatus.OPEN,
      },
    });

    const newlyOpened: string[] = [];
    const resolved: string[] = [];
    const notificationsToEmit: StructuredTireAlertCandidate[] = [];

    for (const row of openRows) {
      if (!candidateByKey.has(row.dedupeKey)) {
        await this.prisma.tireHealthAlert.update({
          where: { id: row.id },
          data: {
            status: TireHealthAlertStatus.RESOLVED,
            resolutionReason: TireHealthAlertResolutionReason.EVIDENCE_CLEARED,
            resolvedAt: now,
          },
        });
        resolved.push(row.dedupeKey);
        this.observability?.recordAlert({
          action: 'resolved',
          alertType: row.alertType,
        });
      }
    }

    for (const candidate of args.candidates) {
      const existing = openRows.find((r) => r.dedupeKey === candidate.dedupeKey);
      if (existing) {
        const notify =
          args.emitNotifications !== false &&
          candidate.notifyEligible &&
          existing.lastNotifiedFingerprint !== candidate.evidenceFingerprint;
        await this.prisma.tireHealthAlert.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: now,
            inputFingerprint: args.inputFingerprint ?? existing.inputFingerprint,
            evidenceFingerprint: candidate.evidenceFingerprint,
            severity: candidate.severity,
            templateParamsJson: candidate.templateParams,
            pressureSource: candidate.pressureContext?.sourceLabel ?? null,
            pressureTimestamp: candidate.pressureContext?.sourceTimestamp
              ? new Date(candidate.pressureContext.sourceTimestamp)
              : null,
            pressureFreshness: candidate.pressureContext?.freshness ?? null,
            ...(notify
              ? { lastNotifiedFingerprint: candidate.evidenceFingerprint }
              : {}),
          },
        });
        if (notify) notificationsToEmit.push(candidate);
        continue;
      }

      const existingOpen = await this.prisma.tireHealthAlert.findFirst({
        where: {
          dedupeKey: candidate.dedupeKey,
          status: TireHealthAlertStatus.OPEN,
        },
      });
      if (existingOpen) {
        const notify =
          args.emitNotifications !== false &&
          candidate.notifyEligible &&
          existingOpen.lastNotifiedFingerprint !== candidate.evidenceFingerprint;
        await this.prisma.tireHealthAlert.update({
          where: { id: existingOpen.id },
          data: {
            lastSeenAt: now,
            inputFingerprint: args.inputFingerprint ?? existingOpen.inputFingerprint,
            evidenceFingerprint: candidate.evidenceFingerprint,
            severity: candidate.severity,
            templateParamsJson: candidate.templateParams,
            pressureSource: candidate.pressureContext?.sourceLabel ?? null,
            pressureTimestamp: candidate.pressureContext?.sourceTimestamp
              ? new Date(candidate.pressureContext.sourceTimestamp)
              : null,
            pressureFreshness: candidate.pressureContext?.freshness ?? null,
            ...(notify
              ? { lastNotifiedFingerprint: candidate.evidenceFingerprint }
              : {}),
          },
        });
        if (notify) notificationsToEmit.push(candidate);
        continue;
      }

      try {
        await this.prisma.tireHealthAlert.create({
          data: {
            organizationId: args.organizationId,
            vehicleId: args.vehicleId,
            tireSetupId: args.tireSetupId,
            alertType: candidate.alertType,
            reasonCode: candidate.reasonCode,
            severity: candidate.severity,
            wheelPosition: candidate.wheelPosition ?? null,
            displayMode: candidate.displayMode,
            evidenceFingerprint: candidate.evidenceFingerprint,
            dedupeKey: candidate.dedupeKey,
            status: TireHealthAlertStatus.OPEN,
            inputFingerprint: args.inputFingerprint ?? null,
            lastNotifiedFingerprint:
              args.emitNotifications !== false && candidate.notifyEligible
                ? candidate.evidenceFingerprint
                : null,
            pressureSource: candidate.pressureContext?.sourceLabel ?? null,
            pressureTimestamp: candidate.pressureContext?.sourceTimestamp
              ? new Date(candidate.pressureContext.sourceTimestamp)
              : null,
            pressureFreshness: candidate.pressureContext?.freshness ?? null,
            templateParamsJson: candidate.templateParams,
          },
        });
      } catch (error) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : (error as { code?: string } | null)?.code;
        if (code === 'P2002') {
          this.observability?.recordAlert({
            action: 'deduplicated',
            alertType: candidate.alertType,
          });
          continue;
        }
        throw error;
      }
      newlyOpened.push(candidate.dedupeKey);
      this.observability?.recordAlert({
        action: 'created',
        alertType: candidate.alertType,
      });
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

  async resolveAlertsForOtherSetups(
    organizationId: string,
    vehicleId: string,
    activeSetupId: string,
    at: Date = new Date(),
  ): Promise<number> {
    const result = await this.prisma.tireHealthAlert.updateMany({
      where: {
        organizationId,
        vehicleId,
        tireSetupId: { not: activeSetupId },
        status: TireHealthAlertStatus.OPEN,
      },
      data: {
        status: TireHealthAlertStatus.RESOLVED,
        resolutionReason: TireHealthAlertResolutionReason.SETUP_CHANGED,
        resolvedAt: at,
      },
    });
    return result.count;
  }

  async resolveOpenAlertsForSetup(
    tireSetupId: string,
    reason: TireHealthAlertResolutionReason,
  ): Promise<number> {
    const result = await this.prisma.tireHealthAlert.updateMany({
      where: { tireSetupId, status: TireHealthAlertStatus.OPEN },
      data: {
        status: TireHealthAlertStatus.RESOLVED,
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
    const rows = await this.prisma.tireHealthAlert.findMany({
      where: {
        organizationId: args.organizationId,
        vehicleId: args.vehicleId,
        status: TireHealthAlertStatus.OPEN,
      },
    });

    return rows
      .filter((row) => row.severity === 'warning' || row.severity === 'critical')
      .map((row) => ({
        eventType: 'TIRE_CRITICAL' as const,
        vehicleId: args.vehicleId,
        label: args.label,
        code: buildTireAlertNotificationCode(
          row.reasonCode as Parameters<typeof buildTireAlertNotificationCode>[0],
          row.dedupeKey,
        ),
        reason: String(
          (row.templateParamsJson as Record<string, string> | null)?.messageDe ??
            row.reasonCode,
        ),
        severity: row.severity === 'critical' ? 'critical' : 'warning',
      }));
  }
}
