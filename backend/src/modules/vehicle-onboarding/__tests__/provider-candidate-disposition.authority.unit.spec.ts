import { resolveCandidateDispositionFromActiveClaims } from '../candidate-discovery/provider-candidate-disposition.authority';

describe('resolveCandidateDispositionFromActiveClaims', () => {
  const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const case1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  it('returns AVAILABLE when no active claims', () => {
    expect(resolveCandidateDispositionFromActiveClaims([], orgA)).toEqual({
      disposition: 'AVAILABLE',
    });
  });

  it('returns RESUMABLE for same-org consistent primary', () => {
    const result = resolveCandidateDispositionFromActiveClaims(
      [
        {
          ref: {
            isPrimary: true,
            provider: 'DIMO',
            connectionScopeKey: '',
            externalVehicleIdentity: 'ext-1',
          },
          onboardingCase: {
            id: case1,
            organizationId: orgA,
            primarySourceProvider: 'DIMO',
            primarySourceScopeKey: '',
            primarySourceExternalId: 'ext-1',
          },
        },
      ],
      orgA,
    );
    expect(result).toEqual({ disposition: 'RESUMABLE', resumableCaseId: case1 });
  });

  it('returns null for secondary-only claim', () => {
    expect(
      resolveCandidateDispositionFromActiveClaims(
        [
          {
            ref: {
              isPrimary: false,
              provider: 'HIGH_MOBILITY',
              connectionScopeKey: 'org',
              externalVehicleIdentity: 'hm-1',
            },
            onboardingCase: {
              id: case1,
              organizationId: orgA,
              primarySourceProvider: 'DIMO',
              primarySourceScopeKey: '',
              primarySourceExternalId: 'dimo-1',
            },
          },
        ],
        orgA,
      ),
    ).toBeNull();
  });

  it('returns null for cross-org primary without disclosure', () => {
    expect(
      resolveCandidateDispositionFromActiveClaims(
        [
          {
            ref: {
              isPrimary: true,
              provider: 'DIMO',
              connectionScopeKey: '',
              externalVehicleIdentity: 'ext-1',
            },
            onboardingCase: {
              id: case1,
              organizationId: orgB,
              primarySourceProvider: 'DIMO',
              primarySourceScopeKey: '',
              primarySourceExternalId: 'ext-1',
            },
          },
        ],
        orgA,
      ),
    ).toBeNull();
  });

  it('returns null for multi-holder integrity', () => {
    expect(
      resolveCandidateDispositionFromActiveClaims(
        [
          {
            ref: { isPrimary: true, provider: 'DIMO', connectionScopeKey: '', externalVehicleIdentity: 'a' },
            onboardingCase: {
              id: case1,
              organizationId: orgA,
              primarySourceProvider: 'DIMO',
              primarySourceScopeKey: '',
              primarySourceExternalId: 'a',
            },
          },
          {
            ref: { isPrimary: true, provider: 'DIMO', connectionScopeKey: '', externalVehicleIdentity: 'b' },
            onboardingCase: {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              organizationId: orgA,
              primarySourceProvider: 'DIMO',
              primarySourceScopeKey: '',
              primarySourceExternalId: 'b',
            },
          },
        ],
        orgA,
      ),
    ).toBeNull();
  });
});
