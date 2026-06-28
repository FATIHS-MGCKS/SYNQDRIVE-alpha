/**
 * SynqDrive — LTE_R1 Event Context UI helpers (Phase 6)
 *
 * Pure, presentation-only helpers that translate the backend EventContextAssessment
 * (per native event) into honest German UI copy.
 *
 * GUARDRAILS:
 *   - No detection here. These helpers only LABEL data the backend already produced.
 *   - "Unauffällig" must never be shown when context/data quality is insufficient —
 *     `deriveTripAssessability` enforces that distinction.
 */

import type { TripBehaviorEvent, TripEventContextAssessment } from '../../../lib/api';

// ── Classification → German label ────────────────────────────────────────────

export const CONTEXT_CLASSIFICATION_LABEL: Record<string, string> = {
  AGGRESSIVE_START: 'Aggressiver Start',
  LAUNCH_LIKE_START: 'Launch-like Start',
  KICKDOWN_LIKELY: 'Kickdown wahrscheinlich',
  FULL_THROTTLE_LIKELY: 'Volllast wahrscheinlich',
  OVERTAKING_LIKELY: 'Überholvorgang wahrscheinlich',
  COLD_ENGINE_ACCELERATION: 'Kaltmotorbelastung',
  COLD_ENGINE_KICKDOWN: 'Kaltmotor-Kickdown',
  COLD_ENGINE_HIGH_RPM: 'Kaltmotor: hohe Drehzahl',
  EMERGENCY_LIKE_BRAKING: 'Notbremsung-ähnlich',
  REV_IN_IDLE_CANDIDATE: 'Hochdrehen im Stand (Verdacht)',
  REV_IN_IDLE_CONFIRMED: 'Hochdrehen im Stand bestätigt',
  HIGH_RPM_CONSTANT: 'Dauerhaft hohe Drehzahl',
  HIGH_RPM_SPIKE: 'Drehzahlspitze',
  OVERHEATING_RISK: 'Überhitzungsrisiko',
  INSUFFICIENT_CONTEXT: 'Kontext nicht ausreichend',
};

export const CONTEXT_CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: 'hohe Sicherheit',
  MEDIUM: 'mittlere Sicherheit',
  LOW: 'geringe Sicherheit',
  INSUFFICIENT: 'nicht bewertbar',
};

export const EVIDENCE_GRADE_LABEL: Record<string, string> = {
  A: 'Beweisstufe A — stark',
  B: 'Beweisstufe B — belastbar',
  C: 'Beweisstufe C — schwach',
  D: 'Beweisstufe D — unzureichend',
};

const REASON_CODE_LABEL: Record<string, string> = {
  HIGH_RPM: 'Hohe Drehzahl',
  HIGH_THROTTLE: 'Hohe Gaspedalstellung',
  HIGH_ENGINE_LOAD: 'Hohe Motorlast',
  COLD_COOLANT: 'Niedrige Kühlmitteltemperatur',
  HIGH_COOLANT: 'Hohe Kühlmitteltemperatur',
  NEAR_STANDSTILL: 'Nahezu Stillstand',
  LOW_PRE_SPEED: 'Niedrige Anfangsgeschwindigkeit',
  RPM_WEBHOOK_ANCHOR: 'Historischer RPM-Webhook-Anker (deprecated)',
  SPARSE_SIGNALS: 'Sparse Signaldaten',
  MISSING_ENGINE_SIGNALS: 'Fehlende Motorsignale',
  NOT_APPLICABLE_POWERTRAIN: 'Antrieb nicht zutreffend (Tesla/EV)',
  ENGINE_OFF: 'Motor vermutlich aus',
};

export function contextClassificationLabel(code: string): string {
  return CONTEXT_CLASSIFICATION_LABEL[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

export function reasonCodeLabel(code: string): string {
  return REASON_CODE_LABEL[code] ?? code.replace(/_/g, ' ').toLowerCase();
}

export function confidenceLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return CONTEXT_CONFIDENCE_LABEL[code] ?? code.toLowerCase();
}

export function evidenceGradeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return EVIDENCE_GRADE_LABEL[code] ?? `Beweisstufe ${code}`;
}

// ── Assessment helpers ───────────────────────────────────────────────────────

export function isContextInsufficient(
  ca: TripEventContextAssessment | null | undefined,
): boolean {
  if (!ca) return false;
  return ca.status === 'INSUFFICIENT_CONTEXT' || ca.confidence === 'INSUFFICIENT';
}

/** First meaningful (non-INSUFFICIENT_CONTEXT) classification, if any. */
export function primaryContextClassification(
  ca: TripEventContextAssessment | null | undefined,
): string | null {
  if (!ca || !Array.isArray(ca.preliminaryClassifications)) return null;
  return (
    ca.preliminaryClassifications.find((c) => c !== 'INSUFFICIENT_CONTEXT') ?? null
  );
}

/**
 * Human-readable context suffix for an event title, e.g.:
 *   "Kontext: Kickdown wahrscheinlich"
 *   "Kontext nicht ausreichend bewertbar"
 * Returns null when there is no context assessment at all (non-LTE_R1/ICE events).
 */
export function contextSummarySuffix(
  ca: TripEventContextAssessment | null | undefined,
): string | null {
  if (!ca) return null;
  if (ca.status === 'SKIPPED_NOT_APPLICABLE') return null;
  if (isContextInsufficient(ca)) return 'Kontext nicht ausreichend bewertbar';
  const primary = primaryContextClassification(ca);
  if (!primary) return null;
  return `Kontext: ${contextClassificationLabel(primary)}`;
}

// ── Trip-level assessability ("belastbar" vs "unauffällig") ───────────────────

export type TripAssessabilitySource =
  | 'NATIVE_EVENTS'
  | 'HF_SUFFICIENT'
  | 'INSUFFICIENT_DATA'
  | 'NOT_RUN';

export interface TripAssessabilityInput {
  enrichmentStatus?: string | null;
  detailsLimited?: boolean;
  behaviorReady?: boolean;
  hasNativeEvents: boolean;
}

export interface TripAssessability {
  /** True when the trip can be HONESTLY summarised as unremarkable when clean. */
  assessable: boolean;
  source: TripAssessabilitySource;
  /** Short German note explaining the data-quality basis. */
  note: string;
}

/**
 * Decides whether a trip with no notable events may be called "Unauffällig".
 *
 * Assessable when a reliable event source exists:
 *   - native DIMO behavior events are present (authoritative LTE_R1 source), OR
 *   - HF enrichment completed with sufficient (non-limited) data quality.
 *
 * Otherwise the trip is "nicht belastbar bewertet" — we must NOT claim it is clean.
 */
export function deriveTripAssessability(
  input: TripAssessabilityInput,
): TripAssessability {
  if (input.hasNativeEvents) {
    return {
      assessable: true,
      source: 'NATIVE_EVENTS',
      note: 'Native DIMO-Ereignisquelle verfügbar.',
    };
  }
  const status = input.enrichmentStatus ?? null;
  if (status === 'COMPLETED' && !input.detailsLimited) {
    return {
      assessable: true,
      source: 'HF_SUFFICIENT',
      note: 'Trip-Signalanalyse mit ausreichender Datenqualität abgeschlossen.',
    };
  }
  if (
    status === 'SKIPPED_NO_HF_DATA' ||
    status === 'FAILED_TRANSIENT' ||
    status === 'FAILED_PERMANENT' ||
    status == null
  ) {
    return {
      assessable: false,
      source: 'NOT_RUN',
      note: 'Keine ausreichende Datenqualität für Kurzzeit-Misuse — Analyse nicht belastbar.',
    };
  }
  return {
    assessable: false,
    source: 'INSUFFICIENT_DATA',
    note: 'Keine ausreichende Datenqualität für Kurzzeit-Misuse.',
  };
}

/** Whether any native DIMO behavior events are present in the unified list. */
export function hasNativeBehaviorEvents(events: TripBehaviorEvent[]): boolean {
  return events.some((e) => e.provenance === 'NATIVE' || e.source === 'DRIVING_EVENT');
}

// ── Key value extraction for the event timeline ──────────────────────────────

export interface ContextKeyValue {
  label: string;
  value: string;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Pulls the most relevant engine/context key values out of a context assessment
 * for compact display. Only returns values that are actually present.
 */
export function contextKeyValues(
  ca: TripEventContextAssessment | null | undefined,
): ContextKeyValue[] {
  if (!ca) return [];
  const out: ContextKeyValue[] = [];
  const speed = ca.speedContext;
  if (speed) {
    const pre = num(speed.valueBeforeAnchor);
    const post = num(speed.valueAfterAnchor);
    const max = num(speed.max);
    if (pre != null || post != null) {
      out.push({
        label: 'Speed (vor→nach)',
        value: `${pre != null ? Math.round(pre) : '—'} → ${post != null ? Math.round(post) : '—'} km/h`,
      });
    } else if (max != null) {
      out.push({ label: 'Max Speed', value: `${Math.round(max)} km/h` });
    }
  }
  const rpm = num(ca.rpmContext?.max);
  if (rpm != null) out.push({ label: 'Max Drehzahl', value: `${Math.round(rpm)} rpm` });
  const throttle = num(ca.throttleContext?.max);
  if (throttle != null) out.push({ label: 'Max Gaspedal', value: `${Math.round(throttle)} %` });
  const load = num(ca.engineLoadContext?.max);
  if (load != null) out.push({ label: 'Max Motorlast', value: `${Math.round(load)} %` });
  const coolant = num(ca.coolantContext?.max) ?? num(ca.coolantContext?.min);
  if (coolant != null) out.push({ label: 'Kühlmittel', value: `${Math.round(coolant)} °C` });
  return out;
}
