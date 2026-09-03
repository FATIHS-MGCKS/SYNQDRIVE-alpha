import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';
import { buildCanonicalLvPublicationHandoffJobKey } from './lv-publication-handoff.policy';

describe('lv-publication-contract.policy', () => {
  it('defines LV_PUBLICATION_CONTRACT_VERSION === 1', () => {
    expect(LV_PUBLICATION_CONTRACT_VERSION).toBe(1);
  });

  it('builds pub:{assessmentId}:v1 identity', () => {
    expect(
      buildCanonicalLvPublicationHandoffJobKey({ assessmentId: 'assess-a' }),
    ).toBe('pub:assess-a:v1');
  });
});
