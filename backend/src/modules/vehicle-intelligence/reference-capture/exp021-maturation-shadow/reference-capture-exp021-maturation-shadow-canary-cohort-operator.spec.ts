import { EXP021_KS_MX_2024_CANARY } from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import {
  buildSettlementShadowLoaderForMember,
  resolveCohortForMaturationOperator,
} from './reference-capture-exp021-maturation-shadow-canary-cohort-operator.lib';
import { buildExp021CanaryCohortAuthority } from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';

describe('reference-capture-exp021-maturation-shadow-canary-cohort-operator.lib', () => {
  const twoMemberCohort = buildExp021CanaryCohortAuthority([
    {
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
      tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
    },
    {
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
      tokenId: 187361,
    },
  ])!;

  it('resolveCohortForMaturationOperator fails closed without env', () => {
    delete process.env.EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON;
    delete process.env.EXP021_CANARY_LIVE_WINDOW_COHORT_JSON;
    expect(() => resolveCohortForMaturationOperator()).toThrow('cohort operator requires');
  });

  it('buildSettlementShadowLoaderForMember scopes queries to vehicle/token', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      referenceCaptureSettlementShadowExperiment: { findMany },
    };
    const member = twoMemberCohort.members[0];
    await buildSettlementShadowLoaderForMember(prisma as never, member)();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: member.organizationId,
          vehicleId: member.vehicleId,
          tokenId: member.tokenId,
        },
      }),
    );
  });

});
