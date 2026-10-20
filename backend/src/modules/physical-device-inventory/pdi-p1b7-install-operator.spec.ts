import { UserPlatformRole, UserStatus } from '@prisma/client';
import { resolveAuthorizedMasterAdminActor } from './pdi-p1b7-manual-intake-operator.lib';
import {
  assertPdiP1b7InstallExecuteGates,
  buildPdiP1b7InstallDto,
  PDI_P1B7_AUTHORIZED_INSTALL,
  validatePdiP1b7InstallDto,
} from './pdi-p1b7-install-operator.lib';

describe('pdi-p1b7-install-operator.lib', () => {
  const prevOperatorGate = process.env.PDI_P1B7_INSTALL_OPERATOR_ENABLED;
  const prevP1b1 = process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;

  afterEach(() => {
    if (prevOperatorGate === undefined) {
      delete process.env.PDI_P1B7_INSTALL_OPERATOR_ENABLED;
    } else {
      process.env.PDI_P1B7_INSTALL_OPERATOR_ENABLED = prevOperatorGate;
    }
    if (prevP1b1 === undefined) {
      delete process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;
    } else {
      process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = prevP1b1;
    }
  });

  it('builds the frozen P1B.7 Gate D install DTO', async () => {
    const dto = buildPdiP1b7InstallDto();
    await validatePdiP1b7InstallDto(dto);
    expect(dto.vehicleId).toBe(PDI_P1B7_AUTHORIZED_INSTALL.vehicleId);
    expect(dto.installConfirmation).toBe(true);
    expect(dto.idempotencyKey).toBe(PDI_P1B7_AUTHORIZED_INSTALL.idempotencyKey);
    expect(dto.installNotes).toBe(PDI_P1B7_AUTHORIZED_INSTALL.installNotes);
  });

  it('blocks execute when operator env gate is OFF', () => {
    delete process.env.PDI_P1B7_INSTALL_OPERATOR_ENABLED;
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';
    expect(() =>
      assertPdiP1b7InstallExecuteGates({
        execute: true,
        confirmFlag: true,
        operatorAttestation: 'Owner authorized PDI P1B.7 Gate D',
      }),
    ).toThrow(/PDI_P1B7_INSTALL_OPERATOR_ENABLED/);
  });

  it('requires operator env gate and confirmation for execute', () => {
    process.env.PDI_P1B7_INSTALL_OPERATOR_ENABLED = 'true';
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';

    expect(() =>
      assertPdiP1b7InstallExecuteGates({
        execute: true,
        confirmFlag: false,
        operatorAttestation: 'owner ok',
      }),
    ).toThrow(/confirm-p1b7-install/);

    assertPdiP1b7InstallExecuteGates({
      execute: true,
      confirmFlag: true,
      operatorAttestation: 'Owner authorized PDI P1B.7 Gate D',
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
    ).rejects.toThrow(/MASTER_ADMIN/i);
  });
});
