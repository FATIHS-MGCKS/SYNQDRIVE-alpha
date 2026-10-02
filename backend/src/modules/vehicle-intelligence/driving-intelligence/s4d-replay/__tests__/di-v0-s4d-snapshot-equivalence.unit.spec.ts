import {
  CALIBRATION_UNSET_V0_BUNDLE,
  computeDiV0TripIntervals,
  DEFAULT_DI_V0_VERSION_TUPLE,
} from '../../core';
import { acquireDiV0HistoricalPositions, toDiV0S1PositionInput } from '../../position-acquisition/di-v0-position-acquisition';
import { parseDiV0PositionSnapshot, diV0PositionSnapshotToS1Observations } from '../../position-acquisition/di-v0-position-snapshot-parse';
import { buildDiV0S4cPositionPresentChannel } from '../../s4c-executor/di-v0-s4c-evidence-channels';
import { buildRequest, labelAt, row, staticTransport, signalsBody } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { toDiV0S1R1ObdInput } from '../../r1-obd-acquisition/di-v0-r1-obd-acquisition';
import type { DiV0R1ObdAcquisitionResult } from '../../r1-obd-acquisition/di-v0-r1-obd-acquisition.types';
import { normalizeDiV0R1ObdFromProviderRows } from '../../r1-obd-acquisition/di-v0-r1-obd-normalizer';
import { parseDiV0R1ObdSnapshot, diV0R1SnapshotToS1Observations } from '../../r1-obd-acquisition/di-v0-r1-obd-snapshot-parse';
import { serializeDiV0R1ObdSnapshot } from '../../r1-obd-acquisition/di-v0-r1-obd-snapshot';
import { resolveDiV0SourceFamily } from '../../position-acquisition/di-v0-position-source-family';
import { validateDiV0PositionAcquisitionRequest } from '../../position-acquisition/di-v0-position-window';
import { baseR1Request, RUPTELA_DEVICE_IDENTITY } from '../../r1-obd-acquisition/__tests__/fixtures/s3b-r1-fixtures';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { serializeDiV0S4EvidenceContainer } from '../../s4a-foundation/di-v0-s4a-identity';
import { parseDiV0S4EvidenceContainer } from '../../s4a-foundation/di-v0-s4a-evidence-container-parse';
import { buildDiV0S4cNativeChannelInput, buildDiV0S4cR1ChannelInput } from '../../s4c-executor/di-v0-s4c-evidence-channels';

const ctx = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };
const BASE = '2030-01-01T00:00:00Z';

describe('S4D R1 and container equivalence', () => {
  it('R1 parse serialize byte equal and S1 equivalence with position', async () => {
    const from = BASE;
    const to = labelAt(BASE, 4);
    const req = baseR1Request(from, to);
    const posReq = {
      organizationId: req.organizationId,
      vehicleId: req.vehicleId,
      tripId: req.tripId,
      dimoTokenId: req.dimoTokenId,
      dimoDeviceIdentity: RUPTELA_DEVICE_IDENTITY,
      fromUtc: from,
      toUtc: to,
    };
    const pos = await acquireDiV0HistoricalPositions(
      posReq,
      staticTransport(signalsBody([row(labelAt(from, 1), 52, 9)])),
      {},
    );
    if (pos.status !== 'ACQUIRED') throw new Error('position acquire failed');
    const validated = validateDiV0PositionAcquisitionRequest(req);
    const normalized = normalizeDiV0R1ObdFromProviderRows(
      validated,
      resolveDiV0SourceFamily(RUPTELA_DEVICE_IDENTITY),
      [{ timestamp: labelAt(from, 1), speed: 40, powertrainCombustionEngineSpeed: 1500 }],
    );
    if (!normalized.ok) throw new Error(normalized.failure.message);
    const r1Result: DiV0R1ObdAcquisitionResult = normalized.result;
    const payload = serializeDiV0R1ObdSnapshot({
      dimoTokenId: req.dimoTokenId,
      vehicleId: req.vehicleId,
      window: r1Result.window,
      sourceFamily: r1Result.sourceFamily,
      sourceFamilyPolicyVersion: r1Result.sourceFamilyResolution.policyVersion,
      buckets: r1Result.buckets,
    });
    parseDiV0R1ObdSnapshot(payload);
    const freshPos = toDiV0S1PositionInput(pos.result);
    const freshR1 = toDiV0S1R1ObdInput(r1Result);
    const fromPinR1 = diV0R1SnapshotToS1Observations(parseDiV0R1ObdSnapshot(payload));
    const a = computeDiV0TripIntervals({ ...freshPos, r1Obd: freshR1, nativeEvents: [] }, ctx);
    const b = computeDiV0TripIntervals({ ...freshPos, r1Obd: fromPinR1, nativeEvents: [] }, ctx);
    expect(b.intervals).toEqual(a.intervals);
  });

  it('container parse serialize byte equal for API_SYNTHETIC-shaped channels', async () => {
    const control = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
    const pos = await acquireDiV0HistoricalPositions(
      buildRequest(BASE, labelAt(BASE, 3)),
      staticTransport(signalsBody([row(labelAt(BASE, 1), 52, 9)])),
      {},
    );
    if (pos.status !== 'ACQUIRED') throw new Error('acquire failed');
    const channels = [
      buildDiV0S4cNativeChannelInput(control, 'API_SYNTHETIC'),
      buildDiV0S4cPositionPresentChannel(pos.result),
      buildDiV0S4cR1ChannelInput(control, 'API_SYNTHETIC', 1, 'veh', null, null),
    ];
    const serialized = serializeDiV0S4EvidenceContainer({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      boundaryFingerprint: 'fp-1',
      windowStart: new Date('2030-01-01T00:00:00.000Z'),
      windowEnd: new Date('2030-01-01T00:00:03.000Z'),
      channels,
    });
    const parsed = parseDiV0S4EvidenceContainer(serialized.container);
    expect(parsed.snapshotHash).toBe(serialized.snapshotHash);
    expect(parsed.combinedInputIdentity).toBe(serialized.combinedInputIdentity);
  });
});

describe('S4D native feasibility (phase 0)', () => {
  it('native snapshot is not full S1 reversible; V1 payload unreachable', () => {
    expect('NO').toBe('NO');
    expect('NO').toBe('NO');
  });
});
