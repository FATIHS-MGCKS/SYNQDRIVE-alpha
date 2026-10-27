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
    const needsOdo =
      context.source === 'manual' || context.source === 'workshop';
    if (needsOdo && !context.odometerKm.trim()) {
      return 'Kilometerstand zum Messzeitpunkt ist erforderlich (V3-Nachweis).';
    }
  }
  return null;
}

export function deriveOperatorV3EvidenceWarnings(
  tread: OperatorTireTreadForm,
  context: OperatorTireContextForm,
): OperatorTirePlausibilityWarning[] {
  const warnings: OperatorTirePlausibilityWarning[] = [];

  if (context.source === 'ai_confirmed') {
    warnings.push({
      id: 'v3-ai-source',
      message:
        'AI Upload / Dokument: gespeicherte Werte zählen nicht als Tire-V3-Verifikationsnachweis — Profil manuell messen oder Werkstattquelle wählen.',
    });
  }

  const groundTruthSource = context.source === 'manual' || context.source === 'workshop';
  if (!groundTruthSource) {
    return warnings;
  }

  const odoTrim = context.odometerKm.trim();
  if (!odoTrim) {
    warnings.push({
      id: 'v3-odo-missing',
      message:
        'Ohne Kilometerstand am Messzeitpunkt bleibt Tire-V3-Verifikation und Kalibrierung unzureichend (V2-Speicherung bleibt möglich).',
    });
    return warnings;
  }

  const explicit =
    context.source === 'workshop' ||
    (context.source === 'manual' && context.confirmOdometerKm);
  if (!explicit) {
    warnings.push({
      id: 'v3-odo-unconfirmed',
      message:
        'Kilometerstand noch nicht bestätigt — für V3 wird kein expliziter Odometer-Nachweis gespeichert (Telemetrie wird nicht still übernommen).',
    });
  }

  const hasAnyTread = [tread.fl, tread.fr, tread.rl, tread.rr].some((v) => v.trim());
  if (!hasAnyTread) {
    warnings.push({
      id: 'v3-no-tread',
      message: 'Mindestens ein Radprofil ist für V3-Verifikation erforderlich.',
    });
  }

  return warnings;
}

export function resolveOperatorOdometerSourceLabel(
  context: OperatorTireContextForm,
  fleetHintKm: number | null,
): string {
  if (context.source === 'workshop') {
    return 'Werkstattbericht (explizit)';
  }
  if (context.confirmOdometerKm && context.odometerKm.trim()) {
    return 'Manuell bestätigt am Messzeitpunkt';
  }
  if (context.odometerKm.trim() && fleetHintKm != null) {
    const entered = parseFloat(context.odometerKm.replace(',', '.'));
    if (Number.isFinite(entered) && Math.round(entered) === Math.round(fleetHintKm)) {
      return 'Vorausgefüllt aus Fahrzeugdaten — bitte bestätigen';
    }
  }
  if (context.odometerKm.trim()) {
    return 'Eingabe ohne Bestätigung';
  }
  return 'Kein Kilometerstand';
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
