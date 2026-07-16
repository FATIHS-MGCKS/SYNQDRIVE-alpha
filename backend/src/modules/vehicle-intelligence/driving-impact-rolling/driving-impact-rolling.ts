/**
 * Rolling vehicle load hardening (P46).
 *
 * Deterministic cohort selection: only compatible model versions and profiles
 * are aggregated. Stale or incompatible trips are excluded explicitly.
 */

import type { TripDrivingImpact } from '@prisma/client';
import type { DrivingImpactSourceProvenance } from '../driving-impact/driving-impact-provenance';
import type { DrivingImpactHealthEligibility } from '../driving-impact/driving-impact-provenance';
import { resolvePrimarySource } from '../driving-impact/driving-impact-provenance';
import { DRIVING_IMPACT_MODEL_PROFILE_VERSION } from '../driving-impact-model-profile/driving-impact-model-profile.types';
import {
  areDrivingImpactModelProfilesComparable,
  buildDrivingImpactModelProfileManifest,
} from '../driving-impact-model-profile/driving-impact-model-profile';
import { readTripDrivingImpactModelProfile } from '../driving-impact-model-profile/driving-impact-model-profile.reader';
import { DRIVING_IMPACT_MODEL_PROFILES } from '../driving-impact-model-profile/driving-impact-model-profile.config';
import {
  DRIVING_IMPACT_ROLLING_VERSION,
  type DrivingImpactRollingWindowManifest,
  type RollingExclusionReason,
  type RollingMixPolicy,
  type RollingTripRow,
  type TripRollingIdentity,
} from './driving-impact-rolling.types';

export type RollingCohortSelection = {
  included: RollingTripRow[];
  excluded: Array<{ row: RollingTripRow; reason: RollingExclusionReason }>;
  mixPolicy: RollingMixPolicy;
  anchorProfile: TripRollingIdentity | null;
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isRollingModelVersionCompatible(
  tripModelVersion: string,
  targetModelVersion: string,
): boolean {
  return tripModelVersion === targetModelVersion;
}

export function readTripRollingIdentity(row: RollingTripRow): TripRollingIdentity {
  const manifest = readTripDrivingImpactModelProfile(row.sourceSummaryJson);
  return {
    tripId: row.tripId,
    modelVersion: row.modelVersion,
    modelProfileVersion: manifest?.version ?? null,
    modelProfile: manifest?.profile ?? null,
    behavioralIngestionPath: manifest?.behavioralIngestionPath ?? null,
  };
}

export function sortRollingTripRows<T extends { tripStartedAt: Date; tripId: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const timeDiff = a.tripStartedAt.getTime() - b.tripStartedAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.tripId.localeCompare(b.tripId);
  });
}

function profilesComparable(a: TripRollingIdentity, b: TripRollingIdentity): boolean {
  if (!a.modelProfile || !b.modelProfile) return false;
  const manifestA = buildDrivingImpactModelProfileManifest(
    DRIVING_IMPACT_MODEL_PROFILES[a.modelProfile],
    { gatingApplied: false, reasonCodes: [] },
  );
  const manifestB = buildDrivingImpactModelProfileManifest(
    DRIVING_IMPACT_MODEL_PROFILES[b.modelProfile],
    { gatingApplied: false, reasonCodes: [] },
  );
  return areDrivingImpactModelProfilesComparable(manifestA, manifestB);
}

function cohortKey(identity: TripRollingIdentity): string {
  return `${identity.modelProfile ?? 'UNKNOWN'}::${identity.behavioralIngestionPath ?? 'UNKNOWN'}`;
}

/**
 * Select a single compatible rolling cohort. Model-version mismatches are excluded.
 * When multiple profile cohorts exist, the largest distance cohort wins (deterministic).
 */
export function selectRollingCohort(
  rows: readonly RollingTripRow[],
  targetModelVersion: string,
): RollingCohortSelection {
  const sorted = sortRollingTripRows(rows);
  const excluded: RollingCohortSelection['excluded'] = [];
  const versionCompatible: RollingTripRow[] = [];

  for (const row of sorted) {
    if (!isRollingModelVersionCompatible(row.modelVersion, targetModelVersion)) {
      excluded.push({ row, reason: 'MODEL_VERSION_MISMATCH' });
      continue;
    }
    const identity = readTripRollingIdentity(row);
    if (
      identity.modelProfileVersion != null &&
      identity.modelProfileVersion !== DRIVING_IMPACT_MODEL_PROFILE_VERSION
    ) {
      excluded.push({ row, reason: 'MODEL_PROFILE_VERSION_MISMATCH' });
      continue;
    }
    versionCompatible.push(row);
  }

  if (versionCompatible.length === 0) {
    return {
      included: [],
      excluded,
      mixPolicy: 'MODEL_CHANGE_RESET',
      anchorProfile: null,
    };
  }

  const cohorts = new Map<string, { rows: RollingTripRow[]; distanceKm: number }>();
  for (const row of versionCompatible) {
    const identity = readTripRollingIdentity(row);
    const key = cohortKey(identity);
    const entry = cohorts.get(key) ?? { rows: [], distanceKm: 0 };
    entry.rows.push(row);
    entry.distanceKm += row.distanceKm;
    cohorts.set(key, entry);
  }

  const ranked = [...cohorts.entries()].sort((a, b) => {
    const distDiff = b[1].distanceKm - a[1].distanceKm;
    if (distDiff !== 0) return distDiff;
    return a[0].localeCompare(b[0]);
  });

  const [winningKey, winningCohort] = ranked[0];
  const anchorProfile = readTripRollingIdentity(winningCohort.rows[0]);
  const included: RollingTripRow[] = [];

  for (const row of versionCompatible) {
    const identity = readTripRollingIdentity(row);
    if (cohortKey(identity) === winningKey) {
      included.push(row);
      continue;
    }
    if (!profilesComparable(identity, anchorProfile)) {
      excluded.push({ row, reason: 'PROFILE_INCOMPATIBLE' });
    } else {
      excluded.push({ row, reason: 'PROFILE_INCOMPATIBLE' });
    }
  }

  const mixPolicy: RollingMixPolicy =
    excluded.some((e) => e.reason === 'MODEL_VERSION_MISMATCH')
      ? 'MODEL_CHANGE_RESET'
      : excluded.length > 0
        ? 'PROFILE_PARTITION'
        : 'COMPATIBLE_COHORT';

  return {
    included: sortRollingTripRows(included),
    excluded,
    mixPolicy,
    anchorProfile,
  };
}

export function distanceWeightedAverage(
  rows: readonly RollingTripRow[],
  pick: (row: RollingTripRow) => number | null,
): number | null {
  const valid = rows.filter((row) => pick(row) != null);
  if (valid.length === 0) return null;
  const totalKm = valid.reduce((sum, row) => sum + row.distanceKm, 0);
  if (totalKm <= 0) return null;
  const value = valid.reduce(
    (sum, row) => sum + (pick(row) as number) * (row.distanceKm / totalKm),
    0,
  );
  return round2(value);
}

export function mergeRollingSourceQuality(
  provenanceRows: readonly DrivingImpactSourceProvenance[],
  distanceKmByIndex: readonly number[],
): DrivingImpactRollingWindowManifest['sourceQuality'] {
  if (provenanceRows.length === 0) {
    return {
      measuredShare: 0,
      providerClassifiedShare: 0,
      reconstructedShare: 0,
      estimatedProxyShare: 0,
      contextOnlyShare: 0,
      measurementCoverage: null,
    };
  }

  const totalKm = distanceKmByIndex.reduce((sum, km) => sum + km, 0);
  const weight = (index: number) =>
    totalKm > 0 ? distanceKmByIndex[index] / totalKm : 1 / provenanceRows.length;

  const weighted = (pick: (row: DrivingImpactSourceProvenance) => number) =>
    round3(
      provenanceRows.reduce((sum, row, index) => sum + pick(row) * weight(index), 0),
    );

  const coverageValues = provenanceRows
    .map((row) => row.measurementCoverage)
    .filter((value): value is number => value != null);

  return {
    measuredShare: weighted((row) => row.measuredShare),
    providerClassifiedShare: weighted((row) => row.providerClassifiedShare),
    reconstructedShare: weighted((row) => row.reconstructedShare),
    estimatedProxyShare: weighted((row) => row.estimatedProxyShare),
    contextOnlyShare: weighted((row) => row.contextOnlyShare),
    measurementCoverage:
      coverageValues.length > 0
        ? round3(coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length)
        : null,
  };
}

export function resolveRollingHealthEligibility(
  provenanceRows: readonly DrivingImpactSourceProvenance[],
  distanceKmByIndex: readonly number[],
): DrivingImpactHealthEligibility {
  if (provenanceRows.length === 0) return 'NONE';

  const totalKm = distanceKmByIndex.reduce((sum, km) => sum + km, 0);
  const weight = (index: number) =>
    totalKm > 0 ? distanceKmByIndex[index] / totalKm : 1 / provenanceRows.length;

  const highWeight = provenanceRows.reduce(
    (sum, row, index) =>
      sum + (row.healthEligibility === 'HIGH' ? weight(index) : 0),
    0,
  );
  const lowWeight = provenanceRows.reduce(
    (sum, row, index) =>
      sum + (row.healthEligibility === 'LOW' ? weight(index) : 0),
    0,
  );

  if (highWeight >= 0.8) return 'HIGH';
  if (lowWeight >= 0.5) return 'LOW';
  return 'MEDIUM';
}

export function distanceWeightedBrakingProxyShare(
  rows: readonly Pick<RollingTripRow, 'distanceKm' | 'sourceSummaryJson'>[],
): number {
  if (rows.length === 0) return 0;
  const totalKm = rows.reduce((sum, row) => sum + row.distanceKm, 0);
  if (totalKm <= 0) return 0;

  const weighted = rows.reduce((sum, row) => {
    if (!row.sourceSummaryJson || typeof row.sourceSummaryJson !== 'object') return sum;
    const summary = row.sourceSummaryJson as Record<string, unknown>;
    const brakingProvenance = summary.brakingProvenance as
      | { proxyKinematicShare?: number }
      | undefined;
    const share =
      typeof brakingProvenance?.proxyKinematicShare === 'number'
        ? brakingProvenance.proxyKinematicShare
        : 0;
    return sum + share * (row.distanceKm / totalKm);
  }, 0);

  return round3(weighted);
}

export function buildRollingExclusionSummary(
  excluded: RollingCohortSelection['excluded'],
): Partial<Record<RollingExclusionReason, number>> {
  const summary: Partial<Record<RollingExclusionReason, number>> = {};
  for (const entry of excluded) {
    summary[entry.reason] = (summary[entry.reason] ?? 0) + 1;
  }
  return summary;
}

export function buildRollingWindowManifest(input: {
  windowDays: number;
  targetModelVersion: string;
  selection: RollingCohortSelection;
  provenanceRows: readonly DrivingImpactSourceProvenance[];
  sourceQuality: DrivingImpactRollingWindowManifest['sourceQuality'];
  proxyShare: DrivingImpactRollingWindowManifest['proxyShare'];
  healthEligibility: DrivingImpactHealthEligibility;
}): DrivingImpactRollingWindowManifest {
  const { included, excluded, mixPolicy, anchorProfile } = input.selection;
  const includedKm = included.reduce((sum, row) => sum + row.distanceKm, 0);
  const excludedKm = excluded.reduce((sum, entry) => sum + entry.row.distanceKm, 0);
  const scoredTripCount = included.filter((row) => row.drivingStressScore != null).length;

  const profileDef =
    anchorProfile?.modelProfile != null
      ? DRIVING_IMPACT_MODEL_PROFILES[anchorProfile.modelProfile]
      : null;

  return {
    version: DRIVING_IMPACT_ROLLING_VERSION,
    windowDays: input.windowDays,
    windowStartedAt: included[0]?.tripStartedAt.toISOString() ?? null,
    windowEndedAt:
      (included[included.length - 1]?.tripEndedAt ??
        included[included.length - 1]?.tripStartedAt)?.toISOString() ?? null,
    tripCount: included.length,
    scoredTripCount,
    excludedTripCount: excluded.length,
    distanceKmWindow: round2(includedKm),
    excludedDistanceKm: round2(excludedKm),
    modelVersion: input.targetModelVersion,
    modelProfileVersion: anchorProfile?.modelProfileVersion ?? null,
    modelProfile: anchorProfile?.modelProfile ?? null,
    mixPolicy,
    exclusionSummary: buildRollingExclusionSummary(excluded),
    sourceQuality: input.sourceQuality,
    proxyShare: input.proxyShare,
    healthEligibility: input.healthEligibility,
    notDriverEvaluation: true,
    comparabilityHint: profileDef?.comparabilityHintDe ?? null,
    recomputeDeterministic: true,
  };
}

export function toRollingTripRow(
  row: TripDrivingImpact,
): RollingTripRow {
  return {
    tripId: row.tripId,
    distanceKm: row.distanceKm,
    tripStartedAt: row.tripStartedAt,
    tripEndedAt: row.tripEndedAt,
    drivingStressScore: row.drivingStressScore,
    modelVersion: row.modelVersion,
    sourceSummaryJson: row.sourceSummaryJson,
  };
}

export function rollingDistanceWeightedFieldAverage<
  T extends TripDrivingImpact,
  K extends keyof T,
>(rows: readonly T[], key: K): number | null {
  const valid = rows.filter((row) => row[key] != null);
  if (valid.length === 0) return null;
  const totalKm = valid.reduce((sum, row) => sum + row.distanceKm, 0);
  if (totalKm <= 0) return null;
  const value = valid.reduce(
    (sum, row) => sum + (row[key] as number) * (row.distanceKm / totalKm),
    0,
  );
  return round2(value);
}
