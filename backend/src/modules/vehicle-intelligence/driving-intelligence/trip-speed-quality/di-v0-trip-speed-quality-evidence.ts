import { CALIBRATION_UNSET_V0_BUNDLE } from '../core/calibration/CALIBRATION_UNSET_V0';
import { classifyPositionRows } from '../core/position/hold-release';
import type { PositionState } from '../core/types';
import { parseDiV0PositionSnapshot } from '../position-acquisition/di-v0-position-snapshot-parse';
import { parseDiV0R1ObdSnapshot, diV0R1SnapshotToS1Observations } from '../r1-obd-acquisition/di-v0-r1-obd-snapshot-parse';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../position-acquisition/di-v0-position-acquisition.versions';
import { DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.versions';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import type { DiV0SpeedQcPositionSample, DiV0SpeedQcR1Sample } from '../speed-qc/di-v0-speed-qc.types';

export interface DiV0TripSpeedQualityEvidenceBundle {
  positions: DiV0SpeedQcPositionSample[];
  positionStateByLabel: Map<string, PositionState>;
  r1Obd: DiV0SpeedQcR1Sample[];
}

/** Derives per-bucket position samples with S1 hold/release classification (not shadow center state). */
export function buildDiV0TripSpeedQualityEvidenceFromParsedContainer(
  parsed: DiV0S4ParsedEvidenceContainer,
): DiV0TripSpeedQualityEvidenceBundle {
  const positionEntry = parsed.channelManifest.find((c) => c.channel === 'POSITION');
  const r1Entry = parsed.channelManifest.find((c) => c.channel === 'R1_OBD');
  const positions: DiV0SpeedQcPositionSample[] = [];
  const positionStateByLabel = new Map<string, PositionState>();

  if (positionEntry?.formatVersion === DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 && parsed.channelPayloads.POSITION) {
    const material = parseDiV0PositionSnapshot(parsed.channelPayloads.POSITION);
    const classified = classifyPositionRows(
      material.buckets.map((b) => b.observation),
      CALIBRATION_UNSET_V0_BUNDLE,
    );
    for (const row of classified) {
      const obs = row.observation;
      positions.push({
        bucketLabel: obs.bucketLabel,
        availability: obs.availability,
        latitude: obs.latitude,
        longitude: obs.longitude,
        positionState: row.positionState,
      });
      positionStateByLabel.set(obs.bucketLabel, row.positionState);
    }
  } else if (positionEntry?.payloadSha256 != null) {
    throw new Error('POSITION channel pinned but payload missing or unsupported format');
  }

  const r1Obd: DiV0SpeedQcR1Sample[] = [];
  if (r1Entry?.formatVersion === DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 && parsed.channelPayloads.R1_OBD) {
    const observations = diV0R1SnapshotToS1Observations(parseDiV0R1ObdSnapshot(parsed.channelPayloads.R1_OBD));
    for (const obs of observations) {
      r1Obd.push({ bucketLabel: obs.bucketLabel, speedKmh: obs.speedKmh ?? null });
    }
  } else if (r1Entry?.payloadSha256 != null) {
    throw new Error('R1_OBD channel pinned but payload missing or unsupported format');
  }

  return { positions, positionStateByLabel, r1Obd };
}
