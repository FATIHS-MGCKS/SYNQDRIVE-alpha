import {
  evaluateMixedReplicaCutoverInterlock,
  parseReplicaPeerBuildIds,
} from './physical-state-cutover-mixed-replica-interlock';

describe('physical-state-cutover-mixed-replica-interlock', () => {
  it('P25-M rejects mixed peer build ids', () => {
    const result = evaluateMixedReplicaCutoverInterlock({
      currentBuildId: 'build-a',
      peerBuildIds: ['build-a', 'build-b'],
      requiredCapableBuildId: 'build-a',
    });
    expect(result.safe).toBe(false);
    expect(result.reason).toBe('BLOCKED_MIXED_REPLICA');
  });

  it('P25-M accepts uniform replica builds', () => {
    const result = evaluateMixedReplicaCutoverInterlock({
      currentBuildId: 'build-a',
      peerBuildIds: ['build-a'],
      requiredCapableBuildId: 'build-a',
    });
    expect(result.safe).toBe(true);
  });

  it('P25-N rejects stale binary below capable build', () => {
    const result = evaluateMixedReplicaCutoverInterlock({
      currentBuildId: 'old-build',
      peerBuildIds: [],
      requiredCapableBuildId: 'p25-capable',
    });
    expect(result.safe).toBe(false);
    expect(result.reason).toBe('BLOCKED_MIXED_REPLICA');
  });

  it('parses peer build ids', () => {
    expect(parseReplicaPeerBuildIds('a,b, c')).toEqual(['a', 'b', 'c']);
  });
});
