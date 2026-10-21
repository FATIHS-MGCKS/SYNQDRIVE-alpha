import {
  classifyPartialBoundaryRepair,
  BOUNDARY_MATCH_TOLERANCE_MS,
} from './partial-boundary-classification.util';

const T0 = Date.parse('2026-08-29T12:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const provider = (startMin: number, endMin: number, mechanism = 'changePointDetection') => ({
  segmentId: 'seg-1',
  mechanism,
  startTime: at(startMin),
  endTime: at(endMin),
});

const trip = (id: string, startMin: number, endMin: number, status = 'COMPLETED') => ({
  id,
  startTime: at(startMin),
  endTime: at(endMin),
  tripStatus: status,
});

describe('classifyPartialBoundaryRepair', () => {
  it('I1 — suffix partial: DIMO 12:01–12:50 + live 12:30–12:50 → PARTIAL_EXTENSION', () => {
    const result = classifyPartialBoundaryRepair(
      provider(1, 50),
      [trip('live-suffix', 30, 50)],
    );
    expect(result.kind).toBe('PARTIAL_EXTENSION');
    if (result.kind !== 'PARTIAL_EXTENSION') return;
    expect(result.tripId).toBe('live-suffix');
    expect(result.newStart).toEqual(at(1));
    expect(result.newEnd).toEqual(at(50));
    expect(result.extendStart).toBe(true);
    expect(result.extendEnd).toBe(false);
  });

  it('I2 — prefix partial: DIMO 12:01–12:50 + live 12:01–12:30 → PARTIAL_EXTENSION end', () => {
    const result = classifyPartialBoundaryRepair(
      provider(1, 50),
      [trip('live-prefix', 1, 30)],
    );
    expect(result.kind).toBe('PARTIAL_EXTENSION');
    if (result.kind !== 'PARTIAL_EXTENSION') return;
    expect(result.newStart).toEqual(at(1));
    expect(result.newEnd).toEqual(at(50));
    expect(result.extendEnd).toBe(true);
  });

  it('I4 — exact match → no mutation classification', () => {
    const result = classifyPartialBoundaryRepair(
      provider(1, 50),
      [trip('exact', 1, 50)],
    );
    expect(result.kind).toBe('EXACT_MATCH');
  });

  it('I5 — two unrelated canonical trips → AMBIGUOUS', () => {
    const result = classifyPartialBoundaryRepair(provider(1, 50), [
      trip('t1', 1, 10),
      trip('t2', 40, 50),
    ]);
    expect(result.kind).toBe('AMBIGUOUS');
  });

  it('I6 — partial trip + conflicting trip in extension range → AMBIGUOUS (no mutation)', () => {
    const result = classifyPartialBoundaryRepair(provider(1, 50), [
      trip('suffix', 30, 50),
      trip('blocker', 5, 15),
    ]);
    expect(result.kind).toBe('AMBIGUOUS');
  });

  it('rejects energy/refuel segments', () => {
    const result = classifyPartialBoundaryRepair(
      provider(1, 50, 'refuel'),
      [trip('live', 30, 50)],
    );
    expect(result.kind).toBe('AMBIGUOUS');
  });

  it('no intersecting trip → MISSING_TRIP', () => {
    const result = classifyPartialBoundaryRepair(provider(1, 50), []);
    expect(result.kind).toBe('MISSING_TRIP');
  });

  it('treats near-exact boundaries within tolerance as EXACT_MATCH', () => {
    const result = classifyPartialBoundaryRepair(
      provider(1, 50),
      [
        {
          id: 'near',
          startTime: new Date(at(1).getTime() + BOUNDARY_MATCH_TOLERANCE_MS - 1000),
          endTime: new Date(at(50).getTime() - 1000),
          tripStatus: 'COMPLETED',
        },
      ],
    );
    expect(result.kind).toBe('EXACT_MATCH');
  });
});
