import { applyEntityLinkOperations, readSupersededEntityLinks } from './document-entity-link.util';

describe('document-entity-link.util', () => {
  it('supersedes existing link on confirm replacement', () => {
    const result = applyEntityLinkOperations({
      confirmedData: {
        acceptedEntityLinks: [{ entityType: 'vendor', entityId: 'vendor-old' }],
      },
      operations: [{ operation: 'confirm', entityType: 'vendor', entityId: 'vendor-new' }],
      userId: 'user-1',
      at: '2026-07-17T12:00:00.000Z',
    });

    expect(result.changed).toBe(true);
    expect(result.acceptedEntityLinks).toEqual([
      { entityType: 'vendor', entityId: 'vendor-new', label: null },
    ]);
    expect(result.superseded[0]).toMatchObject({
      entityId: 'vendor-old',
      supersededReason: 'confirmed_replaced',
      replacedByEntityId: 'vendor-new',
    });
  });

  it('keeps multiple entity types independently', () => {
    const result = applyEntityLinkOperations({
      confirmedData: {
        acceptedEntityLinks: [{ entityType: 'booking', entityId: 'book-1' }],
      },
      operations: [{ operation: 'confirm', entityType: 'customer', entityId: 'cust-1' }],
      userId: 'user-1',
    });

    expect(result.acceptedEntityLinks).toEqual([
      { entityType: 'booking', entityId: 'book-1', label: null },
      { entityType: 'customer', entityId: 'cust-1', label: null },
    ]);
  });
});

describe('readSupersededEntityLinks', () => {
  it('reads superseded links from pipeline payload', () => {
    const rows = readSupersededEntityLinks({
      _pipeline: {
        supersededEntityLinks: [
          {
            entityType: 'customer',
            entityId: 'cust-1',
            supersededAt: '2026-07-17T12:00:00.000Z',
            supersededReason: 'removed',
          },
        ],
      },
    });
    expect(rows).toHaveLength(1);
  });
});
