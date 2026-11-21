import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { assertOrganizationAllowsTenantSurface } from './organization-lifecycle-access.policy';

/**
 * Guards routes mounted at `:vehicleId` without an explicit org in the path.
 *
 * Rules:
 *  - MASTER_ADMIN: full pass-through.
 *  - Org member: ACTIVE membership, vehicle in JWT organizationId, current org lifecycle allows TENANT_OPERATIONAL.
 *  - If vehicleId is not in the route params, the guard passes (route is not vehicle-specific).
 */
@Injectable()
export class VehicleOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(VehicleOwnershipGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no authenticated user, defer to the auth guard (which runs first globally)
    if (!user) return true;

    // MASTER_ADMIN can access any vehicle
    if (user.platformRole === 'MASTER_ADMIN') return true;

    const vehicleId: string | undefined = request.params?.vehicleId;
    if (!vehicleId) return true;

    const organizationId: string | undefined = user.organizationId;
    if (!organizationId) {
      // User has no org — cannot access any vehicle-scoped data
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
      throw new ForbiddenException('You do not have access to this organization');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        organization: { select: { status: true } },
      },
    });

    if (!vehicle) {
      this.logger.warn(
        `VehicleOwnershipGuard: vehicle ${vehicleId} not found for org ${organizationId} (user ${user.id})`,
      );
      throw new NotFoundException('Vehicle not found');
    }

    assertOrganizationAllowsTenantSurface(
      vehicle.organization?.status,
      'TENANT_OPERATIONAL',
    );

    return true;
  }
}
