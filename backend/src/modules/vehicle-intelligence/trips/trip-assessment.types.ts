import type { StressLevel } from '../driving-impact/stress-level.util';

export const TRIP_ASSESSMENT_VERSION = '1.0.0';

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
  drivingStressScore: number | null;
  drivingStressLevel: StressLevel | null;
  misuseCaseCount: number;
  hasEnoughData: boolean;
  distanceKm: number | null;
  durationMinutes: number | null;
  nativeEventCount: number;
  reconstructedEventCount: number;
}

export interface TripAssessmentSignals {
  behaviorEvents: number;
  abuseRelevantEvents: number;
  misuseCases: number;
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
