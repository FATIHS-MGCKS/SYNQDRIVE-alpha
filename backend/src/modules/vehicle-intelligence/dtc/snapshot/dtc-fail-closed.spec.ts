import { assertDtcSnapshotApplyWired, Dtc01aFailClosedError } from './dtc-fail-closed';

describe('dtc-fail-closed', () => {
  it('throws when flag enabled without apply service', () => {
    expect(() => assertDtcSnapshotApplyWired(true, undefined, 'test')).toThrow(
      Dtc01aFailClosedError,
    );
  });

  it('passes when service present', () => {
    expect(() => assertDtcSnapshotApplyWired(true, {}, 'test')).not.toThrow();
  });
});
