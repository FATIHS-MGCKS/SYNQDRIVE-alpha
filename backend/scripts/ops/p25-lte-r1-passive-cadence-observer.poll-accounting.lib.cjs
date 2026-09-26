'use strict';

/**
 * Pure poll cursor + distinct-row accounting for passive cadence observer.
 * ONE dimo_poll_logs row counted at most once across observer samples/restarts.
 */

function emptyVehiclePollState() {
  return {
    lastProcessedPollId: null,
    lastProcessedPollStartedAt: null,
    pollCount: 0,
    successfulPollCount: 0,
    failedPollCount: 0,
  };
}

function pollRowSortKey(row) {
  return { startedAtMs: new Date(row.startedAt).getTime(), id: row.id };
}

function comparePollRows(a, b) {
  const ka = pollRowSortKey(a);
  const kb = pollRowSortKey(b);
  if (ka.startedAtMs !== kb.startedAtMs) return ka.startedAtMs - kb.startedAtMs;
  return ka.id.localeCompare(kb.id);
}

/** Rows strictly after cursor in (startedAt ASC, id ASC) order. */
function filterPollsAfterCursor(allRows, cursor) {
  const sorted = [...allRows].sort(comparePollRows);
  if (!cursor?.lastProcessedPollId || !cursor?.lastProcessedPollStartedAt) {
    return sorted;
  }
  const cursorAt = new Date(cursor.lastProcessedPollStartedAt).getTime();
  const cursorId = cursor.lastProcessedPollId;
  return sorted.filter((row) => {
    const t = new Date(row.startedAt).getTime();
    if (t > cursorAt) return true;
    if (t < cursorAt) return false;
    return row.id > cursorId;
  });
}

/**
 * Apply newly observed poll rows exactly once; advance cursor to last row in batch.
 * @returns {{ state, newRows, newSuccess, newFailed }}
 */
function applyDistinctPollRows(vehicleState, newRows) {
  const state = {
    ...emptyVehiclePollState(),
    ...vehicleState,
    signals: vehicleState?.signals ?? {},
  };
  const ordered = [...newRows].sort(comparePollRows);
  if (ordered.length === 0) {
    return { state, newRows: 0, newSuccess: 0, newFailed: 0 };
  }

  let newSuccess = 0;
  let newFailed = 0;
  for (const row of ordered) {
    state.pollCount += 1;
    if (row.status === 'SUCCESS') newSuccess += 1;
    else newFailed += 1;
  }
  state.successfulPollCount += newSuccess;
  state.failedPollCount += newFailed;

  const last = ordered[ordered.length - 1];
  state.lastProcessedPollId = last.id;
  state.lastProcessedPollStartedAt =
    last.startedAt instanceof Date ? last.startedAt.toISOString() : last.startedAt;

  return {
    state,
    newRows: ordered.length,
    newSuccess,
    newFailed,
  };
}

/** Bootstrap cursor at epoch boundary without incrementing epoch counters. */
function bootstrapPollCursorAtLatest(vehicleState, latestPollRow) {
  const state = {
    ...emptyVehiclePollState(),
    ...vehicleState,
    signals: vehicleState?.signals ?? {},
    pollCount: 0,
    successfulPollCount: 0,
    failedPollCount: 0,
  };
  if (!latestPollRow) return state;
  state.lastProcessedPollId = latestPollRow.id;
  state.lastProcessedPollStartedAt =
    latestPollRow.startedAt instanceof Date
      ? latestPollRow.startedAt.toISOString()
      : latestPollRow.startedAt;
  return state;
}

module.exports = {
  emptyVehiclePollState,
  comparePollRows,
  filterPollsAfterCursor,
  applyDistinctPollRows,
  bootstrapPollCursorAtLatest,
};
