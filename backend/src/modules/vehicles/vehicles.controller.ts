import {
  BadRequestException,
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
import { Throttle } from '@nestjs/throttler';
import { VehiclesService } from './vehicles.service';
import type { RegistrationBrakeManualSpec } from '@modules/vehicle-intelligence/brakes/register-brake-baseline';
import { VehicleExteriorImagesService } from './vehicle-exterior-images.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
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
import { FleetConnectivityQueryDto } from './dto/fleet-connectivity-query.dto';
import { VehicleCleaningTaskService } from '../tasks/vehicle-cleaning-task.service';
import {
  VehicleDetailAccessAuditAction,
  VehicleDetailAccessAuditService,
} from '@modules/activity-log/vehicle-detail-access-audit.service';

interface VehicleStatusAuthRequest {
  user?: { id?: string };
  requestId?: string;
  ip?: string;
  connection?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  route?: { path?: string };
}

type VehicleExteriorView = 'FRONT' | 'LEFT' | 'RIGHT' | 'REAR' | 'ROOF';

const ALLOWED_EXTERIOR_VIEWS: ReadonlySet<VehicleExteriorView> =
  new Set<VehicleExteriorView>([
    'FRONT' as VehicleExteriorView,
    'LEFT' as VehicleExteriorView,
    'RIGHT' as VehicleExteriorView,
    'REAR' as VehicleExteriorView,
    'ROOF' as VehicleExteriorView,
  ]);

function parseExteriorView(value: string): VehicleExteriorView {
  const upper = (value || '').toUpperCase() as VehicleExteriorView;
  if (!ALLOWED_EXTERIOR_VIEWS.has(upper)) {
    throw new BadRequestException(
      `Unknown exterior view '${value}'. Expected one of FRONT, LEFT, RIGHT, REAR, ROOF.`,
    );
  }
  return upper;
}

@Controller()
@UseGuards(RolesGuard)
export class VehiclesController {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly exteriorImagesService: VehicleExteriorImagesService,
    private readonly vehicleCleaningTasks: VehicleCleaningTaskService,
    private readonly vehicleDetailAudit: VehicleDetailAccessAuditService,
  ) {}

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
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async getFleetMap(@Param('orgId') orgId: string, @Req() req: VehicleStatusAuthRequest) {
    const auditCtx = VehicleDetailAccessAuditService.contextFromRequest(
      req,
      orgId,
      'GET /organizations/:orgId/fleet-map',
    );
    return this.vehiclesService.getFleetMapData(orgId, auditCtx);
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
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async getVehicleTelemetry(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: VehicleStatusAuthRequest,
  ) {
    const auditCtx = VehicleDetailAccessAuditService.contextFromRequest(
      req,
      orgId,
      'GET /organizations/:orgId/vehicles/:vehicleId/telemetry',
    );
    auditCtx.vehicleId = vehicleId;
    return this.vehiclesService.getVehicleWithTelemetry(vehicleId, orgId, auditCtx);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/live-gps')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async getLiveGps(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: VehicleStatusAuthRequest,
  ) {
    const auditCtx = VehicleDetailAccessAuditService.contextFromRequest(
      req,
      orgId,
      'GET /organizations/:orgId/vehicles/:vehicleId/live-gps',
    );
    auditCtx.vehicleId = vehicleId;
    return this.vehiclesService.getLiveGps(vehicleId, orgId, auditCtx);
  }

  @Post('organizations/:orgId/vehicles')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async createByOrg(
    @Param('orgId') orgId: string,
    @Body() body: Omit<Prisma.VehicleCreateInput, 'organization'>,
    @Req() req: any,
  ) {
    return this.vehiclesService.create(orgId, body, req.user?.id);
  }

  @Post('organizations/:orgId/vehicles/register-from-dimo')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
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
        brakes?: RegistrationBrakeManualSpec;
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
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async updateByOrg(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: Prisma.VehicleUpdateInput,
  ) {
    return this.vehiclesService.update(vehicleId, body, orgId);
  }

  @Put('organizations/:orgId/vehicles/:vehicleId/tires')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
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

  /**
   * V4.6.90 — Only operational availability states can be set directly
   * via the admin status PATCH.
   *
   * `RENTED` and `RESERVED` are derived from real booking / handover
   * truth (see `BookingsHandoverService.createHandover` — PICKUP moves
   * the booking to ACTIVE which the fleet-status derivation surfaces
   * as "Active Rented"; CONFIRMED/PENDING bookings with a future start
   * show as "Reserved"). Allowing an admin to write those enum values
   * directly used to create "ghost rentals" — a vehicle card that said
   * "Active Rented" with null customer / return data because no matching
   * booking existed. The fleet-status derivation now demotes such ghost
   * rows to Available at read time (see
   * `VehiclesService.deriveFleetStatusContext`), but we also reject the
   * write boundary here so the DB truth stays consistent.
   */
  private static readonly ADMIN_WRITABLE_VEHICLE_STATES: ReadonlySet<VehicleStatus> =
    new Set<VehicleStatus>([
      'AVAILABLE' as VehicleStatus,
      'IN_SERVICE' as VehicleStatus,
      'OUT_OF_SERVICE' as VehicleStatus,
    ]);

  @Patch('organizations/:orgId/vehicles/:vehicleId/status')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async updateVehicleStatus(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: VehicleStatusAuthRequest,
    @Body()
    body: {
      status?: VehicleStatus;
      cleaningStatus?: CleaningStatus;
      healthStatus?: HealthStatus;
    },
  ) {
    const data: Prisma.VehicleUpdateInput = {};
    let previousVehicleStatus: VehicleStatus | null = null;
    let previousCleaningStatus: CleaningStatus | null = null;
    const needsExistingSnapshot = Boolean(body.status || body.cleaningStatus);
    const existingVehicle = needsExistingSnapshot
      ? await this.vehiclesService.findOne(orgId, vehicleId)
      : null;

    if (body.status) {
      if (!VehiclesController.ADMIN_WRITABLE_VEHICLE_STATES.has(body.status)) {
        throw new BadRequestException(
          `Vehicle status '${body.status}' cannot be set via the admin status endpoint. RENTED / RESERVED are derived from booking and handover events; create/cancel the booking instead.`,
        );
      }
      previousVehicleStatus = (existingVehicle?.status as VehicleStatus | undefined) ?? null;
      data.status = body.status;
    }
    if (body.cleaningStatus) {
      previousCleaningStatus =
        (existingVehicle?.cleaningStatus as CleaningStatus | undefined) ?? null;
      data.cleaningStatus = body.cleaningStatus;
    }
    if (body.healthStatus) data.healthStatus = body.healthStatus;

    const vehicle = await this.vehiclesService.update(vehicleId, data, orgId);

    await this.vehiclesService.invalidateFleetMapCache(orgId);

    const auditCtx = VehicleDetailAccessAuditService.contextFromRequest(
      req,
      orgId,
      'PATCH /organizations/:orgId/vehicles/:vehicleId/status',
    );
    auditCtx.vehicleId = vehicleId;

    if (body.status && previousVehicleStatus && previousVehicleStatus !== body.status) {
      this.vehicleDetailAudit.record({
        ...auditCtx,
        auditAction: VehicleDetailAccessAuditAction.OPERATIONAL_STATUS_UPDATE,
        outcome: 'allowed',
        purpose: 'VEHICLE_OPERATIONAL_STATUS_CHANGE',
        metadata: {
          previousStatus: previousVehicleStatus,
          nextStatus: body.status,
        },
      });
    }

    if (
      body.cleaningStatus &&
      previousCleaningStatus &&
      previousCleaningStatus !== body.cleaningStatus
    ) {
      this.vehicleDetailAudit.record({
        ...auditCtx,
        auditAction: VehicleDetailAccessAuditAction.CLEANING_STATUS_UPDATE,
        outcome: 'allowed',
        purpose: 'VEHICLE_CLEANING_STATUS_CHANGE',
        metadata: {
          previousCleaningStatus,
          nextCleaningStatus: body.cleaningStatus,
        },
      });
    }

    let cleaningTask: Awaited<
      ReturnType<VehicleCleaningTaskService['ensureCleaningTask']>
    > | null = null;

    if (body.cleaningStatus === 'NEEDS_CLEANING') {
      cleaningTask = await this.vehicleCleaningTasks.ensureCleaningTask(orgId, vehicleId);
    } else if (body.cleaningStatus === 'CLEAN') {
      cleaningTask = await this.vehicleCleaningTasks.completeOpenCleaningTasks(
        orgId,
        vehicleId,
        req.user?.id,
      );
    }

    return { vehicle, cleaningTask };
  }

  @Get('organizations/:orgId/fleet-connectivity')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet-connectivity', 'read')
  async getFleetConnectivity(
    @Param('orgId') orgId: string,
    @Query() query: FleetConnectivityQueryDto,
  ) {
    return this.vehiclesService.getFleetConnectivity(orgId, query);
  }

  @Get('organizations/:orgId/fleet-connectivity/:vehicleId')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet-connectivity', 'read')
  async getFleetConnectivityDetail(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.getFleetConnectivityDetail(orgId, vehicleId);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/device-connection')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet-connectivity', 'read')
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async getDeviceConnection(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Req() req: VehicleStatusAuthRequest,
  ) {
    const auditCtx = VehicleDetailAccessAuditService.contextFromRequest(
      req,
      orgId,
      'GET /organizations/:orgId/vehicles/:vehicleId/device-connection',
    );
    auditCtx.vehicleId = vehicleId;
    return this.vehiclesService.getDeviceConnection(orgId, vehicleId, auditCtx);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/complaints')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async listVehicleComplaints(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.vehiclesService.listVehicleComplaints(orgId, vehicleId);
  }

  @Post('organizations/:orgId/vehicles/:vehicleId/complaints')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
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
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission('fleet', 'manage')
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

  // ── Exterior Images (Damage Map) ─────────────────────────────────
  //
  // V4.7.50 — Five canonical exterior photo slots per vehicle (FRONT, LEFT,
  // RIGHT, REAR, ROOF). Master-Admin operators upload these either during
  // vehicle registration (`VehicleRegistrationModal`) or post-hoc on the
  // Master-Admin vehicle detail drawer (`PlatformVehiclesView`). The Rental
  // `DamagesView` reads them via the org-scoped/vehicle-scoped GET below to
  // render a vehicle-specific damage map carousel.

  @Get('admin/vehicles/:vehicleId/exterior-images')
  @Roles('MASTER_ADMIN')
  async listExteriorImagesAdmin(@Param('vehicleId') vehicleId: string) {
    return this.exteriorImagesService.listByVehicle(vehicleId);
  }

  @Get('admin/vehicles/:vehicleId/exterior-images/effective')
  @Roles('MASTER_ADMIN')
  async listEffectiveExteriorImagesAdmin(@Param('vehicleId') vehicleId: string) {
    return this.exteriorImagesService.listEffectiveByVehicle(vehicleId);
  }

  @Get('admin/vehicle-exterior-model-images')
  @Roles('MASTER_ADMIN')
  async listExteriorModelImages(
    @Query('make') make?: string,
    @Query('model') model?: string,
  ) {
    if (make && model) {
      return this.exteriorImagesService.listByModel(make, model);
    }
    return this.exteriorImagesService.listAvailableModels();
  }

  @Put('admin/vehicle-exterior-model-images/:view')
  @Roles('MASTER_ADMIN')
  async upsertExteriorModelImage(
    @Param('view') view: string,
    @Body()
    body: {
      make: string;
      model: string;
      imageData: string;
      caption?: string | null;
      sourceVehicleId?: string | null;
    },
    @Req() req: any,
  ) {
    return this.exteriorImagesService.upsertModelImage(
      body?.make,
      body?.model,
      parseExteriorView(view),
      body?.imageData,
      body?.caption ?? null,
      body?.sourceVehicleId ?? null,
      req?.user?.id ?? null,
    );
  }

  @Put('admin/vehicles/:vehicleId/exterior-images/:view')
  @Roles('MASTER_ADMIN')
  async upsertExteriorImageAdmin(
    @Param('vehicleId') vehicleId: string,
    @Param('view') view: string,
    @Body() body: { imageData: string; caption?: string | null },
    @Req() req: any,
  ) {
    return this.exteriorImagesService.upsert(
      vehicleId,
      parseExteriorView(view),
      body?.imageData,
      body?.caption ?? null,
      req?.user?.id ?? null,
    );
  }

  @Post('admin/vehicles/:vehicleId/exterior-images/:view/save-as-model')
  @Roles('MASTER_ADMIN')
  async saveExteriorImageAsModelTemplate(
    @Param('vehicleId') vehicleId: string,
    @Param('view') view: string,
    @Req() req: any,
  ) {
    return this.exteriorImagesService.saveVehicleImageAsModelTemplate(
      vehicleId,
      parseExteriorView(view),
      req?.user?.id ?? null,
    );
  }

  @Post('admin/vehicles/:vehicleId/exterior-images/:view/apply-model')
  @Roles('MASTER_ADMIN')
  async applyExteriorModelImageToVehicle(
    @Param('vehicleId') vehicleId: string,
    @Param('view') view: string,
    @Body() body: { modelKey: string },
    @Req() req: any,
  ) {
    return this.exteriorImagesService.applyModelTemplateToVehicle(
      vehicleId,
      parseExteriorView(view),
      body?.modelKey,
      req?.user?.id ?? null,
    );
  }

  @Delete('admin/vehicles/:vehicleId/exterior-images/:view')
  @Roles('MASTER_ADMIN')
  async deleteExteriorImageAdmin(
    @Param('vehicleId') vehicleId: string,
    @Param('view') view: string,
  ) {
    await this.exteriorImagesService.delete(
      vehicleId,
      parseExteriorView(view),
    );
    return { success: true };
  }

  // Read-only access for any authenticated user with vehicle ownership
  // (Rental Damages page consumes this to render the damage map carousel).
  @Get('vehicles/:vehicleId/exterior-images/effective')
  @UseGuards(VehicleOwnershipGuard)
  async listEffectiveExteriorImages(@Param('vehicleId') vehicleId: string) {
    return this.exteriorImagesService.listEffectiveByVehicle(vehicleId);
  }

  @Get('vehicles/:vehicleId/exterior-images')
  @UseGuards(VehicleOwnershipGuard)
  async listExteriorImages(@Param('vehicleId') vehicleId: string) {
    return this.exteriorImagesService.listByVehicle(vehicleId);
  }
}
