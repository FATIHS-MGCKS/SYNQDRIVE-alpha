import {
  isLiveFsmSplitContinuationCandidate,
  isLiveFsmSplitParentCandidate,
} from '../trip-di-boundary-admission-live-fsm-split.util';

describe('trip-di-boundary-admission-live-fsm-split.util', () => {
  it('parent candidate requires MID_TRIP_GAP_SPLIT + LIVE_FSM without admission', () => {
    expect(
      isLiveFsmSplitParentCandidate({
        tripStatus: 'COMPLETED',
        endDetectionMode: 'MID_TRIP_GAP_SPLIT',
        rawDetectionMeta: { splitTriggeredBy: 'LIVE_FSM' },
      }),
    ).toBe(true);
    expect(
      isLiveFsmSplitParentCandidate({
        tripStatus: 'COMPLETED',
        endDetectionMode: 'MID_TRIP_GAP_SPLIT',
        rawDetectionMeta: { splitTriggeredBy: 'RECONCILIATION' },
      }),
    ).toBe(false);
  });

  it('continuation candidate requires splitFrom + LIVE_FSM without admission', () => {
    expect(
      isLiveFsmSplitContinuationCandidate({
        tripStatus: 'COMPLETED',
        rawDetectionMeta: { splitTriggeredBy: 'LIVE_FSM', splitFrom: 'parent-id' },
      }),
    ).toBe(true);
  });
});
