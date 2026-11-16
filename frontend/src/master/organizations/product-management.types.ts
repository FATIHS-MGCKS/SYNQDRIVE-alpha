export type AdminCatalogProductRow = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  catalogStatus: string;
  organizationsCount?: number;
};

export type AdminOrgProductAssignment = {
  id: string;
  name: string;
  productSlug: string;
  status: string;
  plan: string;
  vehicleAccessMode: 'ORGANIZATION_WIDE' | 'SELECTED_VEHICLES' | string;
};

export type VehicleProductGrantRow = {
  vehicleId: string;
  productSlug: string;
  status: string;
  grantVersion: number;
  grantedAt: string;
  revokedAt: string | null;
};

export type OrgVehicleListRow = {
  id: string;
  vehicleName?: string;
  name?: string;
  licensePlate?: string;
  vin?: string;
};