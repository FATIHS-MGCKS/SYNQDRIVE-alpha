import { parseVsiP5b2ReplayProfileMode } from './vsi-apds-p5b2-replay-profile-mode';
import { VsiApdsP5b1OfflineReplayProfileMode } from './vsi-apds-p5b2.types';
import { VsiApdsP5b1OperatorScopeError } from './vsi-apds-p5b1-operator-scope';

describe('parseVsiP5b2ReplayProfileMode', () => {
  it('defaults to legacy when unset', () => {
    expect(parseVsiP5b2ReplayProfileMode(undefined)).toBe(
      VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE,
    );
    expect(parseVsiP5b2ReplayProfileMode('')).toBe(
      VsiApdsP5b1OfflineReplayProfileMode.LEGACY_MUTABLE_PROFILE,
    );
  });

  it('accepts explicit modes', () => {
    expect(parseVsiP5b2ReplayProfileMode('HISTORY_AS_OF')).toBe(
      VsiApdsP5b1OfflineReplayProfileMode.HISTORY_AS_OF,
    );
  });

  it('fail-closed on unknown explicit value', () => {
    expect(() => parseVsiP5b2ReplayProfileMode('TYPO_MODE')).toThrow(
      VsiApdsP5b1OperatorScopeError,
    );
  });
});
