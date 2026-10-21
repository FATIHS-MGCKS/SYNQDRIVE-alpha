import { computeCutoverReplicaPeerSetDigest } from './physical-state-cutover-evidence.peer-digest';

describe('physical-state-cutover-evidence.peer-digest', () => {
  it('preserves fleet cardinality for duplicate build IDs', () => {
    const oneReplica = computeCutoverReplicaPeerSetDigest([
      { replicaId: 'request-a', buildId: 'build-x', role: 'REQUEST', port: 3001 },
    ]);
    const twoReplicas = computeCutoverReplicaPeerSetDigest([
      { replicaId: 'request-a', buildId: 'build-x', role: 'REQUEST', port: 3001 },
      { replicaId: 'request-b', buildId: 'build-x', role: 'REQUEST', port: 3002 },
    ]);
    expect(oneReplica).not.toBe(twoReplicas);
  });
});
