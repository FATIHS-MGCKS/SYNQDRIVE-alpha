import { BadRequestException } from '@nestjs/common';
import { ValidateBrakeServiceScopePipe } from './brake-service-scope.validation';

describe('ValidateBrakeServiceScopePipe', () => {
  const pipe = new ValidateBrakeServiceScopePipe();

  it('accepts inspection without scope', () => {
    expect(
      pipe.transform({
        serviceDate: '2026-06-01T10:00:00Z',
        kind: 'inspection_only',
        measured: { frontPadMm: 6.2 },
      } as any),
    ).toBeDefined();
  });

  it('rejects inspection with scope', () => {
    expect(() =>
      pipe.transform({
        serviceDate: '2026-06-01T10:00:00Z',
        kind: 'inspection_only',
        scope: ['front_pads'],
      } as any),
    ).toThrow(BadRequestException);
  });

  it('rejects full service without scope or measurements', () => {
    expect(() =>
      pipe.transform({
        serviceDate: '2026-06-01T10:00:00Z',
        kind: 'full_brake_service',
      } as any),
    ).toThrow('full_service_requires_explicit_scope');
  });

  it('accepts scoped pads service with matching thickness', () => {
    expect(
      pipe.transform({
        serviceDate: '2026-06-01T10:00:00Z',
        kind: 'pads_service',
        scope: ['front_pads'],
        measured: { frontPadMm: 11 },
      } as any),
    ).toBeDefined();
  });
});
