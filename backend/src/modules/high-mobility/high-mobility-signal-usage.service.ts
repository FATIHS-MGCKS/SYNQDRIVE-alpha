import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityHealthFetchService } from './high-mobility-health-fetch.service';
import type { HmHealthDataDto } from './dto/high-mobility.dto';
import {
  extractHmSignalData,
  extractHmSignalValue,
  resolveHmSignalEntry,
} from './high-mobility-mqtt-payload.util';

/** Signal group identifier — matches HmSignalGroup Prisma enum */
export type HmSignalGroupKey = 'SERVICE' | 'TIRE_PRESSURE' | 'AI_HEALTH_CARE';

/** Freshness tier for UI display */
export type HmFreshnessStatus = 'fresh' | 'aging' | 'stale' | 'no_data';

const ALL_HM_SIGNAL_GROUPS: HmSignalGroupKey[] = ['SERVICE', 'TIRE_PRESSURE', 'AI_HEALTH_CARE'];

// Freshness windows per signal group (milliseconds)
const FRESHNESS_WINDOWS: Record<HmSignalGroupKey, { fresh: number; aging: number }> = {
  SERVICE:         { fresh: 24 * 60 * 60 * 1000, aging: 72 * 60 * 60 * 1000 },  // 24h / 72h
  TIRE_PRESSURE:   { fresh:  6 * 60 * 60 * 1000, aging: 24 * 60 * 60 * 1000 },  // 6h / 24h
  AI_HEALTH_CARE:  { fresh:  6 * 60 * 60 * 1000, aging: 12 * 60 * 60 * 1000 },  // 6h / 12h
};

function getFreshnessStatus(
  lastSuccessAt: Date | null | undefined,
  group: HmSignalGroupKey,
): HmFreshnessStatus {
  if (!lastSuccessAt) return 'no_data';
  const ageMs = Date.now() - lastSuccessAt.getTime();
  const { fresh, aging } = FRESHNESS_WINDOWS[group];
  if (ageMs < fresh) return 'fresh';
  if (ageMs < aging) return 'aging';
  return 'stale';
}

export interface HmServiceSignals {
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
  lastUpdatedAt: string | null;
  hmVehicleId: string;
  freshnessStatus: HmFreshnessStatus;
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
  freshnessStatus: HmFreshnessStatus;
}

export interface HmAiHealthCareSignals {
  oilLevel: { value: unknown; unit: string | null; status: string | null } | null;
  limpModeActive: boolean | null;
  brakeLiningPreWarning: boolean | null;
  tirePressureWarning: boolean | null;
  dashboardLights: unknown | null;
  lastUpdatedAt: string | null;
  hmVehicleId: string;
  freshnessStatus: HmFreshnessStatus;
}

export interface HmSignalGroupMeta {
  hmVehicleId: string | null;
  lastUpdatedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  freshnessStatus: HmFreshnessStatus;
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
      freshnessStatus: getFreshnessStatus(state.lastSuccessAt, 'SERVICE'),
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
      freshnessStatus: getFreshnessStatus(state.lastSuccessAt, 'TIRE_PRESSURE'),
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
      freshnessStatus: getFreshnessStatus(state.lastSuccessAt, 'AI_HEALTH_CARE'),
    };
  }

  async getSignalGroupMeta(
    vehicleId: string,
    signalGroup: HmSignalGroupKey,
  ): Promise<HmSignalGroupMeta> {
    const state = await this.getGroupState(vehicleId, signalGroup);
    return {
      hmVehicleId: state?.hmVehicleId ?? (await this.getLinkedHmVehicleId(vehicleId)),
      lastUpdatedAt: state?.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: state?.lastErrorAt?.toISOString() ?? null,
      lastErrorMessage: state?.lastErrorMessage ?? null,
      freshnessStatus: state?.lastSuccessAt ? getFreshnessStatus(state.lastSuccessAt, signalGroup) : 'no_data',
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

      if (healthData.syncStatus === 'MQTT_ONLY') {
        // Fleet Clearance vehicle — REST command not supported. Data arrives via MQTT push.
        // Write informational state (not an error). Preserve existing dataJson if present.
        const existing = await this.getGroupState(vehicleId, signalGroup);
        await this.upsertGroupState(vehicleId, hmVehicleId, signalGroup, {
          lastFetchedAt: now,
          lastErrorAt: null,
          lastErrorMessage: 'MQTT_ONLY: waiting for vehicle telemetry via MQTT push',
          dataJson: (existing?.dataJson as Record<string, unknown> | null) ?? null,
        });
        this.logger.log(
          `HM ${signalGroup} [MQTT_ONLY] vehicle ${vehicleId} — fleet clearance push model. ` +
          `Data arrives when the car sends telemetry. No REST polling.`,
        );
        return;
      }

      if (healthData.syncStatus !== 'SUCCESS') {
        await this.upsertGroupState(vehicleId, hmVehicleId, signalGroup, {
          lastFetchedAt: now,
          lastErrorAt: now,
          lastErrorMessage: healthData.errorMessage ?? `HM ${signalGroup} refresh failed`,
          dataJson: null,
        });
        this.logger.warn(`HM ${signalGroup} signals unavailable for vehicle ${vehicleId}: ${healthData.errorMessage ?? healthData.syncStatus}`);
        return;
      }
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

      if (healthData.syncStatus === 'MQTT_ONLY') {
        // Fleet Clearance push model — REST command not supported.
        // Mark all groups as MQTT_ONLY (informational, not error).
        for (const g of ALL_HM_SIGNAL_GROUPS) {
          await this.upsertGroupState(vehicleId, hmVehicleId, g, {
            lastFetchedAt: now,
            lastErrorAt: null,
            lastErrorMessage: 'MQTT_ONLY: waiting for vehicle telemetry via MQTT push',
            dataJson: null,
          });
        }
        this.logger.log(
          `HM initial refresh [MQTT_ONLY] for vehicle ${vehicleId} — ` +
          `fleet clearance push model, no REST command. Waiting for car to send telemetry.`,
        );
        return;
      }

      if (healthData.syncStatus !== 'SUCCESS') {
        for (const g of ALL_HM_SIGNAL_GROUPS) {
          await this.upsertGroupState(vehicleId, hmVehicleId, g, {
            lastFetchedAt: now,
            lastErrorAt: now,
            lastErrorMessage: healthData.errorMessage ?? 'HM initial refresh failed',
            dataJson: null,
          });
        }
        this.logger.warn(`HM initial signal refresh failed for vehicle ${vehicleId}: ${healthData.errorMessage ?? healthData.syncStatus}`);
        return;
      }
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

  /**
   * Bridge MQTT Health-APP push payloads into hm_signal_group_states.
   * This keeps HM health UI caches in sync for MQTT-only fleet-clearance vehicles
   * without waiting for REST-based refresh cycles.
   */
  async ingestMqttHealthSnapshot(params: {
    vehicleId: string;
    hmVehicleId: string;
    payload: Record<string, unknown>;
    receivedAt: Date;
  }): Promise<void> {
    const { vehicleId, hmVehicleId, payload, receivedAt } = params;
    const now = receivedAt ?? new Date();

    const getSignal = (key: string, aliases: string[] = []): unknown =>
      resolveHmSignalEntry(payload, key, aliases);

    const toFiniteNumberOrNull = (entry: unknown): number | null => {
      const value = extractHmSignalValue(entry);
      if (value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const buildSignalRecord = (entry: unknown): { value: unknown; unit: string | null; timestamp: string | null } => {
      const sample = Array.isArray(entry) ? entry[0] : entry;
      const payloadData = extractHmSignalData(entry);
      const value = extractHmSignalValue(entry);
      const unit =
        payloadData && typeof payloadData === 'object'
          ? ((payloadData as Record<string, unknown>).unit as string | undefined) ?? null
          : null;
      const timestamp =
        sample && typeof sample === 'object'
          ? ((sample as Record<string, unknown>).timestamp as string | undefined) ?? null
          : null;
      return { value, unit, timestamp };
    };

    const distanceSig = getSignal('maintenance.get.distance_to_next_service', ['maintenance.distance_to_next_service', 'distance_to_next_service']);
    const timeSig = getSignal('maintenance.get.time_to_next_service', ['maintenance.time_to_next_service', 'time_to_next_service']);
    const distanceToNextServiceKm = toFiniteNumberOrNull(distanceSig);
    const timeToNextServiceDays = toFiniteNumberOrNull(timeSig);

    if (distanceToNextServiceKm !== null || timeToNextServiceDays !== null) {
      const existing = await this.getGroupState(vehicleId, 'SERVICE');
      const prev = (existing?.dataJson as Record<string, any> | null) ?? null;
      await this.upsertGroupState(vehicleId, hmVehicleId, 'SERVICE', {
        lastFetchedAt: now,
        lastSuccessAt: now,
        lastErrorAt: null,
        lastErrorMessage: null,
        dataJson: {
          distanceToNextServiceKm: distanceToNextServiceKm ?? prev?.distanceToNextServiceKm ?? null,
          timeToNextServiceDays: timeToNextServiceDays ?? prev?.timeToNextServiceDays ?? null,
        },
      });
    }

    const tirePressuresSig = getSignal('diagnostics.get.tire_pressures', ['diagnostics.tire_pressures', 'tire_pressures']);
    const tireStatusesSig = getSignal('diagnostics.get.tire_pressure_statuses', ['diagnostics.tire_pressure_statuses', 'tire_pressure_statuses']);
    const tirePressuresPayload = extractHmSignalData(tirePressuresSig);
    const tireStatusesPayload = extractHmSignalData(tireStatusesSig);

    if (tirePressuresPayload != null || tireStatusesPayload != null) {
      const existing = await this.getGroupState(vehicleId, 'TIRE_PRESSURE');
      const prev = (existing?.dataJson as Record<string, any> | null) ?? null;
      await this.upsertGroupState(vehicleId, hmVehicleId, 'TIRE_PRESSURE', {
        lastFetchedAt: now,
        lastSuccessAt: now,
        lastErrorAt: null,
        lastErrorMessage: null,
        dataJson: {
          tirePressures: tirePressuresPayload ?? prev?.tirePressures ?? null,
          tirePressureStatuses: tireStatusesPayload ?? prev?.tirePressureStatuses ?? null,
        },
      });
    }

    const aiSignalDefs: Array<{ key: string; aliases?: string[] }> = [
      { key: 'dashboard_lights.get.dashboard_lights', aliases: ['dashboard_lights.dashboard_lights'] },
      { key: 'diagnostics.get.engine_oil_level', aliases: ['diagnostics.engine_oil_level', 'engine_oil_level'] },
      { key: 'engine.get.limp_mode', aliases: ['engine.limp_mode', 'limp_mode'] },
      { key: 'diagnostics.get.brake_lining_wear_pre_warning', aliases: ['diagnostics.brake_lining_wear_pre_warning', 'brake_lining_wear_pre_warning'] },
    ];
    const aiSignalDelta: Record<string, { value: unknown; unit: string | null; timestamp: string | null }> = {};

    for (const def of aiSignalDefs) {
      const entry = getSignal(def.key, def.aliases ?? []);
      if (entry !== null && entry !== undefined) {
        aiSignalDelta[def.key] = buildSignalRecord(entry);
      }
    }

    if (Object.keys(aiSignalDelta).length > 0 || tireStatusesPayload != null) {
      const existing = await this.getGroupState(vehicleId, 'AI_HEALTH_CARE');
      const prev = (existing?.dataJson as Record<string, any> | null) ?? null;
      const prevSignals = (prev?.signals && typeof prev.signals === 'object'
        ? (prev.signals as Record<string, any>)
        : {}) as Record<string, any>;
      await this.upsertGroupState(vehicleId, hmVehicleId, 'AI_HEALTH_CARE', {
        lastFetchedAt: now,
        lastSuccessAt: now,
        lastErrorAt: null,
        lastErrorMessage: null,
        dataJson: {
          signals: {
            ...prevSignals,
            ...aiSignalDelta,
          },
          tirePressureStatuses: tireStatusesPayload ?? prev?.tirePressureStatuses ?? null,
        },
      });
    }
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
      dataJson?: Record<string, unknown> | null;
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
