import { persistHandoverTechnicalObservationsInTransaction } from './handover-technical-observation.persistence';

describe('persistHandoverTechnicalObservationsInTransaction', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    bookingId: 'book-1',
    customerId: 'cust-1',
    handoverProtocolId: 'proto-1',
    stationId: 'station-1',
    createdByUserId: 'user-1',
    source: 'OPERATOR_HANDOVER' as const,
  };

  const makeTx = () => {
    const rows: Array<{ id: string; description: string }> = [];
    let nextId = 1;
    return {
      vehicleComplaint: {
        findFirst: jest.fn(async ({ where }: any) => {
          const match = rows.find(
            (r) =>
              r.description.toLowerCase() ===
              String(where.description?.equals ?? '').toLowerCase(),
          );
          return match ? { id: match.id } : null;
        }),
        create: jest.fn(async ({ data }: any) => {
          const row = { id: `obs-${nextId++}`, description: data.description };
          rows.push(row);
          return row;
        }),
      },
      _rows: rows,
    };
  };

  it('creates observations for pickup handover context', async () => {
    const tx = makeTx();
    const result = await persistHandoverTechnicalObservationsInTransaction(tx as any, {
      ...baseInput,
      drafts: [{ description: 'Worn wipers', severity: 'medium' }],
    });
    expect(result.createdIds).toHaveLength(1);
    expect(result.skippedDuplicateIds).toHaveLength(0);
    expect(tx.vehicleComplaint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'OPERATOR_HANDOVER',
          blocksRental: false,
          bookingId: 'book-1',
          handoverProtocolId: 'proto-1',
        }),
      }),
    );
  });

  it('skips duplicate descriptions for same protocol (idempotent)', async () => {
    const tx = makeTx();
    const first = await persistHandoverTechnicalObservationsInTransaction(tx as any, {
      ...baseInput,
      drafts: [{ description: 'Engine noise', severity: 'high' }],
    });
    const second = await persistHandoverTechnicalObservationsInTransaction(tx as any, {
      ...baseInput,
      drafts: [{ description: 'engine noise', severity: 'critical' }],
    });
    expect(first.createdIds).toHaveLength(1);
    expect(second.createdIds).toHaveLength(0);
    expect(second.skippedDuplicateIds).toEqual(first.createdIds);
    expect(tx.vehicleComplaint.create).toHaveBeenCalledTimes(1);
  });

  it('critical severity does not imply blocksRental', async () => {
    const tx = makeTx();
    await persistHandoverTechnicalObservationsInTransaction(tx as any, {
      ...baseInput,
      source: 'OPERATOR_RETURN',
      drafts: [{ description: 'Brake squeal', severity: 'critical' }],
    });
    expect(tx.vehicleComplaint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          urgency: 'CRITICAL',
          blocksRental: false,
          source: 'OPERATOR_RETURN',
        }),
      }),
    );
  });
});
