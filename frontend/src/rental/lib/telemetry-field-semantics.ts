/**
 * Canonical null-preserving telemetry field semantics for SynqDrive UI layers.
 *
 * Target contract (Prompt 9/36):
 * - `null` / `undefined` / invalid → **missing** (render "—", neutral tone)
 * - `0` → **valid measured zero** (render "0", "0 %", "0 km/h", etc.)
 * - Never use `?? 0` or `|| 0` at API→UI boundaries for scalar telemetry.
 *
 * Legacy paths (`/telemetry` response, `useLiveVehicleTelemetry`, `LiveTelemetrySnapshot`)
 * still coerce missing values to 0 — migration tracked in audit doc.
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
}

export interface TelemetryDashboardApiResponse {
  speed?: TelemetryScalar;
  fuel?: TelemetryScalar;
  battery?: TelemetryScalar;
  odometer?: TelemetryScalar;
  coolant?: TelemetryScalar;
  lvBatteryVoltage?: TelemetryScalar;
  engineLoad?: TelemetryScalar;
}

/** @deprecated Legacy coerced snapshot shape used by `useVehicleLiveMapStore` today. */
export interface LegacyCoercedLiveTelemetrySnapshot {
  speed: number;
  fuel: number;
  coolant: number;
  battery: number;
  lvBatteryVoltage: number;
  odometer: number;
  engineLoad: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Parse a telemetry scalar without collapsing missing to zero.
 * Returns `null` for undefined, null, NaN, and non-numbers.
 */
export function parseTelemetryNumber(value: unknown): number | null {
  if (!isFiniteNumber(value)) return null;
  return value;
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

/** Target mapper — null-preserving API → store snapshot. */
export function mapTelemetryDashboardResponseToNullableSnapshot(
  data: TelemetryDashboardApiResponse,
): NullableLiveTelemetrySnapshot {
  return {
    speedKmh: parseTelemetryNumber(data.speed),
    fuelPercent: parseTelemetryNumber(data.fuel),
    evSocPercent: parseTelemetryNumber(data.battery),
    odometerKm: parseTelemetryNumber(data.odometer),
    coolantTempC: parseTelemetryNumber(data.coolant),
    lvBatteryVoltage: parseTelemetryNumber(data.lvBatteryVoltage),
    engineLoadPercent: parseTelemetryNumber(data.engineLoad),
  };
}

/**
 * Documents current hook coercion (`useLiveVehicleTelemetry`) — do not use in new code.
 * Kept for regression comparison until hook migration (Prompt 9 follow-up).
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
  const parsed = parseTelemetryNumber(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)} %`;
}

export function formatTelemetrySpeedKmh(value: TelemetryScalar): string {
  const parsed = parseTelemetryNumber(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)} km/h`;
}

export function formatTelemetryVoltage(
  value: TelemetryScalar,
  decimals: number = 1,
): string {
  const parsed = parseTelemetryNumber(value);
  if (parsed === null) return '—';
  return `${parsed.toFixed(decimals)} V`;
}

export function formatTelemetryTemperatureC(value: TelemetryScalar): string {
  const parsed = parseTelemetryNumber(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)} °C`;
}

export function formatTelemetryRangeKm(value: TelemetryScalar): string {
  const parsed = parseTelemetryNumber(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed)} km`;
}

export function resolveEnergyPercentForDisplay(input: {
  isElectric: boolean;
  fuelPercent: TelemetryScalar;
  evSocPercent: TelemetryScalar;
}): number | null {
  return input.isElectric
    ? parseTelemetryNumber(input.evSocPercent)
    : parseTelemetryNumber(input.fuelPercent);
}
