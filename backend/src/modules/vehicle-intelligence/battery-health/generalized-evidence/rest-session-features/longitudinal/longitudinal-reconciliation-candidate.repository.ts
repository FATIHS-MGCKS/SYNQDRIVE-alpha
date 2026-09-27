import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';
import { LONGITUDINAL_INPUT_SNAPSHOT_ISOLATION } from './longitudinal-input.constants';
import { LongitudinalInputRepository } from './longitudinal-input.repository';
import { computeLongitudinalSourceEvidenceFingerprint } from './longitudinal-source-evidence-fingerprint';
import { LongitudinalSourceEvidenceAckRepository } from './longitudinal-source-evidence-ack.repository';
import { LONGITUDINAL_RECONCILIATION_BATCH_MAX } from './longitudinal-reconciliation.config';

export type LongitudinalReconciliationCandidate = {
  organizationId: string;
  vehicleId: string;
  /** Latest current-version C3 computed_at — proxy for outstanding source change ordering. */
  outstandingChangeAtMs: number;
};

export type LongitudinalReconciliationCandidateRepositoryDb = Pick<
  PrismaService,
  | '$queryRaw'
  | '$transaction'
  | 'batteryLongitudinalReconciliationVehicleScan'
  | 'batteryLongitudinalReconciliationFleetCursor'
>;

const PREFILTER_OVERSAMPLE_FACTOR = 50;
const PREFILTER_OVERSAMPLE_CAP = 500;
const FLEET_CURSOR_SINGLETON_ID = 1;

type VehicleKey = {
  organizationId: string;
  vehicleId: string;
};

export class LongitudinalReconciliationCandidateRepository {
  constructor(
    private readonly db: LongitudinalReconciliationCandidateRepositoryDb,
    private readonly sourceEvidenceAckRepository: LongitudinalSourceEvidenceAckRepository,
  ) {}

  private async getFleetCursor(): Promise<VehicleKey | null> {
    const row = await this.db.batteryLongitudinalReconciliationFleetCursor.findUnique({
      where: { id: FLEET_CURSOR_SINGLETON_ID },
    });
    if (!row?.lastOrganizationId || !row.lastVehicleId) {
      return null;
    }
    return {
      organizationId: row.lastOrganizationId,
      vehicleId: row.lastVehicleId,
    };
  }

  private async setFleetCursor(key: VehicleKey): Promise<void> {
    await this.db.batteryLongitudinalReconciliationFleetCursor.upsert({
      where: { id: FLEET_CURSOR_SINGLETON_ID },
      create: {
        id: FLEET_CURSOR_SINGLETON_ID,
        lastOrganizationId: key.organizationId,
        lastVehicleId: key.vehicleId,
      },
      update: {
        lastOrganizationId: key.organizationId,
        lastVehicleId: key.vehicleId,
      },
    });
  }

  private async listDistinctVehicleKeysAfterCursor(input: {
    limit: number;
    after: VehicleKey | null;
  }): Promise<VehicleKey[]> {
    if (input.after == null) {
      return this.db.$queryRaw<VehicleKey[]>`
        SELECT f.organization_id AS "organizationId", f.vehicle_id AS "vehicleId"
        FROM battery_rest_session_features f
        WHERE f.feature_model_version = ${REST_SESSION_FEATURE_MODEL_VERSION}
          AND f.retention_policy_version = ${REST_SESSION_RETENTION_POLICY_VERSION}
          AND f.charge_opportunity_policy_version = ${REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION}
        GROUP BY f.organization_id, f.vehicle_id
        ORDER BY f.organization_id ASC, f.vehicle_id ASC
        LIMIT ${input.limit}
      `;
    }

    return this.db.$queryRaw<VehicleKey[]>`
      SELECT f.organization_id AS "organizationId", f.vehicle_id AS "vehicleId"
      FROM battery_rest_session_features f
      WHERE f.feature_model_version = ${REST_SESSION_FEATURE_MODEL_VERSION}
        AND f.retention_policy_version = ${REST_SESSION_RETENTION_POLICY_VERSION}
        AND f.charge_opportunity_policy_version = ${REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION}
        AND (
          f.organization_id > ${input.after.organizationId}
          OR (
            f.organization_id = ${input.after.organizationId}
            AND f.vehicle_id > ${input.after.vehicleId}
          )
        )
      GROUP BY f.organization_id, f.vehicle_id
      ORDER BY f.organization_id ASC, f.vehicle_id ASC
      LIMIT ${input.limit}
    `;
  }

  /** Keyset fleet sweep with wrap — bounded, no OFFSET, eventual liveness. */
  async listBoundedInspectionVehicleKeys(input: { limit: number }): Promise<VehicleKey[]> {
    const cursor = await this.getFleetCursor();
    const firstPage = await this.listDistinctVehicleKeysAfterCursor({
      limit: input.limit,
      after: cursor,
    });
    if (firstPage.length >= input.limit || cursor == null) {
      return firstPage;
    }
    const wrapLimit = input.limit - firstPage.length;
    const wrapPage = await this.listDistinctVehicleKeysAfterCursor({
      limit: wrapLimit,
      after: null,
    });
    return [...firstPage, ...wrapPage];
  }

  async touchVehicleScan(key: VehicleKey): Promise<void> {
    await this.db.batteryLongitudinalReconciliationVehicleScan.upsert({
      where: {
        organizationId_vehicleId: {
          organizationId: key.organizationId,
          vehicleId: key.vehicleId,
        },
      },
      create: {
        organizationId: key.organizationId,
        vehicleId: key.vehicleId,
        lastScanAt: new Date(),
      },
      update: {
        lastScanAt: new Date(),
      },
    });
  }

  async getLatestSourceChangeAtMs(key: VehicleKey): Promise<number> {
    const rows = await this.db.$queryRaw<Array<{ latestMs: Date | null }>>`
      SELECT MAX(f.computed_at) AS "latestMs"
      FROM battery_rest_session_features f
      WHERE f.organization_id = ${key.organizationId}
        AND f.vehicle_id = ${key.vehicleId}
        AND f.feature_model_version = ${REST_SESSION_FEATURE_MODEL_VERSION}
        AND f.retention_policy_version = ${REST_SESSION_RETENTION_POLICY_VERSION}
        AND f.charge_opportunity_policy_version = ${REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION}
    `;
    const latest = rows[0]?.latestMs;
    return latest ? latest.getTime() : 0;
  }

  async computeCurrentSourceEvidenceFingerprint(input: {
    organizationId: string;
    vehicleId: string;
    sessionLimit: number;
  }): Promise<{ fingerprint: string }> {
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
        return { fingerprint: evidence.fingerprint };
      },
      { isolationLevel: LONGITUDINAL_INPUT_SNAPSHOT_ISOLATION },
    );
  }

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

    const inspectionKeys = await this.listBoundedInspectionVehicleKeys({
      limit: oversample,
    });

    const stale: LongitudinalReconciliationCandidate[] = [];
    let lastInspected: VehicleKey | null = null;

    for (const key of inspectionKeys) {
      lastInspected = key;
      await this.touchVehicleScan(key);

      const current = await this.computeCurrentSourceEvidenceFingerprint({
        organizationId: key.organizationId,
        vehicleId: key.vehicleId,
        sessionLimit: input.sessionLimit,
      });
      const acknowledged =
        await this.sourceEvidenceAckRepository.isSourceEvidenceAcknowledged({
          organizationId: key.organizationId,
          vehicleId: key.vehicleId,
          sourceEvidenceFingerprint: current.fingerprint,
        });

      if (!acknowledged) {
        const outstandingChangeAtMs = await this.getLatestSourceChangeAtMs(key);
        stale.push({
          organizationId: key.organizationId,
          vehicleId: key.vehicleId,
          outstandingChangeAtMs,
        });
      }

      if (stale.length >= batchSize) {
        break;
      }
    }

    if (lastInspected != null) {
      await this.setFleetCursor(lastInspected);
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
