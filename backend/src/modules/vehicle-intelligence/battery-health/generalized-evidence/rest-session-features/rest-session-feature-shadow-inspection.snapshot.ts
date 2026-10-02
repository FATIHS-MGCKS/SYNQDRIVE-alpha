import type { BatteryRestSession } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS } from './rest-session-feature.constants';
import type { RestSessionFeatureRevisionIntegrityAggregate } from './rest-session-feature-inspection.repository.types';
import { RestSessionFeatureRepository } from './rest-session-feature.repository';
import type { BatteryRestSessionFeature } from '@prisma/client';

export type RestSessionFeatureInspectionReadSnapshot = {
  session: BatteryRestSession;
  totalRows: number;
  aggregate: RestSessionFeatureRevisionIntegrityAggregate;
  latestRows: BatteryRestSessionFeature[];
  canonicalCandidates: BatteryRestSessionFeature[];
};

export type RestSessionFeatureInspectionSnapshotHooks = {
  /** Test-only: invoked after COUNT inside repeatable-read transaction. */
  pauseAfterCountInSnapshot?: () => Promise<void>;
};

export async function loadRestSessionFeatureInspectionReadSnapshot(
  db: Pick<PrismaService, 'batteryRestSession' | 'batteryRestSessionFeature' | '$queryRaw'>,
  input: {
    organizationId: string;
    vehicleId: string;
    restSessionId: string;
  },
  hooks?: RestSessionFeatureInspectionSnapshotHooks,
): Promise<RestSessionFeatureInspectionReadSnapshot | null> {
  const session = await db.batteryRestSession.findFirst({
    where: {
      id: input.restSessionId,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    },
  });
  if (!session) {
    return null;
  }

  const repository = new RestSessionFeatureRepository(db);
  const scope = {
    organizationId: input.organizationId,
    restSessionId: input.restSessionId,
  };

  const totalRows = await repository.countFeatureRowsForSession(scope);
  await hooks?.pauseAfterCountInSnapshot?.();

  const aggregate = await repository.readRevisionIntegrityAggregate(scope);
  const latestRows = await repository.listLatestFeatureRowsForSession({
    ...scope,
    limit: REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS,
  });
  const canonicalCandidates = await repository.listCanonicalCandidateRows(scope);

  return {
    session,
    totalRows,
    aggregate,
    latestRows,
    canonicalCandidates,
  };
}
