/**
 * Canonical null-preserving telemetry field semantics for SynqDrive UI layers.
 *
 * Contract (Prompt 10/36):
 * - `null` / `undefined` / invalid → **missing** (render "—", neutral tone)
 * - `0` → **valid measured zero** (render "0", "0 %", "0 km/h", etc.)
 * - Never use `?? 0` or `|| 0` at API→UI boundaries for scalar telemetry.
 */

export type TelemetryScalar = number | null | undefined;

export interface NullableLiveTelemetrySnapshot {
  speedKmh: number | null;
  fuelPercent: number | null;
  evSocPercent: number | null;
  odometerKm: number | null;
  coolantTempC: number | null;
  lvBatteryVoltage: number | null;
  engineLoadPercent: number | null;
  rangeKm: number | null;
  tractionBatteryTemperatureC: number | null;
  latitude: number | null;
  longitude: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
}

export interface TelemetryDashboardApiResponse {
  speed?: TelemetryScalar;
  fuel?: TelemetryScalar;
  battery?: TelemetryScalar;
  odometer?: TelemetryScalar;
  coolant?: TelemetryScalar;
  lvBatteryVoltage?: TelemetryScalar;
  engineLoad?: TelemetryScalar;
  rangeKm?: TelemetryScalar;
  range?: TelemetryScalar;
  tractionBatteryTemperatureC?: TelemetryScalar;
  tractionBatteryTemperature?: TelemetryScalar;
  latitude?: TelemetryScalar;
  longitude?: TelemetryScalar;
  heading?: TelemetryScalar;
  accuracy?: TelemetryScalar;
  accuracyM?: TelemetryScalar;
}

/** @deprecated Legacy coerced snapshot shape — kept for regression comparison only. */
export interface LegacyCoercedLiveTelemetrySnapshot {
  speed: number;
  fuel: number;
  coolant: number;
  battery: number;
  lvBatteryVoltage: number;
  odometer: number;
  engineLoad: number;
}

export interface LiveTelemetrySnapshot {
  speed: number | null;
  fuel: number | null;
  coolant: number | null;
  battery: number | null;
  lvBatteryVoltage: number | null;
  odometer: number | null;
  engineLoad: number | null;
  rangeKm: number | null;
  tractionBatteryTemperatureC: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  ignitionOn?: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseBoundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (!isFiniteNumber(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/**
 * Parse a telemetry scalar without collapsing missing to zero.
 * Returns `null` for undefined, null, NaN, Infinity, and non-numbers.
 */
export function parseTelemetryNumber(value: unknown): number | null {
  if (!isFiniteNumber(value)) return null;
  return value;
}

/** Percent fields: 0–100 inclusive; rejects NaN, strings, out-of-range. */
export function parseTelemetryPercent(value: unknown): number | null {
  return parseBoundedNumber(value, 0, 100);
}

/** Speed in km/h: 0–500 inclusive. */
export function parseTelemetrySpeedKmh(value: unknown): number | null {
  return parseBoundedNumber(value, 0, 500);
}

/** Odometer in km: non-negative, capped at 9_999_999. */
export function parseTelemetryOdometerKm(value: unknown): number | null {
  return parseBoundedNumber(value, 0, 9_999_999);
}

/** 12-V system voltage: 0–20 V. */
export function parseTelemetryVoltage(value: unknown): number | null {
  return parseBoundedNumber(value, 0, 20);
}

/** Ambient / coolant / battery temperature in °C: −50…150. */
export function parseTelemetryTemperatureC(value: unknown): number | null {
  return parseBoundedNumber(value, -50, 150);
}

/** Estimated range in km: 0–2000. */
export function parseTelemetryRangeKm(value: unknown): number | null {
  return parseBoundedNumber(value, 0, 2000);
}

/** GPS heading 0–360° (360 treated as 0). */
export function parseTelemetryHeadingDeg(value: unknown): number | null {
  const parsed = parseTelemetryNumber(value);
  if (parsed === null) return null;
  if (parsed < 0 || parsed > 360) return null;
  return parsed === 360 ? 0 : parsed;
}

/** GPS horizontal accuracy in metres: 0–10_000. */
export function parseTelemetryAccuracyM(value: unknown): number | null {
  return parseBoundedNumber(value, 0, 10_000);
}

/** WGS84 latitude −90…90. */
export function parseTelemetryLatitude(value: unknown): number | null {
  return parseBoundedNumber(value, -90, 90);
}

/** WGS84 longitude −180…180. */
export function parseTelemetryLongitude(value: unknown): number | null {
  return parseBoundedNumber(value, -180, 180);
}

export function isTelemetryMissing(value: TelemetryScalar): boolean {
  return parseTelemetryNumber(value) === null;
}

export function isTelemetryPresent(value: TelemetryScalar): boolean {
  return parseTelemetryNumber(value) !== null;
}

/**
 * Detect legacy coercion: canonical nullable is missing but legacy numeric reads 0.
 * Useful for regression tests while migrating `?? 0` call sites.
 */
export function isLegacyCoercedZero(
  legacyValue: number,
  canonicalNullable: TelemetryScalar,
): boolean {
  return legacyValue === 0 && isTelemetryMissing(canonicalNullable);
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.ceil(value)));
}

export function floorOdometerKm(value: number): number {
  return Math.floor(value);
}

/** Null-preserving API → canonical nullable snapshot. */
export function mapTelemetryDashboardResponseToNullableSnapshot(
  data: TelemetryDashboardApiResponse,
): NullableLiveTelemetrySnapshot {
  return {
    speedKmh: parseTelemetrySpeedKmh(data.speed),
    fuelPercent: parseTelemetryPercent(data.fuel),
    evSocPercent: parseTelemetryPercent(data.battery),
    odometerKm: parseTelemetryOdometerKm(data.odometer),
    coolantTempC: parseTelemetryTemperatureC(data.coolant),
    lvBatteryVoltage: parseTelemetryVoltage(data.lvBatteryVoltage),
    engineLoadPercent: parseTelemetryPercent(data.engineLoad),
    rangeKm: parseTelemetryRangeKm(data.rangeKm ?? data.range),
    tractionBatteryTemperatureC: parseTelemetryTemperatureC(
      data.tractionBatteryTemperatureC ?? data.tractionBatteryTemperature,
    ),
    latitude: parseTelemetryLatitude(data.latitude),
    longitude: parseTelemetryLongitude(data.longitude),
    headingDeg: parseTelemetryHeadingDeg(data.heading),
    accuracyM: parseTelemetryAccuracyM(data.accuracyM ?? data.accuracy),
  };
}

/** API → live map store snapshot (nullable fields, canonical names in store). */
export function mapTelemetryDashboardResponseToLiveSnapshot(
  data: TelemetryDashboardApiResponse,
): LiveTelemetrySnapshot {
  const mapped = mapTelemetryDashboardResponseToNullableSnapshot(data);
  return {
    speed: mapped.speedKmh,
    fuel: mapped.fuelPercent,
    coolant: mapped.coolantTempC,
    battery: mapped.evSocPercent,
    lvBatteryVoltage: mapped.lvBatteryVoltage,
    odometer: mapped.odometerKm,
    engineLoad: mapped.engineLoadPercent,
    rangeKm: mapped.rangeKm,
    tractionBatteryTemperatureC: mapped.tractionBatteryTemperatureC,
    headingDeg: mapped.headingDeg,
    accuracyM: mapped.accuracyM,
  };
}

/**
 * @deprecated Documents pre–Prompt-10 hook coercion — do not use in new code.
 */
export function mapTelemetryDashboardResponseLegacyCoerced(
  data: TelemetryDashboardApiResponse,
): LegacyCoercedLiveTelemetrySnapshot {
  return {
    speed: typeof data.speed === 'number' ? data.speed : 0,
    fuel: typeof data.fuel === 'number' ? data.fuel : 0,
    coolant: typeof data.coolant === 'number' ? data.coolant : 0,
    battery: typeof data.battery === 'number' ? data.battery : 0,
    lvBatteryVoltage: typeof data.lvBatteryVoltage === 'number' ? data.lvBatteryVoltage : 0,
    odometer: typeof data.odometer === 'number' ? data.odometer : 0,
    engineLoad: typeof data.engineLoad === 'number' ? data.engineLoad : 0,
  };
}

/**
 * Prefer live HUD snapshot, then static vehicle canonical, then legacy vehicle field.
 * Never fabricates a value — returns `null` when all sources are missing.
 */
export function resolveTelemetryScalarForDisplay(
  live: TelemetryScalar,
  canonical: TelemetryScalar,
  legacy?: TelemetryScalar,
): number | null {
  const fromLive = parseTelemetryNumber(live);
  if (fromLive !== null) return fromLive;
  const fromCanonical = parseTelemetryNumber(canonical);
  if (fromCanonical !== null) return fromCanonical;
  return parseTelemetryNumber(legacy);
}

export function formatTelemetryInteger(
  value: TelemetryScalar,
  locale: string = 'de-DE',
): string {
  const parsed = parseTelemetryNumber(value);
  if (parsed === null) return '—';
  return Math.round(parsed).toLocaleString(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

export function formatTelemetryPercent(value: TelemetryScalar): string {
  const parsed = parseTelemetryPercent(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)} %`;
}

export function formatTelemetryPercentValue(value: TelemetryScalar): string {
  const parsed = parseTelemetryPercent(value);
  if (parsed === null) return '—';
  return String(Math.round(parsed));
}

export function formatTelemetrySpeedKmh(value: TelemetryScalar): string {
  const parsed = parseTelemetrySpeedKmh(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)} km/h`;
}

export function formatTelemetryVoltage(
  value: TelemetryScalar,
  decimals: number = 1,
): string {
  const parsed = parseTelemetryVoltage(value);
  if (parsed === null) return '—';
  return `${parsed.toFixed(decimals)} V`;
}

export function formatTelemetryTemperatureC(value: TelemetryScalar): string {
  const parsed = parseTelemetryTemperatureC(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)} °C`;
}

export function formatTelemetryRangeKm(value: TelemetryScalar): string {
  const parsed = parseTelemetryRangeKm(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)} km`;
}

export function formatTelemetryHeadingDeg(value: TelemetryScalar): string {
  const parsed = parseTelemetryHeadingDeg(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)}°`;
}

export function formatTelemetryAccuracyM(value: TelemetryScalar): string {
  const parsed = parseTelemetryAccuracyM(value);
  if (parsed === null) return '—';
  return `±${Math.round(parsed)} m`;
}

export function resolveEnergyPercentForDisplay(input: {
  isElectric: boolean;
  fuelPercent: TelemetryScalar;
  evSocPercent: TelemetryScalar;
}): number | null {
  return input.isElectric
    ? parseTelemetryPercent(input.evSocPercent)
    : parseTelemetryPercent(input.fuelPercent);
}
