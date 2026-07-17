import type {
  BatteryEvidenceItem,
  BatteryHealthDetail,
  BatteryHealthSummary,
  BatteryRestingVoltageStatus,
  TripProfile,
  VehicleTripAnalytics,
} from '../../lib/api';
import { normalizeLvBatteryVoltage } from './battery-display.utils';
import {
  ESTIMATED_LV_HEALTH_SCORE_LABEL_DE,
  LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
} from './battery-lv-semantics';

export const RESTING_VOLTAGE_EXPLANATION =
  'Spannung der 12V-Batterie im Ruhezustand. Dieser Wert eignet sich besser zur Batteriebewertung als ein einzelner Live-Wert.';

const VOLTAGE_EVIDENCE_TYPES = new Set([
  'RESTING_VOLTAGE_V',
  'VOLTAGE_V',
  'CRANKING_VOLTAGE_V',
  'CHARGING_VOLTAGE_V',
]);

export interface BatteryMeasurementRow {
  id: string;
  label: string;
  valueText: string;
  metaText: string;
  dateText: string;
  kind: 'evidence' | 'service' | 'legacy';
}

export interface RestingVoltageChartPoint {
  recordedAt: string;
  voltageV: number;
  day: string;
  time: string;
  status: BatteryRestingVoltageStatus;
}

export interface ExteriorAmbientContext {
  valueC: number | null;
  observedAt: string | null;
  source: 'trip' | 'profile_avg' | null;
}

export function resolveCanonicalRestingVoltage(
  battery: BatteryHealthSummary | null | undefined,
): number | null {
  return (
    normalizeLvBatteryVoltage(battery?.lv?.restingVoltage?.valueV) ??
    normalizeLvBatteryVoltage(battery?.lv?.telemetry?.restingVoltage) ??
    normalizeLvBatteryVoltage(battery?.currentState?.restingVoltage)
  );
}

export function resolveCurrentLiveVoltage(
  battery: BatteryHealthSummary | null | undefined,
  liveMapVoltage?: number | null,
): number | null {
  return (
    normalizeLvBatteryVoltage(battery?.lv?.telemetry?.voltageV) ??
    normalizeLvBatteryVoltage(battery?.currentState?.voltageV) ??
    normalizeLvBatteryVoltage(battery?.currentTelemetry?.lvVoltageV) ??
    normalizeLvBatteryVoltage(liveMapVoltage)
  );
}

export function labelBatteryMeasurementType(
  valueType: string | null | undefined,
  options?: { scope?: 'LV' | 'HV'; semanticValueType?: string | null; displayLabel?: string | null },
): string {
  if (options?.displayLabel) return options.displayLabel;
  if (options?.scope === 'LV' && valueType === 'SOH_PERCENT') {
    return ESTIMATED_LV_HEALTH_SCORE_LABEL_DE;
  }
  switch (valueType) {
    case 'RESTING_VOLTAGE_V':
      return '12V-Ruhespannung';
    case 'VOLTAGE_V':
      return 'Aktuelle Spannung';
    case 'CRANKING_VOLTAGE_V':
      return 'Startspannung / Crank Drop';
    case 'CHARGING_VOLTAGE_V':
      return 'Ladespannung';
    case 'SOH_PERCENT':
      return 'SOH';
    default:
      return 'Messung';
  }
}

export function labelBatteryEvidenceSource(
  sourceType: string | null | undefined,
  provider: string | null | undefined,
): string {
  const normalized = (sourceType ?? '').toLowerCase();
  if (normalized.includes('document') || normalized.includes('ai')) {
    return 'AI Upload / Werkstattbericht';
  }
  if (normalized.includes('workshop')) return 'Manuell / Werkstattdokument';
  if (normalized.includes('manual')) return 'Manuelle Messung';
  if (normalized.includes('provider') || provider) {
    return provider ? String(provider) : 'Provider / Telemetrie';
  }
  if (normalized.includes('telemetry') || normalized.includes('hm')) {
    return 'Live / Telemetrie';
  }
  return sourceType ? String(sourceType) : 'Telemetrie';
}

function isAgmBatteryType(batteryType: string | null | undefined): boolean {
  return (batteryType ?? '').toUpperCase().includes('AGM');
}

export function classifyRestingVoltageForChart(
  voltageV: number,
  batteryType?: string | null,
): BatteryRestingVoltageStatus {
  const agm = isAgmBatteryType(batteryType);
  const good = agm ? 12.6 : 12.5;
  const watch = agm ? 12.3 : 12.2;
  const warning = agm ? 12.1 : 12.0;
  if (voltageV >= good) return 'GOOD';
  if (voltageV >= watch) return 'WATCH';
  if (voltageV >= warning) return 'WARNING';
  return 'CRITICAL';
}

export function restingVoltageStatusLabelDe(status: BatteryRestingVoltageStatus): string {
  switch (status) {
    case 'GOOD':
      return 'Gut';
    case 'WATCH':
      return 'Beobachten';
    case 'WARNING':
      return 'Niedrig';
    case 'CRITICAL':
      return 'Kritisch';
    default:
      return '—';
  }
}

export function buildRestingVoltageTrendPoints(
  evidence: BatteryEvidenceItem[],
  days: number,
  batteryType?: string | null,
): RestingVoltageChartPoint[] {
  const since = Date.now() - days * 86_400_000;
  return evidence
    .filter((e) => e.valueType === 'RESTING_VOLTAGE_V')
    .map((e) => {
      const voltageV = normalizeLvBatteryVoltage(e.value);
      if (voltageV == null) return null;
      const ts = new Date(e.observedAt).getTime();
      if (!Number.isFinite(ts) || ts < since) return null;
      const d = new Date(e.observedAt);
      return {
        recordedAt: e.observedAt,
        voltageV,
        day: d.toLocaleDateString('de-DE', days > 14 ? { day: '2-digit', month: '2-digit' } : { weekday: 'short' }),
        time: d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
        status: classifyRestingVoltageForChart(voltageV, batteryType),
      };
    })
    .filter((p): p is RestingVoltageChartPoint => p != null)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export function restingVoltageChartDomain(batteryType?: string | null): [number, number] {
  return isAgmBatteryType(batteryType) ? [11.8, 13.2] : [11.5, 13.0];
}

function formatEvidenceDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildBatteryMeasurementRows(
  detail: BatteryHealthDetail | null | undefined,
  summary: BatteryHealthSummary | null | undefined,
): BatteryMeasurementRow[] {
  const evidence = detail?.detail?.lv?.evidence ?? [];
  const evidenceRows: BatteryMeasurementRow[] = evidence
    .filter(
      (e) =>
        (VOLTAGE_EVIDENCE_TYPES.has(e.valueType) ||
          (e.valueType === 'SOH_PERCENT' &&
            e.semanticValueType === LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC)) &&
        e.value != null,
    )
    .map((e) => {
      const valueV = normalizeLvBatteryVoltage(e.value);
      const isLegacyLvScore = e.valueType === 'SOH_PERCENT';
      const unit = e.unit ?? (isLegacyLvScore ? '%' : 'V');
      const metaParts = [labelBatteryEvidenceSource(e.sourceType, e.provider)];
      if (e.confidence) metaParts.push(String(e.confidence));
      if (e.quality) metaParts.push(String(e.quality));
      if (isLegacyLvScore) metaParts.push('Verhaltenswert (kein Werkstatt-SOH)');
      return {
        id: e.id,
        kind: 'evidence' as const,
        label: labelBatteryMeasurementType(e.valueType, {
          scope: 'LV',
          semanticValueType: e.semanticValueType,
          displayLabel: e.displayLabel,
        }),
        valueText: isLegacyLvScore
          ? `${Math.round(e.value!)} Punkte`
          : `${(valueV ?? e.value)!.toFixed(2)} ${unit}`,
        metaText: metaParts.join(' · '),
        dateText: formatEvidenceDate(e.observedAt),
      };
    });

  const serviceRows: BatteryMeasurementRow[] = (summary?.history ?? [])
    .filter((h) => h.type === 'service')
    .map((h) => ({
      id: h.id,
      kind: 'service' as const,
      label: 'Batterie-Service',
      valueText: h.notes ? String(h.notes) : 'Serviceeintrag',
      metaText: h.workshopName ? String(h.workshopName) : 'Werkstatt',
      dateText: formatEvidenceDate(h.date),
    }));

  if (evidenceRows.length > 0) {
    return [...evidenceRows, ...serviceRows]
      .sort((a, b) => b.dateText.localeCompare(a.dateText, 'de'))
      .slice(0, 20);
  }

  return (summary?.history ?? []).map((h) => ({
    id: h.id,
    kind: 'legacy' as const,
    label: h.type === 'service' ? 'Batterie-Service' : 'Messung',
    valueText:
      h.voltage != null
        ? `${h.voltage.toFixed(2)} V`
        : h.estimatedLvHealthScore != null
          ? `${Math.round(h.estimatedLvHealthScore)} Punkte`
          : h.soh != null
            ? `${Math.round(h.soh)} Punkte (Legacy)`
            : '—',
    metaText: h.workshopName ?? h.notes ?? (h.type === 'service' ? 'Service' : 'Snapshot'),
    dateText: formatEvidenceDate(h.date),
  }));
}

export function resolveExteriorAmbientTemperature(
  trips: VehicleTripAnalytics[] | null | undefined,
  tripProfile: TripProfile | null | undefined,
): ExteriorAmbientContext {
  const sorted = [...(trips ?? [])].sort((a, b) => b.startTime.localeCompare(a.startTime));
  for (const trip of sorted) {
    const raw = (trip as { outsideTemperatureStartC?: number | null }).outsideTemperatureStartC;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return { valueC: raw, observedAt: trip.startTime, source: 'trip' };
    }
  }
  if (tripProfile?.avgTemp != null && Number.isFinite(tripProfile.avgTemp)) {
    return { valueC: tripProfile.avgTemp, observedAt: null, source: 'profile_avg' };
  }
  return { valueC: null, observedAt: null, source: null };
}

export function formatExteriorAmbientDisplay(ctx: ExteriorAmbientContext): {
  value: string;
  hint: string | null;
} {
  if (ctx.valueC == null) {
    return { value: 'Nicht verfügbar', hint: null };
  }
  const rounded = Math.round(ctx.valueC * 10) / 10;
  if (ctx.source === 'trip' && ctx.observedAt) {
    const rel = formatRelativeShort(ctx.observedAt);
    return { value: `${rounded} °C`, hint: rel ? `bei letzter Fahrt · ${rel}` : 'bei letzter Fahrt' };
  }
  if (ctx.source === 'profile_avg') {
    return { value: `${rounded} °C`, hint: 'Ø aus Fahrten (Messkontext)' };
  }
  return { value: `${rounded} °C`, hint: null };
}

function formatRelativeShort(iso: string): string | null {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const ms = Date.now() - ts;
  if (ms < 3_600_000) return 'vor <1 Std.';
  if (ms < 86_400_000) return `vor ${Math.floor(ms / 3_600_000)} Std.`;
  return `vor ${Math.floor(ms / 86_400_000)} Tg.`;
}
