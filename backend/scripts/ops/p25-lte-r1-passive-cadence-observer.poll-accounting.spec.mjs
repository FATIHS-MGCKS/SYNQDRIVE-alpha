import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPollsAfterCursor,
  applyDistinctPollRows,
  bootstrapPollCursorAtLatest,
} from './p25-lte-r1-passive-cadence-observer.poll-accounting.lib.cjs';

function poll(id, startedAt, status = 'SUCCESS') {
  return { id, startedAt, status };
}

describe('lte-r1 poll accounting', () => {
  it('POLL_DEDUP: same poll not counted twice across two apply batches', () => {
    const rows = [poll('a', '2026-09-25T10:00:00.000Z')];
    let state = {};
    const r1 = applyDistinctPollRows(state, filterPollsAfterCursor(rows, null));
    state = r1.state;
    assert.equal(r1.newRows, 1);
    assert.equal(state.pollCount, 1);

    const r2 = applyDistinctPollRows(state, filterPollsAfterCursor(rows, state));
    assert.equal(r2.newRows, 0);
    assert.equal(r2.state.pollCount, 1);
  });

  it('MULTI_POLL_BETWEEN_SAMPLES: 2+ new polls in one window', () => {
    const all = [
      poll('a', '2026-09-25T10:00:00.000Z'),
      poll('b', '2026-09-25T10:00:30.000Z'),
      poll('c', '2026-09-25T10:01:00.000Z'),
    ];
    let state = {};
    const batch1 = applyDistinctPollRows(state, filterPollsAfterCursor([all[0]], null));
    state = batch1.state;
    const batch2 = applyDistinctPollRows(state, filterPollsAfterCursor(all, state));
    assert.equal(batch2.newRows, 2);
    assert.equal(batch2.state.pollCount, 3);
    assert.equal(batch2.state.successfulPollCount, 3);
  });

  it('same startedAt different ids', () => {
    const t = '2026-09-25T10:00:00.000Z';
    const all = [poll('id-1', t), poll('id-2', t)];
    const r = applyDistinctPollRows({}, filterPollsAfterCursor(all, null));
    assert.equal(r.newRows, 2);
    assert.equal(r.state.lastProcessedPollId, 'id-2');
  });

  it('OBSERVER_RESTART_CURSOR: resumes after persisted cursor', () => {
    const all = [
      poll('a', '2026-09-25T10:00:00.000Z'),
      poll('b', '2026-09-25T10:00:30.000Z'),
    ];
    let state = applyDistinctPollRows({}, filterPollsAfterCursor([all[0]], null)).state;
    const reloaded = applyDistinctPollRows(
      { ...state },
      filterPollsAfterCursor(all, state),
    );
    assert.equal(reloaded.newRows, 1);
    assert.equal(reloaded.state.pollCount, 2);
  });

  it('bootstrap cursor does not increment counters', () => {
    const boot = bootstrapPollCursorAtLatest({}, poll('z', '2026-09-25T12:00:00.000Z'));
    assert.equal(boot.pollCount, 0);
    assert.equal(boot.lastProcessedPollId, 'z');
  });
});
