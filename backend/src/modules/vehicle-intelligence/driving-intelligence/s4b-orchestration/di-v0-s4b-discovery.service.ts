import { Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { resolveDiV0SourceFamily } from '../position-acquisition/di-v0-position-source-family';
import { DI_V0_S4_LIMITS } from '../s4a-foundation/di-v0-s4a-contract';
import { evaluateDiV0S4KillRow, type DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { isDiV0S4Rejection, type DiV0S4RejectionCode } from '../s4a-foundation/di-v0-s4a-errors';
import type { DiV0S4WorkItemRepository } from '../s4a-foundation/di-v0-s4a-work-item.repository';
import { DI_V0_S4B_TUNING, isDiV0S4DiscoveryConfigured } from './di-v0-s4b-config';
import {
  isDiV0S4DiscoveryContainmentAvailable,
  type DiV0S4DiscoveryContainmentState,
} from './di-v0-s4b-discovery-containment';
import type { DiV0S4RuntimePipeline } from './di-v0-s4b-pipeline-manifest';

export type DiV0S4DiscoveryPassStatus = 'DISABLED' | 'CONTAINMENT_UNAVAILABLE' | 'KILLED' | 'COMPLETED' | 'STOPPED';

export interface DiV0S4DiscoveryPassResult {
  status: DiV0S4DiscoveryPassStatus;
  candidates: number;
  created: number;
  duplicates: number;
  skipped: number;
  stopReason: DiV0S4RejectionCode | 'KILL_ROW' | 'UNEXPECTED_ERROR' | null;
}

interface DiscoveryCandidateRow {
  trip_id: string;
  organization_id: string;
  vehicle_id: string;
  dimo_raw_json: unknown;
}

/** Per-trip refusals that leave the rest of the batch valid. */
const SKIP_CODES: readonly DiV0S4RejectionCode[] = ['TRIP_NOT_COMPLETED', 'TENANT_SCOPE_INVALID'];

/**
 * S4B PRIMARY discovery. Candidate selection is a read-only hint; every guard (kill row, scope,
 * DISCOVERY enablement, COMPLETED, registry, boundary occurrence) is enforced again by T01
 * `createWorkItem`, which is the only write this service performs.
 */
export class DiV0S4DiscoveryService {
  private readonly logger = new Logger(DiV0S4DiscoveryService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: DiV0S4WorkItemRepository,
    private readonly config: DiV0S4ControlPlaneConfig,
    private readonly pipeline: DiV0S4RuntimePipeline,
    private readonly discoveryContainment: DiV0S4DiscoveryContainmentState,
  ) {}

  isConfigured(): boolean {
    return isDiV0S4DiscoveryConfigured(this.config, this.discoveryContainment);
  }

  async runDiscoveryPass(options: { limit?: number } = {}): Promise<DiV0S4DiscoveryPassResult> {
    const result: DiV0S4DiscoveryPassResult = {
      status: 'DISABLED',
      candidates: 0,
      created: 0,
      duplicates: 0,
      skipped: 0,
      stopReason: null,
    };
    if (
      this.config.masterEnabled &&
      this.config.discoveryEnabled &&
      this.config.positionEnabled &&
      this.config.organizationAllowlist.size > 0 &&
      this.config.vehicleAllowlist.size > 0 &&
      !isDiV0S4DiscoveryContainmentAvailable(this.discoveryContainment)
    ) {
      return { ...result, status: 'CONTAINMENT_UNAVAILABLE', stopReason: 'UNEXPECTED_ERROR' };
    }
    if (!this.isConfigured()) return result;

    if (await this.isKilled()) {
      return { ...result, status: 'KILLED', stopReason: 'KILL_ROW' };
    }

    const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? DI_V0_S4B_TUNING.discoveryBatchLimit), DI_V0_S4B_TUNING.discoveryMaxBatchLimit));
    const candidates = await this.selectCandidates(limit);
    result.candidates = candidates.length;
    result.status = 'COMPLETED';

    for (const candidate of candidates) {
      try {
        await this.repository.createWorkItem({
          tripId: candidate.trip_id,
          sourceFamily: resolveDiV0SourceFamily(candidate.dimo_raw_json).sourceFamily,
          runPurpose: 'PRIMARY',
          pipelineManifest: this.pipeline.manifest,
          expectedOrganizationId: candidate.organization_id,
          expectedVehicleId: candidate.vehicle_id,
        });
        result.created += 1;
      } catch (error) {
        if (isDiV0S4Rejection(error, 'DUPLICATE_WORK_ITEM')) {
          result.duplicates += 1;
          continue;
        }
        if (isDiV0S4Rejection(error) && SKIP_CODES.includes(error.code)) {
          result.skipped += 1;
          continue;
        }
        result.status = 'STOPPED';
        result.stopReason = isDiV0S4Rejection(error) ? error.code : 'UNEXPECTED_ERROR';
        if (!isDiV0S4Rejection(error)) {
          this.logger.warn(`DI V0 S4 discovery pass stopped: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
        }
        break;
      }
    }
    return result;
  }

  /** Unlocked read; T01 re-proves NOT_KILLED under `FOR UPDATE` in its own transaction. */
  private async isKilled(): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ kill_state: unknown }>>`
        SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
      const kill = evaluateDiV0S4KillRow(rows.length === 1 ? { kind: 'ROW', killState: rows[0].kill_state } : { kind: 'MISSING' });
      return kill.state !== 'NOT_KILLED';
    } catch {
      return true;
    }
  }

  /**
   * COMPLETED trips of allowlisted vehicles whose settlement anchor (same expression as the
   * repository's `settlement.anchor`, naive columns read as UTC) is at least the quiet period old
   * on the DB clock, without a non-SUPERSEDED PRIMARY for this pipeline version (the predicate of
   * `di_v0_s4_wi_active_primary_uq`). Oldest anchor first, then trip id.
   */
  private selectCandidates(limit: number): Promise<DiscoveryCandidateRow[]> {
    if (!isDiV0S4DiscoveryContainmentAvailable(this.discoveryContainment)) {
      return Promise.resolve([]);
    }
    const notBefore = this.discoveryContainment.notBeforeUtc;
    const orgs = [...this.config.organizationAllowlist];
    const vehicles = [...this.config.vehicleAllowlist];
    return this.prisma.$queryRaw<DiscoveryCandidateRow[]>`
      SELECT t.id AS trip_id, v.organization_id, t.vehicle_id, d.raw_json AS dimo_raw_json
      FROM vehicle_trips t
      JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN dimo_vehicles d ON d.id = v.dimo_vehicle_id
      CROSS JOIN LATERAL (
        SELECT GREATEST(
          t.end_time AT TIME ZONE 'UTC',
          t.created_at AT TIME ZONE 'UTC',
          (SELECT max(r.applied_at) FROM trip_repairs r WHERE r.trip_id = t.id AND r.status = 'APPLIED') AT TIME ZONE 'UTC'
        ) AS anchor
      ) a
      WHERE t.trip_status::text = 'COMPLETED'
        AND t.end_time IS NOT NULL
        AND t.end_time >= ${notBefore}
        AND v.organization_id = ANY(${orgs}::text[])
        AND t.vehicle_id = ANY(${vehicles}::text[])
        AND a.anchor + make_interval(secs => ${DI_V0_S4_LIMITS.settlementQuietPeriodSeconds}::int) <= clock_timestamp()
        AND NOT EXISTS (
          SELECT 1 FROM di_v0_s4_work_items w
          WHERE w.organization_id = v.organization_id AND w.trip_id = t.id
            AND w.pipeline_version_key = ${this.pipeline.pipelineVersionKey}
            AND w.run_purpose = 'PRIMARY' AND w.status <> 'SUPERSEDED'
        )
      ORDER BY a.anchor ASC, t.id ASC
      LIMIT ${limit}`;
  }
}
