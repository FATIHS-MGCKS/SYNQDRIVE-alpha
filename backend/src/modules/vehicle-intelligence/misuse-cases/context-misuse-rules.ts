/**
 * SynqDrive — Context-derived Misuse Rules (LTE_R1 / ICE) — Phase 5
 *
 * Pure functions that turn Event Context Assessments (anchored on native DIMO
 * behavior events or RPM webhook candidates) into MisuseCase candidates.
 *
 * Guardrails (do NOT relax):
 *   - A candidate/assessment alone is never automatically misuse.
 *   - Only COMPLETED assessments with engine signals applicable are considered;
 *     EV/Tesla (engineSignalsApplicable=false) and INSUFFICIENT_CONTEXT never
 *     produce ICE misuse cases.
 *   - Evidence grade gating: only grade A/B feed hard misuse. Grade C is shown in
 *     the event/trip detail but never creates a case; grade D never either.
 *   - Conservative classification → severity mapping; no false positives.
 *
 * These candidates are merged by type with the existing behavior-event rules in
 * MisuseCaseRulesService, so native events + RPM candidates in the same window
 * collapse into one combined case (no duplicates).
 */
import {
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import {
  COLD_COOLANT_C,
  STANDSTILL_KMH,
} from '../event-context/event-context-stats';
import type {
  ContextClassification,
  EvidenceGrade,
} from '../event-context/event-context.types';
import type { EventContextAssessment } from '../event-context/event-context-assessment.types';
import type {
  CaseCandidate,
  ContextAnchor,
  EvidenceCandidate,
} from './misuse-case.types';

/** Coolant temperature (°C) above which an overheating context is plausible. */
const OVERHEAT_COOLANT_C = 110;
/** Minimum window samples for a HIGH_RPM_CONSTANT to count as "sustained". */
const SUSTAINED_SAMPLE_MIN = 5;
/** Launch needs near-standstill before the anchor. */
const LAUNCH_PRE_SPEED_MAX = 5;

const GRADE_RANK: Record<EvidenceGrade, number> = { A: 3, B: 2, C: 1, D: 0 };

function gradeAtLeast(grade: EvidenceGrade, min: EvidenceGrade): boolean {
  return GRADE_RANK[grade] >= GRADE_RANK[min];
}

function bestGrade(anchors: ContextAnchor[]): EvidenceGrade {
  return anchors.reduce<EvidenceGrade>(
    (acc, a) =>
      GRADE_RANK[a.assessment.evidenceGrade] > GRADE_RANK[acc]
        ? a.assessment.evidenceGrade
        : acc,
    'D',
  );
}

function hasClass(a: ContextAnchor, c: ContextClassification): boolean {
  return a.assessment.preliminaryClassifications.includes(c);
}

function highEngine(a: ContextAnchor): boolean {
  const rc = a.assessment.reasonCodes;
  return (
    rc.includes('HIGH_RPM') ||
    rc.includes('HIGH_THROTTLE') ||
    rc.includes('HIGH_ENGINE_LOAD')
  );
}

function coolantAtAnchor(a: ContextAnchor): number | null {
  return a.assessment.coolantContext.nearestValueToAnchor;
}

function coolantLow(a: ContextAnchor): boolean {
  const c = coolantAtAnchor(a);
  return c != null && c < COLD_COOLANT_C;
}

function preSpeed(a: ContextAnchor): number | null {
  return (
    a.assessment.speedContext.valueBeforeAnchor ??
    a.assessment.speedContext.nearestValueToAnchor
  );
}

function nearStandstill(a: ContextAnchor, maxKmh: number): boolean {
  const s =
    a.assessment.speedContext.nearestValueToAnchor ??
    a.assessment.speedContext.valueBeforeAnchor;
  return s != null && s <= maxKmh;
}

function num(...values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  return present.length ? present.reduce((a, b) => Math.max(a, b)) : null;
}

/** Map context confidence + evidence grade → persisted MisuseCaseConfidence. */
function toMisuseConfidence(
  conf: EventContextAssessment['confidence'],
  grade: EvidenceGrade,
  repeated: number,
): MisuseCaseConfidence {
  if (repeated >= 2) return MisuseCaseConfidence.HIGH;
  if (grade === 'A' && conf === 'HIGH') return MisuseCaseConfidence.HIGH;
  if (conf === 'HIGH' || conf === 'MEDIUM') return MisuseCaseConfidence.MEDIUM;
  return MisuseCaseConfidence.LOW;
}

function bestContextConfidence(
  anchors: ContextAnchor[],
): EventContextAssessment['confidence'] {
  const order = { HIGH: 3, MEDIUM: 2, LOW: 1, INSUFFICIENT: 0 } as const;
  return anchors.reduce<EventContextAssessment['confidence']>(
    (acc, a) => (order[a.assessment.confidence] > order[acc] ? a.assessment.confidence : acc),
    'INSUFFICIENT',
  );
}

function anchorEvidence(a: ContextAnchor): EvidenceCandidate {
  const cls = a.assessment.preliminaryClassifications.filter(
    (c) => c !== 'INSUFFICIENT_CONTEXT',
  );
  return {
    sourceType: MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
    sourceId: a.anchorId,
    eventType: cls[0] ?? a.assessment.anchorType,
    occurredAt: a.occurredAt,
    snapshotJson: {
      anchorSource: a.source,
      anchorType: a.assessment.anchorType,
      classifications: cls,
      evidenceGrade: a.assessment.evidenceGrade,
      confidence: a.assessment.confidence,
      reasonCodes: a.assessment.reasonCodes,
      windowStart: a.assessment.windowStart,
      windowEnd: a.assessment.windowEnd,
      keyValues: {
        maxRpm: a.assessment.rpmContext.max,
        maxThrottle: a.assessment.throttleContext.max,
        maxEngineLoad: a.assessment.engineLoadContext.max,
        coolantAtEvent: coolantAtAnchor(a),
        coolantMin: a.assessment.coolantContext.min,
        coolantMax: a.assessment.coolantContext.max,
        preSpeed: a.assessment.speedContext.valueBeforeAnchor,
        postSpeed: a.assessment.speedContext.valueAfterAnchor,
      },
    },
  };
}

/** Build the structured evidence payload merged into MisuseCase.evidenceSummary. */
function buildEvidenceSummary(
  anchors: ContextAnchor[],
  classifications: ContextClassification[],
): Record<string, unknown> {
  const drivingEventIds = anchors
    .filter((a) => a.source === 'DRIVING_EVENT')
    .map((a) => a.anchorId);

  const usedSignals = new Set<string>();
  const missingSignals = new Set<string>();
  const reasonCodes = new Set<string>();
  for (const a of anchors) {
    for (const cov of a.assessment.signalCoverage) {
      if (cov.quality === 'GOOD' || cov.quality === 'SPARSE') usedSignals.add(cov.signal);
      if (cov.quality === 'MISSING') missingSignals.add(cov.signal);
    }
    for (const rc of a.assessment.reasonCodes) reasonCodes.add(rc);
  }

  const windowStart = anchors
    .map((a) => a.assessment.windowStart)
    .sort()[0];
  const windowEnd = anchors
    .map((a) => a.assessment.windowEnd)
    .sort()
    .slice(-1)[0];

  const grade = bestGrade(anchors);
  const confidence = bestContextConfidence(anchors);

  return {
    contextEvidence: {
      sourceAnchors: { drivingEventIds },
      contextClassifications: [...new Set(classifications)],
      evidenceGrade: grade,
      confidence,
      usedSignals: [...usedSignals],
      missingSignals: [...missingSignals],
      reasonCodes: [...reasonCodes],
      windowStart: windowStart ?? null,
      windowEnd: windowEnd ?? null,
      keyValues: {
        maxRpm: num(...anchors.map((a) => a.assessment.rpmContext.max)),
        maxThrottle: num(...anchors.map((a) => a.assessment.throttleContext.max)),
        maxEngineLoad: num(...anchors.map((a) => a.assessment.engineLoadContext.max)),
        coolantAtEvent: coolantAtAnchor(anchors[0]),
        coolantMin: anchors
          .map((a) => a.assessment.coolantContext.min)
          .filter((v): v is number => v != null)
          .reduce<number | null>((acc, v) => (acc == null ? v : Math.min(acc, v)), null),
        coolantMax: num(...anchors.map((a) => a.assessment.coolantContext.max)),
        preSpeed: anchors[0]?.assessment.speedContext.valueBeforeAnchor ?? null,
        postSpeed: anchors[0]?.assessment.speedContext.valueAfterAnchor ?? null,
      },
      dataQuality: {
        sampleCount: anchors.reduce((s, a) => s + a.assessment.dataQuality.sampleCount, 0),
        medianIntervalMs: num(
          ...anchors.map((a) => a.assessment.dataQuality.medianIntervalMs),
        ),
        p95IntervalMs: num(...anchors.map((a) => a.assessment.dataQuality.p95IntervalMs)),
        maxGapMs: num(...anchors.map((a) => a.assessment.dataQuality.maxGapMs)),
      },
    },
  };
}

function timeBounds(anchors: ContextAnchor[]): { first: Date; last: Date } {
  const times = anchors.map((a) => a.occurredAt.getTime());
  return { first: new Date(Math.min(...times)), last: new Date(Math.max(...times)) };
}

function buildCandidate(
  anchors: ContextAnchor[],
  classifications: ContextClassification[],
  base: {
    type: MisuseCaseType;
    category: MisuseCaseCategory;
    severity: MisuseCaseSeverity;
    title: string;
    description: string;
    recommendedAction: string;
  },
): CaseCandidate {
  const { first, last } = timeBounds(anchors);
  const grade = bestGrade(anchors);
  const conf = toMisuseConfidence(bestContextConfidence(anchors), grade, anchors.length);
  return {
    type: base.type,
    category: base.category,
    severity: base.severity,
    confidence: conf,
    title: base.title,
    description: base.description,
    recommendedAction: base.recommendedAction,
    evidence: anchors.map((a) => anchorEvidence(a)),
    eventCount: anchors.length,
    firstDetectedAt: first,
    lastDetectedAt: last,
    evidenceSummary: buildEvidenceSummary(anchors, classifications),
  };
}

/**
 * Evaluate context anchors into MisuseCase candidates. Returns 0..n candidates;
 * the caller merges them (by type) with behavior-event candidates.
 */
export function evaluateContextAnchors(anchors: ContextAnchor[]): CaseCandidate[] {
  // Only trustworthy, engine-applicable, sufficiently graded windows feed misuse.
  const usable = anchors.filter(
    (a) =>
      a.assessment?.status === 'COMPLETED' &&
      a.assessment.engineSignalsApplicable === true &&
      !hasClass(a, 'INSUFFICIENT_CONTEXT') &&
      gradeAtLeast(a.assessment.evidenceGrade, 'B'),
  );
  if (usable.length === 0) return [];

  const out: CaseCandidate[] = [];

  // ── Cold Engine Abuse ──────────────────────────────────────────────────────
  const coldClasses: ContextClassification[] = [
    'COLD_ENGINE_ACCELERATION',
    'COLD_ENGINE_KICKDOWN',
    'COLD_ENGINE_HIGH_RPM',
  ];
  const coldAnchors = usable.filter(
    (a) => coldClasses.some((c) => hasClass(a, c)) && coolantLow(a) && highEngine(a),
  );
  if (coldAnchors.length > 0) {
    const severe =
      coldAnchors.length >= 2 ||
      coldAnchors.some(
        (a) => a.assessment.evidenceGrade === 'A' || hasClass(a, 'COLD_ENGINE_KICKDOWN'),
      );
    out.push(
      buildCandidate(
        coldAnchors,
        coldClasses,
        {
          type: MisuseCaseType.COLD_ENGINE_ABUSE,
          category: MisuseCaseCategory.MISUSE_SUSPICION,
          severity: severe ? MisuseCaseSeverity.SEVERE : MisuseCaseSeverity.WARNING,
          title: 'Kaltmotor-Missbrauch erkannt',
          description:
            'Hohe Motorlast bei kaltem Motor im Ereigniskontext belegt (Kühlmittel niedrig, hohe Drehzahl/Last). Hinweis zur Prüfung, kein automatisierter Vorwurf.',
          recommendedAction: 'Motor-Schonphase und Fahrweise prüfen.',
        },
      ),
    );
  }

  // ── Launch Abuse Pattern ───────────────────────────────────────────────────
  const launchAnchors = usable.filter(
    (a) =>
      hasClass(a, 'LAUNCH_LIKE_START') &&
      (preSpeed(a) ?? 999) <= LAUNCH_PRE_SPEED_MAX &&
      highEngine(a),
  );
  if (launchAnchors.length > 0) {
    const severe =
      launchAnchors.length >= 2 ||
      launchAnchors.some((a) => a.assessment.evidenceGrade === 'A');
    out.push(
      buildCandidate(launchAnchors, ['LAUNCH_LIKE_START'], {
        type: MisuseCaseType.LAUNCH_ABUSE_PATTERN,
        category: MisuseCaseCategory.MISUSE_SUSPICION,
        severity: severe ? MisuseCaseSeverity.SEVERE : MisuseCaseSeverity.WARNING,
        title: 'Launch-ähnliches Beschleunigungsmuster',
        description:
          'Heftiger Beschleunigungsstart aus dem Stand im Ereigniskontext belegt (Stillstand vor dem Ereignis, hohe Drehzahl/Last).',
        recommendedAction: 'Fahrzeug und Reifen auf Folgeschäden prüfen.',
      }),
    );
  }

  // ── Aggressive Driving (aggressive start, repeated kickdown, high-rpm const) ─
  const aggStart = usable.filter((a) => hasClass(a, 'AGGRESSIVE_START'));
  const kickdown = usable.filter(
    (a) => hasClass(a, 'KICKDOWN_LIKELY') || hasClass(a, 'FULL_THROTTLE_LIKELY'),
  );
  const highRpmConst = usable.filter(
    (a) =>
      hasClass(a, 'HIGH_RPM_CONSTANT') &&
      a.assessment.dataQuality.sampleCount >= SUSTAINED_SAMPLE_MIN,
  );
  // Warm single kickdown is behavior context only — needs a repeated pattern.
  const kickdownRepeated = kickdown.length >= 2 ? kickdown : [];
  const aggressiveAnchors = [
    ...new Set([...aggStart, ...kickdownRepeated, ...highRpmConst]),
  ];
  if (aggressiveAnchors.length > 0) {
    const classes: ContextClassification[] = [
      'AGGRESSIVE_START',
      'KICKDOWN_LIKELY',
      'FULL_THROTTLE_LIKELY',
      'HIGH_RPM_CONSTANT',
    ];
    const strong = aggressiveAnchors.length >= 3 || kickdownRepeated.length >= 2;
    out.push(
      buildCandidate(aggressiveAnchors, classes, {
        type: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
        category: strong
          ? MisuseCaseCategory.MISUSE_SUSPICION
          : MisuseCaseCategory.USAGE_ANOMALY,
        severity: strong ? MisuseCaseSeverity.SEVERE : MisuseCaseSeverity.WARNING,
        title: 'Aggressives Fahrmuster (Ereigniskontext)',
        description:
          'Aggressive Beschleunigungs-/Drehzahlmuster im Ereigniskontext belegt. Hinweis zur Prüfung, kein automatisierter Vorwurf.',
        recommendedAction: 'Fahrmuster im Trip-Kontext prüfen und ggf. mit Kunde besprechen.',
      }),
    );
  }


  // ── Overheating Risk ───────────────────────────────────────────────────────
  const overheatAnchors = usable.filter(
    (a) =>
      hasClass(a, 'OVERHEATING_RISK') &&
      (a.assessment.coolantContext.max ?? 0) >= OVERHEAT_COOLANT_C &&
      highEngine(a),
  );
  if (overheatAnchors.length > 0) {
    out.push(
      buildCandidate(overheatAnchors, ['OVERHEATING_RISK'], {
        type: MisuseCaseType.OVERHEATING_DAMAGE_RISK,
        category: MisuseCaseCategory.TECHNICAL_RISK,
        severity: MisuseCaseSeverity.SEVERE,
        title: 'Überhitzungsrisiko (Ereigniskontext)',
        description:
          'Hohe Kühlmitteltemperatur unter Last im Ereigniskontext belegt. Technisches Risiko, Prüfung empfohlen.',
        recommendedAction: 'Kühlung und Motorzustand prüfen.',
      }),
    );
  }

  return out;
}
