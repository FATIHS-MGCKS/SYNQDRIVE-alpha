import { createHash } from 'crypto';
import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
} from '../../core';
import { acquireDiV0HistoricalPositions, toDiV0S1PositionInput } from '../../position-acquisition/di-v0-position-acquisition';
import { parseDiV0PositionSnapshot, diV0PositionSnapshotToS1Observations } from '../../position-acquisition/di-v0-position-snapshot-parse';
import { buildRequest, labelAt, row, staticTransport, signalsBody } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { buildDiV0S4cPositionPresentChannel } from '../../s4c-executor/di-v0-s4c-evidence-channels';

const BASE = '2030-01-01T00:00:00Z';
const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };

describe('S4D snapshot parse round-trip', () => {
  it('position parse serialize byte equal and S1 equivalence', async () => {
    const acquired = await acquireDiV0HistoricalPositions(
      buildRequest(BASE, labelAt(BASE, 3)),
      staticTransport(signalsBody([row(labelAt(BASE, 1), 52, 9)])),
      {},
    );
    if (acquired.status !== 'ACQUIRED') throw new Error('acquire failed');
    const pin = buildDiV0S4cPositionPresentChannel(acquired.result);
    const payload = pin.payload!;
    const material = parseDiV0PositionSnapshot(payload);
    const fromPin = diV0PositionSnapshotToS1Observations(material);
    const fresh = toDiV0S1PositionInput(acquired.result);
    const a = computeDiV0TripIntervals({ ...fresh, r1Obd: [], nativeEvents: [] }, ctx);
    const b = computeDiV0TripIntervals({ sourceFamily: fresh.sourceFamily, positions: fromPin, r1Obd: [], nativeEvents: [] }, ctx);
    expect(b.intervals).toEqual(a.intervals);
    expect(createHash('sha256').update(payload, 'utf8').digest('hex')).toBe(acquired.result.snapshotIdentity.digest);
  });

});
