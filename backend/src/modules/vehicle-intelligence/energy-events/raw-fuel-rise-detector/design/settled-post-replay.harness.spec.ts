import {
  ADVERSARIAL_REPLAY_CASES,
  CALIBRATION_PACK_MANIFEST,
  DEFENSIBLE_NATURAL_CALIBRATION_ROWS,
} from './settled-post-replay.fixtures';
import { REPLAY_DROP_CAP_CLASSIFICATION } from './settled-post-refuel-plateau.policy';

describe('RFRF settled-post replay fixtures (design-only)', () => {
  it('calibration pack lists seven defensible natural rows and twelve adversarial cases', () => {
    expect(CALIBRATION_PACK_MANIFEST.defensibleNaturalRows).toBe(7);
    expect(CALIBRATION_PACK_MANIFEST.adversarialSemanticCases).toBe(12);
    expect(DEFENSIBLE_NATURAL_CALIBRATION_ROWS).toHaveLength(7);
    expect(ADVERSARIAL_REPLAY_CASES.map((c) => c.id)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'A7',
      'A8',
      'A9',
      'A10',
      'A11',
      'A12',
    ]);
  });

  it('replay drop caps remain classified as hypothesis-only (not Production)', () => {
    expect(REPLAY_DROP_CAP_CLASSIFICATION).toBe('REPLAY_HYPOTHESIS_ONLY');
  });
});
