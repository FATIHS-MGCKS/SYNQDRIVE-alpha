import { BadRequestException } from '@nestjs/common';
import { parseCapabilityResolverEvaluationTime } from './vsi-capability-resolver.controller';

describe('parseCapabilityResolverEvaluationTime', () => {
  it('rejects invalid date strings', () => {
    expect(() => parseCapabilityResolverEvaluationTime('not-a-date')).toThrow(
      BadRequestException,
    );
  });

  it('rejects far-future evaluationTime', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(() => parseCapabilityResolverEvaluationTime(future)).toThrow(BadRequestException);
  });

  it('accepts valid ISO evaluationTime in the past', () => {
    const past = new Date(Date.now() - 60_000);
    expect(parseCapabilityResolverEvaluationTime(past.toISOString()).toISOString()).toBe(
      past.toISOString(),
    );
  });
});
