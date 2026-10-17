import { parseDiV0PositionSnapshot } from '../position-acquisition/di-v0-position-snapshot-parse';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../position-acquisition/di-v0-position-acquisition.versions';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import type { ResearchGpsBucket } from '../s4-research/contracts';

export type DiV0S4ResearchShadowL3ByBucket = ReadonlyMap<string, number | null>;

function mapAvailability(raw: string): ResearchGpsBucket['availability'] {
  if (raw === 'PRESENT' || raw === 'ROW_ABSENT' || raw === 'SIGNAL_NULL') return raw;
  return 'OTHER';
}

/**
 * Build research GPS buckets from a verified pinned S4 evidence container.
 * Does not invent coordinates for absent rows.
 */
export function buildResearchGpsBucketsFromParsedContainer(
  parsed: DiV0S4ParsedEvidenceContainer,
  shadowL3ByBucket: DiV0S4ResearchShadowL3ByBucket = new Map(),
): ResearchGpsBucket[] {
  const positionEntry = parsed.channelManifest.find((c) => c.channel === 'POSITION');
  if (positionEntry?.outcome !== 'PRESENT' || !parsed.channelPayloads.POSITION) {
    return [];
  }
  if (positionEntry.formatVersion !== DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1) {
    throw new Error('UNSUPPORTED_POSITION_FORMAT');
  }
  const material = parseDiV0PositionSnapshot(parsed.channelPayloads.POSITION);
  return material.buckets.map((b) => {
    const obs = b.observation;
    return {
      bucketLabelUtc: b.bucketLabel,
      sourceTimestampUtc: b.bucketLabel,
      availability: mapAvailability(b.availability),
      latitude: obs.latitude ?? null,
      longitude: obs.longitude ?? null,
      qcTrustLevel: null,
      l3SpeedKmh: shadowL3ByBucket.get(b.bucketLabel) ?? null,
      motionState: null,
    };
  });
}
