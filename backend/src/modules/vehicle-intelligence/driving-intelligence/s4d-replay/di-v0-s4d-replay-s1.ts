import type { DiV0TripComputeInput, TelemetrySourceFamily } from '../core/types';
import { parseDiV0PositionSnapshot, diV0PositionSnapshotToS1Observations } from '../position-acquisition/di-v0-position-snapshot-parse';
import { parseDiV0R1ObdSnapshot, diV0R1SnapshotToS1Observations } from '../r1-obd-acquisition/di-v0-r1-obd-snapshot-parse';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../position-acquisition/di-v0-position-acquisition.versions';
import { DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.versions';

export class DiV0S4dReplayS1Error extends Error {
  constructor(message: string) {
    super(`DI_V0_S4D_REPLAY_S1:${message}`);
    this.name = 'DiV0S4dReplayS1Error';
  }
}

/** Deserialize pinned channel payloads into S1 compute input. No provider calls; no fabrication. */
export function buildDiV0S4dS1InputFromParsedContainer(
  parsed: DiV0S4ParsedEvidenceContainer,
  sourceFamily: TelemetrySourceFamily,
): DiV0TripComputeInput {
  const positionEntry = parsed.channelManifest.find((c) => c.channel === 'POSITION');
  const r1Entry = parsed.channelManifest.find((c) => c.channel === 'R1_OBD');
  let positions: DiV0TripComputeInput['positions'] = [];
  if (positionEntry?.formatVersion === DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 && parsed.channelPayloads.POSITION) {
    positions = diV0PositionSnapshotToS1Observations(parseDiV0PositionSnapshot(parsed.channelPayloads.POSITION));
  } else if (positionEntry?.payloadSha256 != null) {
    throw new DiV0S4dReplayS1Error('position payload missing or unsupported format');
  }
  let r1Obd: DiV0TripComputeInput['r1Obd'] = [];
  if (r1Entry?.formatVersion === DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 && parsed.channelPayloads.R1_OBD) {
    r1Obd = diV0R1SnapshotToS1Observations(parseDiV0R1ObdSnapshot(parsed.channelPayloads.R1_OBD));
  } else if (r1Entry?.payloadSha256 != null) {
    throw new DiV0S4dReplayS1Error('r1 payload missing or unsupported format');
  }
  if (parsed.channelPayloads.NATIVE_EVENT) {
    throw new DiV0S4dReplayS1Error('native payload not supported under channel policy V1');
  }
  return { sourceFamily, positions, r1Obd, nativeEvents: [] };
}
