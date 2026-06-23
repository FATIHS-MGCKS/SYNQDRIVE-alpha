import type { EnergyEvent, TripBehaviorEvent, TripEnrichment } from '../../../lib/api';

export type BehaviorEnrichmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SKIPPED_NO_HF_DATA'
  | 'FAILED_TRANSIENT'
  | 'FAILED_PERMANENT'
  | null;

/** Core trip fields used across timeline and map surfaces. */
export interface TripTimelineTrip {
  id: string;
  vehicleId: string;
  dimoSegmentId?: string;
  tripStatus: 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  endTime?: string | null;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  distanceKm?: number | null;
  durationMinutes?: number;
  avgSpeedKmh?: number;
  maxSpeedKmh?: number;
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  driverName?: string;
  assignmentStatus?:
    | 'ASSIGNED_DRIVER'
    | 'ASSIGNED_BOOKING_CUSTOMER'
    | 'PRIVATE_UNASSIGNED'
    | 'UNKNOWN_ASSIGNMENT'
    | null;
  assignmentSubjectType?: 'DRIVER' | 'BOOKING_CUSTOMER' | null;
  assignmentSubjectId?: string | null;
  assignedBookingId?: string | null;
  isPrivateTrip?: boolean;
  behaviorReady?: boolean;
  behaviorEnrichedAt?: string;
  behaviorEnrichmentStatus?: BehaviorEnrichmentStatus;
  detailsLimited?: boolean;
  gapEnded?: boolean;
  enrichedAt?: string;
  totalAccelerationEvents?: number;
  accelerationEventCount?: number;
  totalBrakingEvents?: number;
  brakingEventCount?: number;
  abuseEvents?: number;
  abuseEventCount?: number;
  harshBrakeCount?: number;
  harshAccelCount?: number;
  harshCornerCount?: number;
  hardBrakingEvents?: number;
  hardBrakingCount?: number;
  citySharePercent?: number;
  highwaySharePercent?: number;
  countrySharePercent?: number;
  avgEngineLoad?: number;
  avgThrottlePosition?: number;
}

/** Full trip record including optional analytics fields from the API. */
export interface TripData extends TripTimelineTrip {
  scoreSource?: 'trip_driving_impact' | 'vehicle_trip_compat' | 'derived';
  fuelUsedLiters?: number;
  avgConsumptionLPer100Km?: number;
  fuelConfidence?: string;
  energyUsedKwh?: number;
  avgConsumptionKwhPer100Km?: number;
  energyConfidence?: string;
  outsideTemperatureStartC?: number;
  engineTempStartC?: number;
  engineTempEndC?: number;
  avgRpm?: number;
  possibleImpactCount?: number;
  kickdownCount?: number;
  coldEngineAbuseCount?: number;
  longIdleCount?: number;
  abuseScore?: number;
  behaviorEnrichmentAttempts?: number;
  drivingImpactComputedAt?: string;
  assignmentSubjectId?: string | null;
  scoreEligible?: boolean;
  events?: unknown[];
  hardAccelerationEvents?: number;
  hardAccelerationCount?: number;
  fullBrakingEvents?: number;
  fullBrakingCount?: number;
  corneringEvents?: number;
}

export interface TripRoutePoint {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  timestamp: string;
}

export type TripTimelineItem =
  | { itemType: 'trip'; id: string; startTime: string; trip: TripTimelineTrip }
  | { itemType: 'energy-event'; id: string; startTime: string; event: EnergyEvent };

export interface TripDaySummary {
  tripCount: number;
  totalKm: number;
  totalMinutes: number;
  notableEvents: number;
  privateCount: number;
}

export interface OperationalChip {
  key: string;
  label: string;
  tone: 'neutral' | 'info' | 'watch' | 'critical' | 'private' | 'success';
}

export interface TripMapActions {
  centerRoute: () => void;
  focusBehaviorEvent: (eventId: string) => void;
}

export interface TripsViewProps {
  isDarkMode: boolean;
  vehicleId?: string;
  selectedDate?: string;
  selectedDriver?: string;
  fuelType?: string;
  onTripsLoaded?: (trips: TripData[]) => void;
  onOpenBooking?: (bookingId: string) => void;
}

export type { EnergyEvent, TripBehaviorEvent, TripEnrichment };
