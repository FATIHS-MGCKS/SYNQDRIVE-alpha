import type { PrismaClient } from '@prisma/client';
import { S4_RESEARCH_GEOMETRY_PROJECTION_ID } from '../s4-research/version';
import type { DiV0S4ResearchPersistableRun } from './di-v0-s4-research-processor';
import { DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2 } from './di-v0-s4-research-bundle.version';

export class DiV0S4ResearchRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insertRun(scope: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    workItemId: string;
    combinedInputIdentity: string;
    pinnedSnapshotHash: string;
    result: DiV0S4ResearchPersistableRun;
  }): Promise<boolean> {
    const { result } = scope;
    const osmKey = result.kind === 'ARTIFACT' ? result.osmContextKey : result.osmContextKey;
    const osmSha = result.kind === 'ARTIFACT' ? result.osmSnapshotSha256 : result.osmSnapshotSha256;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO di_v0_s4_research_runs_v1 (
          id, organization_id, vehicle_id, trip_id, work_item_id,
          research_bundle_version, geometry_projection_id,
          pinned_snapshot_hash, combined_input_identity,
          osm_context_key, osm_snapshot_sha256,
          research_status, independent_road_id_accuracy,
          summary_json, windows_json
        ) VALUES (
          ${result.id}, ${scope.organizationId}, ${scope.vehicleId}, ${scope.tripId}, ${scope.workItemId},
          ${DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2}, ${S4_RESEARCH_GEOMETRY_PROJECTION_ID},
          ${scope.pinnedSnapshotHash}, ${scope.combinedInputIdentity},
          ${osmKey}, ${osmSha},
          ${result.researchStatus}, 'NOT_ASSESSABLE',
          ${JSON.stringify(result.summaryJson)}::jsonb, ${JSON.stringify(result.windowsJson)}::jsonb
        )`;
      return true;
    } catch {
      return false;
    }
  }
}
