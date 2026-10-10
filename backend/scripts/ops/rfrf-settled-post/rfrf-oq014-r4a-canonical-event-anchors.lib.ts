import { KS_MX_2024_SEPT04_EVENT_A } from '../../../src/modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';
import {
  DEFENSIBLE_NATURAL_CALIBRATION_ROWS,
  type ReplayCaseDefinition,
} from './settled-post-replay.fixtures';

export type R4aCanonicalRefuelTimestampProvenance =
  | 'COMMITTED_DEFENSIBLE_PACK_PHYSICAL_EVENT'
  | 'PRODUCTION_FORENSIC_PHYSICAL_EPISODE'
  | 'UNVERIFIED';

export interface R4aCanonicalPhysicalEpisodeFromSpine {
  refuelRiseStartUtc: string | null;
  provenance: string;
  evidenceRef?: string;
}

export interface R4aResolvedCanonicalEventAnchors {
  eventId: string;
  queryWindowFromUtc: string;
  queryWindowToUtc: string;
  firstSampleTimestampUtc: string | null;
  canonicalRefuelTimestampUtc: string | null;
  canonicalRefuelTimestampProvenance: R4aCanonicalRefuelTimestampProvenance;
  provenanceDetail: string;
}

function isValidIsoTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}

function provenanceFromSpineEpisode(
  episode: R4aCanonicalPhysicalEpisodeFromSpine | null | undefined,
): Pick<R4aResolvedCanonicalEventAnchors, 'canonicalRefuelTimestampUtc' | 'canonicalRefuelTimestampProvenance' | 'provenanceDetail'> {
  if (!episode?.refuelRiseStartUtc || !isValidIsoTimestamp(episode.refuelRiseStartUtc)) {
    return {
      canonicalRefuelTimestampUtc: null,
      canonicalRefuelTimestampProvenance: 'UNVERIFIED',
      provenanceDetail: episode?.provenance ?? 'NO_INDEPENDENT_CANONICAL_REFUEL_TIMESTAMP',
    };
  }
  if (episode.provenance.startsWith('UNVERIFIED')) {
    return {
      canonicalRefuelTimestampUtc: null,
      canonicalRefuelTimestampProvenance: 'UNVERIFIED',
      provenanceDetail: episode.provenance,
    };
  }
  return {
    canonicalRefuelTimestampUtc: episode.refuelRiseStartUtc,
    canonicalRefuelTimestampProvenance: 'PRODUCTION_FORENSIC_PHYSICAL_EPISODE',
    provenanceDetail: episode.evidenceRef ?? episode.provenance,
  };
}

/** Independent canonical refuel timestamps — never inferred from first telemetry sample. */
export function resolveCanonicalEventAnchors(
  eventId: string,
  replayDef: ReplayCaseDefinition | null,
  spineEpisode: R4aCanonicalPhysicalEpisodeFromSpine | null,
): R4aResolvedCanonicalEventAnchors {
  const firstSample =
    replayDef?.samples[0]?.timestamp.toISOString() ??
    (replayDef && replayDef.samples.length === 0 ? null : null);

  const queryFrom = replayDef?.window.from ?? '';
  const queryTo = replayDef?.window.to ?? '';

  const packRow = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.find((r) => r.id === eventId);
  if (packRow && packRow.samples.length > 0 && isValidIsoTimestamp(packRow.eventTimestamp)) {
    return {
      eventId,
      queryWindowFromUtc: packRow.window.from,
      queryWindowToUtc: packRow.window.to,
      firstSampleTimestampUtc: packRow.samples[0]?.timestamp.toISOString() ?? null,
      canonicalRefuelTimestampUtc: packRow.eventTimestamp,
      canonicalRefuelTimestampProvenance: 'COMMITTED_DEFENSIBLE_PACK_PHYSICAL_EVENT',
      provenanceDetail: 'settled-post-replay.fixtures DEFENSIBLE_NATURAL_CALIBRATION_ROWS',
    };
  }

  if (eventId === 'KS_MX_2024_2026_09_04') {
    const forensicStart = KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseStart;
    return {
      eventId,
      queryWindowFromUtc: queryFrom,
      queryWindowToUtc: queryTo,
      firstSampleTimestampUtc: firstSample,
      canonicalRefuelTimestampUtc: forensicStart,
      canonicalRefuelTimestampProvenance: 'PRODUCTION_FORENSIC_PHYSICAL_EPISODE',
      provenanceDetail: 'ks-mx-2024-sept04-refuel.fixture.ts EVENT_A fuelLevelRiseStart',
    };
  }

  const fromSpine = provenanceFromSpineEpisode(spineEpisode);
  return {
    eventId,
    queryWindowFromUtc: queryFrom,
    queryWindowToUtc: queryTo,
    firstSampleTimestampUtc: firstSample,
    ...fromSpine,
  };
}

export function anchorIsVerifiedForAttribution(
  anchors: R4aResolvedCanonicalEventAnchors,
): boolean {
  return (
    anchors.canonicalRefuelTimestampProvenance !== 'UNVERIFIED' &&
    isValidIsoTimestamp(anchors.canonicalRefuelTimestampUtc)
  );
}
