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

  COLD_ENGINE_HIGH_RPM: 'Kaltmotor: hohe Drehzahl (Signal im Kontextfenster)',

  EMERGENCY_LIKE_BRAKING: 'Notbremsung-ähnlich',

  /** Native ±30s context only — NOT a DIMO webhook trigger. */

  REV_IN_IDLE_CANDIDATE: 'Hochdrehen im Stand (Verdacht, Kontext)',

  REV_IN_IDLE_CONFIRMED: 'Hochdrehen im Stand (inaktiv/zukünftig)',

  HIGH_RPM_CONSTANT: 'Dauerhaft hohe Drehzahl (Kontext)',

  HIGH_RPM_SPIKE: 'Drehzahlspitze (Kontext)',

  OVERHEATING_RISK: 'Überhitzungsrisiko',

  INSUFFICIENT_CONTEXT: 'Kontext nicht ausreichend bewertbar',

};



export const CONTEXT_CONFIDENCE_LABEL: Record<string, string> = {

  HIGH: 'hohe Sicherheit',

  MEDIUM: 'mittlere Sicherheit',

  LOW: 'geringe Sicherheit',

  INSUFFICIENT: 'nicht bewertbar',

};



/** Title-case confidence for the prominent context block. */

export const CONTEXT_CONFIDENCE_LABEL_DISPLAY: Record<string, string> = {

  HIGH: 'Hohe Sicherheit',

  MEDIUM: 'Mittlere Sicherheit',

  LOW: 'Geringe Sicherheit',

  INSUFFICIENT: 'Nicht bewertbar',

};



export const EVIDENCE_GRADE_LABEL: Record<string, string> = {

  A: 'Beweisstufe A — stark',

  B: 'Beweisstufe B — belastbar',

  C: 'Beweisstufe C — schwach',

  D: 'Beweisstufe D — unzureichend',

};



const REASON_CODE_LABEL: Record<string, string> = {

  HIGH_RPM: 'Hohe Drehzahl',

  HIGH_RPM_IN_WINDOW: 'Hohe Drehzahl im Kontextfenster',

  HIGH_THROTTLE: 'Hohe Gaspedalstellung',

  HIGH_ENGINE_LOAD: 'Hohe Motorlast',

  COLD_COOLANT: 'Niedrige Kühlmitteltemperatur',

  HIGH_COOLANT: 'Hohe Kühlmitteltemperatur',

  NEAR_STANDSTILL: 'Nahezu Stillstand',

  LOW_PRE_SPEED: 'Niedrige Anfangsgeschwindigkeit',

  SPARSE_SIGNALS: 'Sparse Signaldaten',

  MISSING_ENGINE_SIGNALS: 'Fehlende Motorsignale',

  NOT_APPLICABLE_POWERTRAIN: 'Antrieb nicht zutreffend (Tesla/EV)',

  ENGINE_OFF: 'Motor vermutlich aus',

};



const ENGINE_SIGNAL_LABEL: Record<string, string> = {

  speed: 'Geschwindigkeit',

  rpm: 'Drehzahl',

  throttle: 'Gaspedal',

  engineLoad: 'Motorlast',

  coolant: 'Kühlmittel',

};



export function contextClassificationLabel(code: string): string {

  return CONTEXT_CLASSIFICATION_LABEL[code] ?? code.replace(/_/g, ' ').toLowerCase();

}



export function reasonCodeLabel(code: string): string {

  return REASON_CODE_LABEL[code] ?? code.replace(/_/g, ' ').toLowerCase();

}



export function engineSignalLabel(signal: string): string {

  return ENGINE_SIGNAL_LABEL[signal] ?? signal;

}



export function confidenceLabel(code: string | null | undefined): string {

  if (!code) return '—';

  return CONTEXT_CONFIDENCE_LABEL[code] ?? code.toLowerCase();

}



export function confidenceLabelDisplay(code: string | null | undefined): string {

  if (!code) return '—';

  return CONTEXT_CONFIDENCE_LABEL_DISPLAY[code] ?? code;

}



export function evidenceGradeLabel(code: string | null | undefined): string {

  if (!code) return '—';

  return EVIDENCE_GRADE_LABEL[code] ?? `Beweisstufe ${code}`;

}



export function evidenceGradeShort(code: string | null | undefined): string {

  if (!code) return '—';

  return `Beweisstufe ${code}`;

}



// ── Assessment helpers ───────────────────────────────────────────────────────



export function isContextInsufficient(

  ca: TripEventContextAssessment | null | undefined,

): boolean {

  if (!ca) return false;

  return (

    ca.status === 'INSUFFICIENT_CONTEXT' ||

    ca.confidence === 'INSUFFICIENT' ||

    (Array.isArray(ca.classifications) &&

      ca.classifications.length > 0 &&

      ca.classifications.every((c) => c === 'INSUFFICIENT_CONTEXT'))

  );

}



export function classificationList(

  ca: TripEventContextAssessment | null | undefined,

): string[] {

  if (!ca) return [];

  if (Array.isArray(ca.classifications) && ca.classifications.length > 0) {

    return ca.classifications;

  }

  return ca.preliminaryClassifications ?? [];

}



/** All meaningful context classifications for chip display (one event card). */

export function contextDisplayClassifications(

  ca: TripEventContextAssessment | null | undefined,

): string[] {

  return classificationList(ca).filter((c) => c !== 'INSUFFICIENT_CONTEXT');

}



/** First meaningful (non-INSUFFICIENT_CONTEXT) classification, if any. */

export function primaryContextClassification(

  ca: TripEventContextAssessment | null | undefined,

): string | null {

  if (!ca) return null;

  return classificationList(ca).find((c) => c !== 'INSUFFICIENT_CONTEXT') ?? null;

}



export function shouldRenderContextBlock(

  ca: TripEventContextAssessment | null | undefined,

): boolean {

  if (!ca) return false;

  return ca.status !== 'SKIPPED_NOT_APPLICABLE';

}



/**

 * Primary headline for the context block — classification label or honest insufficient copy.

 */

export function contextHeadline(ca: TripEventContextAssessment | null | undefined): string {

  if (!ca) return '';

  if (isContextInsufficient(ca)) {

    return 'Natives DIMO-Ereignis erkannt, Kontext nicht ausreichend bewertbar';

  }

  const primary = primaryContextClassification(ca);

  if (primary) return contextClassificationLabel(primary);

  if (ca.status === 'FAILED') return 'Kontextbewertung fehlgeschlagen';

  return 'Kontext erfasst';

}



export function contextReasonCodes(

  ca: TripEventContextAssessment | null | undefined,

): string[] {

  if (!ca || !Array.isArray(ca.reasonCodes)) return [];

  return ca.reasonCodes.map(reasonCodeLabel);

}



export function formatMissingSignals(

  ca: TripEventContextAssessment | null | undefined,

): string[] {

  if (!ca) return [];

  const fromTop = Array.isArray(ca.missingSignals) ? ca.missingSignals : [];

  const fromDataQuality = Array.isArray(ca.dataQuality?.missingSignals)

    ? (ca.dataQuality!.missingSignals as string[])

    : [];

  const merged = [...new Set([...fromTop, ...fromDataQuality])];

  return merged.map(engineSignalLabel);

}



function isRecord(value: unknown): value is Record<string, unknown> {

  return value != null && typeof value === 'object' && !Array.isArray(value);

}



/** Notes for signals with sparse coverage in the context window. */

export function contextSparseSignalNotes(

  ca: TripEventContextAssessment | null | undefined,

): string[] {

  if (!ca) return [];

  const notes: string[] = [];



  if (Array.isArray(ca.signalCoverage)) {

    for (const entry of ca.signalCoverage) {

      if (!isRecord(entry)) continue;

      const quality = String(entry.quality ?? '').toUpperCase();

      if (quality === 'SPARSE' || quality === 'POOR') {

        const signal = String(entry.signal ?? 'Signal');

        notes.push(`${engineSignalLabel(signal)} eingeschränkt`);

      }

    }

  }



  const contexts: Array<[string, { coverageQuality?: string } | undefined]> = [

    ['Drehzahl', ca.rpmContext],

    ['Gaspedal', ca.throttleContext],

    ['Motorlast', ca.engineLoadContext],

    ['Kühlmittel', ca.coolantContext],

  ];

  for (const [label, ctx] of contexts) {

    const q = ctx?.coverageQuality?.toUpperCase();

    if (q === 'SPARSE' || q === 'POOR') {

      notes.push(`${label} sparse`);

    }

  }



  return [...new Set(notes)];

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

  if (!shouldRenderContextBlock(ca)) return null;

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

 * for compact display. Prefers backend `keyValues`, then signal stats.

 */

export function contextKeyValues(

  ca: TripEventContextAssessment | null | undefined,

): ContextKeyValue[] {

  if (!ca) return [];

  const out: ContextKeyValue[] = [];



  const kv = ca.keyValues;

  if (kv) {

    const pre = num(kv.preSpeed);

    const post = num(kv.postSpeed);

    const maxSpeed = num(kv.maxSpeed);

    if (pre != null || post != null) {

      out.push({

        label: 'Speed vor/nach',

        value: `${pre != null ? Math.round(pre) : '—'} / ${post != null ? Math.round(post) : '—'} km/h`,

      });

    } else if (maxSpeed != null) {

      out.push({ label: 'Max Speed', value: `${Math.round(maxSpeed)} km/h` });

    }

    const maxRpm = num(kv.maxRpm);

    if (maxRpm != null) out.push({ label: 'Max Drehzahl', value: `${Math.round(maxRpm)} rpm` });

    const maxThrottle = num(kv.maxThrottle);

    if (maxThrottle != null) out.push({ label: 'Max Gaspedal', value: `${Math.round(maxThrottle)} %` });

    const maxLoad = num(kv.maxEngineLoad);

    if (maxLoad != null) out.push({ label: 'Max Motorlast', value: `${Math.round(maxLoad)} %` });

    const coolantAt = num(kv.coolantAtEvent);

    const coolantMin = num(kv.coolantMin);

    const coolantMax = num(kv.coolantMax);

    if (coolantAt != null || coolantMin != null || coolantMax != null) {

      const parts = [

        coolantAt != null ? `${Math.round(coolantAt)} °C am Event` : null,

        coolantMin != null ? `min ${Math.round(coolantMin)} °C` : null,

        coolantMax != null ? `max ${Math.round(coolantMax)} °C` : null,

      ].filter(Boolean);

      out.push({ label: 'Kühlmittel', value: parts.join(' · ') });

    }

    if (out.length > 0) return out;

  }



  const speed = ca.speedContext;

  if (speed) {

    const pre = num(speed.valueBeforeAnchor);

    const post = num(speed.valueAfterAnchor);

    const max = num(speed.max);

    if (pre != null || post != null) {

      out.push({

        label: 'Speed vor/nach',

        value: `${pre != null ? Math.round(pre) : '—'} / ${post != null ? Math.round(post) : '—'} km/h`,

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

  const coolantAt = num(ca.coolantContext?.nearestValueToAnchor);

  const coolantMin = num(ca.coolantContext?.min);

  const coolantMax = num(ca.coolantContext?.max);

  if (coolantAt != null || coolantMin != null || coolantMax != null) {

    const parts = [

      coolantAt != null ? `${Math.round(coolantAt)} °C am Event` : null,

      coolantMin != null ? `min ${Math.round(coolantMin)} °C` : null,

      coolantMax != null ? `max ${Math.round(coolantMax)} °C` : null,

    ].filter(Boolean);

    out.push({ label: 'Kühlmittel', value: parts.join(' · ') });

  }

  return out;

}


