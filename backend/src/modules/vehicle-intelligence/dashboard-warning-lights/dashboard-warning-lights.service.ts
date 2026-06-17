import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  HmSignalUsageService,
  type HmAiHealthCareRawState,
  type HmSignalEntry,
} from '../../high-mobility/high-mobility-signal-usage.service';
import {
  buildBooleanWarnLight,
  buildOilLevelLight,
  buildTirePressureLight,
  isEvPowertrain,
  parseDashboardLightEntries,
} from './dashboard-warning-lights.parsing';
import type {
  DashboardFreshness,
  DashboardOverallStatus,
  DashboardWarningLight,
  DashboardWarningLightsResponse,
} from './dashboard-warning-lights.types';

const SIGNAL_ALIASES: Record<string, string[]> = {
  LIMP: ['engine.get.limp_mode', 'engine.limp_mode', 'limp_mode'],
  OIL: ['diagnostics.get.engine_oil_level', 'diagnostics.engine_oil_level', 'engine_oil_level'],
  BRAKE: [
    'diagnostics.get.brake_lining_wear_pre_warning',
    'diagnostics.brake_lining_wear_pre_warning',
    'brake_lining_wear_pre_warning',
  ],
  DASHBOARD: ['dashboard_lights.get.dashboard_lights', 'dashboard_lights.dashboard_lights'],
};

const TELLTALE_KEYS = [
  'engine_limp_mode',
  'engine_oil_level',
  'brake_lining_wear_pre_warning',
  'tire_pressure_warning',
  'battery_warning_light',
  'check_engine_light',
] as const;

@Injectable()
export class DashboardWarningLightsService {
  private readonly logger = new Logger(DashboardWarningLightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hm: HmSignalUsageService,
  ) {}

  async getDashboardWarningLights(vehicleId: string): Promise<DashboardWarningLightsResponse> {
    const [hmActive, hmVehicleId, fuelType, rawState] = await Promise.all([
      this.hm.isHmHealthActive(vehicleId),
      this.hm.getLinkedHmVehicleId(vehicleId),
      this.loadFuelType(vehicleId),
      this.hm.getAiHealthCareRawState(vehicleId).catch((err) => {
        this.logger.warn(`HM raw state failed for ${vehicleId}: ${err?.message}`);
        return null;
      }),
    ]);

    if (!hmActive && !hmVehicleId) {
      return this.notConnectedEnvelope(vehicleId);
    }

    if (!hmActive) {
      return this.inactiveHmEnvelope(vehicleId, hmVehicleId);
    }

    const state = rawState ?? {
      signals: {},
      tirePressureStatuses: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      freshnessStatus: 'no_data' as const,
      hmVehicleId,
    };

    const connectionStatus = this.resolveConnectionStatus(state);
    const groupFreshness = this.mapGroupFreshness(state);
    const freshness = state.lastErrorMessage && !state.lastSuccessAt ? 'error' : groupFreshness;
    const supportStatus = this.resolveSupportStatus(state);
    const lights = this.buildLights(state, groupFreshness, fuelType);
    const overallStatus = this.computeOverallStatus(lights, freshness);
    const lastObservedAt = this.latestObservedAt(lights, state.lastSuccessAt);

    return {
      vehicleId,
      provider: 'HIGH_MOBILITY',
      connectionStatus,
      supportStatus,
      freshness,
      overallStatus,
      lastObservedAt,
      message: this.buildMessage(connectionStatus, supportStatus, freshness, overallStatus, state),
      lights,
      rentalHealthReady: true,
    };
  }

  private notConnectedEnvelope(vehicleId: string): DashboardWarningLightsResponse {
    return {
      vehicleId,
      provider: 'NONE',
      connectionStatus: 'not_connected',
      supportStatus: 'not_connected',
      freshness: 'no_data',
      overallStatus: 'unknown',
      lastObservedAt: null,
      message:
        'Fahrzeug nicht mit HM/OEM Health verbunden. SynqDrive zeigt keine geschätzten Warnleuchten.',
      lights: TELLTALE_KEYS.map((key) => this.placeholderLight(key, 'not_connected')),
      rentalHealthReady: true,
    };
  }

  private inactiveHmEnvelope(
    vehicleId: string,
    hmVehicleId: string | null,
  ): DashboardWarningLightsResponse {
    return {
      vehicleId,
      provider: hmVehicleId ? 'HIGH_MOBILITY' : 'NONE',
      connectionStatus: 'not_connected',
      supportStatus: 'not_connected',
      freshness: 'no_data',
      overallStatus: 'unknown',
      lastObservedAt: null,
      message:
        'HM Health-Verknüpfung ist nicht aktiv. Warnleuchten können erst nach Aktivierung angezeigt werden.',
      lights: TELLTALE_KEYS.map((key) => this.placeholderLight(key, 'inactive')),
      rentalHealthReady: true,
    };
  }

  private placeholderLight(
    key: string,
    reason: 'not_connected' | 'inactive',
  ): DashboardWarningLight {
    const labels: Record<string, string> = {
      engine_limp_mode: 'Motorwarnung / Notlauf',
      engine_oil_level: 'Motorölstand',
      brake_lining_wear_pre_warning: 'Bremsbelag-Vorwarnung',
      tire_pressure_warning: 'Reifendruck-Warnung',
      battery_warning_light: 'Batterie-Warnleuchte',
      check_engine_light: 'Motorkontrollleuchte (MIL)',
    };
    return {
      key,
      label: labels[key] ?? key,
      state: 'unsupported',
      severity: 'unknown',
      supported: null,
      observedAt: null,
      sourceSignal: null,
      sourceTimestamp: null,
      reason:
        reason === 'not_connected'
          ? 'Keine HM/OEM-Verbindung.'
          : 'HM Health nicht aktiv.',
      action: 'Telematik-Verbindung prüfen.',
      rentalImpact: 'none',
    };
  }

  private resolveConnectionStatus(state: HmAiHealthCareRawState): DashboardWarningLightsResponse['connectionStatus'] {
    if (state.lastErrorMessage && !state.lastSuccessAt) return 'provider_error';
    if (state.lastSuccessAt || Object.keys(state.signals).length > 0) return 'connected';
    if (state.hmVehicleId) return 'connected';
    return 'unknown';
  }

  private mapGroupFreshness(state: HmAiHealthCareRawState): DashboardFreshness {
    switch (state.freshnessStatus) {
      case 'fresh':
        return 'fresh';
      case 'aging':
        return 'aging';
      case 'stale':
        return 'stale';
      default:
        return 'no_data';
    }
  }

  private resolveSupportStatus(state: HmAiHealthCareRawState): DashboardWarningLightsResponse['supportStatus'] {
    const hasAny = this.hasTelltaleSignalKeys(state);
    if (!state.lastSuccessAt && Object.keys(state.signals).length === 0) return 'no_data';
    if (hasAny) return 'supported';
    if (state.lastSuccessAt) return 'unknown';
    return 'no_data';
  }

  private hasTelltaleSignalKeys(state: HmAiHealthCareRawState): boolean {
    const keys = new Set(Object.keys(state.signals));
    const allAliases = Object.values(SIGNAL_ALIASES).flat();
    if (allAliases.some((a) => keys.has(a))) return true;
    if (state.tirePressureStatuses && Object.keys(state.tirePressureStatuses).length > 0) return true;
    return false;
  }

  private pickSignal(
    state: HmAiHealthCareRawState,
    aliases: string[],
  ): HmSignalEntry | undefined {
    for (const key of aliases) {
      if (state.signals[key]) return state.signals[key];
    }
    return undefined;
  }

  private buildLights(
    state: HmAiHealthCareRawState,
    groupFreshness: DashboardFreshness,
    fuelType: string | null,
  ): DashboardWarningLight[] {
    const groupObservedAt = state.lastSuccessAt;
    const limp = buildBooleanWarnLight({
      key: 'engine_limp_mode',
      label: 'Motorwarnung / Notlauf',
      sourceSignal: 'engine.get.limp_mode',
      entry: this.pickSignal(state, SIGNAL_ALIASES.LIMP),
      groupFreshness,
      groupObservedAt,
      activeReason: 'Notlaufmodus aktiv (HM/OEM).',
      activeAction: 'Fahrzeug nicht vermieten — Werkstatt aufsuchen.',
      offReason: 'Notlaufmodus nicht aktiv.',
      offAction: 'Keine Maßnahme.',
      activeSeverity: 'critical',
      activeRentalImpact: 'block_rental',
      unsupportedReason: 'Notlauf-Signal nicht verfügbar.',
      noEventReason: 'Notlauf noch nicht gemeldet — nicht als „Aus“ werten.',
    });

    const oil = buildOilLevelLight({
      entry: this.pickSignal(state, SIGNAL_ALIASES.OIL),
      groupFreshness,
      groupObservedAt,
    });

    const brake = buildBooleanWarnLight({
      key: 'brake_lining_wear_pre_warning',
      label: 'Bremsbelag-Vorwarnung',
      sourceSignal: 'diagnostics.get.brake_lining_wear_pre_warning',
      entry: this.pickSignal(state, SIGNAL_ALIASES.BRAKE),
      groupFreshness,
      groupObservedAt,
      activeReason: 'Bremsbelag-Vorwarnung aktiv.',
      activeAction: 'Bremsen vor nächster Vermietung prüfen.',
      offReason: 'Keine Bremsbelag-Vorwarnung.',
      offAction: 'Keine Maßnahme.',
      activeSeverity: 'warning',
      activeRentalImpact: 'inspect_before_next_rental',
      unsupportedReason: 'Bremsbelag-Vorwarnung nicht im Stream.',
      noEventReason: 'Bremswarnung noch nicht gemeldet.',
    });

    const dashboardEntry = this.pickSignal(state, SIGNAL_ALIASES.DASHBOARD);
    const tire = buildTirePressureLight({
      tireStatuses: state.tirePressureStatuses,
      groupFreshness,
      groupObservedAt,
      dashboardEntry,
    });

    const battery = this.buildBatteryLight(state, groupFreshness, groupObservedAt, fuelType);
    const mil = this.buildCheckEngineLight(state, groupFreshness, groupObservedAt);

    return [limp, oil, brake, tire, battery, mil];
  }

  private buildBatteryLight(
    state: HmAiHealthCareRawState,
    groupFreshness: DashboardFreshness,
    groupObservedAt: string | null,
    fuelType: string | null,
  ): DashboardWarningLight {
    const entry = this.pickSignal(state, SIGNAL_ALIASES.DASHBOARD);
    const sourceSignal = 'dashboard_lights.get.dashboard_lights';
    const ev = isEvPowertrain(fuelType);
    const activeAction = ev
      ? '12V-System / DC-DC-Wandler prüfen.'
      : 'Ladesystem / Lichtmaschine prüfen.';
    const activeReason = ev
      ? 'Batterie-Warnleuchte aktiv (12V/DC-DC).'
      : 'Batterie-Warnleuchte aktiv (Ladesystem).';

    if (!entry) {
      return {
        key: 'battery_warning_light',
        label: 'Batterie-Warnleuchte',
        state: 'unsupported',
        severity: 'unknown',
        supported: false,
        observedAt: null,
        sourceSignal,
        sourceTimestamp: null,
        reason: 'Dashboard-Lights-Signal nicht verfügbar.',
        action: activeAction,
        rentalImpact: 'none',
      };
    }

    const entries = parseDashboardLightEntries(entry.value);
    const batteryEntries = entries.filter((e) => e.name.toLowerCase().includes('battery'));

    if (batteryEntries.length === 0 && entries.length === 0 && entry.value == null) {
      return {
        key: 'battery_warning_light',
        label: 'Batterie-Warnleuchte',
        state: 'no_event_yet',
        severity: 'unknown',
        supported: true,
        observedAt: entry.timestamp ?? groupObservedAt,
        sourceSignal,
        sourceTimestamp: entry.timestamp ?? null,
        reason: 'Batterie-Warnleuchte noch nicht gemeldet.',
        action: 'Nicht als „Aus“ werten.',
        rentalImpact: 'none',
      };
    }

    if (batteryEntries.length === 0) {
      return {
        key: 'battery_warning_light',
        label: 'Batterie-Warnleuchte',
        state: 'unsupported',
        severity: 'unknown',
        supported: false,
        observedAt: entry.timestamp ?? groupObservedAt,
        sourceSignal,
        sourceTimestamp: entry.timestamp ?? null,
        rawValue: entry.value,
        reason: 'OEM liefert keine Batterie-Warnleuchte in dashboard_lights.',
        action: activeAction,
        rentalImpact: 'none',
      };
    }

    const active = batteryEntries.some((e) => {
      const s = e.state.toLowerCase();
      return s !== 'off' && s !== 'inactive' && s !== 'none' && s !== '';
    });
    const allOff = batteryEntries.every((e) => {
      const s = e.state.toLowerCase();
      return s === 'off' || s === 'inactive' || s === 'none';
    });

    if (active) {
      return {
        key: 'battery_warning_light',
        label: 'Batterie-Warnleuchte',
        state: 'active',
        severity: 'warning',
        supported: true,
        observedAt: entry.timestamp ?? groupObservedAt,
        sourceSignal,
        sourceTimestamp: entry.timestamp ?? null,
        rawValue: entry.value,
        reason: activeReason,
        action: activeAction,
        rentalImpact: 'inspect_before_next_rental',
      };
    }

    if (allOff) {
      return {
        key: 'battery_warning_light',
        label: 'Batterie-Warnleuchte',
        state: 'off_confirmed',
        severity: 'info',
        supported: true,
        observedAt: entry.timestamp ?? groupObservedAt,
        sourceSignal,
        sourceTimestamp: entry.timestamp ?? null,
        rawValue: entry.value,
        reason: 'Batterie-Warnleuchte aus (HM/OEM).',
        action: 'Keine Maßnahme.',
        rentalImpact: 'none',
      };
    }

    return {
      key: 'battery_warning_light',
      label: 'Batterie-Warnleuchte',
      state: 'no_event_yet',
      severity: 'unknown',
      supported: true,
      observedAt: entry.timestamp ?? groupObservedAt,
      sourceSignal,
      sourceTimestamp: entry.timestamp ?? null,
      rawValue: entry.value,
      reason: 'Batterie-Warnleuchte nicht eindeutig.',
      action: activeAction,
      rentalImpact: 'none',
    };
  }

  private buildCheckEngineLight(
    state: HmAiHealthCareRawState,
    groupFreshness: DashboardFreshness,
    groupObservedAt: string | null,
  ): DashboardWarningLight {
    const entry = this.pickSignal(state, SIGNAL_ALIASES.DASHBOARD);
    const sourceSignal = 'dashboard_lights.get.dashboard_lights';

    if (!entry) {
      return {
        key: 'check_engine_light',
        label: 'Motorkontrollleuchte (MIL)',
        state: 'unsupported',
        severity: 'unknown',
        supported: false,
        observedAt: null,
        sourceSignal,
        sourceTimestamp: null,
        reason: 'Kein MIL/CEL-Signal im HM-Stream.',
        action: 'DTCs und Fahrzeugdisplay prüfen.',
        rentalImpact: 'none',
      };
    }

    const entries = parseDashboardLightEntries(entry.value);
    const milEntries = entries.filter((e) => {
      const n = e.name.toLowerCase();
      return (
        (n.includes('check_engine') ||
          n.includes('mil') ||
          n.includes('malfunction') ||
          n.includes('cel')) &&
        !n.includes('battery') &&
        !n.includes('limp')
      );
    });

    if (milEntries.length === 0) {
      return {
        key: 'check_engine_light',
        label: 'Motorkontrollleuchte (MIL)',
        state: 'unsupported',
        severity: 'unknown',
        supported: false,
        observedAt: entry.timestamp ?? groupObservedAt,
        sourceSignal,
        sourceTimestamp: entry.timestamp ?? null,
        rawValue: entry.value,
        reason: 'Kein separates MIL/CEL in dashboard_lights — Notlauf ist eigenes Signal.',
        action: 'Bei Bedarf DTC-Modul prüfen.',
        rentalImpact: 'none',
      };
    }

    const active = milEntries.some((e) => {
      const s = e.state.toLowerCase();
      return s !== 'off' && s !== 'inactive' && s !== 'none' && s !== '';
    });
    const allOff = milEntries.every((e) => {
      const s = e.state.toLowerCase();
      return s === 'off' || s === 'inactive' || s === 'none';
    });

    if (active) {
      return {
        key: 'check_engine_light',
        label: 'Motorkontrollleuchte (MIL)',
        state: 'active',
        severity: 'warning',
        supported: true,
        observedAt: entry.timestamp ?? groupObservedAt,
        sourceSignal,
        sourceTimestamp: entry.timestamp ?? null,
        rawValue: entry.value,
        reason: 'Motorkontrollleuchte (MIL) aktiv.',
        action: 'Fehlercodes auslesen und prüfen.',
        rentalImpact: 'inspect_before_next_rental',
      };
    }

    if (allOff) {
      return {
        key: 'check_engine_light',
        label: 'Motorkontrollleuchte (MIL)',
        state: 'off_confirmed',
        severity: 'info',
        supported: true,
        observedAt: entry.timestamp ?? groupObservedAt,
        sourceSignal,
        sourceTimestamp: entry.timestamp ?? null,
        rawValue: entry.value,
        reason: 'MIL/CEL nicht aktiv.',
        action: 'Keine Maßnahme.',
        rentalImpact: 'none',
      };
    }

    return {
      key: 'check_engine_light',
      label: 'Motorkontrollleuchte (MIL)',
      state: 'no_event_yet',
      severity: 'unknown',
      supported: true,
      observedAt: entry.timestamp ?? groupObservedAt,
      sourceSignal,
      sourceTimestamp: entry.timestamp ?? null,
      rawValue: entry.value,
      reason: 'MIL/CEL nicht eindeutig.',
      action: 'Bei Bedarf DTC-Modul prüfen.',
      rentalImpact: 'none',
    };
  }

  private computeOverallStatus(
    lights: DashboardWarningLight[],
    freshness: DashboardFreshness,
  ): DashboardOverallStatus {
    const active = lights.filter((l) => l.state === 'active');
    if (active.some((l) => l.severity === 'critical')) return 'critical';
    if (active.some((l) => l.severity === 'warning')) return 'warning';
    if (freshness === 'error' || lights.some((l) => l.state === 'error')) return 'unknown';
    if (freshness === 'stale' || lights.some((l) => l.state === 'stale')) return 'unknown';

    const confirmable = lights.filter(
      (l) => !(l.key === 'check_engine_light' && l.state === 'unsupported'),
    );
    if (
      active.length === 0 &&
      confirmable.length > 0 &&
      confirmable.every((l) => l.state === 'off_confirmed')
    ) {
      return 'good';
    }
    return 'unknown';
  }

  private latestObservedAt(
    lights: DashboardWarningLight[],
    groupAt: string | null,
  ): string | null {
    const times = lights
      .map((l) => l.observedAt)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime())
      .filter(Number.isFinite);
    if (groupAt) times.push(new Date(groupAt).getTime());
    if (times.length === 0) return null;
    return new Date(Math.max(...times)).toISOString();
  }

  private buildMessage(
    connection: DashboardWarningLightsResponse['connectionStatus'],
    support: DashboardWarningLightsResponse['supportStatus'],
    freshness: DashboardFreshness,
    overall: DashboardOverallStatus,
    state: HmAiHealthCareRawState,
  ): string {
    if (connection === 'not_connected') {
      return 'Nicht mit HM/OEM verbunden — Warnleuchten-Status unbekannt.';
    }
    if (connection === 'provider_error') {
      return state.lastErrorMessage ?? 'HM/OEM-Abruf fehlgeschlagen.';
    }
    if (support === 'no_data') {
      return 'HM/OEM verbunden, aber noch keine Warnleuchten-Daten empfangen.';
    }
    if (freshness === 'stale') {
      return 'Warnleuchten-Daten sind veraltet — nicht als aktuelle Wahrheit nutzen.';
    }
    if (overall === 'critical') return 'Mindestens eine kritische Warnleuchte ist aktiv.';
    if (overall === 'warning') return 'Mindestens eine Warnleuchte erfordert Aufmerksamkeit.';
    if (overall === 'good') return 'Alle gemeldeten Warnleuchten sind inaktiv.';
    return 'Warnleuchten-Status teilweise unbekannt — siehe Einzelsignale.';
  }

  private async loadFuelType(vehicleId: string): Promise<string | null> {
    const v = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { fuelType: true },
    });
    return v?.fuelType ?? null;
  }
}
