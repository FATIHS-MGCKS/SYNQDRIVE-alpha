// V4.8.25 — Vehicle stress / Fahrzeugbelastung visualization helpers.
//
// `drivingStressScore` is 0–100 where HIGHER = MORE vehicle load (worse for
// tires/brakes). This is NOT a positive driver-quality score.
//
// Missing data uses an em-dash — never fake 0 or 100.

export const SCORE_EM_DASH = '—';

export type DataConfidence = 'none' | 'low' | 'medium' | 'high';

export type StressLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface StressDisplay {
  compact: string;
  outOf100: string;
  label: string;
  level: StressLevel | null;
  tone: 'success' | 'neutral' | 'warning' | 'critical' | 'muted';
  isMissing: boolean;
}

const round0 = (value: number) => Math.round(value);

/** Classify 0–100 stress score into level bands. */
export function getStressLevel(score: number | null | undefined): StressLevel | null {
  if (score == null || Number.isNaN(score)) return null;
  if (score <= 25) return 'low';
  if (score <= 50) return 'moderate';
  if (score <= 75) return 'high';
  return 'critical';
}

/** German UI label for stress level. */
export function getStressLabel(
  scoreOrLevel: number | StressLevel | null | undefined,
  hasEnoughData: boolean = true,
): string {
  if (!hasEnoughData) return 'Keine ausreichende Datenbasis';
  const level =
    typeof scoreOrLevel === 'string'
      ? scoreOrLevel
      : getStressLevel(scoreOrLevel);
  if (level == null) return 'Nicht verfügbar';
  switch (level) {
    case 'low':
      return 'Niedrig';
    case 'moderate':
      return 'Moderat';
    case 'high':
      return 'Hoch';
    case 'critical':
      return 'Kritisch';
    default:
      return 'Nicht verfügbar';
  }
}

export function getStressTone(level: StressLevel | null): StressDisplay['tone'] {
  switch (level) {
    case 'low':
      return 'success';
    case 'moderate':
      return 'neutral';
    case 'high':
      return 'warning';
    case 'critical':
      return 'critical';
    default:
      return 'muted';
  }
}

export function getStressDescription(level: StressLevel | null): string {
  switch (level) {
    case 'low':
      return 'Geringe Belastung von Reifen, Bremsen und Antrieb.';
    case 'moderate':
      return 'Moderate Fahrzeugbelastung — Verschleiß im normalen Rahmen.';
    case 'high':
      return 'Hohe Belastung — erhöhter Verschleiß auf Reifen und Bremsen möglich.';
    case 'critical':
      return 'Kritische Belastung — Fahrzeug stark beansprucht.';
    default:
      return 'Fahrbelastungs-Score für diese Fahrt nicht verfügbar.';
  }
}

/** Resolve canonical stress score from API record (legacy fallbacks only). */
export function resolveDrivingStressScore(
  record:
    | {
        drivingStressScore?: number | null;
        /** @deprecated legacy alias */
        drivingStyleScore?: number | null;
        /** @deprecated legacy mirror */
        drivingScore?: number | null;
      }
    | null
    | undefined,
): number | null {
  if (!record) return null;
  if (typeof record.drivingStressScore === 'number') return record.drivingStressScore;
  if (typeof record.drivingStyleScore === 'number') return record.drivingStyleScore;
  if (typeof record.drivingScore === 'number') return record.drivingScore;
  return null;
}

export function formatStressScore(
  score: number | null | undefined,
  options: { hasEnoughData?: boolean; level?: StressLevel | null } = {},
): StressDisplay {
  const enough = options.hasEnoughData ?? true;
  const level = options.level ?? getStressLevel(score);
  if (score == null || !enough) {
    return {
      compact: SCORE_EM_DASH,
      outOf100: SCORE_EM_DASH,
      label: getStressLabel(score, enough),
      level: null,
      tone: 'muted',
      isMissing: true,
    };
  }
  const compact = String(round0(score));
  return {
    compact,
    outOf100: `${compact} / 100`,
    label: getStressLabel(level),
    level,
    tone: getStressTone(level),
    isMissing: false,
  };
}

export function getDataConfidenceLabel(confidence: DataConfidence | undefined): string {
  switch (confidence) {
    case 'high':
      return 'Hohe Datenqualität';
    case 'medium':
      return 'Mittlere Datenqualität';
    case 'low':
      return 'Geringe Datenqualität';
    case 'none':
    default:
      return 'Keine ausreichende Datenbasis';
  }
}

export const STRESS_TOOLTIPS = {
  vehicleStress: {
    de: 'Technische Fahrzeugbelastung aus Telemetrie (Beschleunigung, Bremsen, Stop-and-Go, Geschwindigkeit). Hohe Werte bedeuten hohe Belastung — keine Bewertung des Fahrers. Speeding/Compliance wird im Rental-Kontext nicht bewertet.',
    en: 'Technical vehicle load from telemetry. Higher values mean more stress on tires and brakes — not a driver morality score. Speed-limit compliance is not evaluated in Rental.',
  },
} as const;

/** Map stress tone to StatusChip tone. */
export function stressToneToStatusTone(
  tone: StressDisplay['tone'],
): 'success' | 'neutral' | 'warning' | 'critical' | 'info' {
  if (tone === 'success') return 'success';
  if (tone === 'warning') return 'warning';
  if (tone === 'critical') return 'critical';
  if (tone === 'neutral') return 'info';
  return 'neutral';
}

/** @deprecated Use formatStressScore — old positive driving-style semantics removed. */
export function formatDrivingStyleScore(
  score: number | null | undefined,
  options: { hasEnoughData?: boolean } = {},
): StressDisplay {
  return formatStressScore(score, options);
}

/** @deprecated Safety score retired from Rental UI. */
export function formatSafetyScore(
  _score: number | null | undefined,
): StressDisplay {
  return {
    compact: SCORE_EM_DASH,
    outOf100: SCORE_EM_DASH,
    label: 'Nicht verfügbar',
    level: null,
    tone: 'muted',
    isMissing: true,
  };
}

/** @deprecated */
export function getDrivingStyleLabel(
  score: number | null | undefined,
  hasEnoughData: boolean = true,
): string {
  return getStressLabel(score, hasEnoughData);
}

/** @deprecated */
export function getSafetyLabel(): string {
  return 'Nicht verfügbar';
}

/** @deprecated */
export const SCORE_TOOLTIPS = {
  drivingStyle: STRESS_TOOLTIPS.vehicleStress,
  safety: STRESS_TOOLTIPS.vehicleStress,
} as const;
