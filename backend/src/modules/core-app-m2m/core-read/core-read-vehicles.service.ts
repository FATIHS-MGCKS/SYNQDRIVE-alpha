import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductVehicleAccessService } from '@modules/products/product-vehicle-access/product-vehicle-access.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { CoreAppM2mAuthorizedResourceContext } from '../core-app-m2m-resource-authorization.service';
import {
  CORE_READ_VEHICLES_LIST_CONTRACT,
  CORE_READ_VEHICLE_DETAIL_CONTRACT,
  CORE_READ_VEHICLES_MAX_PAGE_SIZE,
} from './core-read-vehicles.constants';
import type {
  CoreReadVehicleDetail,
  CoreReadVehicleDetailResponse,
  CoreReadVehicleSummary,
  CoreReadVehiclesListResponse,
} from './core-read-vehicles.types';

const VEHICLE_LIST_SELECT = {
  id: true,
  organizationId: true,
  make: true,
  model: true,
  year: true,
  vehicleName: true,
  licensePlate: true,
  status: true,
  registryLifecycle: true,
} as const;

const VEHICLE_DETAIL_SELECT = {
  ...VEHICLE_LIST_SELECT,
  fuelType: true,
  mileageKm: true,
  vin: true,
} as const;

@Injectable()
export class CoreReadVehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleAccess: ProductVehicleAccessService,
  ) {}

  async listVehicles(
    auth: CoreAppM2mAuthorizedResourceContext,
    pageRaw: number,
    pageSizeRaw: number,
  ): Promise<CoreReadVehiclesListResponse> {
    const page = normalizePage(pageRaw);
    const pageSize = normalizePageSize(pageSizeRaw);
    const where = await this.vehicleAccess.getAuthorizedVehicleWhere(
      auth.organizationId,
      auth.productSlug,
    );

    const [total, rows] = await Promise.all([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        orderBy: [{ id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: VEHICLE_LIST_SELECT,
      }),
    ]);

    return {
      contractVersion: CORE_READ_VEHICLES_LIST_CONTRACT,
      organizationId: auth.organizationId,
      productSlug: auth.productSlug,
      page,
      pageSize,
      total,
      items: rows.map((row) => mapSummary(row)),
    };
  }

  async getVehicle(
    auth: CoreAppM2mAuthorizedResourceContext,
    vehicleId: string,
  ): Promise<CoreReadVehicleDetailResponse> {
    await this.vehicleAccess.assertVehicleAuthorized(
      auth.organizationId,
      vehicleId,
      auth.productSlug,
    );

    const where = await this.vehicleAccess.getAuthorizedVehicleWhere(
      auth.organizationId,
      auth.productSlug,
    );

    const row = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ...where },
      select: VEHICLE_DETAIL_SELECT,
    });

    if (!row || row.organizationId !== auth.organizationId) {
      throw new NotFoundException('Vehicle not found');
    }

    return {
      contractVersion: CORE_READ_VEHICLE_DETAIL_CONTRACT,
      organizationId: auth.organizationId,
      productSlug: auth.productSlug,
      vehicle: mapDetail(row),
    };
  }
}

function normalizePage(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

function normalizePageSize(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 25;
  }
  return Math.min(CORE_READ_VEHICLES_MAX_PAGE_SIZE, Math.floor(value));
}

function mapSummary(row: {
  id: string;
  organizationId: string;
  make: string;
  model: string;
  year: number;
  vehicleName: string | null;
  licensePlate: string | null;
  status: CoreReadVehicleSummary['status'];
  registryLifecycle: CoreReadVehicleSummary['registryLifecycle'];
}): CoreReadVehicleSummary {
  return {
    vehicleId: row.id,
    organizationId: row.organizationId,
    make: row.make,
    model: row.model,
    year: row.year,
    vehicleName: row.vehicleName,
    licensePlate: row.licensePlate,
    status: row.status,
    registryLifecycle: row.registryLifecycle,
  };
}

function mapDetail(row: {
  id: string;
  organizationId: string;
  make: string;
  model: string;
  year: number;
  vehicleName: string | null;
  licensePlate: string | null;
  status: CoreReadVehicleSummary['status'];
  registryLifecycle: CoreReadVehicleSummary['registryLifecycle'];
  fuelType: string;
  mileageKm: number | null;
  vin: string | null;
}): CoreReadVehicleDetail {
  return {
    ...mapSummary(row),
    fuelType: String(row.fuelType),
    mileageKm: row.mileageKm,
    vinLast4: row.vin && row.vin.length >= 4 ? row.vin.slice(-4) : null,
  };
}