import { isUuidLike, mergeEnrichedTemplateParams } from './notification-entity-label.enricher';

describe('notification-entity-label.enricher', () => {
  it('detects uuid-like labels', () => {
    expect(isUuidLike('68868291-5478-42cd-b0c4-cc77b2a78e21')).toBe(true);
    expect(isUuidLike('KS FH 660E')).toBe(false);
  });

  it('replaces uuid template params with enriched context', () => {
    const row = {
      id: 'n1',
      entityType: 'VEHICLE',
      entityId: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      templateParams: {
        label: '68868291-5478-42cd-b0c4-cc77b2a78e21',
        plate: '68868291-5478-42cd-b0c4-cc77b2a78e21',
      },
    };
    const contexts = new Map([
      [
        'n1',
        {
          label: 'KS FH 660E',
          plate: 'KS FH 660E',
          make: 'Tesla',
          model: 'Model 3',
        },
      ],
    ]);

    expect(mergeEnrichedTemplateParams(row, contexts)).toEqual({
      label: 'KS FH 660E',
      plate: 'KS FH 660E',
      make: 'Tesla',
      model: 'Model 3',
    });
  });
});
