export type VehicleDisplayState = 'MOVING' | 'IDLE' | 'PARKED';
export type VehicleOnlineStatus = 'ONLINE' | 'STANDBY' | 'OFFLINE';
export type VehicleDisplayIgnition = 'ON' | 'OFF' | 'UNKNOWN';

export interface VehicleData {
  id: string;
  license: string;
  make?: string;
  model: string;
  year: number;
  station: string;
  fuelType: 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid' | 'PHEV';
  status: 'Available' | 'Active Rented' | 'Reserved' | 'Maintenance';
  cleaningStatus: 'Clean' | 'Needs Cleaning';
  healthStatus: 'Good Health' | 'Warning' | 'Critical';
  online: boolean;
  lastSignal: string;
  badge: number;
  odometer: number;
  fuel: number;
  fuelLevel?: number;
  battery: number;
  speed: number;
  coolant: number;
  brakes: number;
  tires: number;
  engineOil: number;
  isElectric: boolean;
  hvBatteryCapacityKwh: number | null;
  lat?: number;
  lng?: number;
  // Interpreted telemetry (from backend, centralized truth)
  signalAgeMs?: number;
  isFresh?: boolean;
  onlineStatus?: VehicleOnlineStatus;
  displayState?: VehicleDisplayState;
  displayIgnition?: VehicleDisplayIgnition;
  isLiveTracking?: boolean;
  // Fleet-specific
  alert?: string | null;
  driver?: string;
  ert?: string;
  customer?: string;
  pickup?: string;
  reason?: string;
  workshop?: string;
  eta?: string;
  // Documents
  leasingRate: string;
  insuranceCost: string;
  taxCost: string;
  totalMonthlyCost: string;
  /** Vehicle image for fleet lists / maps */
  imageUrl?: string | null;
}

// Simulated data removed - loaded from API via RentalApp
export const fleetVehicles: VehicleData[] = [];

export function getShortModel(model: string): string {
  return model.replace(/ \d{4}$/, '');
}