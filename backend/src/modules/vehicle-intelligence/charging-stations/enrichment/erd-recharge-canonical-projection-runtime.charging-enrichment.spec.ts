import { ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME } from '../../energy-events/erd-recharge-projection/erd-canonical-recharge-projector.types';
import { ErdRechargeCanonicalProjectionRuntimeService } from '../../energy-events/erd-recharge-write-authority/erd-recharge-canonical-projection-runtime.service';
import { ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME } from '../../energy-events/erd-recharge-write-authority/erd-recharge-write-authority.constants';
import { projectCanonicalRecharge } from '../../energy-events/erd-recharge-projection/erd-canonical-recharge-projector';
import { shouldProjectCanonicalRechargeSession } from '../../energy-events/erd-recharge-write-authority/erd-recharge-write-gate.policy';

jest.mock('../../energy-events/erd-recharge-projection/erd-canonical-recharge-projector', () => ({
  projectCanonicalRecharge: jest.fn(),
}));
jest.mock('../../energy-events/erd-recharge-write-authority/erd-recharge-write-gate.policy', () => ({
  shouldProjectCanonicalRechargeSession: jest.fn(),
}));

describe('ErdRechargeCanonicalProjectionRuntimeService E6.3 hook (H1–H8)', () => {
  const prisma = {} as never;
  const producer = {
    enqueueAfterProjection: jest.fn().mockResolvedValue('job-1'),
  };

  const service = new ErdRechargeCanonicalProjectionRuntimeService(
    prisma,
    undefined,
    producer as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    (shouldProjectCanonicalRechargeSession as jest.Mock).mockReturnValue({ allowed: true });
  });

  const baseInput = {
    organizationId: 'org',
    vehicleId: 'veh',
    session: { id: 'sess' } as never,
    env: process.env,
  };

  it.each([
    ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED,
    ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED,
    ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.HANDOFF_COMPLETED,
    ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NO_OP,
  ])('H: %s enqueues', async (outcome) => {
    (projectCanonicalRecharge as jest.Mock).mockResolvedValue({
      outcome,
      vehicleEnergyEventId: 'vee-1',
    });
    await service.projectSingleSessionSafe(baseInput);
    expect(producer.enqueueAfterProjection).toHaveBeenCalledWith('vee-1');
  });

  it('H5/H6: NOT_PROJECTABLE and conflict skip enqueue', async () => {
    (projectCanonicalRecharge as jest.Mock).mockResolvedValue({
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.NOT_PROJECTABLE,
      vehicleEnergyEventId: 'vee-1',
    });
    await service.projectSingleSessionSafe(baseInput);
    expect(producer.enqueueAfterProjection).not.toHaveBeenCalled();

    (projectCanonicalRecharge as jest.Mock).mockResolvedValue({
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.IDENTITY_CONFLICT,
      vehicleEnergyEventId: 'vee-1',
    });
    const result = await service.projectSingleSessionSafe(baseInput);
    expect(result).toBe(ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.CONFLICT);
    expect(producer.enqueueAfterProjection).not.toHaveBeenCalled();
  });

  it('H7: enqueue failure does not fail projection outcome', async () => {
    (projectCanonicalRecharge as jest.Mock).mockResolvedValue({
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED,
      vehicleEnergyEventId: 'vee-1',
    });
    producer.enqueueAfterProjection.mockRejectedValue(new Error('redis down'));
    const result = await service.projectSingleSessionSafe(baseInput);
    expect(result).toBe(ERD_RECHARGE_PROJECTION_RUNTIME_OUTCOME.CREATED);
  });

  it('H8: missing producer is no-op', async () => {
    const noProducer = new ErdRechargeCanonicalProjectionRuntimeService(prisma);
    (projectCanonicalRecharge as jest.Mock).mockResolvedValue({
      outcome: ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.CREATED,
      vehicleEnergyEventId: 'vee-1',
    });
    await noProducer.projectSingleSessionSafe(baseInput);
  });
});
