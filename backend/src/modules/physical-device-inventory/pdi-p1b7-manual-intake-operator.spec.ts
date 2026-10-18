import { UserPlatformRole, UserStatus, PhysicalDeviceModelCode } from '@prisma/client';
import {
  assertPdiP1b7ExecuteGates,
  buildPdiP1b7ManualIntakeDto,
  PDI_P1B7_AUTHORIZED_INTAKE,
  resolveAuthorizedMasterAdminActor,
  validatePdiP1b7ManualIntakeDto,
} from './pdi-p1b7-manual-intake-operator.lib';

describe('pdi-p1b7-manual-intake-operator.lib', () => {
  const prevOperatorGate = process.env.PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED;
  const prevP1b1 = process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;

  afterEach(() => {
    if (prevOperatorGate === undefined) {
      delete process.env.PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED;
    } else {
      process.env.PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED = prevOperatorGate;
    }
    if (prevP1b1 === undefined) {
      delete process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;
    } else {
      process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = prevP1b1;
    }
  });

  it('builds the frozen P1B.7 manual intake DTO', async () => {
    const dto = buildPdiP1b7ManualIntakeDto();
    await validatePdiP1b7ManualIntakeDto(dto);
    expect(dto.modelCode).toBe(PhysicalDeviceModelCode.RUPTELA_R1);
    expect(dto.serialNumber).toBe(PDI_P1B7_AUTHORIZED_INTAKE.serialNumber);
    expect(dto.idempotencyKey).toBe(PDI_P1B7_AUTHORIZED_INTAKE.idempotencyKey);
    expect(dto.imei).toBeUndefined();
  });

  it('blocks execute when operator env gate is OFF', () => {
    delete process.env.PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED;
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';
    expect(() =>
      assertPdiP1b7ExecuteGates({
        execute: true,
        confirmFlag: true,
        operatorAttestation: 'Owner authorized PDI P1B.7 Gate B',
      }),
    ).toThrow(/PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED/);
  });

  it('requires operator env gate and confirmation for execute', () => {
    process.env.PDI_P1B7_MANUAL_INTAKE_OPERATOR_ENABLED = 'true';
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';

    expect(() =>
      assertPdiP1b7ExecuteGates({
        execute: true,
        confirmFlag: false,
        operatorAttestation: 'owner ok',
      }),
    ).toThrow(/confirm-p1b7-manual-intake/);

    expect(() =>
      assertPdiP1b7ExecuteGates({
        execute: true,
        confirmFlag: true,
        operatorAttestation: 'short',
      }),
    ).toThrow(/operator-attestation/);

    assertPdiP1b7ExecuteGates({
      execute: true,
      confirmFlag: true,
      operatorAttestation: 'Owner authorized PDI P1B.7 Gate B',
    });
  });

  it('rejects non-master-admin actor resolution', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'user@example.com',
          platformRole: UserPlatformRole.USER,
          status: UserStatus.ACTIVE,
        }),
      },
    };
    await expect(
      resolveAuthorizedMasterAdminActor(prisma as never, { actorEmail: 'user@example.com' }),
    ).rejects.toThrow(/MASTER_ADMIN/);
  });

  it('accepts master admin actor resolution', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@synqdrive.de',
          platformRole: UserPlatformRole.MASTER_ADMIN,
          status: UserStatus.ACTIVE,
        }),
      },
    };
    const actor = await resolveAuthorizedMasterAdminActor(prisma as never, {
      actorEmail: 'admin@synqdrive.de',
    });
    expect(actor.id).toBe('admin-1');
  });
});
