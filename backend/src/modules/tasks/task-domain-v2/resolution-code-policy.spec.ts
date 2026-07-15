/**
 * Task Domain V2 — Resolution code policy (W12)
 */
import { BadRequestException } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import {
  assertValidManualResolutionCode,
  getAllowedResolutionCodesForType,
  taskTypeRequiresResolutionCode,
} from '../task-resolution-policy.util';

describe('Task Domain V2 — Resolution code policy', () => {
  it('exposes canonical codes for REPAIR', () => {
    expect(getAllowedResolutionCodesForType('REPAIR')).toEqual([
      'REPAIR_COMPLETED',
      'PARTS_REPLACED',
      'OTHER',
    ]);
    expect(taskTypeRequiresResolutionCode('REPAIR')).toBe(true);
    expect(taskTypeRequiresResolutionCode('CUSTOM')).toBe(false);
  });

  it('rejects missing resolution code for coded task types', () => {
    expect(() => assertValidManualResolutionCode('REPAIR', undefined)).toThrow(BadRequestException);
    expect(() => assertValidManualResolutionCode('REPAIR', '  ')).toThrow(BadRequestException);
  });

  it('rejects unknown resolution codes', () => {
    expect(() => assertValidManualResolutionCode('REPAIR', 'UNKNOWN_CODE')).toThrow(BadRequestException);
  });

  it('accepts allowed resolution codes', () => {
    expect(() => assertValidManualResolutionCode('REPAIR', 'REPAIR_COMPLETED')).not.toThrow();
  });
});
