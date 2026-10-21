import { interleaveByOrganization } from './interleave-by-organization';

describe('interleaveByOrganization', () => {
  it('round-robins across organizations deterministically', () => {
    const items = [
      { organizationId: 'org-b', id: 'b1' },
      { organizationId: 'org-a', id: 'a1' },
      { organizationId: 'org-a', id: 'a2' },
      { organizationId: 'org-b', id: 'b2' },
      { organizationId: 'org-c', id: 'c1' },
    ];

    const ordered = interleaveByOrganization(items);
    expect(ordered.map((x) => x.id)).toEqual(['a1', 'b1', 'c1', 'a2', 'b2']);
  });

  it('does not starve smaller org when one org has many vehicles', () => {
    const items = [
      ...Array.from({ length: 100 }, (_, i) => ({
        organizationId: 'big-org',
        id: `big-${i}`,
      })),
      { organizationId: 'small-org', id: 'small-0' },
    ];

    const ordered = interleaveByOrganization(items);
    expect(ordered[0].organizationId).toBe('big-org');
    expect(ordered[1].organizationId).toBe('small-org');
    expect(ordered[2].organizationId).toBe('big-org');
  });
});
