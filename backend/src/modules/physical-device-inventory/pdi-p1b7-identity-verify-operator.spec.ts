import { UserPlatformRole, UserStatus } from '@prisma/client';
import { resolveAuthorizedMasterAdminActor } from './pdi-p1b7-manual-intake-operator.lib';
import {
  assertPdiP1b7IdentityVerifyExecuteGates,
  buildPdiP1b7IdentityVerifyDto,
  PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY,
  validatePdiP1b7IdentityVerifyDto,
} from './pdi-p1b7-identity-verify-operator.lib';

describe('pdi-p1b7-identity-verify-operator.lib', () => {
  const prevOperatorGate = process.env.PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED;
  const prevP1b1 = process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;

  afterEach(() => {
    if (prevOperatorGate === undefined) {
      delete process.env.PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED;
    } else {
      process.env.PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED = prevOperatorGate;
    }
    if (prevP1b1 === undefined) {
      delete process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;
    } else {
      process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = prevP1b1;
    }
  });

  it('builds the frozen P1B.7 Gate C verify DTO', async () => {
    const reviewerId = '51cf9144-8aa5-4a19-994a-dc8c9efa6ccb';
    const dto = buildPdiP1b7IdentityVerifyDto(reviewerId);
    await validatePdiP1b7IdentityVerifyDto(dto);
    expect(dto.attestationKind).toBe(PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.attestationKind);
    expect(dto.providerReconciliationVehicleId).toBe(PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.vehicleId);
    expect(dto.reviewerUserId).toBe(reviewerId);
    expect(dto.idempotencyKey).toBe(PDI_P1B7_AUTHORIZED_IDENTITY_VERIFY.idempotencyKey);
  });

  it('blocks execute when operator env gate is OFF', () => {
    delete process.env.PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED;
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';
    expect(() =>
      assertPdiP1b7IdentityVerifyExecuteGates({
        execute: true,
        confirmFlag: true,
        operatorAttestation: 'Owner authorized PDI P1B.7 Gate C',
      }),
    ).toThrow(/PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED/);
  });

  it('requires operator env gate and confirmation for execute', () => {
    process.env.PDI_P1B7_IDENTITY_VERIFY_OPERATOR_ENABLED = 'true';
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = 'true';

    expect(() =>
      assertPdiP1b7IdentityVerifyExecuteGates({
        execute: true,
        confirmFlag: false,
        operatorAttestation: 'owner ok',
      }),
    ).toThrow(/confirm-p1b7-identity-verify/);

    assertPdiP1b7IdentityVerifyExecuteGates({
      execute: true,
      confirmFlag: true,
      operatorAttestation: 'Owner authorized PDI P1B.7 Gate C',
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
    ).toThrow(/MASTER_ADMIN/);
  });
});
