import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

/**
 * Guards routes mounted at `:vehicleId` without an explicit org in the path.
 *
 * Rules:
 *  - MASTER_ADMIN: full pass-through.
 *  - Org member: vehicle must belong to their organizationId.
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

    return true;
  }
}
