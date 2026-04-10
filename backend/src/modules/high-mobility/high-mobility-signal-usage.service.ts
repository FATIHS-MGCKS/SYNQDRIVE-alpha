import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityHealthFetchService } from './high-mobility-health-fetch.service';
import type { HmHealthDataDto } from './dto/high-mobility.dto';

/** Signal group identifier — matches HmSignalGroup Prisma enum */
export type HmSignalGroupKey = 'SERVICE' | 'TIRE_PRESSURE' | 'AI_HEALTH_CARE';

const ALL_HM_SIGNAL_GROUPS: HmSignalGroupKey[] = ['SERVICE', 'TIRE_PRESSURE', 'AI_HEALTH_CARE'];

export interface HmServiceSignals {
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

export interface HmTirePressureSignals {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
  unit: string;
  statusFrontLeft: string | null;
  statusFrontRight: string | null;
  statusRearLeft: string | null;
  statusRearRight: string | null;
  overallStatus: 'OK' | 'ISSUE' | 'UNKNOWN';
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

export interface HmAiHealthCareSignals {
  oilLevel: { value: unknown; unit: string | null; status: string | null } | null;
  limpModeActive: boolean | null;
  brakeLiningPreWarning: boolean | null;
  tirePressureWarning: boolean | null;
  dashboardLights: unknown | null;
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

/**
 * Mediates between raw HM health data and specific UI consumers.
 *
 * - Reads from hm_signal_group_states cache (normalized JSON).
 * - Writes to cache after a fresh fetch.
 * - Enforces domain rule: signals only flow to explicitly allowed UI consumers.
 * - Never injects HM signals into existing authoritative health calculation pipelines.
 */
@Injectable()
export class HmSignalUsageService {
  private readonly logger = new Logger(HmSignalUsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly healthFetchService: HighMobilityHealthFetchService,
  ) {}

  /** Check if a vehicle has an active HM_HEALTH data source link */
  async isHmHealthActive(vehicleId: string): Promise<boolean> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId,
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        isActive: true,
      },
      select: { id: true },
    });
    return !!link;
  }

  /** Get the linked HM vehicle ID for a SynqDrive vehicle, or null */
  async getLinkedHmVehicleId(vehicleId: string): Promise<string | null> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        vehicleId,
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        isActive: true,
      },
      select: { sourceReferenceId: true },
    });
    return link?.sourceReferenceId ?? null;
  }

  /** Get service-related HM signals from cache */
  async getServiceInfoSignals(vehicleId: string): Promise<HmServiceSignals | null> {
    const state = await this.getGroupState(vehicleId, 'SERVICE');
    if (!state?.dataJson) return null;

    const data = state.dataJson as Record<string, any>;
    return {
      distanceToNextServiceKm: data.distanceToNextServiceKm ?? null,
      timeToNextServiceDays: data.timeToNextServiceDays ?? null,
      lastUpdatedAt: state.lastSuccessAt?.toISOString() ?? null,
      hmVehicleId: state.hmVehicleId,
    };
  }

  /** Get tire pressure signals from cache */
  async getTirePressureSignals(vehicleId: string): Promise<HmTirePressureSignals | null> {
    const state = await this.getGroupState(vehicleId, 'TIRE_PRESSURE');
    if (!state?.dataJson) return null;

    const data = state.dataJson as Record<string, any>;
    const pressures = data.tirePressures ?? {};
    const statuses = data.tirePressureStatuses ?? {};

    const allStatuses = [
      statuses.frontLeft, statuses.frontRight,
      statuses.rearLeft, statuses.rearRight,
    ].filter(Boolean) as string[];

    const hasIssue = allStatuses.some(s =>
      s.toLowerCase().includes('low') ||
      s.toLowerCase().includes('high') ||
      s.toLowerCase().includes('deflat') ||
      s.toLowerCase().includes('warn') ||
      s === 'ALERT'
    );

    return {
      frontLeft: pressures.frontLeft ?? null,
      frontRight: pressures.frontRight ?? null,
      rearLeft: pressures.rearLeft ?? null,
      rearRight: pressures.rearRight ?? null,
      unit: pressures.unit ?? 'bar',
      statusFrontLeft: statuses.frontLeft ?? null,
      statusFrontRight: statuses.frontRight ?? null,
      statusRearLeft: statuses.rearLeft ?? null,
      statusRearRight: statuses.rearRight ?? null,
      overallStatus: allStatuses.length === 0 ? 'UNKNOWN' : hasIssue ? 'ISSUE' : 'OK',
      lastUpdatedAt: state.lastSuccessAt?.toISOString() ?? null,
      hmVehicleId: state.hmVehicleId,
    };
  }

  /** Get AI Health Care indicator signals from cache */
  async getAiHealthCareSignals(vehicleId: string): Promise<HmAiHealthCareSignals | null> {
    const state = await this.getGroupState(vehicleId, 'AI_HEALTH_CARE');
    if (!state?.dataJson) return null;

    const data = state.dataJson as Record<string, any>;
    const signals: Record<string, any> = data.signals ?? {};

    const oilSig = signals['diagnostics.get.engine_oil_level'];
    const limpSig = signals['engine.get.limp_mode'];
    const brakeSig = signals['diagnostics.get.brake_lining_wear_pre_warning'];
    const tireSig = data.tirePressureStatuses ?? null;

    // Derive tire pressure warning from statuses
    let tirePressureWarning: boolean | null = null;
    if (tireSig) {
      const vals = Object.values(tireSig) as string[];
      tirePressureWarning = vals.some(v =>
        v?.toLowerCase().includes('low') ||
        v?.toLowerCase().includes('warn') ||
        v === 'ALERT'
      );
    }

    return {
      oilLevel: oilSig != null ? {
        value: oilSig.value,
        unit: oilSig.unit ?? null,
        status: this.normalizeOilLevelStatus(oilSig.value),
      } : null,
      limpModeActive: limpSig != null ? Boolean(limpSig.value) : null,
      brakeLiningPreWarning: brakeSig != null ? Boolean(brakeSig.value) : null,
      tirePressureWarning,
      dashboardLights: signals['dashboard_lights.get.dashboard_lights']?.value ?? null,
      lastUpdatedAt: state.lastSuccessAt?.toISOString() ?? null,
      hmVehicleId: state.hmVehicleId,
    };
  }

  /**
   * Trigger a fresh fetch from HM API for the given signal group.
   * Updates hm_signal_group_states cache with result.
   */
  async refreshSignalGroup(vehicleId: string, signalGroup: HmSignalGroupKey): Promise<void> {
    const hmVehicleId = await this.getLinkedHmVehicleId(vehicleId);
    if (!hmVehicleId) {
      this.logger.debug(`No HM link for vehicle ${vehicleId} — skipping refresh of ${signalGroup}`);
      return;
    }

    const now = new Date();
    try {
      const healthData = await this.healthFetchService.fetchHealth(hmVehicleId, 'SCHEDULED');
      const dataJson = this.buildDataJsonForGroup(signalGroup, healthData);

      await this.upsertGroupState(vehicleId, hmVehicleId, signalGroup, {
        lastFetchedAt: now,
        lastSuccessAt: now,
        lastErrorAt: null,
        lastErrorMessage: null,
        dataJson,
      });
      this.logger.log(`HM ${signalGroup} signals refreshed for vehicle ${vehicleId}`);
    } catch (err: any) {
      this.logger.warn(`HM ${signalGroup} refresh failed for vehicle ${vehicleId}: ${err?.message}`);
      await this.upsertGroupState(vehicleId, hmVehicleId, signalGroup, {
        lastFetchedAt: now,
        lastErrorAt: now,
        lastErrorMessage: err?.message ?? 'Unknown error',
      });
    }
  }

  /**
   * Single HM API call, then upserts SERVICE + TIRE_PRESSURE + AI_HEALTH_CARE caches.
   * Use right after HM clearance approval (or when HM Health is first linked) so the UI
   * has data immediately instead of waiting for the 5-minute polling scheduler.
   */
  async refreshAllSignalGroupsInitial(vehicleId: string): Promise<void> {
    const hmVehicleId = await this.getLinkedHmVehicleId(vehicleId);
    if (!hmVehicleId) {
      this.logger.debug(`No HM link for vehicle ${vehicleId} — skipping initial HM refresh`);
      return;
    }

    const now = new Date();
    try {
      const healthData = await this.healthFetchService.fetchHealth(hmVehicleId, 'POST_APPROVAL_INITIAL');
      for (const g of ALL_HM_SIGNAL_GROUPS) {
        const dataJson = this.buildDataJsonForGroup(g, healthData);
        await this.upsertGroupState(vehicleId, hmVehicleId, g, {
          lastFetchedAt: now,
          lastSuccessAt: now,
          lastErrorAt: null,
          lastErrorMessage: null,
          dataJson,
        });
      }
      this.logger.log(`HM initial signal refresh (all groups) for vehicle ${vehicleId}`);
    } catch (err: any) {
      this.logger.warn(`HM initial refresh failed for vehicle ${vehicleId}: ${err?.message}`);
      for (const g of ALL_HM_SIGNAL_GROUPS) {
        try {
          await this.upsertGroupState(vehicleId, hmVehicleId, g, {
            lastFetchedAt: now,
            lastErrorAt: now,
            lastErrorMessage: err?.message ?? 'Unknown error',
          });
        } catch { /* non-critical */ }
      }
    }
  }

  /**
   * If an active HM_HEALTH link exists for this HM vehicle record, run {@link refreshAllSignalGroupsInitial}.
   * Used when clearance flips to APPROVED (webhook / manual refresh) before the scheduler runs.
   */
  async refreshAllSignalGroupsIfHmHealthLinked(hmVehicleRecordId: string): Promise<void> {
    const link = await this.prisma.vehicleDataSourceLink.findFirst({
      where: {
        sourceReferenceId: hmVehicleRecordId,
        sourceType: 'HIGH_MOBILITY',
        sourceSubtype: 'HM_HEALTH',
        isActive: true,
      },
      select: { vehicleId: true },
    });
    if (!link) {
      this.logger.debug(`No active HM_HEALTH link for HM record ${hmVehicleRecordId} — skip post-approval poll`);
      return;
    }
    await this.refreshAllSignalGroupsInitial(link.vehicleId);
  }

  private buildDataJsonForGroup(signalGroup: HmSignalGroupKey, healthData: HmHealthDataDto): Record<string, unknown> {
    const signalMap: Record<string, any> = {};
    for (const sig of healthData.signals) {
      signalMap[sig.signalId] = { value: sig.value, unit: sig.unit, timestamp: sig.timestamp };
    }
    switch (signalGroup) {
      case 'SERVICE':
        return {
          distanceToNextServiceKm: healthData.serviceInfo?.distanceToNextServiceKm ?? null,
          timeToNextServiceDays: healthData.serviceInfo?.timeToNextServiceDays ?? null,
        };
      case 'TIRE_PRESSURE':
        return {
          tirePressures: healthData.tirePressures ?? null,
          tirePressureStatuses: healthData.tirePressureStatuses ?? null,
        };
      case 'AI_HEALTH_CARE':
        return {
          signals: signalMap,
          tirePressureStatuses: healthData.tirePressureStatuses ?? null,
        };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async getGroupState(vehicleId: string, signalGroup: HmSignalGroupKey) {
    return this.prisma.hmSignalGroupState.findFirst({
      where: { vehicleId, signalGroup: signalGroup as any },
    });
  }

  private async upsertGroupState(
    vehicleId: string,
    hmVehicleId: string,
    signalGroup: HmSignalGroupKey,
    updates: {
      lastFetchedAt?: Date;
      lastSuccessAt?: Date;
      lastErrorAt?: Date | null;
      lastErrorMessage?: string | null;
      dataJson?: Record<string, unknown>;
    },
  ) {
    const existing = await this.getGroupState(vehicleId, signalGroup);

    const data: any = {
      lastFetchedAt: updates.lastFetchedAt,
      ...(updates.lastSuccessAt !== undefined && { lastSuccessAt: updates.lastSuccessAt }),
      ...(updates.lastErrorAt !== undefined && { lastErrorAt: updates.lastErrorAt }),
      ...(updates.lastErrorMessage !== undefined && { lastErrorMessage: updates.lastErrorMessage }),
      ...(updates.dataJson !== undefined && { dataJson: updates.dataJson }),
    };

    if (existing) {
      await this.prisma.hmSignalGroupState.update({
        where: { id: existing.id },
        data: { ...data, fetchCount: { increment: 1 } },
      });
    } else {
      await this.prisma.hmSignalGroupState.create({
        data: {
          vehicleId,
          hmVehicleId,
          signalGroup: signalGroup as any,
          fetchCount: 1,
          ...data,
        },
      });
    }
  }

  private normalizeOilLevelStatus(value: unknown): string | null {
    if (value == null) return null;
    const v = String(value).toLowerCase();
    if (v.includes('low') || v.includes('min') || v.includes('critical')) return 'LOW';
    if (v.includes('ok') || v.includes('normal') || v.includes('good') || v.includes('max')) return 'OK';
    if (v.includes('high')) return 'HIGH';
    // Numeric check (normalized 0.0–1.0 or 0–100)
    const n = parseFloat(v);
    if (!isNaN(n)) {
      if (n <= 0.2 || (n > 1 && n <= 20)) return 'LOW';
      if (n >= 0.8 || (n > 1 && n >= 80)) return 'HIGH';
      return 'OK';
    }
    return null;
  }
}
