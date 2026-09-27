import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';
import { LongitudinalInputRepository } from './longitudinal-input.repository';
import { computeLongitudinalSourceEvidenceFingerprint } from './longitudinal-source-evidence-fingerprint';
import { LongitudinalProfileMaterializationRepository } from './longitudinal-profile-materialization.repository';
import { LONGITUDINAL_RECONCILIATION_BATCH_MAX } from './longitudinal-reconciliation.config';

export type LongitudinalReconciliationCandidate = {
  organizationId: string;
  vehicleId: string;
  /** Deterministic ordering — oldest outstanding scientific source change first. */
  outstandingChangeAtMs: number;
};

export type LongitudinalReconciliationCandidateRepositoryDb = Pick<
  PrismaService,
  '$queryRaw' | '$transaction'
>;

const PREFILTER_OVERSAMPLE_FACTOR = 50;
const PREFILTER_OVERSAMPLE_CAP = 500;

export class LongitudinalReconciliationCandidateRepository {
  constructor(
    private readonly db: LongitudinalReconciliationCandidateRepositoryDb,
    private readonly materializationRepository: LongitudinalProfileMaterializationRepository,
  ) {}

  async listPrefilterVehicleKeys(input: { limit: number }): Promise<
    Array<{
      organizationId: string;
      vehicleId: string;
      oldestC3ComputedAt: Date;
    }>
  > {
    const rows = await this.db.$queryRaw<
      Array<{
        organizationId: string;
        vehicleId: string;
        oldestC3ComputedAt: Date;
      }>
    >`
      SELECT
        f.organization_id AS "organizationId",
        f.vehicle_id AS "vehicleId",
        MIN(f.computed_at) AS "oldestC3ComputedAt"
      FROM battery_rest_session_features f
      WHERE f.feature_model_version = ${REST_SESSION_FEATURE_MODEL_VERSION}
        AND f.retention_policy_version = ${REST_SESSION_RETENTION_POLICY_VERSION}
        AND f.charge_opportunity_policy_version = ${REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION}
      GROUP BY f.organization_id, f.vehicle_id
      ORDER BY MIN(f.computed_at) ASC, f.organization_id ASC, f.vehicle_id ASC
      LIMIT ${input.limit}
    `;
    return rows;
  }

  async computeCurrentSourceEvidenceFingerprint(input: {
    organizationId: string;
    vehicleId: string;
    sessionLimit: number;
  }): Promise<{ fingerprint: string; outstandingChangeAtMs: number }> {
    return this.db.$transaction(
      async (tx) => {
        const snapshot = await new LongitudinalInputRepository(
          tx as unknown as PrismaService,
        ).loadLongitudinalInputReadSnapshot({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          sessionLimit: input.sessionLimit,
        });
        const evidence = computeLongitudinalSourceEvidenceFingerprint({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          appliedSessionLimit: input.sessionLimit,
          sessions: snapshot.sessions,
          canonicalCandidates: snapshot.canonicalCandidates,
        });
        const outstandingChangeAtMs =
          evidence.meta.oldestSelectedCanonicalComputedAtMs ??
          snapshot.canonicalCandidates.reduce(
            (min, row) => Math.min(min, row.computedAt.getTime()),
            Number.MAX_SAFE_INTEGER,
          );
        return {
          fingerprint: evidence.fingerprint,
          outstandingChangeAtMs:
            outstandingChangeAtMs === Number.MAX_SAFE_INTEGER
              ? 0
              : outstandingChangeAtMs,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /**
   * Tenant-safe bounded candidate discovery (DB LIMIT prefilter + fingerprint fence compare).
   */
  async findCandidates(input: {
    batchSize: number;
    sessionLimit: number;
  }): Promise<LongitudinalReconciliationCandidate[]> {
    const batchSize = Math.min(
      Math.max(1, input.batchSize),
      LONGITUDINAL_RECONCILIATION_BATCH_MAX,
    );
    const oversample = Math.min(
      batchSize * PREFILTER_OVERSAMPLE_FACTOR,
      PREFILTER_OVERSAMPLE_CAP,
    );

    const prefilter = await this.listPrefilterVehicleKeys({ limit: oversample });
    const stale: LongitudinalReconciliationCandidate[] = [];

    for (const key of prefilter) {
      const current = await this.computeCurrentSourceEvidenceFingerprint({
        organizationId: key.organizationId,
        vehicleId: key.vehicleId,
        sessionLimit: input.sessionLimit,
      });
      const latestD3 =
        await this.materializationRepository.findLatestSourceEvidenceFingerprint({
          organizationId: key.organizationId,
          vehicleId: key.vehicleId,
        });

      if (latestD3 == null || latestD3 !== current.fingerprint) {
        stale.push({
          organizationId: key.organizationId,
          vehicleId: key.vehicleId,
          outstandingChangeAtMs: current.outstandingChangeAtMs,
        });
      }
      if (stale.length >= batchSize) break;
    }

    stale.sort((a, b) => {
      if (a.outstandingChangeAtMs !== b.outstandingChangeAtMs) {
        return a.outstandingChangeAtMs - b.outstandingChangeAtMs;
      }
      if (a.organizationId !== b.organizationId) {
        return a.organizationId.localeCompare(b.organizationId);
      }
      return a.vehicleId.localeCompare(b.vehicleId);
    });

    return stale.slice(0, batchSize);
  }
}
