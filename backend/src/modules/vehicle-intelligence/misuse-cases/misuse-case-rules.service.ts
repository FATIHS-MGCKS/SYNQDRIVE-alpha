import { Injectable } from '@nestjs/common';
import {
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import type { TripBehaviorEvent, DrivingEvent } from '@prisma/client';
import type {
  CaseCandidate,
  EvidenceCandidate,
  TripEvaluationContext,
} from './misuse-case.types';
import { maxConfidence, maxSeverity } from './misuse-case.types';
import { evaluateContextAnchors } from './context-misuse-rules';
import { enrichCaseWithEvidence } from '../trips/trip-evidence-case.builder';
import { evaluateCanonicalDamageIncidents } from '../damage-incidents/damage-incident-canonical';
import { resolveAttribution } from './misuse-case.types';

const MS_15_MIN = 15 * 60 * 1000;
const MS_30_MIN = 30 * 60 * 1000;
const MS_24_H = 24 * 60 * 60 * 1000;

@Injectable()
export class MisuseCaseRulesService {
  evaluate(context: TripEvaluationContext): CaseCandidate[] {
    const candidates: CaseCandidate[] = [];
    const abuse = context.behaviorEvents.filter((e) => e.eventCategory === 'ABUSE');

    const notableAcceleration = this.ruleNotableAccelerationPattern(context);
    if (notableAcceleration) candidates.push(notableAcceleration);

    const aggressive = this.ruleAggressiveDriving(context, abuse);
    if (aggressive) candidates.push(aggressive);

    const coldEngine = this.ruleColdEngineAbuse(abuse);
    if (coldEngine) candidates.push(coldEngine);

    const revIdle = this.ruleRepeatedEngineRevInIdle(abuse);
    if (revIdle) candidates.push(revIdle);

    const launch = this.ruleLaunchAbuse(abuse);
    if (launch) candidates.push(launch);

    const brake = this.ruleBrakeAbuse(context, abuse);
    if (brake) candidates.push(brake);

    const attribution = resolveAttribution(context.trip);
    candidates.push(...evaluateCanonicalDamageIncidents(context, attribution));

    const overheat = this.ruleOverheating(abuse);
    if (overheat) candidates.push(overheat);

    const dtcAfter = this.ruleDtcAfterAbuseOrImpact(context, abuse);
    if (dtcAfter) candidates.push(dtcAfter);

    // Context-derived candidates (LTE_R1/ICE native event context assessments).
    // Merged by type with behavior-event candidates above.
    candidates.push(...evaluateContextAnchors(context.contextAnchors ?? []));

    return this.mergeSameType(candidates).map((candidate) => enrichCaseWithEvidence(candidate));
  }

  /**
   * Two or more native hard accelerations without further abuse signals —
   * review hint only, never automatic misuse accusation.
   */
  private ruleNotableAccelerationPattern(
    context: TripEvaluationContext,
  ): CaseCandidate | null {
    const harshAccel = context.drivingEvents.filter(
      (e) => e.eventType === 'HARSH_ACCELERATION',
    );
    if (harshAccel.length < 2) return null;

    const hasStrongerAbuse =
      context.behaviorEvents.some((e) => e.eventCategory === 'ABUSE') ||
      context.drivingEvents.some((e) => e.eventType === 'EXTREME_BRAKING');
    if (hasStrongerAbuse) return null;

    const evidence: EvidenceCandidate[] = harshAccel
      .slice(0, 5)
      .map((e) => this.drivingEvidence(e));
    const times = evidence.map((e) => e.occurredAt.getTime());

    return {
      type: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
      category: MisuseCaseCategory.USAGE_ANOMALY,
      severity: MisuseCaseSeverity.WARNING,
      confidence: MisuseCaseConfidence.MEDIUM,
      title: 'Auffälliges Beschleunigungsmuster',
      description: 'Prüfung empfohlen — kein automatisierter Vorwurf.',
      recommendedAction: 'Fahrmuster im Trip-Kontext prüfen.',
      evidence,
      eventCount: harshAccel.length,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
    };
  }

  /**
   * Merge candidates that share the same MisuseCaseType into one — combine
   * evidence (deduped), take the strongest severity/confidence, widen the time
   * window, and shallow-merge the structured evidence summary. Behavior-event
   * rules emit at most one candidate per type, so this only ever folds a
   * context-derived candidate into a behavior-derived one (or vice versa).
   */
  private mergeSameType(candidates: CaseCandidate[]): CaseCandidate[] {
    const byType = new Map<MisuseCaseType, CaseCandidate>();
    for (const c of candidates) {
      const existing = byType.get(c.type);
      if (!existing) {
        byType.set(c.type, { ...c, evidence: [...c.evidence] });
        continue;
      }
      existing.severity = maxSeverity(existing.severity, c.severity);
      existing.confidence = maxConfidence(existing.confidence, c.confidence);
      existing.evidence = this.dedupeEvidence([...existing.evidence, ...c.evidence]);
      existing.eventCount = Math.max(existing.eventCount, c.eventCount);
      existing.firstDetectedAt = new Date(
        Math.min(existing.firstDetectedAt.getTime(), c.firstDetectedAt.getTime()),
      );
      existing.lastDetectedAt = new Date(
        Math.max(existing.lastDetectedAt.getTime(), c.lastDetectedAt.getTime()),
      );
      if (c.evidenceSummary || existing.evidenceSummary) {
        existing.evidenceSummary = {
          ...(existing.evidenceSummary ?? {}),
          ...(c.evidenceSummary ?? {}),
        };
      }
    }
    return [...byType.values()];
  }

  private dedupeEvidence(evidence: EvidenceCandidate[]): EvidenceCandidate[] {
    const seen = new Set<string>();
    const out: EvidenceCandidate[] = [];
    for (const e of evidence) {
      const key = `${e.sourceType}:${e.sourceId ?? ''}:${e.eventType}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }

  private maxEventsInSlidingWindow(times: Date[], windowMs: number): number {
    if (times.length === 0) return 0;
    const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
    let max = 0;
    for (let i = 0; i < sorted.length; i++) {
      let count = 0;
      for (let j = i; j < sorted.length; j++) {
        if (sorted[j].getTime() - sorted[i].getTime() <= windowMs) count++;
        else break;
      }
      max = Math.max(max, count);
    }
    return max;
  }

  private ruleAggressiveDriving(
    context: TripEvaluationContext,
    abuse: TripBehaviorEvent[],
  ): CaseCandidate | null {
    const harshDriving = context.drivingEvents.filter((e) =>
      ['HARSH_ACCELERATION', 'HARSH_BRAKING', 'EXTREME_BRAKING', 'HARSH_CORNERING'].includes(
        e.eventType,
      ),
    );

    const kickdowns = abuse.filter((e) => e.eventType === 'KICKDOWN');
    const launches = abuse.filter((e) => e.eventType === 'LAUNCH_LIKE_START');

    const aggressiveMoments = [
      ...kickdowns.map((e) => e.startedAt),
      ...launches.map((e) => e.startedAt),
      ...harshDriving.map((e) => e.recordedAt),
    ];
    const aggressiveCount = this.maxEventsInSlidingWindow(aggressiveMoments, MS_30_MIN);

    const hasCombo =
      kickdowns.length >= 1 &&
      (harshDriving.some((e) => e.eventType === 'HARSH_ACCELERATION') ||
        launches.length >= 1);

    if (aggressiveCount < 5 && !hasCombo) return null;

    const evidence: EvidenceCandidate[] = [
      ...kickdowns.slice(0, 5).map((e) => this.behaviorEvidence(e)),
      ...launches.slice(0, 3).map((e) => this.behaviorEvidence(e)),
      ...harshDriving.slice(0, 5).map((e) => this.drivingEvidence(e)),
    ];

    const times = evidence.map((e) => e.occurredAt.getTime());
    return {
      type: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
      category: MisuseCaseCategory.USAGE_ANOMALY,
      severity: aggressiveCount >= 8 ? MisuseCaseSeverity.SEVERE : MisuseCaseSeverity.WARNING,
      confidence: hasCombo ? MisuseCaseConfidence.HIGH : MisuseCaseConfidence.MEDIUM,
      title: 'Auffälliges Fahrmuster',
      description:
        `${aggressiveCount} aggressive Fahrereignisse innerhalb von 30 Minuten wurden zusammengefasst. ` +
        'Prüfung empfohlen — kein automatisierter Vorwurf.',
      recommendedAction: 'Fahrmuster im Trip-Kontext prüfen und ggf. mit Kunde besprechen.',
      evidence,
      eventCount: aggressiveCount,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
    };
  }

  private ruleColdEngineAbuse(abuse: TripBehaviorEvent[]): CaseCandidate | null {
    const coldEvents = abuse.filter(
      (e) =>
        e.eventType === 'COLD_ENGINE_HIGH_RPM' ||
        e.eventType === 'COLD_ENGINE_FULL_THROTTLE',
    );
    if (coldEvents.length === 0) return null;

    const hasSevere = coldEvents.some(
      (e) => e.classification === 'SEVERE' || e.classification === 'CRITICAL',
    );
    if (!hasSevere && coldEvents.length < 2) return null;

    const evidence = coldEvents.map((e) => this.behaviorEvidence(e));
    const times = evidence.map((e) => e.occurredAt.getTime());

    return {
      type: MisuseCaseType.COLD_ENGINE_ABUSE,
      category: MisuseCaseCategory.MISUSE_SUSPICION,
      severity: hasSevere ? MisuseCaseSeverity.SEVERE : MisuseCaseSeverity.WARNING,
      confidence: hasSevere ? MisuseCaseConfidence.HIGH : MisuseCaseConfidence.MEDIUM,
      title: 'Auffälliges Fahrmuster',
      description:
        'Auffällige Last auf kalten Motor erkannt. Prüfung empfohlen — kein automatisierter Vorwurf.',
      recommendedAction: 'Motor-Schonphase und Fahrweise prüfen.',
      evidence,
      eventCount: coldEvents.length,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
    };
  }

  private ruleRepeatedEngineRevInIdle(abuse: TripBehaviorEvent[]): CaseCandidate | null {
    const revEvents = abuse.filter((e) => e.eventType === 'ENGINE_REV_IN_IDLE');
    if (revEvents.length === 0) return null;

    const longEvent = revEvents.find((e) => (e.durationMs ?? 0) >= 8000);
    const maxCluster = this.maxEventsInSlidingWindow(
      revEvents.map((e) => e.startedAt),
      MS_15_MIN,
    );
    if (!longEvent && maxCluster < 3) return null;

    const evidence = revEvents.map((e) => this.behaviorEvidence(e));
    const times = evidence.map((e) => e.occurredAt.getTime());

    return {
      type: MisuseCaseType.REPEATED_ENGINE_REV_IN_IDLE,
      category: MisuseCaseCategory.MISUSE_SUSPICION,
      severity: longEvent ? MisuseCaseSeverity.SEVERE : MisuseCaseSeverity.WARNING,
      confidence: revEvents.length >= 3 ? MisuseCaseConfidence.HIGH : MisuseCaseConfidence.MEDIUM,
      title: 'Wiederholtes Hochdrehen im Stand',
      description:
        'Mehrfaches oder ausgeprägtes Hochdrehen bei stehendem Fahrzeug erkannt.',
      recommendedAction: 'Standgasmuster prüfen.',
      evidence,
      eventCount: revEvents.length,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
    };
  }

  private ruleLaunchAbuse(abuse: TripBehaviorEvent[]): CaseCandidate | null {
    const launches = abuse.filter((e) => e.eventType === 'LAUNCH_LIKE_START');
    if (launches.length === 0) return null;

    const strong = launches.find(
      (e) => e.classification === 'SEVERE' || e.classification === 'CRITICAL',
    );
    if (!strong && launches.length < 2) return null;

    const evidence = launches.map((e) => this.behaviorEvidence(e));
    const times = evidence.map((e) => e.occurredAt.getTime());

    return {
      type: MisuseCaseType.LAUNCH_ABUSE_PATTERN,
      category: MisuseCaseCategory.MISUSE_SUSPICION,
      severity:
        launches.length >= 2 || strong
          ? MisuseCaseSeverity.SEVERE
          : MisuseCaseSeverity.WARNING,
      confidence: strong ? MisuseCaseConfidence.HIGH : MisuseCaseConfidence.MEDIUM,
      title: 'Launch-ähnliches Beschleunigungsmuster',
      description:
        'Heftiger Beschleunigungsstart vom Stand erkannt (heuristisch, kein OEM-Nachweis).',
      recommendedAction: 'Fahrzeug und Reifen auf Folgeschäden prüfen.',
      evidence,
      eventCount: launches.length,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
    };
  }

  private ruleBrakeAbuse(
    context: TripEvaluationContext,
    abuse: TripBehaviorEvent[],
  ): CaseCandidate | null {
    const fullBraking = abuse.filter((e) => e.eventType === 'FULL_BRAKING');
    const extremeDriving = context.drivingEvents.filter(
      (e) => e.eventType === 'EXTREME_BRAKING',
    );
    const harshBraking = context.drivingEvents.filter(
      (e) => e.eventType === 'HARSH_BRAKING',
    );

    const clusterCount = fullBraking.length + extremeDriving.length;
    if (clusterCount < 2 && harshBraking.length < 4) return null;

    const evidence: EvidenceCandidate[] = [
      ...fullBraking.map((e) => this.behaviorEvidence(e)),
      ...extremeDriving.map((e) => this.drivingEvidence(e)),
      ...harshBraking.slice(0, 4).map((e) => this.drivingEvidence(e)),
    ];
    const times = evidence.map((e) => e.occurredAt.getTime());

    return {
      type: MisuseCaseType.BRAKE_ABUSE_PATTERN,
      category:
        clusterCount >= 3
          ? MisuseCaseCategory.MISUSE_SUSPICION
          : MisuseCaseCategory.USAGE_ANOMALY,
      severity: clusterCount >= 3 ? MisuseCaseSeverity.SEVERE : MisuseCaseSeverity.WARNING,
      confidence: clusterCount >= 2 ? MisuseCaseConfidence.HIGH : MisuseCaseConfidence.MEDIUM,
      title: 'Auffälliges Bremsverhalten',
      description: 'Cluster aus Vollbremsungen oder wiederholtem harten Bremsen erkannt.',
      recommendedAction: 'Bremsverhalten und Bremsenverschleiß prüfen.',
      evidence,
      eventCount: evidence.length,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
    };
  }

  private ruleOverheating(abuse: TripBehaviorEvent[]): CaseCandidate | null {
    const overheat = abuse.filter((e) => e.eventType === 'OVERHEATING_ENGINE');
    if (overheat.length === 0) return null;

    const evidence = overheat.map((e) => this.behaviorEvidence(e));
    const times = evidence.map((e) => e.occurredAt.getTime());

    return {
      type: MisuseCaseType.OVERHEATING_DAMAGE_RISK,
      category: MisuseCaseCategory.TECHNICAL_RISK,
      severity: MisuseCaseSeverity.SEVERE,
      confidence: MisuseCaseConfidence.HIGH,
      title: 'Schadenverdacht',
      description:
        'Motorüberhitzung während der Fahrt erkannt. Technisches Risiko — Prüfung empfohlen.',
      recommendedAction: 'Kühlung und Motorzustand prüfen.',
      evidence,
      eventCount: overheat.length,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
    };
  }

  private ruleDtcAfterAbuseOrImpact(
    context: TripEvaluationContext,
    abuse: TripBehaviorEvent[],
  ): CaseCandidate | null {
    if (!context.trip.endTime || context.dtcEvents.length === 0) return null;

    const triggerTypes = new Set([
      'POSSIBLE_IMPACT',
      'OVERHEATING_ENGINE',
      'COLD_ENGINE_FULL_THROTTLE',
      'FULL_BRAKING',
    ]);
    const triggers = abuse.filter((e) => triggerTypes.has(e.eventType));
    if (triggers.length === 0) return null;

    const lastTrigger = triggers.reduce((a, b) =>
      a.startedAt > b.startedAt ? a : b,
    );
    const windowEnd = new Date(context.trip.endTime.getTime() + MS_24_H);

    const dtcsAfter = context.dtcEvents.filter(
      (d) =>
        d.firstSeenAt >= lastTrigger.startedAt && d.firstSeenAt <= windowEnd,
    );
    if (dtcsAfter.length === 0) return null;

    const evidence: EvidenceCandidate[] = [
      this.behaviorEvidence(lastTrigger),
      ...dtcsAfter.map((d) => ({
        sourceType: MisuseEvidenceSourceType.DTC,
        sourceId: d.id,
        eventType: d.dtcCode,
        severity: MisuseCaseSeverity.WARNING,
        confidence: MisuseCaseConfidence.MEDIUM,
        occurredAt: d.firstSeenAt,
        snapshotJson: { description: d.description, isActive: d.isActive },
      })),
    ];
    const times = evidence.map((e) => e.occurredAt.getTime());

    return {
      type: MisuseCaseType.DTC_AFTER_ABUSE_OR_IMPACT,
      category: MisuseCaseCategory.DAMAGE_SUSPICION,
      severity: MisuseCaseSeverity.WARNING,
      confidence: MisuseCaseConfidence.MEDIUM,
      title: 'Fehlercode nach Auffälligkeit',
      description:
        'Nach einer vorherigen Auffälligkeit wurden neue Fehlercodes registriert. Kein Schuld-Nachweis.',
      recommendedAction: 'DTC-Diagnose und Fahrzeuginspektion empfohlen.',
      evidence,
      eventCount: dtcsAfter.length,
      firstDetectedAt: new Date(Math.min(...times)),
      lastDetectedAt: new Date(Math.max(...times)),
    };
  }

  private behaviorEvidence(e: TripBehaviorEvent): EvidenceCandidate {
    return {
      sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
      sourceId: e.id,
      eventType: e.eventType,
      occurredAt: e.startedAt,
      snapshotJson: {
        classification: e.classification,
        durationMs: e.durationMs,
        peakValue: e.peakValue,
      },
    };
  }

  private drivingEvidence(e: DrivingEvent): EvidenceCandidate {
    return {
      sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
      sourceId: e.id,
      eventType: e.eventType,
      occurredAt: e.recordedAt,
      snapshotJson: { severity: e.severity, speedKmh: e.speedKmh },
    };
  }
}
