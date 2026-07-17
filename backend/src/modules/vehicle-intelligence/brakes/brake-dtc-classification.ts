import { DtcSeverity } from '@prisma/client';
import { normalizeDtcCode, getDtcSystemCategory } from '../dtc-knowledge/dtc-knowledge.util';
import { normalizeDtcSeverityBand } from '../dtc/dtc-severity.util';

export type BrakeDtcCategory =
  | 'BRAKE_SYSTEM'
  | 'ABS'
  | 'ESC'
  | 'PARKING_BRAKE'
  | 'BRAKE_SENSOR'
  | 'BRAKE_FLUID'
  | 'COMMUNICATION_RELATED'
  | 'NOT_BRAKE_RELATED';

export type BrakeDtcFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface BrakeDtcClassification {
  normalizedCode: string;
  category: BrakeDtcCategory;
  severity: DtcSeverity;
  reviewRequired: boolean;
  /** True when classification is explicit enough for safety-critical blocking. */
  safetyClassified: boolean;
  mappingSource: 'exact' | 'prefix' | 'heuristic' | 'system_family';
}

interface CodeRegistryEntry {
  category: BrakeDtcCategory;
  severity: DtcSeverity;
  safetyClassified?: boolean;
}

/** Curated SAE / common OEM brake-safety codes — not free-text search. */
const EXACT_CODE_REGISTRY: Readonly<Record<string, CodeRegistryEntry>> = {
  // ABS wheel-speed / tone ring
  C0035: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  C0036: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  C0037: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  C0038: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  C0040: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  C0041: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  C0042: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  C0043: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  // ABS hydraulic / pump
  C0265: { category: 'ABS', severity: 'CRITICAL', safetyClassified: true },
  C0266: { category: 'ABS', severity: 'CRITICAL', safetyClassified: true },
  C0267: { category: 'ABS', severity: 'WARNING', safetyClassified: true },
  // ESC / stability
  C0455: { category: 'ESC', severity: 'WARNING', safetyClassified: true },
  C0561: { category: 'ESC', severity: 'WARNING', safetyClassified: true },
  C0710: { category: 'ESC', severity: 'WARNING', safetyClassified: true },
  C0715: { category: 'ESC', severity: 'WARNING', safetyClassified: true },
  // Brake fluid / pressure
  C1220: { category: 'BRAKE_SYSTEM', severity: 'CRITICAL', safetyClassified: true },
  C1241: { category: 'BRAKE_FLUID', severity: 'CRITICAL', safetyClassified: true },
  C1242: { category: 'PARKING_BRAKE', severity: 'WARNING', safetyClassified: true },
  // Parking brake / switch
  P0571: { category: 'BRAKE_SYSTEM', severity: 'WARNING', safetyClassified: true },
  P0572: { category: 'BRAKE_SYSTEM', severity: 'WARNING', safetyClassified: true },
  P0826: { category: 'PARKING_BRAKE', severity: 'WARNING', safetyClassified: true },
  // Wear sensor
  C1101: { category: 'BRAKE_SENSOR', severity: 'WARNING', safetyClassified: true },
  // Communication with brake modules
  U0121: { category: 'COMMUNICATION_RELATED', severity: 'WARNING', safetyClassified: true },
  U0122: { category: 'COMMUNICATION_RELATED', severity: 'WARNING', safetyClassified: true },
  U0128: { category: 'COMMUNICATION_RELATED', severity: 'WARNING', safetyClassified: true },
  U0415: { category: 'COMMUNICATION_RELATED', severity: 'WARNING', safetyClassified: true },
  U0416: { category: 'COMMUNICATION_RELATED', severity: 'WARNING', safetyClassified: true },
  // Explicit non-brake examples
  P0675: { category: 'NOT_BRAKE_RELATED', severity: 'INFO' },
  P0420: { category: 'NOT_BRAKE_RELATED', severity: 'INFO' },
  P0300: { category: 'NOT_BRAKE_RELATED', severity: 'INFO' },
};

const PREFIX_REGISTRY: ReadonlyArray<{
  prefix: string;
  entry: CodeRegistryEntry;
  mappingSource: 'prefix';
}> = [
  { prefix: 'C003', entry: { category: 'ABS', severity: 'WARNING', safetyClassified: true }, mappingSource: 'prefix' },
  { prefix: 'C004', entry: { category: 'ABS', severity: 'WARNING', safetyClassified: true }, mappingSource: 'prefix' },
  { prefix: 'C026', entry: { category: 'ABS', severity: 'WARNING', safetyClassified: true }, mappingSource: 'prefix' },
  { prefix: 'C045', entry: { category: 'ESC', severity: 'WARNING', safetyClassified: true }, mappingSource: 'prefix' },
  { prefix: 'C056', entry: { category: 'ESC', severity: 'WARNING', safetyClassified: true }, mappingSource: 'prefix' },
  { prefix: 'C071', entry: { category: 'ESC', severity: 'WARNING', safetyClassified: true }, mappingSource: 'prefix' },
  { prefix: 'U012', entry: { category: 'COMMUNICATION_RELATED', severity: 'WARNING', safetyClassified: true }, mappingSource: 'prefix' },
  { prefix: 'U041', entry: { category: 'COMMUNICATION_RELATED', severity: 'WARNING', safetyClassified: true }, mappingSource: 'prefix' },
];

function mapSeverityBandToDtcSeverity(
  band: ReturnType<typeof normalizeDtcSeverityBand>,
  fallback: DtcSeverity,
): DtcSeverity {
  switch (band) {
    case 'critical':
      return 'CRITICAL';
    case 'warning':
      return 'WARNING';
    case 'info':
      return 'INFO';
    default:
      return fallback;
  }
}

function classifyBySystemFamily(normalizedCode: string): BrakeDtcClassification | null {
  const system = getDtcSystemCategory(normalizedCode);
  switch (system) {
    case 'POWERTRAIN':
      return {
        normalizedCode,
        category: 'NOT_BRAKE_RELATED',
        severity: 'INFO',
        reviewRequired: false,
        safetyClassified: true,
        mappingSource: 'system_family',
      };
    case 'NETWORK':
      return {
        normalizedCode,
        category: 'COMMUNICATION_RELATED',
        severity: 'WARNING',
        reviewRequired: false,
        safetyClassified: true,
        mappingSource: 'system_family',
      };
    case 'CHASSIS':
    case 'BODY':
      return {
        normalizedCode,
        category: 'BRAKE_SYSTEM',
        severity: 'WARNING',
        reviewRequired: true,
        safetyClassified: false,
        mappingSource: 'system_family',
      };
    default:
      return null;
  }
}

export function buildBrakeDtcDedupeKey(normalizedCode: string): string {
  return `dtc:${normalizedCode}`;
}

export function isBrakeDtcEvidenceRelevant(category: BrakeDtcCategory): boolean {
  return category !== 'NOT_BRAKE_RELATED';
}

/**
 * Classify a raw OBD DTC for brake safety evidence production.
 * Never uses free-text descriptions as the sole classifier.
 */
export function classifyBrakeDtc(
  rawCode: string,
  options?: {
    eventSeverity?: string | null;
  },
): BrakeDtcClassification | null {
  const normalizedCode = normalizeDtcCode(rawCode);
  if (!normalizedCode) return null;

  const exact = EXACT_CODE_REGISTRY[normalizedCode];
  if (exact) {
    const eventBand = normalizeDtcSeverityBand(options?.eventSeverity);
    const severity =
      eventBand === 'unknown'
        ? exact.severity
        : mapSeverityBandToDtcSeverity(eventBand, exact.severity);
    return {
      normalizedCode,
      category: exact.category,
      severity: capSeverityForReview(exact.safetyClassified ?? true, severity),
      reviewRequired: false,
      safetyClassified: exact.safetyClassified ?? true,
      mappingSource: 'exact',
    };
  }

  for (const row of PREFIX_REGISTRY) {
    if (normalizedCode.startsWith(row.prefix)) {
      return {
        normalizedCode,
        category: row.entry.category,
        severity: row.entry.severity,
        reviewRequired: false,
        safetyClassified: row.entry.safetyClassified ?? true,
        mappingSource: 'prefix',
      };
    }
  }

  const family = classifyBySystemFamily(normalizedCode);
  if (family) {
    if (family.reviewRequired) {
      family.severity = 'WARNING';
    }
    return family;
  }

  return {
    normalizedCode,
    category: 'NOT_BRAKE_RELATED',
    severity: 'INFO',
    reviewRequired: false,
    safetyClassified: true,
    mappingSource: 'heuristic',
  };
}

function capSeverityForReview(safetyClassified: boolean, severity: DtcSeverity): DtcSeverity {
  if (safetyClassified) return severity;
  if (severity === 'CRITICAL') return 'WARNING';
  return severity;
}

export function resolveBrakeDtcFreshness(args: {
  lastSuccessfulCheckAt: Date | null | undefined;
  staleThresholdMs?: number;
}): BrakeDtcFreshness {
  const threshold = args.staleThresholdMs ?? 6 * 60 * 60_000;
  if (!args.lastSuccessfulCheckAt) return 'UNKNOWN';
  const ageMs = Date.now() - new Date(args.lastSuccessfulCheckAt).getTime();
  return ageMs > threshold ? 'STALE' : 'FRESH';
}

export function isActiveBrakeDtcEvidenceRow(row: {
  source: string;
  dtcActive?: boolean | null;
  dtcFreshness?: string | null;
  dtcSeverity?: string | null;
}): boolean {
  if (row.source !== 'DTC_SIGNAL') return true;
  if (row.dtcActive === false) return false;
  if (row.dtcFreshness === 'STALE') return false;
  return typeof row.dtcSeverity === 'string' && row.dtcSeverity.trim().length > 0;
}
