import { acquireDiV0HistoricalPositions } from '../../position-acquisition/di-v0-position-acquisition';
import { parseDiV0PositionSnapshot, DiV0PositionSnapshotParseError } from '../../position-acquisition/di-v0-position-snapshot-parse';
import { serializeDiV0PositionSnapshot } from '../../position-acquisition/di-v0-position-snapshot';
import { buildRequest, labelAt, row, staticTransport, signalsBody } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { buildDiV0S4cPositionPresentChannel } from '../../s4c-executor/di-v0-s4c-evidence-channels';
import { assertDbChannelManifestMatchesParsed } from '../di-v0-s4d-manifest-parity';

const BASE = '2030-01-01T00:00:00Z';

describe('S4D P1 adversarial (unit)', () => {
  it('D-26 rejects permuted POSITION bucket labels with correct count', async () => {
    const acquired = await acquireDiV0HistoricalPositions(
      buildRequest(BASE, labelAt(BASE, 3)),
      staticTransport(signalsBody([row(labelAt(BASE, 2), 52, 9), row(labelAt(BASE, 1), 52.1, 9.1)])),
      {},
    );
    if (acquired.status !== 'ACQUIRED') throw new Error('acquire failed');
    const pin = buildDiV0S4cPositionPresentChannel(acquired.result);
    const lines = pin.payload!.split('\n');
    const bucketLines = lines.filter((l) => l.startsWith('["b"'));
    const swapped = [...bucketLines];
    if (swapped.length >= 2) [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    let out = 0;
    const rebuilt = lines.map((l) => (l.startsWith('["b"') ? swapped[out++] : l)).join('\n');
    expect(() => parseDiV0PositionSnapshot(rebuilt)).toThrow(DiV0PositionSnapshotParseError);
  });

  it('D-28 rejects semantically illegal ROW_ABSENT with providerRowCount>0', async () => {
    const acquired = await acquireDiV0HistoricalPositions(
      buildRequest(BASE, labelAt(BASE, 2)),
      staticTransport(signalsBody([row(labelAt(BASE, 1), 52, 9)])),
      {},
    );
    if (acquired.status !== 'ACQUIRED') throw new Error('acquire failed');
    const material = parseDiV0PositionSnapshot(buildDiV0S4cPositionPresentChannel(acquired.result).payload!);
    const tampered = { ...material, buckets: [{ ...material.buckets[0], availability: 'ROW_ABSENT' as const, providerRowCount: 2 }] };
    const payload = serializeDiV0PositionSnapshot(tampered);
    expect(() => parseDiV0PositionSnapshot(payload)).toThrow(DiV0PositionSnapshotParseError);
  });

  it('D-20 manifest parity rejects missing R1 entry in DB manifest', async () => {
    const parsed = [
      { channel: 'NATIVE_EVENT', outcome: 'DISABLED', reasonCode: null, formatVersion: null, payloadSha256: null, channelEvidenceHash: null, attestationRef: null },
      { channel: 'POSITION', outcome: 'PRESENT', reasonCode: null, formatVersion: 'v', payloadSha256: 'a', channelEvidenceHash: 'b', attestationRef: null },
    ];
    expect(() => assertDbChannelManifestMatchesParsed(parsed, parsed as never)).toThrow();
  });
});
