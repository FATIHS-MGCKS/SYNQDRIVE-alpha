import type { StressLevel } from '../driving-impact/stress-level.util';

import type { TripEvidenceLevel } from './trip-evidence-level.types';

export const TRIP_ASSESSMENT_VERSION = '1.2.0';

export type TripAssessmentStatus =
  | 'UNAUFFAELLIG'
  | 'BEOBACHTEN'
  | 'AUFFAELLIG'
  | 'KRITISCH'
  | 'PRUEFHINWEIS'
  | 'NICHT_BEWERTBAR';

export type TripAssessmentConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type TripAssessmentSource =
  | 'NATIVE_EVENTS'
  | 'HF_RECONSTRUCTED'
  /** @deprecated Vehicle load no longer drives conduct assessment status (v1.2.0). */
  | 'STRESS_ONLY'
  | 'MISUSE_EVIDENCE'
  | 'MIXED'
  | 'NO_DATA';

export interface TripAssessmentEventInput {
  classification: string;
  eventCategory: string;
  eventType: string;
  provenance: 'NATIVE' | 'RECONSTRUCTED';
  abuseRelevant: boolean;
}

export interface TripAssessmentInput {
  unifiedEvents: TripAssessmentEventInput[];
  /** Vehicle load 0–100 (higher = more mechanical stress). Does not imply driver conduct. */
  drivingStressScore: number | null;
  drivingStressLevel: StressLevel | null;
  misuseCaseCount: number;
  maxEvidenceLevel?: TripEvidenceLevel;
  hasEnoughData: boolean;
  distanceKm: number | null;
  durationMinutes: number | null;
  nativeEventCount: number;
  reconstructedEventCount: number;
  deviceQualityDegraded?: boolean;
}

export interface TripAssessmentSignals {
  behaviorEvents: number;
  abuseRelevantEvents: number;
  misuseCases: number;
  maxEvidenceLevel: TripEvidenceLevel | null;
  /** Vehicle load signal — separate from conduct assessment. */
  drivingStressScore: number | null;
  drivingStressLevel: string | null;
  hasEnoughData: boolean;
}

export interface TripAssessment {
  status: TripAssessmentStatus;
  label: string;
  primaryReason: string;
  confidence: TripAssessmentConfidence;
  source: TripAssessmentSource;
  version: string;
  signals: TripAssessmentSignals;
}
