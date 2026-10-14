import { verifyNoNumericReferenceGroupSums } from '../di-v0-p21-r3-forensic-analyze';

describe('P21 R3B reference group arithmetic', () => {
  it('accepts when A/B sum to noNumericTotal and C + posGap equals total', () => {
    const result = verifyNoNumericReferenceGroupSums({
      noNumericTotal: 763,
      disjointV2: { POS_GAP_X: 8, HOLD_TRANSITION_Y: 755 },
      holdDetailAllNoNumeric: { CENTER_FROZEN_UNRESOLVED: 501, OTHER: 262 },
      holdDetailExcludingPosGap: { CENTER_FROZEN_UNRESOLVED: 500, OTHER: 255 },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects when hold breakdown is mislabeled with wrong denominator', () => {
    const result = verifyNoNumericReferenceGroupSums({
      noNumericTotal: 763,
      disjointV2: { A: 763 },
      holdDetailAllNoNumeric: { X: 755 },
      holdDetailExcludingPosGap: { X: 755 },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('B_holdAll'))).toBe(true);
  });
});
