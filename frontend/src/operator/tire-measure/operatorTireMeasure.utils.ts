import type {
  OperatorTireContextForm,
  OperatorTireMeasureStep,
  OperatorTirePlausibilityWarning,
  OperatorTireTreadForm,
} from './operatorTireMeasure.types';

/** Matches backend `TireHealthMeasurementDto` / `AddTireMeasurementDto` tread bounds. */
export const TREAD_MIN_MM = 0;
export const TREAD_MAX_MM = 20;
export const LEGAL_MIN_MM = 1.6;
export const WARN_LOW_MM = 2.5;
export const WARN_HIGH_MM = 10;
export const AXLE_DIFF_WARN_MM = 2;

export const SEASON_LABELS: Record<string, string> = {
  SUMMER: 'Sommerreifen',
  WINTER: 'Winterreifen',
  ALL_SEASON: 'Ganzjahresreifen',
  TRACK: 'Track',
  OTHER: 'Sonstiges',
  UNKNOWN: 'Unbekannt',
};

export function parseTreadMm(value: string): number | undefined {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export function formatTreadInput(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value);
}

export function deriveTirePlausibilityWarnings(form: OperatorTireTreadForm): OperatorTirePlausibilityWarning[] {
  const warnings: OperatorTirePlausibilityWarning[] = [];
  const fl = parseTreadMm(form.fl);
  const fr = parseTreadMm(form.fr);
  const rl = parseTreadMm(form.rl);
  const rr = parseTreadMm(form.rr);

  const checkWheel = (mm: number | undefined, label: string, id: string) => {
    if (mm == null) return;
    if (mm < TREAD_MIN_MM || mm > TREAD_MAX_MM) {
      warnings.push({ id: `${id}-range`, message: `${label}: Wert außerhalb ${TREAD_MIN_MM}–${TREAD_MAX_MM} mm.` });
    } else if (mm <= LEGAL_MIN_MM) {
      warnings.push({ id: `${id}-legal`, message: `${label}: Nahe gesetzlicher Mindestprofiltiefe (${mm} mm).` });
    } else if (mm <= WARN_LOW_MM) {
      warnings.push({ id: `${id}-low`, message: `${label}: Profil sehr niedrig (${mm} mm).` });
    } else if (mm >= WARN_HIGH_MM) {
      warnings.push({ id: `${id}-high`, message: `${label}: Ungewöhnlich hoher Wert (${mm} mm) — bitte prüfen.` });
    }
  };

  checkWheel(fl, 'VL', 'fl');
  checkWheel(fr, 'VR', 'fr');
  checkWheel(rl, 'HL', 'rl');
  checkWheel(rr, 'HR', 'rr');

  const frontDiff =
    fl != null && fr != null ? Math.abs(fl - fr) : null;
  const rearDiff =
    rl != null && rr != null ? Math.abs(rl - rr) : null;
  if (frontDiff != null && frontDiff >= AXLE_DIFF_WARN_MM) {
    warnings.push({
      id: 'front-axle-diff',
      message: `Vorderachse: Unterschied VL/VR auffällig (${frontDiff.toFixed(1)} mm).`,
    });
  }
  if (rearDiff != null && rearDiff >= AXLE_DIFF_WARN_MM) {
    warnings.push({
      id: 'rear-axle-diff',
      message: `Hinterachse: Unterschied HL/HR auffällig (${rearDiff.toFixed(1)} mm).`,
    });
  }

  return warnings;
}

export function validateTireMeasureStep(
  step: OperatorTireMeasureStep,
  tread: OperatorTireTreadForm,
  context: OperatorTireContextForm,
): string | null {
  if (step === 'tread') {
    const hasAny = [tread.fl, tread.fr, tread.rl, tread.rr].some((v) => v.trim());
    if (!hasAny) return 'Mindestens eine Profiltiefe eingeben.';
  }
  if (step === 'context') {
    if (context.measuredAt) {
      const d = new Date(context.measuredAt);
      if (Number.isNaN(d.getTime())) return 'Messdatum ungültig.';
    }
    if (context.odometerKm.trim()) {
      const odo = parseFloat(context.odometerKm.replace(',', '.'));
      if (!Number.isFinite(odo) || odo < 0) return 'Kilometerstand ungültig.';
    }
  }
  return null;
}

export function extractTreadFromAiReviewFields(
  fields: Array<{ key: string; value: string }>,
): OperatorTireTreadForm {
  const read = (key: string) => fields.find((f) => f.key === key)?.value?.trim() ?? '';
  return {
    fl: read('treadDepthMm.fl'),
    fr: read('treadDepthMm.fr'),
    rl: read('treadDepthMm.rl'),
    rr: read('treadDepthMm.rr'),
  };
}

export function defaultMeasuredAtLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
