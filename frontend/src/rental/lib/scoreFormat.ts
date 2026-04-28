// V4.6.95 — Canonical score visualization helpers.
//
// SynqDrive has exactly TWO public score scalars — `drivingStyleScore` and
// `safetyScore`. Both are 0–100 model scores. They must NOT be rendered as
// percentages or as school grades. Missing data is presented with an em-dash
// and a confidence label, never as a fake 0 or 100.
//
// These helpers are the single rendering source of truth for both scalars
// across `TripsView`, `CustomersView`, `CustomerDetailView`,
// `CustomerDetailModal`, `BookingsView`, `RentalDrivingAnalysisView`, and
// `NewBookingView`.

export const SCORE_EM_DASH = '—';

export type DataConfidence = 'none' | 'low' | 'medium' | 'high';

export interface ScoreDisplay {
  /** Compact numeric label, e.g. "82" or "—". */
  compact: string;
  /** Full "82 / 100" label for surfaces with room. */
  outOf100: string;
  /** Semantic descriptor, e.g. "Smooth" / "Risky" / "Not enough data". */
  label: string;
  /** Tone hint for badge coloring; consumers map to brand classes. */
  tone: 'success' | 'good' | 'neutral' | 'warning' | 'critical' | 'muted';
  /** True when the underlying score was null/undefined. */
  isMissing: boolean;
}

const round0 = (value: number) => Math.round(value);

// ── Driving Style ───────────────────────────────────────────────────────────

export function getDrivingStyleLabel(
  score: number | null | undefined,
  hasEnoughData: boolean = true,
): string {
  if (score == null) return 'Not available';
  if (!hasEnoughData) return 'Not enough data';
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Smooth';
  if (score >= 60) return 'Balanced';
  if (score >= 40) return 'Aggressive';
  return 'Critical';
}

// ── Safety ──────────────────────────────────────────────────────────────────

export function getSafetyLabel(
  score: number | null | undefined,
  hasEnoughData: boolean = true,
): string {
  if (score == null) return 'No speed-limit data';
  if (!hasEnoughData) return 'Not enough data';
  if (score >= 90) return 'Very Safe';
  if (score >= 75) return 'Safe';
  if (score >= 60) return 'Moderate';
  if (score >= 40) return 'Risky';
  return 'Critical';
}

// ── Tone mapping (shared) ───────────────────────────────────────────────────

function toneForScore(score: number): ScoreDisplay['tone'] {
  if (score >= 90) return 'success';
  if (score >= 75) return 'good';
  if (score >= 60) return 'neutral';
  if (score >= 40) return 'warning';
  return 'critical';
}

// ── Display builders ────────────────────────────────────────────────────────

export function formatDrivingStyleScore(
  score: number | null | undefined,
  options: { hasEnoughData?: boolean } = {},
): ScoreDisplay {
  const enough = options.hasEnoughData ?? true;
  if (score == null || !enough) {
    return {
      compact: SCORE_EM_DASH,
      outOf100: SCORE_EM_DASH,
      label: getDrivingStyleLabel(score, enough),
      tone: 'muted',
      isMissing: true,
    };
  }
  const compact = String(round0(score));
  return {
    compact,
    outOf100: `${compact} / 100`,
    label: getDrivingStyleLabel(score, true),
    tone: toneForScore(score),
    isMissing: false,
  };
}

export function formatSafetyScore(
  score: number | null | undefined,
  options: { hasEnoughData?: boolean; hasSpeedingData?: boolean } = {},
): ScoreDisplay {
  const enough = options.hasEnoughData ?? true;
  const speedingDataOk = options.hasSpeedingData ?? score != null;
  if (score == null || !speedingDataOk || !enough) {
    return {
      compact: SCORE_EM_DASH,
      outOf100: SCORE_EM_DASH,
      label: !speedingDataOk
        ? 'No speed-limit data'
        : getSafetyLabel(score, enough),
      tone: 'muted',
      isMissing: true,
    };
  }
  const compact = String(round0(score));
  return {
    compact,
    outOf100: `${compact} / 100`,
    label: getSafetyLabel(score, true),
    tone: toneForScore(score),
    isMissing: false,
  };
}

// ── Data confidence (shared) ────────────────────────────────────────────────

export function getDataConfidenceLabel(confidence: DataConfidence | undefined): string {
  switch (confidence) {
    case 'high': return 'High confidence';
    case 'medium': return 'Medium confidence';
    case 'low': return 'Low confidence';
    case 'none':
    default: return 'Not enough data';
  }
}

// ── Tooltip copy (i18n-friendly; default English with German fallback) ─────

export const SCORE_TOOLTIPS = {
  drivingStyle: {
    en: 'Measures driving behavior that affects vehicle wear, brakes, tires and powertrain stress. Speeding is not included here.',
    de: 'Bewertet das Fahrverhalten in Bezug auf Verschleiß, Bremsen, Reifen und Antriebsbelastung. Geschwindigkeitsüberschreitungen sind hier nicht enthalten.',
  },
  safety: {
    en: 'Measures safety-related speeding behavior based on speed-limit analysis, speeding exposure and overspeed severity.',
    de: 'Bewertet sicherheitsrelevantes Geschwindigkeitsverhalten anhand von Speed-Limit-Analyse, Überschreitungsanteil und Überschreitungsschwere.',
  },
} as const;
