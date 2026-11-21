/**
 * VehicleOwnershipGuard + live organization.status (PostgreSQL).
 * VEHICLE_OWNERSHIP_LIFECYCLE_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/synqdrive_vehicle_ownership_lifecycle_test npm test -- vehicle-ownership-lifecycle.postgres.integration
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  BusinessType,
  MembershipRole,
  MembershipStatus,
  FuelType,
  OrganizationStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';
import {
  assertVehicleOwnershipLifecycleDisposablePostgresPreflight,
  isVehicleOwnershipLifecyclePostgresOptIn,
} from './testing/vehicle-ownership-lifecycle-disposable-postgres-preflight';

const LIVE = isVehicleOwnershipLifecyclePostgresOptIn();

function contextFor(user: Record<string, unknown>, vehicleId: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: { vehicleId },
        user,
      }),
    }),
  } as never;
}

(LIVE ? describe : describe.skip)(
  'VehicleOwnershipGuard — postgres organization lifecycle',
  () => {
    let prisma: PrismaClient;
    let organizationId: string;
    let vehicleId: string;
    let userId: string;
    let guard: VehicleOwnershipGuard;

    beforeAll(async () => {
      assertVehicleOwnershipLifecycleDisposablePostgresPreflight();
      prisma = new PrismaClient();
      await prisma.$connect();
      guard = new VehicleOwnershipGuard(prisma as never);
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(async () => {
      organizationId = randomUUID();
      vehicleId = randomUUID();
      userId = randomUUID();
      await prisma.organization.create({
        data: {
          id: organizationId,
          companyName: `V-LC ${organizationId.slice(0, 8)}`,
          businessType: BusinessType.FLEET,
          status: OrganizationStatus.ACTIVE,
        },
      });
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@vehicle-lifecycle.test`,
          name: 'Vehicle LC',
          platformRole: UserPlatformRole.USER,
          status: UserStatus.ACTIVE,
        },
      });
      await prisma.organizationMembership.create({
        data: {
          id: randomUUID(),
          userId,
          organizationId,
          role: MembershipRole.WORKER,
          status: MembershipStatus.ACTIVE,
          permissions: { fleet: { read: true, write: true } },
        },
      });
      await prisma.vehicle.create({
        data: {
          id: vehicleId,
          organizationId,
          vin: `VIN${vehicleId.replace(/-/g, '').slice(0, 14)}`,
          make: 'VW',
          model: 'Golf',
          year: 2022,
          fuelType: FuelType.DIESEL,
          status: VehicleStatus.AVAILABLE,
        },
      });
    });

    afterEach(async () => {
      await prisma.vehicle.deleteMany({ where: { organizationId } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    });

    it('allows ACTIVE organization', async () => {
      await expect(
        guard.canActivate(
          contextFor({ id: userId, platformRole: 'USER', organizationId }, vehicleId),
        ),
      ).resolves.toBe(true);
    });

    it('F2 — same user/org binding after DB suspension denies (JWT would be unchanged)', async () => {
      const sessionUser = { id: userId, platformRole: 'USER', organizationId };

      await expect(
        guard.canActivate(contextFor(sessionUser, vehicleId)),
      ).resolves.toBe(true);

      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: OrganizationStatus.SUSPENDED },
      });

      await expect(
        guard.canActivate(contextFor(sessionUser, vehicleId)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('denies foreign vehicle', async () => {
      const otherOrg = randomUUID();
      const otherVehicle = randomUUID();
      await prisma.organization.create({
        data: {
          id: otherOrg,
          companyName: 'Other',
          businessType: BusinessType.FLEET,
        },
      });
      await prisma.vehicle.create({
        data: {
          id: otherVehicle,
          organizationId: otherOrg,
          vin: `VIN${otherVehicle.replace(/-/g, '').slice(0, 14)}`,
          make: 'VW',
          model: 'Golf',
          year: 2022,
          fuelType: FuelType.DIESEL,
          status: VehicleStatus.AVAILABLE,
        },
      });
      await expect(
        guard.canActivate(
          contextFor({ id: userId, platformRole: 'USER', organizationId }, otherVehicle),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await prisma.vehicle.delete({ where: { id: otherVehicle } });
      await prisma.organization.delete({ where: { id: otherOrg } });
    });
  },
);