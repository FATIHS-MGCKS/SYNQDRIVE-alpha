import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { PaginationParams } from '@shared/utils/pagination';
import {
  Prisma,
  CleaningStatus,
  HealthStatus,
  VehicleStatus,
  VehicleType,
  FuelType,
} from '@prisma/client';

@Controller()
@UseGuards(RolesGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  // ── Admin (platform-wide) ─────────────────────────────────────────

  @Get('admin/vehicles')
  @Roles('MASTER_ADMIN')
  async findAllPlatform(@Query() query: PaginationParams) {
    return this.vehiclesService.findAllPlatform(query);
  }

  @Get('admin/vehicles/:vehicleId')
  @Roles('MASTER_ADMIN')
  async findOneAdmin(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.findById(vehicleId);
  }

  // ── Organizations/:orgId/vehicles (org-scoped CRUD) ───────────────

  @Get('organizations/:orgId/vehicles')
  @UseGuards(OrgScopingGuard)
  async findAllByOrg(
    @Param('orgId') orgId: string,
    @Query() query: PaginationParams,
  ) {
    return this.vehiclesService.findByOrganization(orgId, query);
  }

  @Get('organizations/:orgId/fleet-map')
  @UseGuards(OrgScopingGuard)
  async getFleetMap(@Param('orgId') orgId: string) {
    return this.vehiclesService.getFleetMapData(orgId);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId')
  @UseGuards(OrgScopingGuard)
  async findOneByOrg(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.findOne(orgId, vehicleId);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/telemetry')
  async getVehicleTelemetry(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.getVehicleWithTelemetry(vehicleId, orgId);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/live-gps')
  async getLiveGps(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.getLiveGps(vehicleId, orgId);
  }

  @Post('organizations/:orgId/vehicles')
  @UseGuards(OrgScopingGuard)
  async createByOrg(
    @Param('orgId') orgId: string,
    @Body() body: Omit<Prisma.VehicleCreateInput, 'organization'>,
    @Req() req: any,
  ) {
    return this.vehiclesService.create(orgId, body, req.user?.id);
  }

  @Post('organizations/:orgId/vehicles/register-from-dimo')
  async registerFromDimo(
    @Param('orgId') orgId: string,
    @Body()
    body: {
      dimoVehicleId: string;
      stationId?: string;
      /** Core vehicle fields (Prisma-safe subset + string enums from client) */
      extraData?: Partial<Prisma.VehicleCreateInput> & {
        fuelType?: FuelType | string;
        vehicleType?: VehicleType | string;
      };
      /** Optional manual intelligence rows created after the vehicle */
      manualSpecs?: {
        battery?: {
          batteryType?: string | null;
          batteryAmpere?: number | null;
          batteryVolt?: number | null;
        };
        brakes?: {
          frontRotorDiameter?: number | null;
          frontRotorWidth?: number | null;
          frontPadThickness?: number | null;
          rearRotorDiameter?: number | null;
          rearRotorWidth?: number | null;
          rearPadThickness?: number | null;
        };
        tires?: {
          frontDimension?: string | null;
          rearDimension?: string | null;
          brandModelFront?: string | null;
          brandModelRear?: string | null;
          tireSeason?: string | null;
          initialTreadFrontMm?: number | null;
          initialTreadRearMm?: number | null;
          treadFL?: number | null;
          treadFR?: number | null;
          treadBL?: number | null;
          treadBR?: number | null;
        };
      };
    },
    @Req() req: any,
  ) {
    return this.vehiclesService.registerFromDimo(
      orgId,
      body.stationId ?? null,
      body.dimoVehicleId,
      body.extraData,
      body.manualSpecs,
      req.user?.id ?? null,
    );
  }

  @Patch('organizations/:orgId/vehicles/:vehicleId')
  async updateByOrg(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: Prisma.VehicleUpdateInput,
  ) {
    return this.vehiclesService.update(vehicleId, body, orgId);
  }

  @Put('organizations/:orgId/vehicles/:vehicleId/tires')
  async upsertTireData(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: {
      frontDimension?: string | null;
      rearDimension?: string | null;
      brandModelFront?: string | null;
      brandModelRear?: string | null;
      tireSeason?: string | null;
      loadIndexFront?: string | null;
      speedIndexFront?: string | null;
      loadIndexRear?: string | null;
      speedIndexRear?: string | null;
      dotCodeFront?: string | null;
      dotCodeRear?: string | null;
      tireCondition?: string | null;
      treadFL?: number | null;
      treadFR?: number | null;
      treadBL?: number | null;
      treadBR?: number | null;
    },
  ) {
    return this.vehiclesService.upsertTireData(vehicleId, orgId, body);
  }

  @Patch('organizations/:orgId/vehicles/:vehicleId/status')
  async updateVehicleStatus(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: {
      status?: VehicleStatus;
      cleaningStatus?: CleaningStatus;
      healthStatus?: HealthStatus;
    },
  ) {
    const data: Prisma.VehicleUpdateInput = {};
    if (body.status) data.status = body.status;
    if (body.cleaningStatus) data.cleaningStatus = body.cleaningStatus;
    if (body.healthStatus) data.healthStatus = body.healthStatus;
    return this.vehiclesService.update(vehicleId, data, orgId);
  }

  @Get('organizations/:orgId/fleet-connectivity')
  async getFleetConnectivity(@Param('orgId') orgId: string) {
    return this.vehiclesService.getFleetConnectivity(orgId);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/complaints')
  async listVehicleComplaints(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.listVehicleComplaints(orgId, vehicleId);
  }

  @Post('organizations/:orgId/vehicles/:vehicleId/complaints')
  async createVehicleComplaint(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { description: string; urgency?: string; region?: string | null },
    @Req() req: { user?: { id?: string } },
  ) {
    return this.vehiclesService.createVehicleComplaint(
      orgId,
      vehicleId,
      req.user?.id,
      body,
    );
  }

  @Delete('organizations/:orgId/vehicles/:vehicleId')
  async deleteByOrg(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.delete(vehicleId, orgId);
  }

  @Post('admin/vehicles/:vehicleId/deregister')
  async deregisterVehicle(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.deregister(vehicleId);
  }

  // ── vehicles/:vehicleId (direct access) ───────────────────────────
  //
  // These routes are protected by VehicleOwnershipGuard, which validates that
  // the target vehicle belongs to the requesting user's organization (derived
  // from the JWT). MASTER_ADMIN bypasses the ownership check. The service
  // calls also pass user.organizationId for defense-in-depth where applicable.

  @Get('vehicles/:vehicleId')
  @UseGuards(VehicleOwnershipGuard)
  async findOne(@Param('vehicleId') vehicleId: string) {
    return this.vehiclesService.findById(vehicleId);
  }

  @Patch('vehicles/:vehicleId')
  @UseGuards(VehicleOwnershipGuard)
  async update(
    @Param('vehicleId') vehicleId: string,
    @Body() body: Prisma.VehicleUpdateInput,
    @Req() req: any,
  ) {
    // Service-side defense-in-depth: only allow update when the vehicle
    // belongs to the caller's organization (skipped for MASTER_ADMIN which
    // passes the guard without an organizationId check).
    const orgId: string | undefined =
      req?.user?.platformRole === 'MASTER_ADMIN'
        ? undefined
        : req?.user?.organizationId;
    return this.vehiclesService.update(vehicleId, body, orgId);
  }

  @Delete('vehicles/:vehicleId')
  @UseGuards(VehicleOwnershipGuard)
  async delete(@Param('vehicleId') vehicleId: string, @Req() req: any) {
    const orgId: string | undefined =
      req?.user?.platformRole === 'MASTER_ADMIN'
        ? undefined
        : req?.user?.organizationId;
    return this.vehiclesService.delete(vehicleId, orgId);
  }
}
