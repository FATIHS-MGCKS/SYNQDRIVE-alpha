import {
  CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOT_MS,
  CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOTS,
  maxScannedRestAssessmentHandoffCandidates,
  resolveRestAssessmentHandoffScanOffset,
} from './lv-rest-assessment-handoff-reconciliation.policy';

describe('lv-rest-assessment-handoff-reconciliation.policy', () => {
  it('bounds per-invocation scan budget from batch size', () => {
    expect(maxScannedRestAssessmentHandoffCandidates(100)).toBe(2000);
  });

  it('advances scan offset across wall-clock rotation slots', () => {
    const maxScanned = 2000;
    const slot0 = resolveRestAssessmentHandoffScanOffset(0, maxScanned);
    const slot1 = resolveRestAssessmentHandoffScanOffset(
      CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOT_MS,
      maxScanned,
    );
    const slot2 = resolveRestAssessmentHandoffScanOffset(
      CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOT_MS * 2,
      maxScanned,
    );

    expect(slot0).toBe(0);
    expect(slot1).toBe(maxScanned);
    expect(slot2).toBe(maxScanned * 2);
  });

  it('wraps rotation after all slots are consumed', () => {
    const maxScanned = 500;
    const wrapSlot = CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOT_MS *
      CANONICAL_REST_ASSESSMENT_HANDOFF_ROTATION_SLOTS;
    expect(resolveRestAssessmentHandoffScanOffset(wrapSlot, maxScanned)).toBe(0);
  });
});
