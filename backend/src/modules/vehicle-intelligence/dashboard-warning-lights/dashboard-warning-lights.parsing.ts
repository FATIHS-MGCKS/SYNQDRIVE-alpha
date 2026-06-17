import type {
  DashboardFreshness,
  DashboardRentalImpact,
  DashboardWarningLight,
  DashboardWarningLightState,
  DashboardWarningSeverity,
  HmSignalEntry,
} from './dashboard-warning-lights.types';

const AI_HEALTH_FRESH_MS = 6 * 60 * 60 * 1000;
const AI_HEALTH_AGING_MS = 12 * 60 * 60 * 1000;

export function freshnessFromTimestamp(
  iso: string | null | undefined,
  fallback: DashboardFreshness,
): DashboardFreshness {
  if (!iso) return fallback;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return fallback;
  const ageMs = Date.now() - ts;
  if (ageMs < AI_HEALTH_FRESH_MS) return 'fresh';
  if (ageMs < AI_HEALTH_AGING_MS) return 'aging';
  return 'stale';
}

export function isExplicitOff(value: unknown): boolean {
  if (value === false || value === 0) return true;
  if (typeof value === 'string') {
    const s = value.toLowerCase().trim();
    return s === 'false' || s === 'off' || s === 'inactive' || s === 'none' || s === '0';
  }
  return false;
}

export function isExplicitOn(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const s = value.toLowerCase().trim();
    return s === 'true' || s === 'on' || s === 'active' || s === '1';
  }
  return false;
}

export function normalizeOilStatus(value: unknown): 'LOW' | 'OK' | 'HIGH' | 'UNKNOWN' | null {
  if (value == null) return null;
  const v = String(value).toLowerCase();
  if (v.includes('low') || v.includes('min') || v.includes('critical')) return 'LOW';
  if (v.includes('high') || v.includes('over')) return 'HIGH';
  if (v.includes('ok') || v.includes('normal') || v.includes('good')) return 'OK';
  const n = parseFloat(v);
  if (!Number.isNaN(n)) {
    if (n <= 0.2 || (n > 1 && n <= 20)) return 'LOW';
    if (n >= 0.8 || (n > 1 && n >= 80)) return 'HIGH';
    return 'OK';
  }
  return 'UNKNOWN';
}

function baseLight(
  partial: Omit<DashboardWarningLight, 'key' | 'label'> & { key: string; label: string },
): DashboardWarningLight {
  return partial;
}

export function buildBooleanWarnLight(opts: {
  key: string;
  label: string;
  sourceSignal: string;
  entry: HmSignalEntry | undefined;
  groupFreshness: DashboardFreshness;
  groupObservedAt: string | null;
  activeReason: string;
  activeAction: string;
  offReason: string;
  offAction: string;
  activeSeverity: DashboardWarningSeverity;
  activeRentalImpact: DashboardRentalImpact;
  unsupportedReason: string;
  noEventReason: string;
}): DashboardWarningLight {
  const observedAt = opts.entry?.timestamp ?? opts.groupObservedAt;
  const perFreshness = freshnessFromTimestamp(observedAt, opts.groupFreshness);

  if (!opts.entry) {
    return baseLight({
      key: opts.key,
      label: opts.label,
      state: 'unsupported',
      severity: 'unknown',
      supported: false,
      observedAt: null,
      sourceSignal: opts.sourceSignal,
      sourceTimestamp: null,
      reason: opts.unsupportedReason,
      action: 'Signal wird von diesem Fahrzeug/OEM nicht geliefert.',
      rentalImpact: 'none',
    });
  }

  if (perFreshness === 'stale' && opts.groupFreshness === 'stale') {
    return baseLight({
      key: opts.key,
      label: opts.label,
      state: 'stale',
      severity: 'unknown',
      supported: true,
      observedAt,
      sourceSignal: opts.sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      rawValue: opts.entry.value,
      reason: 'Letzte HM/OEM-Meldung ist veraltet.',
      action: 'Verbindung prüfen oder Daten aktualisieren.',
      rentalImpact: 'none',
    });
  }

  if (opts.entry.value === null || opts.entry.value === undefined) {
    return baseLight({
      key: opts.key,
      label: opts.label,
      state: 'no_event_yet',
      severity: 'unknown',
      supported: true,
      observedAt,
      sourceSignal: opts.sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      reason: opts.noEventReason,
      action: 'Noch kein Ereignis seit Stream-Start — nicht als „Aus“ werten.',
      rentalImpact: 'none',
    });
  }

  if (isExplicitOff(opts.entry.value)) {
    return baseLight({
      key: opts.key,
      label: opts.label,
      state: 'off_confirmed',
      severity: 'info',
      supported: true,
      observedAt,
      sourceSignal: opts.sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      rawValue: opts.entry.value,
      reason: opts.offReason,
      action: opts.offAction,
      rentalImpact: 'none',
    });
  }

  if (isExplicitOn(opts.entry.value)) {
    return baseLight({
      key: opts.key,
      label: opts.label,
      state: 'active',
      severity: opts.activeSeverity,
      supported: true,
      observedAt,
      sourceSignal: opts.sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      rawValue: opts.entry.value,
      reason: opts.activeReason,
      action: opts.activeAction,
      rentalImpact: opts.activeRentalImpact,
    });
  }

  return baseLight({
    key: opts.key,
    label: opts.label,
    state: 'no_event_yet',
    severity: 'unknown',
    supported: true,
    observedAt,
    sourceSignal: opts.sourceSignal,
    sourceTimestamp: opts.entry.timestamp ?? null,
    rawValue: opts.entry.value,
    reason: 'Unbekannter Rohwert — kein bestätigter Zustand.',
    action: 'Manuell am Fahrzeug prüfen.',
    rentalImpact: 'none',
  });
}

export function buildOilLevelLight(opts: {
  entry: HmSignalEntry | undefined;
  groupFreshness: DashboardFreshness;
  groupObservedAt: string | null;
}): DashboardWarningLight {
  const sourceSignal = 'diagnostics.get.engine_oil_level';
  if (!opts.entry) {
    return baseLight({
      key: 'engine_oil_level',
      label: 'Motorölstand',
      state: 'unsupported',
      severity: 'unknown',
      supported: false,
      observedAt: null,
      sourceSignal,
      sourceTimestamp: null,
      reason: 'Ölstand-Signal nicht im HM-Stream.',
      action: 'Ölstand manuell prüfen.',
      rentalImpact: 'none',
    });
  }

  const observedAt = opts.entry.timestamp ?? opts.groupObservedAt;
  const perFreshness = freshnessFromTimestamp(observedAt, opts.groupFreshness);
  if (perFreshness === 'stale' && opts.groupFreshness === 'stale') {
    return baseLight({
      key: 'engine_oil_level',
      label: 'Motorölstand',
      state: 'stale',
      severity: 'unknown',
      supported: true,
      observedAt,
      sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      rawValue: opts.entry.value,
      reason: 'Ölstand-Daten veraltet.',
      action: 'HM-Daten aktualisieren oder manuell prüfen.',
      rentalImpact: 'none',
    });
  }

  if (opts.entry.value == null) {
    return baseLight({
      key: 'engine_oil_level',
      label: 'Motorölstand',
      state: 'no_event_yet',
      severity: 'unknown',
      supported: true,
      observedAt,
      sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      reason: 'Ölstand noch nicht gemeldet.',
      action: 'Nicht als „OK“ annehmen.',
      rentalImpact: 'none',
    });
  }

  const status = normalizeOilStatus(opts.entry.value);
  if (status === 'LOW') {
    return baseLight({
      key: 'engine_oil_level',
      label: 'Motorölstand',
      state: 'active',
      severity: 'critical',
      supported: true,
      observedAt,
      sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      rawValue: opts.entry.value,
      reason: 'Motorölstand niedrig (HM/OEM).',
      action: 'Ölstand prüfen und nachfüllen.',
      rentalImpact: 'block_rental',
    });
  }
  if (status === 'HIGH') {
    return baseLight({
      key: 'engine_oil_level',
      label: 'Motorölstand',
      state: 'active',
      severity: 'warning',
      supported: true,
      observedAt,
      sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      rawValue: opts.entry.value,
      reason: 'Motorölstand hoch (HM/OEM).',
      action: 'Vor nächster Vermietung prüfen.',
      rentalImpact: 'inspect_before_next_rental',
    });
  }
  if (status === 'OK') {
    return baseLight({
      key: 'engine_oil_level',
      label: 'Motorölstand',
      state: 'off_confirmed',
      severity: 'info',
      supported: true,
      observedAt,
      sourceSignal,
      sourceTimestamp: opts.entry.timestamp ?? null,
      rawValue: opts.entry.value,
      reason: 'Ölstand im Normalbereich (HM/OEM).',
      action: 'Keine Maßnahme.',
      rentalImpact: 'none',
    });
  }

  return baseLight({
    key: 'engine_oil_level',
    label: 'Motorölstand',
    state: 'no_event_yet',
    severity: 'unknown',
    supported: true,
    observedAt,
    sourceSignal,
    sourceTimestamp: opts.entry.timestamp ?? null,
    rawValue: opts.entry.value,
    reason: 'Ölstand nicht eindeutig interpretierbar.',
    action: 'Manuell prüfen.',
    rentalImpact: 'none',
  });
}

export function buildTirePressureLight(opts: {
  tireStatuses: Record<string, string> | null | undefined;
  groupFreshness: DashboardFreshness;
  groupObservedAt: string | null;
  dashboardEntry: HmSignalEntry | undefined;
}): DashboardWarningLight {
  const sourceSignal = 'diagnostics.get.tire_pressure_statuses';
  const observedAt =
    opts.dashboardEntry?.timestamp ?? opts.groupObservedAt;

  if (!opts.tireStatuses || Object.keys(opts.tireStatuses).length === 0) {
    if (!opts.dashboardEntry) {
      return baseLight({
        key: 'tire_pressure_warning',
        label: 'Reifendruck-Warnung',
        state: 'unsupported',
        severity: 'unknown',
        supported: false,
        observedAt: null,
        sourceSignal,
        sourceTimestamp: null,
        reason: 'Reifendruck-Status nicht im HM-Stream.',
        action: 'Reifendruck manuell prüfen.',
        rentalImpact: 'none',
      });
    }
    return baseLight({
      key: 'tire_pressure_warning',
      label: 'Reifendruck-Warnung',
      state: 'no_event_yet',
      severity: 'unknown',
      supported: true,
      observedAt,
      sourceSignal,
      sourceTimestamp: opts.dashboardEntry.timestamp ?? null,
      reason: 'Noch keine Reifendruck-Statusmeldung.',
      action: 'Nicht als „OK“ werten.',
      rentalImpact: 'none',
    });
  }

  const vals = Object.values(opts.tireStatuses);
  const hasCritical = vals.some((v) => v === 'ALERT' || v.toLowerCase().includes('critical'));
  const hasWarn = vals.some(
    (v) =>
      v.toLowerCase().includes('low') ||
      v.toLowerCase().includes('warn') ||
      v === 'ALERT',
  );

  if (hasCritical || hasWarn) {
    return baseLight({
      key: 'tire_pressure_warning',
      label: 'Reifendruck-Warnung',
      state: 'active',
      severity: hasCritical ? 'critical' : 'warning',
      supported: true,
      observedAt,
      sourceSignal,
      sourceTimestamp: opts.dashboardEntry?.timestamp ?? null,
      rawValue: opts.tireStatuses,
      reason: hasCritical ? 'Kritischer Reifendruck gemeldet.' : 'Reifendruck-Warnung aktiv.',
      action: 'Reifendruck prüfen und korrigieren.',
      rentalImpact: hasCritical ? 'block_rental' : 'inspect_before_next_rental',
    });
  }

  return baseLight({
    key: 'tire_pressure_warning',
    label: 'Reifendruck-Warnung',
    state: 'off_confirmed',
    severity: 'info',
    supported: true,
    observedAt,
    sourceSignal,
    sourceTimestamp: opts.dashboardEntry?.timestamp ?? null,
    rawValue: opts.tireStatuses,
    reason: 'Keine Reifendruck-Warnung gemeldet.',
    action: 'Keine Maßnahme.',
    rentalImpact: 'none',
  });
}

export function parseDashboardLightEntries(raw: unknown): Array<{ name: string; state: string }> {
  if (raw == null) return [];
  const inspect = (entry: unknown): { name: string; state: string } | null => {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.name !== 'string') return null;
    return { name: e.name, state: String(e.state ?? '') };
  };
  if (Array.isArray(raw)) {
    return raw.map(inspect).filter((x): x is { name: string; state: string } => x != null);
  }
  const single = inspect(raw);
  return single ? [single] : [];
}

export function isEvPowertrain(fuelType: string | null | undefined): boolean {
  if (!fuelType) return false;
  const f = fuelType.toUpperCase();
  return f === 'ELECTRIC' || f === 'PLUGIN_HYBRID' || f === 'HYBRID';
}
