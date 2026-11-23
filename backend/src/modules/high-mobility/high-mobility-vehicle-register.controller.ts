import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityVehicleLinkService } from './high-mobility-vehicle-link.service';
import { HighMobilityRegistrationService } from './high-mobility-registration.service';
import type { RegisterHmOnlyVehicleDto } from './dto/high-mobility.dto';
import {
  assertHighMobilityTenantOperationalOrganization,
  isMasterAdminActor,
  resolveHighMobilityTenantOrganizationId,
  resolveHighMobilityVehicleScopedAccess,
} from './high-mobility-tenant-access.policy';

type AuthedRequest = {
  user?: {
    id?: string;
    platformRole?: string;
    organizationId?: string;
  };
};

/**
 * Register-flow integration endpoints.
 * Used by the vehicle registration form to detect + activate HM Health or register HM_ONLY vehicles.
 */
@Controller('vehicles')
@UseGuards(RolesGuard)
export class HighMobilityVehicleRegisterController {
  constructor(
    private readonly vehicleLinkService: HighMobilityVehicleLinkService,
    private readonly registrationService: HighMobilityRegistrationService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /api/v1/vehicles/register/high-mobility-availability?vin=... */
  @Get('register/high-mobility-availability')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async checkAvailability(@Query('vin') vin: string, @Req() req: AuthedRequest) {
    if (!vin?.trim()) throw new BadRequestException('vin is required');
    const isMa = isMasterAdminActor(req.user);
    const orgId = resolveHighMobilityTenantOrganizationId(req.user, undefined, {
      allowMasterAdminWithoutOrg: true,
    });
    const normalizedVin = vin.trim().toUpperCase();
    if (!orgId) {
      return this.vehicleLinkService.checkAvailability(normalizedVin);
    }
    await assertHighMobilityTenantOperationalOrganization(this.prisma, orgId, isMa);
    return this.vehicleLinkService.checkAvailabilityForOrganization(normalizedVin, orgId, isMa);
  }

  /** POST /api/v1/vehicles/:vehicleId/activate-high-mobility-health */
  @Post(':vehicleId/activate-high-mobility-health')
  @UseGuards(VehicleOwnershipGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async activateHmHealth(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { hmVehicleId: string },
    @Req() req: AuthedRequest,
  ) {
    if (!body.hmVehicleId) throw new BadRequestException('hmVehicleId is required');
    const access = await resolveHighMobilityVehicleScopedAccess(this.prisma, vehicleId, req.user);
    await this.vehicleLinkService.activateHealthLink(body.hmVehicleId, vehicleId, access);
    return { success: true, message: 'High Mobility Health activated' };
  }

  /** POST /api/v1/vehicles/:vehicleId/link-high-mobility-full-telemetry */
  @Post(':vehicleId/link-high-mobility-full-telemetry')
  @UseGuards(VehicleOwnershipGuard, PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async linkFullTelemetry(
    @Param('vehicleId') vehicleId: string,
    @Body() body: { hmVehicleId: string },
    @Req() req: AuthedRequest,
  ) {
    if (!body.hmVehicleId) throw new BadRequestException('hmVehicleId is required');
    const access = await resolveHighMobilityVehicleScopedAccess(this.prisma, vehicleId, req.user);
    await this.vehicleLinkService.linkFullTelemetry(body.hmVehicleId, vehicleId, access);
    return {
      success: true,
      message: 'High Mobility Full Telemetry structural link created',
      note: 'Full streaming activation is deferred to Phase 3',
    };
  }

  /** POST /api/v1/vehicles/register/hm-only */
  @Post('register/hm-only')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PermissionsGuard)
  @RequirePermission('fleet', 'write')
  async registerHmOnlyVehicle(@Body() body: RegisterHmOnlyVehicleDto, @Req() req: AuthedRequest) {
    if (!body.hmVehicleId) throw new BadRequestException('hmVehicleId is required');
    const isMa = isMasterAdminActor(req.user);
    const orgId = resolveHighMobilityTenantOrganizationId(req.user, body.organizationId, {
      requireMasterAdminDestinationOrg: isMa,
    });
    if (!orgId) {
      throw new BadRequestException('organizationId is required');
    }
    await assertHighMobilityTenantOperationalOrganization(this.prisma, orgId, isMa);
    return this.registrationService.registerHmOnlyVehicle(
      { ...body, organizationId: orgId },
      {
        tenantOrganizationId: orgId,
        isMasterAdmin: isMa,
        actorUserId: req.user?.id ?? null,
      },
    );
  }

  /** GET /api/v1/vehicles/register/hm-only-candidates?vin=... */
  @Get('register/hm-only-candidates')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fleet', 'read')
  async getHmOnlyCandidates(@Query('vin') vin: string | undefined, @Req() req: AuthedRequest) {
    const isMa = isMasterAdminActor(req.user);
    const orgId = resolveHighMobilityTenantOrganizationId(req.user, undefined, {
      allowMasterAdminWithoutOrg: true,
    });
    if (orgId) {
      await assertHighMobilityTenantOperationalOrganization(this.prisma, orgId, isMa);
    }
    return this.registrationService.getHmOnlyCandidates(orgId ?? 'master-admin', isMa, vin);
  }
}