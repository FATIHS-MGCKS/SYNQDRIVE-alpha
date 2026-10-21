import { createHash } from 'crypto';
import { acquireDiV0HistoricalPositions } from '../../position-acquisition/di-v0-position-acquisition';
import { buildDiV0S4cPositionPresentChannel } from '../di-v0-s4c-evidence-channels';
import { buildRequest, row, labelAt, staticTransport, signalsBody } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';

const BASE = '2030-01-01T00:00:00Z';

async function acquire(rows: unknown[]) {
  const out = await acquireDiV0HistoricalPositions(
    buildRequest(BASE, labelAt(BASE, 3)),
    staticTransport(signalsBody(rows)),
    {},
  );
  if (out.status !== 'ACQUIRED') throw new Error('acquire failed');
  return out.result;
}

describe('S4C position snapshot fidelity', () => {
  it('normal and conflicting duplicate match canonical S3A bytes and digest', async () => {
    const normal = await acquire([row(labelAt(BASE, 1), 52, 9)]);
    const normalPin = buildDiV0S4cPositionPresentChannel(normal);
    expect(normalPin.payload).toBe(normal.canonicalSnapshotPayload);
    expect(createHash('sha256').update(normalPin.payload!, 'utf8').digest('hex')).toBe(normal.snapshotIdentity.digest);

    const conflict = await acquire([
      row(labelAt(BASE, 1), 52, 9),
      row(labelAt(BASE, 1), 53, 9),
    ]);
    const conflictPin = buildDiV0S4cPositionPresentChannel(conflict);
    expect(conflictPin.payload).toBe(conflict.canonicalSnapshotPayload);
    expect(createHash('sha256').update(conflictPin.payload!, 'utf8').digest('hex')).toBe(conflict.snapshotIdentity.digest);
  });
});
