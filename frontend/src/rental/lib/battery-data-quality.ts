export const BATTERY_DATA_QUALITY_STATUSES = [
  'VERIFIED',
  'ESTIMATED',
  'PROXY',
  'EXPERIMENTAL',
  'STALE',
  'MISSED',
  'UNAVAILABLE',
  'UNSUPPORTED',
  'LEGACY_UNVERIFIED',
] as const;

export type BatteryDataQualityStatus = (typeof BATTERY_DATA_QUALITY_STATUSES)[number];

export const BATTERY_DATA_QUALITY_LABEL_KEY_PREFIX = 'health.battery.dataQuality';

export interface BatteryDataQualityPresentation {
  status: BatteryDataQualityStatus;
  labelKey: string;
  decisionCapable: boolean;
  observedAt: string | null;
}

export interface BatteryDataQualitySlicesPresentation {
  lvEstimatedHealth: BatteryDataQualityPresentation;
  lvRestingVoltage: BatteryDataQualityPresentation;
  lvCrank: BatteryDataQualityPresentation;
  hvSoh: BatteryDataQualityPresentation;
  hvLegacyCapacity: BatteryDataQualityPresentation;
}

export function batteryDataQualityLabelKey(status: BatteryDataQualityStatus): string {
  return `${BATTERY_DATA_QUALITY_LABEL_KEY_PREFIX}.${status}`;
}

export function normalizeBatteryDataQualityStatus(
  input: unknown,
): BatteryDataQualityStatus | null {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toUpperCase();
  if ((BATTERY_DATA_QUALITY_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as BatteryDataQualityStatus;
  }
  return null;
}

export function isBatteryDataQualityDecisionCapable(
  status: BatteryDataQualityStatus,
): boolean {
  return status === 'VERIFIED' || status === 'ESTIMATED';
}

export function shouldShowBatteryHealthClaim(
  status: BatteryDataQualityStatus | null | undefined,
): boolean {
  if (!status) return false;
  return status === 'VERIFIED' || status === 'ESTIMATED';
}
