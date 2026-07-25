import { buildComplaintCreateDedupeKey } from './complaint-dedupe.util';

describe('complaint-dedupe.util', () => {
  it('builds stable keys for identical observation content', () => {
    const input = {
      vehicleId: 'veh-1',
      source: 'MANUAL' as const,
      category: 'LIGHTS' as const,
      affectedArea: 'FRONT' as const,
      description: '  Left headlight flickers  ',
    };
    const a = buildComplaintCreateDedupeKey(input);
    const b = buildComplaintCreateDedupeKey({
      ...input,
      description: 'left headlight flickers',
    });
    expect(a).toBe(b);
    expect(a.startsWith('complaint:veh-1:MANUAL:')).toBe(true);
  });

  it('varies key when semantic content differs', () => {
    const base = {
      vehicleId: 'veh-1',
      source: 'MANUAL' as const,
      description: 'Noise when braking',
    };
    const a = buildComplaintCreateDedupeKey(base);
    const b = buildComplaintCreateDedupeKey({
      ...base,
      description: 'Noise when accelerating',
    });
    expect(a).not.toBe(b);
  });
});
