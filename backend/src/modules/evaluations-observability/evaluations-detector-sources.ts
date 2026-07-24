/** Maps insight detector types to coarse data-source buckets (low cardinality). */
export const DETECTOR_DATA_SOURCES: Record<string, string[]> = {
  TIGHT_HANDOVER: ['bookings'],
  RETURN_NEEDS_INSPECTION: ['bookings'],
  STATION_SHORTAGE: ['bookings', 'fleet'],
  LOW_UTILIZATION: ['bookings', 'fleet'],
  SERVICE_WINDOW: ['service'],
  SERVICE_BEFORE_BOOKING: ['bookings', 'service'],
  BATTERY_CRITICAL: ['rental_health', 'telemetry'],
  TIRE_CRITICAL: ['rental_health'],
  BRAKE_CRITICAL: ['rental_health'],
  COMPLIANCE_OPERATIONAL: ['compliance'],
  PICKUP_OVERDUE: ['bookings'],
  DRIVING_ASSESSMENT_DEVICE_QUALITY: ['telemetry'],
};

export function sourcesForDetector(detectorType: string): string[] {
  return DETECTOR_DATA_SOURCES[detectorType] ?? ['unknown'];
}
