import { ERD_PHYSICAL_MATCH_RESULT } from '../vehicle-intelligence/battery-health/hv-charge-session/erd-physical-episode-matcher';
import { matchNativeHvChargeSessionPhysicalEpisode } from '../vehicle-intelligence/battery-health/hv-charge-session/hv-native-physical-episode.policy';
import type { HvChargeSessionMetadata } from '../vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';

export interface HvAdminPhysicalEpisodeSessionRow {
  id: string;
  source: string;
  segmentFingerprint: string;
  startAt: Date;
  endAt: Date | null;
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  deltaSocPercent: number | null;
  isOngoing: boolean;
  quality: string | null;
  metadata: HvChargeSessionMetadata | null;
}

export interface HvAdminPhysicalEpisodeCluster {
  episodeId: string;
  canonicalSessionId: string;
  startAt: Date;
  endAt: Date | null;
  isOngoing: boolean;
  providerSegmentCount: number;
  sessionIds: string[];
}

function isSupersededRow(metadata: HvChargeSessionMetadata | null): boolean {
  return Boolean(metadata?.supersededBySegmentFingerprint);
}

function episodeSide(row: HvAdminPhysicalEpisodeSessionRow) {
  return {
    startAt: row.startAt,
    endAt: row.endAt,
    startSocPercent: row.startSocPercent,
    endSocPercent: row.endSocPercent,
    startEnergyKwh: row.startEnergyKwh,
    endEnergyKwh: row.endEnergyKwh,
    isOngoing: row.isOngoing,
  };
}

function canonicalScore(row: HvAdminPhysicalEpisodeSessionRow): number {
  let score = 0;
  if (row.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) score += 100;
  if (!isSupersededRow(row.metadata)) score += 50;
  if (row.endAt) score += 10;
  if (row.energyAddedKwh != null) score += 5;
  return score;
}

/**
 * Groups provider HV charge session rows into physical charge episodes (no double-count).
 * Superseded fallback rows are attached to the same cluster when they match SAME; they do not
 * form standalone episodes when a native canonical row exists in the cluster.
 */
export function clusterHvAdminPhysicalChargeEpisodes(
  sessions: HvAdminPhysicalEpisodeSessionRow[],
  evaluatedAt: Date,
): HvAdminPhysicalEpisodeCluster[] {
  if (sessions.length === 0) return [];

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id);
    if (!p || p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const session of sessions) {
    parent.set(session.id, session.id);
  }

  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i];
      const b = sessions[j];
      const match = matchNativeHvChargeSessionPhysicalEpisode(
        episodeSide(a),
        episodeSide(b),
        evaluatedAt,
      );
      if (match.result === ERD_PHYSICAL_MATCH_RESULT.SAME) {
        union(a.id, b.id);
      }
    }
  }

  const clusters = new Map<string, HvAdminPhysicalEpisodeSessionRow[]>();
  for (const session of sessions) {
    const root = find(session.id);
    const list = clusters.get(root) ?? [];
    list.push(session);
    clusters.set(root, list);
  }

  const result: HvAdminPhysicalEpisodeCluster[] = [];

  for (const cluster of clusters.values()) {
    const nonSuperseded = cluster.filter((row) => !isSupersededRow(row.metadata));
    const pool = nonSuperseded.length > 0 ? nonSuperseded : cluster;
    const representative = pool.reduce((best, current) =>
      canonicalScore(current) > canonicalScore(best) ? current : best,
    );

    const startAt = cluster.reduce(
      (min, row) => (row.startAt < min ? row.startAt : min),
      cluster[0].startAt,
    );
    const endCandidates = cluster.map((row) => row.endAt).filter((v): v is Date => v != null);
    const endAt =
      cluster.some((row) => row.isOngoing) || endCandidates.length === 0
        ? cluster.some((row) => row.isOngoing)
          ? null
          : endCandidates.reduce((max, row) => (row > max ? row : max), endCandidates[0])
        : endCandidates.reduce((max, row) => (row > max ? row : max), endCandidates[0]);

    result.push({
      episodeId: representative.id,
      canonicalSessionId: representative.id,
      startAt,
      endAt,
      isOngoing: cluster.some((row) => row.isOngoing),
      providerSegmentCount: cluster.length,
      sessionIds: cluster.map((row) => row.id).sort(),
    });
  }

  return result.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
}
