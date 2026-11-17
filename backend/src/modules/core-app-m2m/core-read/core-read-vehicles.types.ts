import type { ProductSlug, VehicleRegistryLifecycle, VehicleStatus } from '@prisma/client';

export type CoreReadVehicleSummary = {
  vehicleId: string;
  organizationId: string;
  make: string;
  model: string;
  year: number;
  vehicleName: string | null;
  licensePlate: string | null;
  status: VehicleStatus;
  registryLifecycle: VehicleRegistryLifecycle;
};

export type CoreReadVehicleDetail = CoreReadVehicleSummary & {
  fuelType: string;
  mileageKm: number | null;
  vinLast4: string | null;
};

export type CoreReadVehiclesListResponse = {
  contractVersion: typeof import('./core-read-vehicles.constants').CORE_READ_VEHICLES_LIST_CONTRACT;
  organizationId: string;
  productSlug: ProductSlug;
  page: number;
  pageSize: number;
  total: number;
  items: CoreReadVehicleSummary[];
};

export type CoreReadVehicleDetailResponse = {
  contractVersion: typeof import('./core-read-vehicles.constants').CORE_READ_VEHICLE_DETAIL_CONTRACT;
  organizationId: string;
  productSlug: ProductSlug;
  vehicle: CoreReadVehicleDetail;
};