export type ActivityWindowType =
  | 'trip_summary'
  | 'ignition_on'
  | 'moving'
  | 'idle'
  | 'parked';

export type ActivityWindowConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type ActivityEvidenceSource =
  | 'telemetry_state_changes'
  | 'telemetry_snapshots'
  | 'combined'
  | 'unknown';

export interface TripActivityWindowRow {
  orgId: string;
  vehicleId: string;
  tripId: string;
  bookingId?: string | null;
  activityType: ActivityWindowType;
  windowStart: Date;
  windowEnd: Date;
  pointCount: number;
  maxSpeedKmh?: number | null;
  odometerDeltaKm?: number | null;
  hasActivity: boolean;
  confidence: ActivityWindowConfidence;
  evidenceSource: ActivityEvidenceSource;
}
