import { describe, expect, it } from 'vitest';
import type { PhysicalDeviceListItemDto } from './physical-device-inventory.types';
import {
  physicalDeviceListFixture,
  physicalDeviceSummaryFixture,
} from './physical-device-inventory.fixtures';

function assertListItemShape(item: PhysicalDeviceListItemDto): void {
  expect(item.id).toBeTruthy();
  expect(item.modelCode).toBe('RUPTELA_R1');
  expect(item.status).toBe('AVAILABLE');
  expect(item.identityStatus).toBe('NEEDS_CLARIFICATION');
  expect(item.currentVehicleId).toBeNull();
  expect(item.installEligible).toBe(false);
  expect(item.serialNumberMasked).toMatch(/\*/);
}

describe('physical device inventory API contract', () => {
  it('fixtures satisfy list and summary DTO shapes', () => {
    expect(physicalDeviceListFixture.total).toBe(physicalDeviceListFixture.items.length);
    assertListItemShape(physicalDeviceListFixture.items[0]);
    expect(physicalDeviceSummaryFixture.byStatus.AVAILABLE).toBe(1);
    expect(physicalDeviceSummaryFixture.byModel.RUPTELA_R1).toBe(1);
  });
});
