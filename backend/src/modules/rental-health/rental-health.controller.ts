import { Body, Controller, Delete, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { RentalHealthService } from './rental-health.service';
import { TireRentalHealthReviewService } from './tire-rental-health-review.service';
import { BrakeRentalHealthReviewService } from './brake-rental-health-review.service';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleHealth } from './rental-health.types';
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
 *   GET /organizations/:orgId/rental-health?vehicleIds=a,b,c
 *
 * The fleet endpoint deliberately returns the SAME VehicleHealth shape
 * per vehicle so the frontend has a single render path. It is fan-out
 * by design — vehicles without a full health surface still get a
 * deterministic `unknown` + reasons entry, never silently dropped.
 */
@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class RentalHealthController {
  constructor(
    private readonly rentalHealth: RentalHealthService,
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

  @Get('rental-health')
  @RequirePermission('fleet', 'read')
  async getFleetHealth(
    @Param('orgId') orgId: string,
    @Query('vehicleIds') vehicleIdsCsv?: string,
  ): Promise<{ vehicles: VehicleHealth[] }> {
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

    // Fan-out in batches of 10 to protect the DB from a 100-vehicle burst.
    // A single request triggers up to 7 module evaluators × N vehicles —
    // batching keeps the P99 latency bounded without serializing everything.
    const BATCH = 10;
    const results: VehicleHealth[] = [];
    for (let i = 0; i < vehicleRows.length; i += BATCH) {
      const slice = vehicleRows.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        slice.map((v) =>
          this.rentalHealth
            .getVehicleHealth(orgId, v.id)
            .catch((err) => {
              // Degrade per-vehicle, never drop — the fleet list must keep
              // rendering even if one vehicle's pipeline errors out.
              return {
                vehicle_id: v.id,
                organization_id: orgId,
                overall_state: 'unknown' as const,
                rental_blocked: false,
                blocking_reasons: [],
                modules: {
                  battery: stubUnknown(),
                  tires: stubUnknown(),
                  brakes: stubUnknown(),
                  error_codes: stubUnknown(),
                  service_compliance: stubUnknown(),
                  complaints: stubUnknown(),
                  vehicle_alerts: stubUnknown(),
                },
                generated_at: new Date().toISOString(),
                _error: (err as Error).message,
              } as any;
            }),
        ),
      );
      results.push(...batchResults);
    }

    return { vehicles: results };
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

function stubUnknown() {
  return {
    state: 'unknown' as const,
    reason: 'Daten nicht verfügbar',
    last_updated_at: null,
    data_stale: true,
  };
}
