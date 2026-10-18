import { createHash } from 'crypto';
import { S4_RESEARCH_GEOMETRY_PROJECTION_ID } from '../s4-research/version';
import { DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2 } from './di-v0-s4-research-bundle.version';

export const DI_V0_S4_RESEARCH_OSM_DATA_VERSION_ENV = 'DI_V0_S4_RESEARCH_OSM_DATA_VERSION';

export function resolveOsmDataVersion(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const raw = env[DI_V0_S4_RESEARCH_OSM_DATA_VERSION_ENV]?.trim();
  return raw && raw.length > 0 ? raw : 'DI_V0_S4_RESEARCH_OSM_DATA_V1';
}

export function buildResearchIntentKey(input: {
  researchBundleVersion?: string;
  geometryProjectionId?: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  osmDataVersion: string;
}): string {
  const payload = JSON.stringify({
    b: input.researchBundleVersion ?? DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2,
    c: input.combinedInputIdentity,
    g: input.geometryProjectionId ?? S4_RESEARCH_GEOMETRY_PROJECTION_ID,
    o: input.osmDataVersion,
    p: input.pinnedSnapshotHash,
  });
  return `DI_V0_S4_RESEARCH_INTENT_V1:sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

/** Terminal research outcomes that should not be re-enqueued for the same intent. */
export function isTerminalResearchRunStatus(status: string): boolean {
  return status === 'SUCCEEDED' || status === 'SNAPSHOT_INVALID';
}
