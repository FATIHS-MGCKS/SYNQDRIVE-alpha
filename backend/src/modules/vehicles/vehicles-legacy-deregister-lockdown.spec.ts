import { ConflictException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { UserPlatformRole } from '@prisma/client';
import { MFA_ERROR, STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { buildMfaClaims, buildPasswordOnlyClaims } from '@shared/auth/auth-session-claims.types';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import {
  CANONICAL_VEHICLE_OFFBOARD_ROUTE,
  LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
  legacyVehicleDestructionDisabledException,
} from './legacy-vehicle-destruction.errors';

function guardsOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

function rolesOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined;
}

function mfaActionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(MASTER_ADMIN_MFA_ACTION_KEY, handler) as string | undefined;
}

describe('VO5C-P2B1 legacy Master Admin deregister lockdown', () => {
  const originalEnv = process.env;
  const vehicleId = 'veh-existing-1';
  const foreignVehicleId = 'veh-foreign-99';
  const missingVehicleId = 'veh-does-not-exist';

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      IAM_MFA_MASTER_ADMIN_ENABLED: 'true',
      IAM_MFA_STEP_UP_ENFORCED: 'true',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('security metadata', () => {
    it('requires MASTER_ADMIN, MasterAdminMfaGuard, MASTER_INTEGRATIONS', () => {
      expect(rolesOf(VehiclesController.prototype, 'deregisterVehicle')).toEqual(['MASTER_ADMIN']);
      expect(guardsOf(VehiclesController.prototype, 'deregisterVehicle')).toContain(
        MasterAdminMfaGuard,
      );
      expect(mfaActionOf(VehiclesController.prototype, 'deregisterVehicle')).toBe(
        STEP_UP_ACTION.MASTER_INTEGRATIONS,
      );
    });
  });

  describe('retirement contract', () => {
    it('stable 409 conflict body', () => {
      const err = legacyVehicleDestructionDisabledException();
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({
        code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE,
        action: 'USE_CANONICAL_OFFBOARD',
        canonicalRoute: CANONICAL_VEHICLE_OFFBOARD_ROUTE,
        requiredFields: ['reason', 'idempotencyKey'],
      });
    });
  });

  describe('HTTP guard chain execution', () => {
    const reflector = new Reflector();
    const rolesGuard = new RolesGuard(reflector);

    function buildMfaGuard(stepUpValid = false) {
      const prisma = {
        userMfaFactor: {
          findFirst: jest.fn().mockResolvedValue({ id: 'factor-1' }),
        },
      };
      const stepUp = {
        validateGrant: jest.fn().mockResolvedValue(stepUpValid),
      };
      return new MasterAdminMfaGuard(reflector, prisma as never, stepUp as never);
    }

    function httpContext(user: Record<string, unknown> | undefined, params: Record<string, string>) {
      const handler = VehiclesController.prototype.deregisterVehicle;
      return {
        getHandler: () => handler,
        getClass: () => VehiclesController,
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'POST',
            user,
            params,
            headers: {},
          }),
        }),
      } as never;
    }

    it('A — anonymous denied by RolesGuard', () => {
      expect(() => rolesGuard.canActivate(httpContext(undefined, { vehicleId }))).toThrow(
        ForbiddenException,
      );
    });

    it('B — tenant employee denied', () => {
      expect(() =>
        rolesGuard.canActivate(
          httpContext(
            { id: 'u1', platformRole: 'USER', membershipRole: 'WORKER', organizationId: 'org-1' },
            { vehicleId },
          ),
        ),
      ).toThrow(ForbiddenException);
    });

    it('C — organization admin denied (membership ORG_ADMIN without MASTER_ADMIN)', () => {
      expect(() =>
        rolesGuard.canActivate(
          httpContext(
            {
              id: 'u2',
              platformRole: 'USER',
              membershipRole: 'ORG_ADMIN',
              organizationId: 'org-1',
            },
            { vehicleId },
          ),
        ),
      ).toThrow(ForbiddenException);
    });

    it('D — master admin without MFA step-up denied', async () => {
      rolesGuard.canActivate(
        httpContext(
          {
            id: 'ma-1',
            platformRole: UserPlatformRole.MASTER_ADMIN,
            sessionClaims: buildPasswordOnlyClaims(),
          },
          { vehicleId },
        ),
      );
      const mfaGuard = buildMfaGuard(false);
      await expect(
        mfaGuard.canActivate(
          httpContext(
            {
              id: 'ma-1',
              platformRole: UserPlatformRole.MASTER_ADMIN,
              sessionClaims: buildPasswordOnlyClaims(),
            },
            { vehicleId },
          ),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('E — master admin with fresh MFA assurance receives 409 retirement (no mutation)', async () => {
      const ctx = httpContext(
        {
          id: 'ma-1',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          sessionClaims: buildMfaClaims(),
        },
        { vehicleId },
      );
      rolesGuard.canActivate(ctx);
      const mfaGuard = buildMfaGuard(false);
      await expect(mfaGuard.canActivate(ctx)).resolves.toBe(true);

      const vehiclesService = { deregister: jest.fn() } as unknown as VehiclesService;
      const controller = new VehiclesController(
        vehiclesService,
        {} as never,
        {} as never,
        {} as never,
        undefined,
      );
      await expect(controller.deregisterVehicle(vehicleId)).rejects.toBeInstanceOf(ConflictException);
      expect(vehiclesService.deregister).not.toHaveBeenCalled();
    });

    it('G — MFA enrollment policy respected (unenrolled master admin denied)', async () => {
      process.env.IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED = 'true';
      const prisma = {
        userMfaFactor: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const mfaGuard = new MasterAdminMfaGuard(
        reflector,
        prisma as never,
        { validateGrant: jest.fn() } as never,
      );
      await expect(
        mfaGuard.canActivate(
          httpContext(
            {
              id: 'ma-1',
              platformRole: UserPlatformRole.MASTER_ADMIN,
              sessionClaims: buildMfaClaims(),
            },
            { vehicleId },
          ),
        ),
      ).rejects.toMatchObject({
        response: { code: MFA_ERROR.ENROLLMENT_REQUIRED },
      });
    });

    it('F — invalid step-up token denied', async () => {
      const ctx = httpContext(
        {
          id: 'ma-1',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          sessionClaims: buildPasswordOnlyClaims(),
        },
        { vehicleId },
      );
      rolesGuard.canActivate(ctx);
      const mfaGuard = buildMfaGuard(false);
      const req = {
        method: 'POST',
        user: {
          id: 'ma-1',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          sessionClaims: buildPasswordOnlyClaims(),
        },
        params: { vehicleId },
        headers: { 'x-step-up-token': 'expired-token' },
      };
      await expect(
        mfaGuard.canActivate({
          getHandler: () => VehiclesController.prototype.deregisterVehicle,
          getClass: () => VehiclesController,
          switchToHttp: () => ({ getRequest: () => req }),
        } as never),
      ).rejects.toMatchObject({
        response: { code: 'STEP_UP_EXPIRED' },
      });
    });

    it('H/I — same 409 for existing, missing, and foreign vehicle ids', async () => {
      const controller = new VehiclesController(
        { deregister: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
        undefined,
      );
      for (const id of [vehicleId, missingVehicleId, foreignVehicleId]) {
        await expect(controller.deregisterVehicle(id)).rejects.toMatchObject({
          response: { code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE },
        });
      }
    });
  });

  describe('VehiclesService.deregister fail-closed', () => {
    function serviceWithMocks() {
      const prisma = {
        vehicle: {
          findUniqueOrThrow: jest.fn(),
          delete: jest.fn(),
          deleteMany: jest.fn(),
          update: jest.fn(),
        },
      };
      const billingQuantity = { onVehicleRemoved: jest.fn() };
      const service = Object.create(VehiclesService.prototype) as VehiclesService;
      Object.assign(service, {
        prisma,
        billingQuantity,
        logger: { warn: jest.fn(), log: jest.fn() },
      });
      return { service, prisma, billingQuantity };
    }

    it('never touches prisma or billing', async () => {
      const { service, prisma, billingQuantity } = serviceWithMocks();
      await expect(service.deregister(vehicleId)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.vehicle.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.vehicle.delete).not.toHaveBeenCalled();
      expect(prisma.vehicle.deleteMany).not.toHaveBeenCalled();
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
      expect(billingQuantity.onVehicleRemoved).not.toHaveBeenCalled();
    });

    it('MFA feature flag disabled still returns 409 without mutation', async () => {
      process.env.IAM_MFA_MASTER_ADMIN_ENABLED = 'false';
      const { service, prisma } = serviceWithMocks();
      await expect(service.deregister(vehicleId)).rejects.toMatchObject({
        response: { code: LEGACY_VEHICLE_DESTRUCTION_DISABLED_CODE },
      });
      expect(prisma.vehicle.delete).not.toHaveBeenCalled();
    });
  });
});
