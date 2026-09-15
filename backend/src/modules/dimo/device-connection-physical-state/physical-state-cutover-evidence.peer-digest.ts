import { createRequire } from 'node:module';
import * as path from 'node:path';
import type { PhysicalStateCutoverReplicaAttestationV1 } from './physical-state-cutover-evidence.types';

const nodeRequire = createRequire(__filename);
const opsLib = nodeRequire(path.join(__dirname, 'physical-state-cutover-evidence.ops-lib.cjs')) as {
  computeCutoverReplicaPeerSetDigest: (
    replicas: readonly PhysicalStateCutoverReplicaAttestationV1[],
  ) => string;
};

/**
 * Canonical cardinality-preserving fleet peer-set digest.
 * Shared trust root with ops CLI (ops-lib.mjs).
 */
export const computeCutoverReplicaPeerSetDigest = opsLib.computeCutoverReplicaPeerSetDigest;
