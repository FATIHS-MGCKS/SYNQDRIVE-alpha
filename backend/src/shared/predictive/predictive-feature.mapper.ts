import type { Prisma } from '@prisma/client';
import type { OrgPredictiveFeatureSnapshot } from '@prisma/client';
import type { PredictiveFeatureSnapshotPayload } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import type { PredictiveFeatureScope } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';

export function resolveScopeKey(scope: PredictiveFeatureScope): string {
  if (scope.type === 'STATION') return `station:${scope.stationId}`;
  if (scope.type === 'VEHICLE_CLASS') return `class:${scope.vehicleClassId}`;
  return 'fleet';
}

export function toPrismaSnapshotCreateInput(
  organizationId: string,
  payload: PredictiveFeatureSnapshotPayload,
  buildRunId: string,
): Prisma.OrgPredictiveFeatureSnapshotCreateInput {
  const scope = payload.scope;
  return {
    organization: { connect: { id: organizationId } },
    featureSetVersion: payload.featureSetVersion,
    grain: 'DAILY',
    observationDate: payload.observationDate,
    asOfUtc: new Date(payload.asOfUtc),
    timezone: payload.timezone,
    scopeKey: resolveScopeKey(scope),
    scopeType: scope.type,
    scopeStationId: scope.type === 'STATION' ? scope.stationId ?? null : null,
    scopeVehicleClassId:
      scope.type === 'VEHICLE_CLASS' ? scope.vehicleClassId ?? null : null,
    features: payload.features as unknown as Prisma.InputJsonValue,
    dataQuality: payload.dataQuality.status,
    dataQualityMeta: {
      coveragePercent: payload.dataQuality.coveragePercent,
      missingFeatureKeys: payload.dataQuality.missingFeatureKeys,
      delayedFeatureKeys: payload.dataQuality.delayedFeatureKeys,
      notes: payload.dataQuality.notes,
    },
    lineage: payload.lineage as unknown as Prisma.InputJsonValue,
    buildRun: { connect: { id: buildRunId } },
  };
}

export function mapFeatureSnapshotRow(
  row: OrgPredictiveFeatureSnapshot,
): PredictiveFeatureSnapshotPayload & {
  id: string;
  organizationId: string;
  scopeKey: string;
  buildRunId: string | null;
  createdAt: string;
} {
  const scope: PredictiveFeatureScope =
    row.scopeType === 'STATION'
      ? { type: 'STATION', stationId: row.scopeStationId }
      : row.scopeType === 'VEHICLE_CLASS'
        ? { type: 'VEHICLE_CLASS', vehicleClassId: row.scopeVehicleClassId }
        : { type: 'FLEET' };

  return {
    id: row.id,
    organizationId: row.organizationId,
    scopeKey: row.scopeKey,
    buildRunId: row.buildRunId,
    createdAt: row.createdAt.toISOString(),
    featureSetVersion: row.featureSetVersion,
    grain: 'DAILY',
    observationDate: row.observationDate,
    asOfUtc: row.asOfUtc.toISOString(),
    timezone: row.timezone,
    scope,
    features: row.features as unknown as PredictiveFeatureSnapshotPayload['features'],
    dataQuality: {
      status: row.dataQuality,
      coveragePercent:
        typeof row.dataQualityMeta === 'object' &&
        row.dataQualityMeta &&
        'coveragePercent' in row.dataQualityMeta
          ? Number((row.dataQualityMeta as { coveragePercent: number }).coveragePercent)
          : 0,
      missingFeatureKeys:
        typeof row.dataQualityMeta === 'object' &&
        row.dataQualityMeta &&
        'missingFeatureKeys' in row.dataQualityMeta
          ? (row.dataQualityMeta as { missingFeatureKeys: string[] }).missingFeatureKeys
          : [],
      delayedFeatureKeys:
        typeof row.dataQualityMeta === 'object' &&
        row.dataQualityMeta &&
        'delayedFeatureKeys' in row.dataQualityMeta
          ? (row.dataQualityMeta as { delayedFeatureKeys: string[] }).delayedFeatureKeys
          : [],
      notes:
        typeof row.dataQualityMeta === 'object' &&
        row.dataQualityMeta &&
        'notes' in row.dataQualityMeta
          ? (row.dataQualityMeta as { notes: string[] }).notes
          : [],
    },
    lineage:
      typeof row.lineage === 'object' && row.lineage
        ? (row.lineage as unknown as PredictiveFeatureSnapshotPayload['lineage'])
        : {
            featureSetVersion: row.featureSetVersion,
            asOfUtc: row.asOfUtc.toISOString(),
            timezone: row.timezone,
            observationDate: row.observationDate,
            scope,
            sources: [],
            recordsIncluded: { bookings: 0, serviceCases: 0, invoices: 0, vehicles: 0 },
            recordsExcluded: { futureLeakage: 0, outOfScope: 0 },
            buildFingerprint: '',
          },
  };
}
