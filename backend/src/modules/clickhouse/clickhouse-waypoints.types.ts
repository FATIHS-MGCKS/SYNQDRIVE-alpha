export type WaypointQuality = 'normalized' | 'downsampled' | 'sparse';

export interface TelemetryWaypointRow {
  orgId: string;
  vehicleId: string;
  tokenId: number;
  source: string;
  provider: string;
  tripId: string;
  bookingId?: string | null;
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKmh?: number | null;
  odometerKm?: number | null;
  quality: WaypointQuality;
}
