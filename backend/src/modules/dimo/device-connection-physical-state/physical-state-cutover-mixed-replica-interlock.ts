/**
 * Application-side mixed-replica cutover interlock (P2.5).
 *
 * Deployment orchestration must still ensure uniform replica SHAs before cutover;
 * this contract prevents cutover when process build identity is inconsistent.
 */

export type MixedReplicaInterlockInput = {
  currentBuildId?: string | null;
  peerBuildIds?: readonly string[];
  requiredCapableBuildId?: string | null;
};

export type MixedReplicaInterlockResult = {
  safe: boolean;
  reason: 'SAFE' | 'BLOCKED_MIXED_REPLICA' | 'BLOCKED_RUNTIME_NOT_READY';
  details: string[];
};

export function parseReplicaPeerBuildIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function evaluateMixedReplicaCutoverInterlock(
  input: MixedReplicaInterlockInput,
): MixedReplicaInterlockResult {
  const details: string[] = [];
  const required = input.requiredCapableBuildId?.trim() ?? '';
  const current = input.currentBuildId?.trim() ?? '';

  if (!required) {
    return {
      safe: false,
      reason: 'BLOCKED_RUNTIME_NOT_READY',
      details: ['missing_required_capable_build_id'],
    };
  }

  if (!current) {
    return {
      safe: false,
      reason: 'BLOCKED_RUNTIME_NOT_READY',
      details: ['missing_current_build_id'],
    };
  }

  if (current !== required) {
    details.push('current_build_not_cutover_capable');
    return {
      safe: false,
      reason: 'BLOCKED_MIXED_REPLICA',
      details,
    };
  }

  const peers = input.peerBuildIds ?? [];
  for (const peer of peers) {
    if (peer !== current) {
      details.push(`peer_build_mismatch:${peer}`);
    }
  }

  if (details.length > 0) {
    return {
      safe: false,
      reason: 'BLOCKED_MIXED_REPLICA',
      details,
    };
  }

  return { safe: true, reason: 'SAFE', details: [] };
}

export function loadMixedReplicaInterlockFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MixedReplicaInterlockInput {
  return {
    currentBuildId: env.SYNQDRIVE_BUILD_ID ?? env.SYNQDRIVE_BUILD_SHA ?? null,
    peerBuildIds: parseReplicaPeerBuildIds(env.SYNQDRIVE_REPLICA_PEER_BUILD_IDS),
    requiredCapableBuildId:
      env.CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID ?? null,
  };
}
