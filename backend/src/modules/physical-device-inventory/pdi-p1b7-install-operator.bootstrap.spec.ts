import { MODULE_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import {
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
  UserPlatformRole,
  UserStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { AppModule } from '../../app.module';
import {
  createPdiP1b7InstallOperatorApplicationContext,
  PdiP1b7InstallOperatorBootstrapModule,
  PDI_P1B7_INSTALL_OPERATOR_MINIMAL_PROVIDERS,
} from './pdi-p1b7-install-operator.bootstrap';
import { PDI_P1B7_AUTHORIZED_INSTALL } from './pdi-p1b7-install-operator.lib';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import {
  createPdiP1b7InstallOperatorApplicationContext as createFromRunner,
  runPdiP1b7InstallOperator,
} from './pdi-p1b7-install-operator.runner';

jest.mock('../../app.module', () => ({
  AppModule: {
    forRootAsync: jest.fn(async () => {
      throw new Error('AppModule bootstrap must not be used for Gate D install operator');
    }),
  },
}));

describe('pdi-p1b7-install-operator.bootstrap', () => {
  it('registers only the minimal provider set with no module imports', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, PdiP1b7InstallOperatorBootstrapModule) ?? [];
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PdiP1b7InstallOperatorBootstrapModule) ?? [];
    expect(imports).toEqual([]);
    expect(providers).toEqual([...PDI_P1B7_INSTALL_OPERATOR_MINIMAL_PROVIDERS]);
  });

  it('does not bootstrap AppModule for production context creation', async () => {
    const createSpy = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue({ close: jest.fn() } as never);

    await createPdiP1b7InstallOperatorApplicationContext();

    expect(AppModule.forRootAsync).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(PdiP1b7InstallOperatorBootstrapModule, {
      logger: false,
    });

    createSpy.mockRestore();
  });

  it('re-exports bootstrap factory from runner without AppModule', async () => {
    const createSpy = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue({ close: jest.fn() } as never);

    await createFromRunner();

    expect(AppModule.forRootAsync).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(PdiP1b7InstallOperatorBootstrapModule, {
      logger: false,
    });

    createSpy.mockRestore();
  });
});

function buildHappyPreflightPrismaMock() {
  const writeMethods = [
    '$executeRaw',
    '$executeRawUnsafe',
    '$transaction',
  ] as const;
  const modelWrite = () => {
    const handler = {
      create: jest.fn(() => {
        throw new Error('unexpected prisma write');
      }),
      createMany: jest.fn(() => {
        throw new Error('unexpected prisma write');
      }),
      update: jest.fn(() => {
        throw new Error('unexpected prisma write');
      }),
      updateMany: jest.fn(() => {
        throw new Error('unexpected prisma write');
      }),
      upsert: jest.fn(() => {
        throw new Error('unexpected prisma write');
      }),
      delete: jest.fn(() => {
        throw new Error('unexpected prisma write');
      }),
      deleteMany: jest.fn(() => {
        throw new Error('unexpected prisma write');
      }),
    };
    return handler;
  };

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([
      {
        token_id: String(PDI_P1B7_AUTHORIZED_INSTALL.dimoToken),
        raw_serial: PDI_P1B7_AUTHORIZED_INSTALL.serialNumber,
        connection_serial: PDI_P1B7_AUTHORIZED_INSTALL.serialNumber,
        vehicle_id: PDI_P1B7_AUTHORIZED_INSTALL.vehicleId,
        organization_id: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
        registry_lifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    ]),
    $executeRaw: jest.fn(() => {
      throw new Error('unexpected prisma write');
    }),
    $executeRawUnsafe: jest.fn(() => {
      throw new Error('unexpected prisma write');
    }),
    $transaction: jest.fn(() => {
      throw new Error('unexpected prisma write');
    }),
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: '51cf9144-8aa5-4a19-994a-dc8c9efa6ccb',
        email: 'admin@synqdrive.de',
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      }),
    },
    physicalDevice: {
      findUnique: jest.fn().mockResolvedValue({
        id: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
        identityStatus: PhysicalDeviceIdentityStatus.VERIFIED,
        status: PhysicalDeviceInventoryStatus.AVAILABLE,
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: PDI_P1B7_AUTHORIZED_INSTALL.serialNumber,
        ownerOrganizationId: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId,
        assignments: [
          {
            id: 'intake-1',
            vehicleId: null,
            assignmentKind: PhysicalDeviceAssignmentKind.INVENTORY_INTAKE,
            idempotencyKey: 'p1b7-intake-token-192922',
            physicalDeviceId: PDI_P1B7_AUTHORIZED_INSTALL.physicalDeviceId,
            effectiveTo: null,
          },
        ],
      }),
      ...modelWrite(),
    },
    physicalDeviceInventoryAuditEvent: {
      findFirst: jest.fn().mockResolvedValue({ id: 'gate-c-audit' }),
      ...modelWrite(),
    },
    physicalDeviceAssignment: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      ...modelWrite(),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: PDI_P1B7_AUTHORIZED_INSTALL.ownerOrganizationId }),
      ...modelWrite(),
    },
  };

  return { prisma, writeMethods };
}

describe('pdi-p1b7-install-operator.runner dry-run isolation', () => {
  it('dry-run returns exit 0 on successful preflight without installOnVehicle or prisma writes', async () => {
    const { prisma } = buildHappyPreflightPrismaMock();
    const app = await createPdiP1b7InstallOperatorApplicationContext({
      prisma: prisma as never,
    });
    const installSpy = jest.spyOn(PhysicalDeviceInventoryService.prototype, 'installOnVehicle');

    const outcome = await runPdiP1b7InstallOperator(app, {
      execute: false,
      confirmFlag: false,
      actorEmail: 'admin@synqdrive.de',
      operatorAttestation: 'preflight only',
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.exitCode).toBe(0);
    }
    expect(installSpy).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.physicalDevice.create).not.toHaveBeenCalled();

    installSpy.mockRestore();
    await app.close();
  });

  it('dry-run returns exit 2 when preflight is blocking', async () => {
    const { prisma } = buildHappyPreflightPrismaMock();
    (prisma.physicalDevice.findUnique as jest.Mock).mockResolvedValue(null);
    const app = await createPdiP1b7InstallOperatorApplicationContext({
      prisma: prisma as never,
    });
    const installSpy = jest.spyOn(PhysicalDeviceInventoryService.prototype, 'installOnVehicle');

    const outcome = await runPdiP1b7InstallOperator(app, {
      execute: false,
      confirmFlag: false,
      actorEmail: 'admin@synqdrive.de',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.exitCode).toBe(2);
    }
    expect(installSpy).not.toHaveBeenCalled();

    installSpy.mockRestore();
    await app.close();
  });

  it('execute gates still block without operator env before service calls', async () => {
    delete process.env.PDI_P1B7_INSTALL_OPERATOR_ENABLED;
    const { prisma } = buildHappyPreflightPrismaMock();
    const app = await createPdiP1b7InstallOperatorApplicationContext({
      prisma: prisma as never,
    });
    const installSpy = jest.spyOn(PhysicalDeviceInventoryService.prototype, 'installOnVehicle');

    const outcome = await runPdiP1b7InstallOperator(app, {
      execute: true,
      confirmFlag: true,
      actorEmail: 'admin@synqdrive.de',
      operatorAttestation: 'owner ok',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr).toMatch(/PDI_P1B7_INSTALL_OPERATOR_ENABLED/);
    }
    expect(installSpy).not.toHaveBeenCalled();

    installSpy.mockRestore();
    await app.close();
  });

  it('closing injected-prisma context does not invoke prisma connect lifecycle on mock', async () => {
    const { prisma } = buildHappyPreflightPrismaMock();
    const app = await createPdiP1b7InstallOperatorApplicationContext({
      prisma: prisma as never,
    });
    await app.close();
    expect(prisma.$connect).not.toHaveBeenCalled();
    expect(prisma.$disconnect).not.toHaveBeenCalled();
  });
});
