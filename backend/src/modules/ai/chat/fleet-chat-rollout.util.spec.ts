import { isFleetChatDomainGroundingEnabled } from './fleet-chat-rollout.util';

describe('fleet-chat-rollout.util', () => {
  const baseConfig = {
    fleetChatDomainGroundingEnabled: true,
    fleetChatOrgAllowlist: [] as string[],
  };

  it('returns false when global flag is disabled', () => {
    expect(
      isFleetChatDomainGroundingEnabled('org-a', {
        ...baseConfig,
        fleetChatDomainGroundingEnabled: false,
      }),
    ).toBe(false);
  });

  it('returns true for all orgs when enabled without allowlist', () => {
    expect(isFleetChatDomainGroundingEnabled('org-a', baseConfig)).toBe(true);
    expect(isFleetChatDomainGroundingEnabled('org-b', baseConfig)).toBe(true);
  });

  it('restricts to allowlisted orgs when list is set', () => {
    const config = {
      ...baseConfig,
      fleetChatOrgAllowlist: ['org-pilot'],
    };
    expect(isFleetChatDomainGroundingEnabled('org-pilot', config)).toBe(true);
    expect(isFleetChatDomainGroundingEnabled('org-other', config)).toBe(false);
  });
});
