import * as fs from 'fs';
import * as path from 'path';
import { DI_V0_S4_LIMITS } from '../di-v0-s4a-contract';

const contract = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../../../../..', 'architecture/drivingintelligence/design/s4a/s4a-contract.v2.json'),
    'utf8',
  ),
) as {
  settlement: {
    quietPeriodSeconds: number;
    quietPeriodSecondsMinimum?: number;
    quietPeriodSecondsMaximum?: number;
    driftHorizonSeconds: number;
    everyBoundaryMutationRearmsQuietTimer: boolean;
  };
};

describe('DI V0 S4A settlement policy (EXP021 near-realtime)', () => {
  it('mirrors contract quietPeriodSeconds for discovery and T01 scheduling', () => {
    expect(DI_V0_S4_LIMITS.settlementQuietPeriodSeconds).toBe(contract.settlement.quietPeriodSeconds);
    expect(DI_V0_S4_LIMITS.settlementQuietPeriodSeconds).toBeGreaterThanOrEqual(
      contract.settlement.quietPeriodSecondsMinimum ?? 300,
    );
    expect(DI_V0_S4_LIMITS.settlementQuietPeriodSeconds).toBeLessThanOrEqual(
      contract.settlement.quietPeriodSecondsMaximum ?? 86_400,
    );
  });

  it('keeps drift horizon well above quiet period for S4E reconciliation', () => {
    expect(DI_V0_S4_LIMITS.driftHorizonSeconds).toBeGreaterThan(DI_V0_S4_LIMITS.settlementQuietPeriodSeconds);
    expect(contract.settlement.driftHorizonSeconds).toBe(DI_V0_S4_LIMITS.driftHorizonSeconds);
  });

  it('does not re-arm the full quiet timer on every boundary mutation (repairs move anchor only)', () => {
    expect(contract.settlement.everyBoundaryMutationRearmsQuietTimer).toBe(false);
  });
});
