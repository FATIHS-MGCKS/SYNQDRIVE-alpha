export interface VehicleData {
  id: string;
  license: string;
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
  battery: number;
  speed: number;
  coolant: number;
  brakes: number;
  tires: number;
  engineOil: number;
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
}

// Simulated data removed - Master uses API (PlatformVehiclesView)
export const fleetVehicles: VehicleData[] = [];

export function getShortModel(model: string): string {
  return model.replace(/ \d{4}$/, '');
}