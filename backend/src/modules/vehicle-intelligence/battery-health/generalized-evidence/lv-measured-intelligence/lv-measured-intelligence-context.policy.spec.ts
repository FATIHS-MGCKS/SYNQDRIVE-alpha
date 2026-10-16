import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import {
  mapEvidenceClassToOperationalContext,
  nominalRestIntervalIndexToLadderLabel,
} from './lv-measured-intelligence-context.policy';

describe('lv-measured-intelligence-context.policy', () => {
  it('maps charging flag before evidence class', () => {
    expect(
      mapEvidenceClassToOperationalContext(
        BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
        true,
      ),
    ).toBe('CHARGING');
  });

  it('maps parked rest candidate to REST', () => {
    expect(
      mapEvidenceClassToOperationalContext(
        BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
        false,
      ),
    ).toBe('REST');
  });

  it('labels nominal ladder hours', () => {
    expect(nominalRestIntervalIndexToLadderLabel(1)).toBe('8h');
    expect(nominalRestIntervalIndexToLadderLabel(3)).toBe('24h');
  });
});
