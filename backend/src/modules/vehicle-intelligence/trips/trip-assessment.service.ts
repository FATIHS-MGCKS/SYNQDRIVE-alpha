import type { StressLevel } from '../driving-impact/stress-level.util';
import { resolveTripAssessmentReasonCategory } from './trip-assessment-reason-category';
import { tripAssessmentStatusFromEvidenceLevel } from './trip-evidence-case.builder';
import type { TripEvidenceLevel } from './trip-evidence-level.types';
import {
  TRIP_ASSESSMENT_VERSION,
  type TripAssessment,
  type TripAssessmentConfidence,
  type TripAssessmentEventInput,
  type TripAssessmentInput,
  type TripAssessmentReasonCategory,
  type TripAssessmentSource,
  type TripAssessmentStatus,
} from './trip-assessment.types';

const STATUS_LABEL: Record<TripAssessmentStatus, string> = {
  UNAUFFAELLIG: 'Unauffällig',
  BEOBACHTEN: 'Beobachten',
  AUFFAELLIG: 'Auffällig',
  KRITISCH: 'Kritisch',
  PRUEFHINWEIS: 'Prüfhinweis',
  NICHT_BEWERTBAR: 'Nicht bewertbar',
};

const CLASSIFICATION_RANK: Record<string, number> = {
  LIGHT: 1,
  MODERATE: 2,
  WARNING: 3,
  HARD: 4,
  SEVERE: 5,
  EXTREME: 6,
  CRITICAL: 7,
};

const HARD_CLASSIFICATIONS = new Set(['HARD', 'EXTREME', 'SEVERE', 'CRITICAL']);
const VERY_SEVERE_CLASSIFICATIONS = new Set(['EXTREME', 'CRITICAL', 'SEVERE']);

function classificationRank(classification: string): number {
  return CLASSIFICATION_RANK[classification] ?? 0;
}

function isHardEvent(event: TripAssessmentEventInput): boolean {
  return HARD_CLASSIFICATIONS.has(event.classification);
}

function isVerySevereEvent(event: TripAssessmentEventInput): boolean {
  return VERY_SEVERE_CLASSIFICATIONS.has(event.classification);
}

function isDrivingBehaviorEvent(event: TripAssessmentEventInput): boolean {
  return event.eventCategory === 'ACCELERATION' || event.eventCategory === 'BRAKING';
}

function countHardDrivingEvents(events: TripAssessmentEventInput[]): number {
  return events.filter((event) => isDrivingBehaviorEvent(event) && isHardEvent(event)).length;
}

function countAbuseRelevantEvents(events: TripAssessmentEventInput[]): number {
  return events.filter((event) => event.abuseRelevant).length;
}

function hasVerySevereOperationalEvents(events: TripAssessmentEventInput[]): number {
  return events.filter(
    (event) =>
      isVerySevereEvent(event) &&
      !event.abuseRelevant &&
      (isDrivingBehaviorEvent(event) || event.eventCategory === 'ABUSE'),
  ).length;
}

function resolveSource(input: TripAssessmentInput, status: TripAssessmentStatus): TripAssessmentSource {
  if (status === 'NICHT_BEWERTBAR') return 'NO_DATA';

  const abuseRelevant = countAbuseRelevantEvents(input.unifiedEvents);
  const native = input.nativeEventCount;
  const reconstructed = input.reconstructedEventCount;
  const hasMisuse = input.misuseCaseCount > 0;

  const contributors: TripAssessmentSource[] = [];
  if (hasMisuse || (status === 'PRUEFHINWEIS' && abuseRelevant > 0)) {
    contributors.push('MISUSE_EVIDENCE');
  }
  if (native > 0) contributors.push('NATIVE_EVENTS');
  if (reconstructed > 0) contributors.push('HF_RECONSTRUCTED');

  const unique = [...new Set(contributors)];
  if (unique.length === 0) {
    return input.unifiedEvents.length > 0 ? 'MIXED' : 'NO_DATA';
  }
  if (unique.length === 1) return unique[0];
  return 'MIXED';
}

function resolveConfidence(
  input: TripAssessmentInput,
  status: TripAssessmentStatus,
  source: TripAssessmentSource,
): TripAssessmentConfidence {
  if (status === 'NICHT_BEWERTBAR') return 'LOW';
  if (input.deviceQualityDegraded) return 'LOW';
  if (source === 'MISUSE_EVIDENCE' || input.nativeEventCount > 0) return 'HIGH';
  if (source === 'HF_RECONSTRUCTED' && input.hasEnoughData) return 'MEDIUM';
  if (input.hasEnoughData && input.unifiedEvents.length > 0) return 'MEDIUM';
  return 'LOW';
}

function buildPrimaryReason(
  status: TripAssessmentStatus,
  input: TripAssessmentInput,
  hardDrivingCount: number,
  abuseRelevantCount: number,
  reasonCategory: TripAssessmentReasonCategory | null,
): string {
  switch (status) {
    case 'NICHT_BEWERTBAR':
      if (input.drivingStressScore != null && input.unifiedEvents.length === 0) {
        return 'Fahrzeugbelastung erfasst — Fahrverhalten ohne belastbare Ereignisse nicht bewertbar.';
      }
      return 'Für diese Fahrt liegen nicht genug belastbare Verhaltenssignale vor.';
    case 'PRUEFHINWEIS':
      if (reasonCategory === 'DATA_QUALITY_REVIEW') {
        return 'Telematik-Datenqualität eingeschränkt — native Fahrereignisse derzeit unzuverlässig (DIMO: Steckung/Kalibrierung prüfen). Keine Fahrerbewertung.';
      }
      if (reasonCategory === 'ATTRIBUTION_REVIEW') {
        return 'Fahrer- oder Buchungszuordnung unklar — vor Kundenmaßnahmen manuell prüfen. Kein automatisierter Vorwurf.';
      }
      if (reasonCategory === 'VEHICLE_LOAD_REVIEW') {
        return 'Erhöhte Fahrzeugbelastung — technische Fahrzeugprüfung empfohlen. Kein automatisierter Vorwurf.';
      }
      if (reasonCategory === 'DAMAGE_INSPECTION') {
        return 'Technisches Schadensrisiko erkannt — Inspektion empfohlen, kein automatisierter Schadensnachweis.';
      }
      if (reasonCategory === 'MISUSE_REVIEW') {
        if (input.maxEvidenceLevel === 'MISUSE_SUSPECTED') {
          return 'Mehrere belastbare Hinweise auf Fehlgebrauch — Prüfung empfohlen, kein automatisierter Vorwurf.';
        }
        if (input.misuseCaseCount > 0) {
          return 'Missbrauchsverdacht — manuelle Prüfung empfohlen, kein automatisierter Vorwurf.';
        }
        const abuseEvent = input.unifiedEvents.find(
          (event) => event.abuseRelevant && event.eventCategory === 'ABUSE',
        );
        if (abuseEvent) {
          return 'Rekonstruiertes Missbrauchsereignis erkannt — Prüfung empfohlen, kein automatisierter Vorwurf.';
        }
        return 'Missbrauchsverdacht — manuelle Prüfung empfohlen, kein automatisierter Vorwurf.';
      }
      if (reasonCategory === 'DRIVER_CONDUCT_REVIEW') {
        if (abuseRelevantCount === 1) {
          const abuseEvent = input.unifiedEvents.find((event) => event.abuseRelevant);
          if (abuseEvent?.eventType === 'EXTREME_BRAKING') {
            return 'Natives Extrembremsereignis erkannt — Prüfung empfohlen, kein automatisierter Vorwurf.';
          }
        }
        return 'Auffälliges Fahrverhalten erkannt — Prüfung empfohlen, kein automatisierter Fahrervorwurf.';
      }
      return 'Operativer Prüfhinweis — kein automatisierter Vorwurf.';
    case 'KRITISCH':
      return 'Schwerwiegende Fahrereignisse erkannt — operativ kritisch einstufen.';
    case 'AUFFAELLIG': {
      const accelHard = input.unifiedEvents.filter(
        (event) => event.eventCategory === 'ACCELERATION' && isHardEvent(event),
      ).length;
      const brakeHard = input.unifiedEvents.filter(
        (event) => event.eventCategory === 'BRAKING' && isHardEvent(event),
      ).length;
      if (accelHard >= 2 && brakeHard === 0) {
        return `${accelHard} starke Beschleunigungsereignisse erkannt.`;
      }
      if (brakeHard >= 2 && accelHard === 0) {
        return `${brakeHard} starke Bremsereignisse erkannt.`;
      }
      if (hardDrivingCount > 0) {
        return `${hardDrivingCount} auffällige Fahrereignisse erkannt.`;
      }
      return 'Auffällige Fahrweise erkannt.';
    }
    case 'BEOBACHTEN':
      return 'Einzelne moderate Fahrereignisse — Beobachtung empfohlen.';
    case 'UNAUFFAELLIG':
    default:
      return 'Keine relevanten Auffälligkeiten erkannt.';
  }
}

function resolveStatusFromEvidence(
  maxLevel: TripEvidenceLevel | undefined,
): TripAssessmentStatus | null {
  if (!maxLevel || maxLevel === 'NONE' || maxLevel === 'INFO') return null;
  return tripAssessmentStatusFromEvidenceLevel(maxLevel);
}

function resolveStatus(input: TripAssessmentInput): TripAssessmentStatus {
  const events = input.unifiedEvents;
  const abuseRelevantCount = countAbuseRelevantEvents(events);
  const hardDrivingCount = countHardDrivingEvents(events);
  const verySevereCount = hasVerySevereOperationalEvents(events);
  const hasBehaviorEvents = events.length > 0;

  if (
    !input.hasEnoughData &&
    !hasBehaviorEvents &&
    input.nativeEventCount === 0 &&
    input.drivingStressScore == null
  ) {
    return 'NICHT_BEWERTBAR';
  }

  const evidenceStatus = resolveStatusFromEvidence(input.maxEvidenceLevel);
  let status: TripAssessmentStatus;

  if (evidenceStatus === 'KRITISCH') {
    status = 'KRITISCH';
  } else if (evidenceStatus === 'PRUEFHINWEIS') {
    status = 'PRUEFHINWEIS';
  } else if (input.misuseCaseCount > 0 || abuseRelevantCount > 0) {
    status = 'PRUEFHINWEIS';
  } else if (verySevereCount > 0) {
    status = 'KRITISCH';
  } else if (hardDrivingCount >= 2) {
    status = 'AUFFAELLIG';
  } else if (
    hardDrivingCount === 1 ||
    events.some((event) => event.classification === 'MODERATE' || event.classification === 'WARNING')
  ) {
    status = 'BEOBACHTEN';
  } else if (hasBehaviorEvents) {
    status = 'UNAUFFAELLIG';
  } else {
    status = 'NICHT_BEWERTBAR';
  }

  if (
    status === 'NICHT_BEWERTBAR' &&
    !input.deviceQualityDegraded &&
    (input.attributionNeedsReview || input.vehicleLoadNeedsReview)
  ) {
    status = 'PRUEFHINWEIS';
  }

  if (input.deviceQualityDegraded) {
    if (
      status === 'KRITISCH' ||
      status === 'AUFFAELLIG' ||
      status === 'BEOBACHTEN' ||
      (status === 'UNAUFFAELLIG' && input.nativeEventCount > 0)
    ) {
      return 'PRUEFHINWEIS';
    }
  }

  return status;
}

/** Derive whether the trip has enough data for a meaningful assessment. */
export function deriveTripAssessmentHasEnoughData(input: {
  distanceKm: number | null;
  durationMinutes: number | null;
  unifiedEventCount: number;
  nativeEventCount: number;
  drivingStressScore: number | null;
  analysisAssessability?: string | null;
}): boolean {
  if (input.analysisAssessability === 'NOT_ASSESSABLE' && input.unifiedEventCount === 0) {
    return false;
  }
  if (input.unifiedEventCount > 0 || input.nativeEventCount > 0) return true;
  if (input.drivingStressScore != null) return true;

  const distance = input.distanceKm ?? 0;
  const duration = input.durationMinutes ?? 0;
  if (distance >= 0.5 || duration >= 2) return true;

  return false;
}

export function assessTrip(input: TripAssessmentInput): TripAssessment {
  const hardDrivingCount = countHardDrivingEvents(input.unifiedEvents);
  const abuseRelevantCount = countAbuseRelevantEvents(input.unifiedEvents);
  const status = resolveStatus(input);
  const reasonCategory = resolveTripAssessmentReasonCategory(input, status, abuseRelevantCount);
  const source = resolveSource(input, status);
  const confidence = resolveConfidence(input, status, source);

  return {
    status,
    label: STATUS_LABEL[status],
    primaryReason: buildPrimaryReason(
      status,
      input,
      hardDrivingCount,
      abuseRelevantCount,
      reasonCategory,
    ),
    reasonCategory,
    confidence,
    source,
    version: TRIP_ASSESSMENT_VERSION,
    signals: {
      behaviorEvents: input.unifiedEvents.length,
      abuseRelevantEvents: abuseRelevantCount,
      misuseCases: input.misuseCaseCount,
      maxEvidenceLevel: input.maxEvidenceLevel ?? null,
      drivingStressScore: input.drivingStressScore,
      drivingStressLevel: input.drivingStressLevel,
      hasEnoughData: input.hasEnoughData,
    },
  };
}

export function mapUnifiedEventsForAssessment(
  events: Array<{
    classification: string;
    eventCategory: string;
    eventType: string;
    provenance: 'NATIVE' | 'RECONSTRUCTED';
    abuseRelevant: boolean;
  }>,
): TripAssessmentEventInput[] {
  return events.map((event) => ({
    classification: event.classification,
    eventCategory: event.eventCategory,
    eventType: event.eventType,
    provenance: event.provenance,
    abuseRelevant: event.abuseRelevant,
  }));
}
