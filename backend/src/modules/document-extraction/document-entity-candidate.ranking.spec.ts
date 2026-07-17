import {
  pickTopCandidatePerEntityType,
  rankDocumentEntityCandidates,
} from './document-entity-candidate.ranking';

describe('document-entity-candidate.ranking', () => {
  it('ranks candidates per entity type by confidence descending', () => {
    const ranked = rankDocumentEntityCandidates([
      { entityType: 'VEHICLE', entityId: 'veh-low', confidence: 0.4 },
      { entityType: 'VEHICLE', entityId: 'veh-high', confidence: 0.95 },
      { entityType: 'CUSTOMER', entityId: 'cust-1', confidence: 0.8 },
      { entityType: 'DRIVER', entityId: 'drv-1', confidence: 0.7 },
    ]);

    expect(ranked.filter((c) => c.entityType === 'VEHICLE').map((c) => c.rank)).toEqual([1, 2]);
    expect(ranked.find((c) => c.entityId === 'veh-high')?.rank).toBe(1);
    expect(ranked.find((c) => c.entityType === 'CUSTOMER')?.rank).toBe(1);
    expect(ranked.find((c) => c.entityType === 'DRIVER')?.rank).toBe(1);
  });

  it('picks top-ranked candidate per entity type', () => {
    const ranked = rankDocumentEntityCandidates([
      { entityType: 'VEHICLE', entityId: 'veh-a', confidence: 0.5 },
      { entityType: 'VEHICLE', entityId: 'veh-b', confidence: 0.9 },
    ]);

    const top = pickTopCandidatePerEntityType(ranked);
    expect(top).toHaveLength(1);
    expect(top[0].entityId).toBe('veh-b');
  });
});
