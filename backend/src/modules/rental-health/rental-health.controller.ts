import { Body, Controller, Delete, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { RentalHealthService } from './rental-health.service';
import { RentalHealthFleetService } from './rental-health-fleet.service';
import { RentalHealthSummaryService } from './rental-health-summary.service';
import { TireRentalHealthReviewService } from './tire-rental-health-review.service';
import { BrakeRentalHealthReviewService } from './brake-rental-health-review.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { FleetVehicleHealthRow } from './rental-health-summary.types';
import type { VehicleHealth } from './rental-health.types';
import { FleetRentalHealthQueryDto } from './dto/fleet-rental-health-query.dto';
import type { FleetRentalHealthPageResult } from './rental-health-fleet-cursor.util';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';

class CreateTireRentalReviewOverrideDto {
  reason!: string;
  expiresAt!: string;
  tireSetupId?: string;
}

class CreateBrakeRentalReviewOverrideDto {
  reason!: string;
  expiresAt!: string;
}

/**
 * Rental Health V1 — read-only endpoints.
 *
 * Single-vehicle:
 *   GET /organizations/:orgId/vehicles/:vehicleId/rental-health
 *
 * Fleet-wide (for Fleet/Bookings list badges):
 *   GET /organizations/:orgId/rental-health
 *   GET /organizations/:orgId/rental-health?vehicleIds=a,b,c   (legacy, cached read model)
 *   GET /organizations/:orgId/rental-health/fleet               (scoped + paginated, cached)
 *
 * Fleet endpoints use the Redis-backed summary read model (see
 * {@link RentalHealthSummaryService}). Detail route stays canonical.
 */
@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class RentalHealthController {
  constructor(
    private readonly rentalHealth: RentalHealthService,
    private readonly rentalHealthFleet: RentalHealthFleetService,
    private readonly rentalHealthSummary: RentalHealthSummaryService,
    private readonly prisma: PrismaService,
    private readonly tireRentalReview: TireRentalHealthReviewService,
    private readonly brakeRentalReview: BrakeRentalHealthReviewService,
  ) {}

  @Get('vehicles/:vehicleId/rental-health')
  @RequirePermission('fleet', 'read')
  async getVehicleHealth(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ): Promise<VehicleHealth> {
    return this.rentalHealth.getVehicleHealth(orgId, vehicleId);
  }

  @Get('rental-health/fleet')
  @RequirePermission('fleet', 'read')
  async getScopedFleetHealth(
    @Param('orgId') orgId: string,
    @Query() query: FleetRentalHealthQueryDto,
    @Req() req: { user?: { id?: string } },
  ): Promise<FleetRentalHealthPageResult<FleetVehicleHealthRow>> {
    return this.rentalHealthFleet.listFleetHealthPage(orgId, req.user?.id, query);
  }

  @Get('rental-health')
  @RequirePermission('fleet', 'read')
  async getFleetHealth(
    @Param('orgId') orgId: string,
    @Query('vehicleIds') vehicleIdsCsv?: string,
  ): Promise<{ vehicles: FleetVehicleHealthRow[] }> {
    const filter = vehicleIdsCsv
      ? vehicleIdsCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    const vehicleRows = await this.prisma.vehicle.findMany({
      where: {
        organizationId: orgId,
        ...(filter && filter.length > 0 ? { id: { in: filter } } : {}),
      },
      select: { id: true },
    });

    const vehicles = await this.rentalHealthSummary.getFleetRowsBatch(
      orgId,
      vehicleRows.map((row) => row.id),
    );

    return { vehicles };
  }

  @Post('vehicles/:vehicleId/tire-rental-health/review-override')
  @RequirePermission('fleet', 'write')
  async createTireRentalReviewOverride(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: CreateTireRentalReviewOverrideDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.tireRentalReview.createOverride({
      organizationId: orgId,
      vehicleId,
      tireSetupId: body.tireSetupId,
      reason: body.reason,
      grantedByUserId: userId,
      expiresAt: new Date(body.expiresAt),
    });
  }

  @Delete('vehicles/:vehicleId/tire-rental-health/review-override/:overrideId')
  @RequirePermission('fleet', 'write')
  async revokeTireRentalReviewOverride(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('overrideId') overrideId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.tireRentalReview.revokeOverride(
      orgId,
      vehicleId,
      overrideId,
      userId,
    );
  }

  @Post('vehicles/:vehicleId/brake-rental-health/review-override')
  @RequirePermission('fleet', 'write')
  async createBrakeRentalReviewOverride(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: CreateBrakeRentalReviewOverrideDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.brakeRentalReview.createOverride({
      organizationId: orgId,
      vehicleId,
      reason: body.reason,
      grantedByUserId: userId,
      expiresAt: new Date(body.expiresAt),
    });
  }

  @Delete('vehicles/:vehicleId/brake-rental-health/review-override/:overrideId')
  @RequirePermission('fleet', 'write')
  async revokeBrakeRentalReviewOverride(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('overrideId') overrideId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return this.brakeRentalReview.revokeOverride(
      orgId,
      vehicleId,
      overrideId,
      userId,
    );
  }
}

