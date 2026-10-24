import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleSpecsController } from './vehicle-specs.controller';
import { VehicleSpecAiService } from './vehicle-spec-ai.service';
import { TireSpecAiService } from './tire-spec-ai.service';
import { AiTireSpecJobService } from './ai-tire-spec-job.service';

describe('VehicleSpecsController security', () => {
  it('requires MASTER_ADMIN at controller level', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, VehicleSpecsController) as string[];
    expect(roles).toEqual(['MASTER_ADMIN']);
    const guards = Reflect.getMetadata('__guards__', VehicleSpecsController) as Array<{ name: string }>;
    expect(guards?.map((g) => g.name)).toContain(RolesGuard.name);
  });

  it('rejects DIMO-only resolution without organizationId', async () => {
    const prisma = { vehicle: { findFirst: jest.fn() }, dimoVehicle: { findFirst: jest.fn() } };
    const controller = new VehicleSpecsController(
      { isConfigured: () => false } as VehicleSpecAiService,
      {} as TireSpecAiService,
      {} as AiTireSpecJobService,
      prisma as unknown as PrismaService,
    );

    const resolve = (
      controller as unknown as {
        resolveVehicleParams: (...args: unknown[]) => Promise<unknown>;
      }
    ).resolveVehicleParams.bind(controller);

    await expect(
      resolve(undefined, undefined, 'dimo-1', undefined, undefined, undefined, undefined, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.dimoVehicle.findFirst).not.toHaveBeenCalled();
  });

  it('rejects DIMO vehicle not linked to organization', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      dimoVehicle: { findFirst: jest.fn() },
    };
    const controller = new VehicleSpecsController(
      { isConfigured: () => false } as VehicleSpecAiService,
      {} as TireSpecAiService,
      {} as AiTireSpecJobService,
      prisma as unknown as PrismaService,
    );

    const resolve = (
      controller as unknown as {
        resolveVehicleParams: (...args: unknown[]) => Promise<unknown>;
      }
    ).resolveVehicleParams.bind(controller);

    await expect(
      resolve(undefined, undefined, 'dimo-1', undefined, undefined, undefined, 'org-a', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.dimoVehicle.findFirst).not.toHaveBeenCalled();
  });
});
