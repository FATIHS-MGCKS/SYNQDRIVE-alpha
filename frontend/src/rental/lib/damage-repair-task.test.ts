import { describe, expect, it } from 'vitest';
import {
  buildRepairTaskPayload,
  buildRepairTaskTitle,
  canCreateRepairTaskForDamage,
  deriveTaskPriorityFromDamage,
} from './damage-repair-task';
import type { DamageResponse } from './damage.types';

function makeDamage(overrides: Partial<DamageResponse> = {}): DamageResponse {
  return {
    id: 'damage-1',
    vehicleId: 'vehicle-1',
    damageType: 'SCRATCH',
    severity: 'MODERATE',
    status: 'OPEN',
    description: 'Deep scratch on door',
    locationView: 'LEFT',
    locationX: 40,
    locationY: 55,
    locationLabel: 'Rear door',
    estimatedCostCents: 12500,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: 'MANUAL',
    rentalImpact: 'BLOCK_RENTAL',
    evidenceStatus: 'PARTIAL',
    reportedBy: null,
    reportedAt: '2026-06-01T10:00:00.000Z',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    repairStartedAt: null,
    repairedAt: null,
    images: [],
    ...overrides,
  };
}

describe('damage-repair-task', () => {
  it('builds title from damage type and location label', () => {
    expect(buildRepairTaskTitle(makeDamage())).toBe('Repair: Scratch - Rear door');
  });

  it('maps rental impact to task priority', () => {
    expect(deriveTaskPriorityFromDamage(makeDamage({ rentalImpact: 'SAFETY_CRITICAL' }))).toBe(
      'CRITICAL',
    );
    expect(deriveTaskPriorityFromDamage(makeDamage({ rentalImpact: 'BLOCK_RENTAL' }))).toBe('HIGH');
    expect(deriveTaskPriorityFromDamage(makeDamage({ rentalImpact: 'WATCH' }))).toBe('NORMAL');
    expect(
      deriveTaskPriorityFromDamage(
        makeDamage({ rentalImpact: 'NONE', severity: 'MINOR' }),
      ),
    ).toBe('LOW');
  });

  it('builds create payload with vehicle and damage context', () => {
    const payload = buildRepairTaskPayload(makeDamage(), 'vehicle-1', {
      dueDate: '2026-06-20T12:00:00.000Z',
      vendorId: 'vendor-1',
      note: 'Urgent body shop',
    });

    expect(payload.type).toBe('REPAIR');
    expect(payload.vehicleId).toBe('vehicle-1');
    expect(payload.vendorId).toBe('vendor-1');
    expect(payload.priority).toBe('HIGH');
    expect(payload.title).toContain('Scratch');
    expect(payload.description).toContain('damage-1');
    expect(payload.description).toContain('Urgent body shop');
    expect(payload.estimatedCostCents).toBe(12500);
  });

  it('prevents duplicate task creation when taskId exists', () => {
    expect(canCreateRepairTaskForDamage(makeDamage({ taskId: 'task-1' }))).toBe(false);
    expect(canCreateRepairTaskForDamage(makeDamage())).toBe(true);
  });
});
