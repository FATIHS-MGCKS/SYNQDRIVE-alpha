import { closeOpenOrganizationAssignmentForOffboard } from '../offboarding/offboard-organization-assignment';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('closeOpenOrganizationAssignmentForOffboard', () => {
  const vehicleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orgId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const offboardedAt = new Date('2026-01-01T00:00:00.000Z');

  it('closes a single matching open assignment', async () => {
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      vehicleOrganizationAssignment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'assign-1', organizationId: orgId }]),
        update,
      },
    };
    await closeOpenOrganizationAssignmentForOffboard(tx as any, {
      vehicleId,
      organizationId: orgId,
      reason: 'OFFBOARD_SOLD',
      offboardedAt,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'assign-1' },
      data: { validTo: offboardedAt, assignmentReason: 'OFFBOARD_SOLD' },
    });
  });

  it('fails closed on foreign-org open assignment', async () => {
    const tx = {
      vehicleOrganizationAssignment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'assign-1', organizationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
        ]),
      },
    };
    await expect(
      closeOpenOrganizationAssignmentForOffboard(tx as any, {
        vehicleId,
        organizationId: orgId,
        reason: 'OFFBOARD_SOLD',
        offboardedAt,
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_MISMATCH' });
  });

  it('fails closed on multiple open assignments', async () => {
    const tx = {
      vehicleOrganizationAssignment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', organizationId: orgId },
          { id: 'a2', organizationId: orgId },
        ]),
      },
    };
    await expect(
      closeOpenOrganizationAssignmentForOffboard(tx as any, {
        vehicleId,
        organizationId: orgId,
        reason: 'OFFBOARD_SOLD',
        offboardedAt,
      }),
    ).rejects.toMatchObject({ code: 'ONBOARDING_CONCURRENCY_CONFLICT' });
  });
});
