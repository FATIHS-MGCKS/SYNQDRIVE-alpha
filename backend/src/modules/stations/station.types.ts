import { Prisma, Station, StationStatus, StationType } from '@prisma/client';
import { stationOpeningHoursIsMissing } from '@shared/stations/station-opening-hours.validation';

export type StationRow = Station & { _count?: { vehiclesHome: number } };

export const STATION_STATUS_LABELS: Record<StationStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  ARCHIVED: 'Archived',
};

export const STATION_TYPE_LABELS: Record<StationType, string> = {
  MAIN: 'Main',
  BRANCH: 'Branch',
  PARKING: 'Parking',
  PARTNER: 'Partner',
  TEMPORARY: 'Temporary',
};

export const SELECTABLE_STATION_STATUSES: StationStatus[] = ['ACTIVE'];

export type StationOverviewStatsDto = {
  totalVehicles: number;
  availableVehicles: number;
  bookedVehicles: number;
  inServiceVehicles: number;
  vehiclesWithHealthWarnings: number | null;
  todayPickups: number;
  todayReturns: number;
  upcomingPickups: number;
  upcomingReturns: number;
  openTasks: number;
  capacity: number | null;
  capacityUsagePercent: number | null;
  hasMissingCoordinates: boolean;
  hasMissingOpeningHours: boolean;
  hasMissingPickupReturnRules: boolean;
};

export type StationDocumentInfo = {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  handoverInstructions: string | null;
  returnInstructions: string | null;
};

export function stationToDocumentInfo(station: Station): StationDocumentInfo {
  return {
    id: station.id,
    name: station.name,
    addressLine1: station.address,
    addressLine2: station.addressLine2,
    postalCode: station.postalCode,
    city: station.city,
    country: station.country,
    phone: station.phone,
    email: station.email,
    handoverInstructions: station.handoverInstructions,
    returnInstructions: station.returnInstructions,
  };
}

export function formatStationAddress(station: StationDocumentInfo | Station): string {
  const line1 = 'addressLine1' in station ? station.addressLine1 : station.address;
  const parts = [
    line1,
    'addressLine2' in station ? station.addressLine2 : null,
    [station.postalCode, station.city].filter(Boolean).join(' '),
    station.country,
  ].filter((p) => typeof p === 'string' && p.trim().length > 0);
  return parts.join(', ');
}

export function openingHoursIsMissing(openingHours: Prisma.JsonValue | null | undefined): boolean {
  return stationOpeningHoursIsMissing(openingHours);
}
