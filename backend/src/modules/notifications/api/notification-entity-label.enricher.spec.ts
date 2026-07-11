import { isUuidLike, mergeEnrichedTemplateParams, enrichActiveDtcTemplateParams } from './notification-entity-label.enricher';
import type { PrismaService } from '@shared/database/prisma.service';

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

  it('enriches ACTIVE_DTC reason from DTC knowledge when placeholder', async () => {
    const prisma = {
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'veh-1', make: 'Audi', model: 'A4', year: 2016 },
        ]),
      },
      vehicleDtcEvent: {
        findMany: jest.fn().mockResolvedValue([
          { vehicleId: 'veh-1', dtcCode: 'P0675', description: 'DTC P0675' },
        ]),
      },
      dtcKnowledge: {
        findMany: jest.fn().mockResolvedValue([
          {
            normalizedCode: 'P0675',
            title: 'P0675 - Zündkerzenheizung Zylinder 5 - Fehlfunktion',
            shortDescription: 'Glühkerze Zylinder 5',
          },
        ]),
      },
      dtcVehicleKnowledge: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const rows = [{
      id: 'n1',
      entityType: 'VEHICLE',
      entityId: 'veh-1',
      eventType: 'ACTIVE_DTC',
      templateParams: { code: 'P0675', reason: '{reason}' },
    }];
    const paramsById = new Map<string, Record<string, string | number | boolean | null>>([
      ['n1', { code: 'P0675', reason: '{reason}' }],
    ]);

    await enrichActiveDtcTemplateParams(prisma, rows, paramsById);

    expect(paramsById.get('n1')?.reason).toBe(
      'P0675 - Zündkerzenheizung Zylinder 5 - Fehlfunktion',
    );
  });
});
