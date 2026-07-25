import { Injectable, Logger, Optional } from '@nestjs/common';
import { VehicleFindingSourceType } from '@prisma/client';
import {
  CreateVehicleFindingInput,
  FindingLifecycleService,
} from './finding-lifecycle.service';

export function buildDtcFindingDedupeKey(vehicleId: string, dtcCode: string): string {
  return `dtc:${vehicleId}:${dtcCode.trim().toUpperCase()}`;
}

export function buildTireAlertFindingDedupeKey(alertDedupeKey: string): string {
  return `tire_alert:${alertDedupeKey}`;
}

export function buildComplaintFindingDedupeKey(dedupeKey: string): string {
  return `complaint:${dedupeKey}`;
}

/**
 * Dual-write bridge from domain alerts/events into canonical `vehicle_findings`.
 * Domain tables remain source-of-truth; findings enable cross-layer correlation.
 */
@Injectable()
export class FindingBridgeService {
  private readonly logger = new Logger(FindingBridgeService.name);
  private readonly enabled =
    process.env.VEHICLE_FINDING_BRIDGE_ENABLED !== 'false';

  constructor(
    @Optional() private readonly lifecycle?: FindingLifecycleService,
  ) {}

  async syncActive(input: CreateVehicleFindingInput): Promise<void> {
    if (!this.enabled || !this.lifecycle) return;
    try {
      await this.lifecycle.upsertActiveFinding(input);
    } catch (err) {
      this.logger.warn(
        `Finding bridge upsert failed key=${input.dedupeKey}: ${(err as Error).message}`,
      );
    }
  }

  async resolve(organizationId: string, dedupeKey: string): Promise<void> {
    if (!this.enabled || !this.lifecycle) return;
    try {
      await this.lifecycle.resolveFinding(organizationId, dedupeKey);
    } catch (err) {
      this.logger.warn(
        `Finding bridge resolve failed key=${dedupeKey}: ${(err as Error).message}`,
      );
    }
  }

  async expire(organizationId: string, dedupeKey: string): Promise<void> {
    if (!this.enabled || !this.lifecycle) return;
    try {
      await this.lifecycle.expireFinding(organizationId, dedupeKey);
    } catch (err) {
      this.logger.warn(
        `Finding bridge expire failed key=${dedupeKey}: ${(err as Error).message}`,
      );
    }
  }

  async syncDtcActive(args: {
    organizationId: string;
    vehicleId: string;
    dtcCode: string;
    severity?: string | null;
    description?: string | null;
    sourceRef?: string | null;
  }): Promise<void> {
    const dedupeKey = buildDtcFindingDedupeKey(args.vehicleId, args.dtcCode);
    await this.syncActive({
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      sourceType: VehicleFindingSourceType.DTC,
      sourceRef: args.sourceRef ?? args.dtcCode,
      dedupeKey,
      severity: args.severity ?? 'warning',
      title: `DTC ${args.dtcCode}`,
      message: args.description ?? `Active fault code ${args.dtcCode}`,
    });
  }

  async resolveDtc(args: {
    organizationId: string;
    vehicleId: string;
    dtcCode: string;
  }): Promise<void> {
    await this.resolve(
      args.organizationId,
      buildDtcFindingDedupeKey(args.vehicleId, args.dtcCode),
    );
  }

  async syncTireAlertActive(args: {
    organizationId: string;
    vehicleId: string;
    alertDedupeKey: string;
    severity: string;
    title: string;
    message: string;
    sourceRef?: string | null;
  }): Promise<void> {
    const dedupeKey = buildTireAlertFindingDedupeKey(args.alertDedupeKey);
    await this.syncActive({
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      sourceType: VehicleFindingSourceType.TIRE_ALERT,
      sourceRef: args.sourceRef ?? args.alertDedupeKey,
      dedupeKey,
      severity: args.severity,
      title: args.title,
      message: args.message,
    });
  }

  async resolveTireAlert(args: {
    organizationId: string;
    alertDedupeKey: string;
  }): Promise<void> {
    await this.resolve(
      args.organizationId,
      buildTireAlertFindingDedupeKey(args.alertDedupeKey),
    );
  }

  async syncComplaintActive(args: {
    organizationId: string;
    vehicleId: string;
    dedupeKey: string;
    severity?: string | null;
    title?: string | null;
    message?: string | null;
    sourceRef?: string | null;
  }): Promise<void> {
    await this.syncActive({
      organizationId: args.organizationId,
      vehicleId: args.vehicleId,
      sourceType: VehicleFindingSourceType.COMPLAINT,
      sourceRef: args.sourceRef ?? args.dedupeKey,
      dedupeKey: buildComplaintFindingDedupeKey(args.dedupeKey),
      severity: args.severity ?? 'warning',
      title: args.title ?? 'Technische Beobachtung',
      message: args.message ?? 'Aktive technische Beobachtung',
    });
  }

  async resolveComplaint(args: {
    organizationId: string;
    dedupeKey: string;
  }): Promise<void> {
    await this.resolve(
      args.organizationId,
      buildComplaintFindingDedupeKey(args.dedupeKey),
    );
  }
}
