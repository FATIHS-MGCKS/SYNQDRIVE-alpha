import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';

/**
 * Guards routes mounted at `:vehicleId` without an explicit org in the path.
 *
 * Rules:
 *  - MASTER_ADMIN: full pass-through.
 *  - Org member: vehicle must belong to JWT `organizationId` AND user must have
 *    an ACTIVE membership in that organization (same invariant as OrgScopingGuard).
 *  - If vehicleId is absent from route params, the guard passes.
 */
@Injectable()
export class VehicleOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(VehicleOwnershipGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return true;

    if (user.platformRole === 'MASTER_ADMIN') {
      const vehicleId: string | undefined = request.params?.vehicleId;
      if (vehicleId) {
        const vehicle = await this.prisma.vehicle.findUnique({
          where: { id: vehicleId },
          select: { organizationId: true },
        });
        if (vehicle?.organizationId) {
          request.tenantId = vehicle.organizationId;
        }
      }
      return true;
    }

    const vehicleId: string | undefined = request.params?.vehicleId;
    if (!vehicleId) return true;

    const organizationId: string | undefined = user.organizationId;
    if (!organizationId) {
      throw new NotFoundException('Vehicle not found');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });

    if (!vehicle) {
      this.logger.warn(
        `VehicleOwnershipGuard: vehicle ${vehicleId} not found for org ${organizationId} (user ${user.id})`,
      );
      throw new NotFoundException('Vehicle not found');
    }

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.id,
        organizationId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!membership) {
      this.logger.warn(
        `VehicleOwnershipGuard: no active membership for user ${user.id} in org ${organizationId}`,
      );
      this.iamMetrics?.recordCrossTenantDenial('membership');
      throw new ForbiddenException('You do not have access to this organization');
    }

    request.tenantId = organizationId;
    return true;
  }
}
