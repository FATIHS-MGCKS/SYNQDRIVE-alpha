import type { TripBehaviorEvent, TripEnrichment } from '../../../lib/api';

export interface TripMapRoutePoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  timestamp: string;
}

export interface TripMapTripData {
  id: string;
  vehicleId: string;
  tripStatus: 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  endTime?: string | null;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  distanceKm?: number | null;
  durationMinutes?: number;
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  driverName?: string;
  assignmentStatus?: 'ASSIGNED_DRIVER' | 'ASSIGNED_BOOKING_CUSTOMER' | 'PRIVATE_UNASSIGNED' | 'UNKNOWN_ASSIGNMENT' | null;
  assignmentSubjectType?: 'DRIVER' | 'BOOKING_CUSTOMER' | null;
  isPrivateTrip?: boolean;
  behaviorReady?: boolean;
  behaviorEnrichmentStatus?:
    | 'PENDING'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'SKIPPED_NO_HF_DATA'
    | 'FAILED_TRANSIENT'
    | 'FAILED_PERMANENT'
    | null;
  detailsLimited?: boolean;
  gapEnded?: boolean;
  enrichedAt?: string;
  behaviorEnrichedAt?: string;
  totalAccelerationEvents?: number;
  accelerationEventCount?: number;
  totalBrakingEvents?: number;
  brakingEventCount?: number;
  abuseEvents?: number;
  abuseEventCount?: number;
  harshBrakeCount?: number;
  harshAccelCount?: number;
  harshCornerCount?: number;
}

export interface TripMapLayerState {
  showSpeed: boolean;
  showStops: boolean;
  showDrivingEvents: boolean;
  showAbuseEvents: boolean;
  showMatchedRoute: boolean;
}

export interface TripMapQualityFlags {
  routeAvailable: boolean;
  routeIncomplete: boolean;
  mapMatched: boolean;
  mapMatchConfidence: number | null;
  hfAvailable: boolean;
  hfLimited: boolean;
  hfUnavailable: boolean;
  hfAnalyzing: boolean;
  gpsGap: boolean;
  routeUpdatedAt: string | null;
  hasMatchedGeometry: boolean;
}

export interface TripMapPopoverState {
  event: TripBehaviorEvent;
  x: number;
  y: number;
}

export type { TripEnrichment, TripBehaviorEvent };
