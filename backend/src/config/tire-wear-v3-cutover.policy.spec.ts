import {
  isTireWearV3CustomerReadActive,
  isTireWearV3CustomerReadAuthoritative,
  shouldSuppressV2TireWearSnapshotWrites,
} from './tire-wear-v3-cutover.policy';

describe('tire-wear-v3-cutover.policy truth table', () => {
  const cases: Array<{
    enabled: boolean;
    authoritative: boolean;
    readActive: boolean;
    readAuthoritative: boolean;
    suppressV2Snapshots: boolean;
  }> = [
    { enabled: false, authoritative: false, readActive: false, readAuthoritative: false, suppressV2Snapshots: false },
    { enabled: false, authoritative: true, readActive: false, readAuthoritative: false, suppressV2Snapshots: false },
    { enabled: true, authoritative: false, readActive: true, readAuthoritative: false, suppressV2Snapshots: false },
    { enabled: true, authoritative: true, readActive: true, readAuthoritative: true, suppressV2Snapshots: true },
  ];

  it.each(cases)(
    'enabled=$enabled authoritative=$authoritative',
    ({ enabled, authoritative, readActive, readAuthoritative, suppressV2Snapshots }) => {
      const flags = { customerReadEnabled: enabled, customerReadAuthoritative: authoritative };
      expect(isTireWearV3CustomerReadActive(flags)).toBe(readActive);
      expect(isTireWearV3CustomerReadAuthoritative(flags)).toBe(readAuthoritative);
      expect(shouldSuppressV2TireWearSnapshotWrites(flags)).toBe(suppressV2Snapshots);
    },
  );
});
