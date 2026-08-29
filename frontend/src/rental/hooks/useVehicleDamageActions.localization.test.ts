// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../test/renderHook';
import type { DamageResponse } from '../lib/damage.types';
import { useVehicleDamageActions } from './useVehicleDamageActions';

const VEHICLE_ID = 'veh-p261';
const ORG_ID = 'org-p261';
const DAMAGE_ID = 'dmg-p261-x7';
const RAW_DESCRIPTION = 'Provider Damage Description X7';
const RAW_LIABILITY_NOTE = 'Provider Liability Note X7';

const {
  mockCreateVehicleDamage,
  mockPlaceVehicleDamage,
  mockAddDamageImage,
  mockUpdateVehicleDamage,
  mockMarkDamageRepaired,
  mockCreateDamageRepairTask,
  mockReload,
} = vi.hoisted(() => ({
  mockCreateVehicleDamage: vi.fn(async () => ({ id: DAMAGE_ID })),
  mockPlaceVehicleDamage: vi.fn(async () => undefined),
  mockAddDamageImage: vi.fn(async () => undefined),
  mockUpdateVehicleDamage: vi.fn(async (...args: unknown[]) => ({ id: DAMAGE_ID, args })),
  mockMarkDamageRepaired: vi.fn(async () => ({ id: DAMAGE_ID })),
  mockCreateDamageRepairTask: vi.fn(async () => ({
    taskId: 'task-new-p261',
    damage: { id: DAMAGE_ID },
  })),
  mockReload: vi.fn(async () => undefined),
}));

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    locale: 'en',
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../lib/api', () => ({
  api: {
    vehicleIntelligence: {
      createVehicleDamage: mockCreateVehicleDamage,
      placeVehicleDamage: mockPlaceVehicleDamage,
      addDamageImage: mockAddDamageImage,
      updateVehicleDamage: mockUpdateVehicleDamage,
      markDamageRepaired: mockMarkDamageRepaired,
      createDamageRepairTask: mockCreateDamageRepairTask,
    },
  },
}));

vi.mock('../lib/damage-image.utils', () => ({
  formatApiError: (error: unknown) => (error instanceof Error ? error.message : 'error'),
  readFileAsDataUrl: vi.fn(async () => 'data:image/jpeg;base64,abc'),
}));

function makeDamage(overrides: Partial<DamageResponse> = {}): DamageResponse {
  return {
    id: DAMAGE_ID,
    vehicleId: VEHICLE_ID,
    damageType: 'SCRATCH',
    severity: 'MODERATE',
    status: 'OPEN',
    description: RAW_DESCRIPTION,
    locationView: 'FRONT',
    locationX: 42,
    locationY: 55,
    locationLabel: 'Provider Repair Shop X7',
    estimatedCostCents: 12500,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: 'MANUAL',
    rentalImpact: 'BLOCK_RENTAL',
    evidenceStatus: 'PARTIAL',
    liabilityStatus: 'NEEDS_REVIEW',
    liabilityNote: RAW_LIABILITY_NOTE,
    reportedBy: 'operator@test',
    reportedAt: '2026-08-15T10:00:00.000Z',
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    repairStartedAt: null,
    repairedAt: null,
    taskId: null,
    images: [],
    ...overrides,
  };
}

describe('useVehicleDamageActions P2.2.61 mutation payload evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createDamage sends exact machine payload fields', async () => {
    const { result, unmount } = renderHook(() =>
      useVehicleDamageActions({
        vehicleId: VEHICLE_ID,
        orgId: ORG_ID,
        reload: mockReload,
      }),
    );

    await act(async () => {
      await result.current.createDamage({
        damageType: 'SCRATCH',
        severity: 'MODERATE',
        description: RAW_DESCRIPTION,
        estimatedCostCents: 12500,
        locationView: 'FRONT',
        locationX: 42,
        locationY: 55,
        source: 'MANUAL',
        images: [{ imageData: 'data:image/jpeg;base64,abc', caption: 'Damage_Photo_X7.jpg' }],
      });
    });

    expect(mockCreateVehicleDamage).toHaveBeenCalledTimes(1);
    expect(mockCreateVehicleDamage).toHaveBeenCalledWith(VEHICLE_ID, {
      damageType: 'SCRATCH',
      severity: 'MODERATE',
      description: RAW_DESCRIPTION,
      estimatedCostCents: 12500,
      locationView: 'FRONT',
      locationX: 42,
      locationY: 55,
      source: 'MANUAL',
      images: [{ imageData: 'data:image/jpeg;base64,abc', caption: 'Damage_Photo_X7.jpg' }],
    });
    unmount();
  });

  it('placeDamage sends exact coordinates and view', async () => {
    const { result, unmount } = renderHook(() =>
      useVehicleDamageActions({
        vehicleId: VEHICLE_ID,
        orgId: ORG_ID,
        reload: mockReload,
      }),
    );

    await act(async () => {
      await result.current.placeDamage(DAMAGE_ID, {
        locationView: 'LEFT',
        locationX: 33.3,
        locationY: 66.7,
      });
    });

    expect(mockPlaceVehicleDamage).toHaveBeenCalledWith(VEHICLE_ID, DAMAGE_ID, {
      locationView: 'LEFT',
      locationX: 33.3,
      locationY: 66.7,
    });
    unmount();
  });

  it('addPhoto sends raw image data and caption', async () => {
    const { result, unmount } = renderHook(() =>
      useVehicleDamageActions({
        vehicleId: VEHICLE_ID,
        orgId: ORG_ID,
        reload: mockReload,
      }),
    );
    const file = new File(['photo'], 'Damage_Photo_X7.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.addPhoto(DAMAGE_ID, file, 'Damage_Photo_X7.jpg');
    });

    expect(mockAddDamageImage).toHaveBeenCalledWith(VEHICLE_ID, DAMAGE_ID, {
      imageData: 'data:image/jpeg;base64,abc',
      caption: 'Damage_Photo_X7.jpg',
    });
    unmount();
  });

  it('markInRepair sends exact status machine value', async () => {
    const { result, unmount } = renderHook(() =>
      useVehicleDamageActions({
        vehicleId: VEHICLE_ID,
        orgId: ORG_ID,
        reload: mockReload,
      }),
    );

    await act(async () => {
      await result.current.markInRepair(DAMAGE_ID);
    });

    expect(mockUpdateVehicleDamage).toHaveBeenCalledWith(
      VEHICLE_ID,
      DAMAGE_ID,
      expect.objectContaining({ status: 'IN_REPAIR', repairStartedAt: expect.any(String) }),
    );
    unmount();
  });

  it('markRepaired calls markDamageRepaired endpoint', async () => {
    const { result, unmount } = renderHook(() =>
      useVehicleDamageActions({
        vehicleId: VEHICLE_ID,
        orgId: ORG_ID,
        reload: mockReload,
      }),
    );

    await act(async () => {
      await result.current.markRepaired(DAMAGE_ID, { repairCostCents: 9900 });
    });

    expect(mockMarkDamageRepaired).toHaveBeenCalledWith(VEHICLE_ID, DAMAGE_ID, {
      repairCostCents: 9900,
    });
    unmount();
  });

  it('archiveDamage sends ARCHIVED status', async () => {
    const { result, unmount } = renderHook(() =>
      useVehicleDamageActions({
        vehicleId: VEHICLE_ID,
        orgId: ORG_ID,
        reload: mockReload,
      }),
    );

    await act(async () => {
      await result.current.archiveDamage(DAMAGE_ID);
    });

    expect(mockUpdateVehicleDamage).toHaveBeenCalledWith(VEHICLE_ID, DAMAGE_ID, {
      status: 'ARCHIVED',
    });
    unmount();
  });

  it('updateLiability sends machine status and raw note', async () => {
    const { result, unmount } = renderHook(() =>
      useVehicleDamageActions({
        vehicleId: VEHICLE_ID,
        orgId: ORG_ID,
        reload: mockReload,
      }),
    );

    await act(async () => {
      await result.current.updateLiability(DAMAGE_ID, {
        liabilityStatus: 'CUSTOMER_RESPONSIBLE',
        liabilityNote: RAW_LIABILITY_NOTE,
      });
    });

    expect(mockUpdateVehicleDamage).toHaveBeenCalledWith(VEHICLE_ID, DAMAGE_ID, {
      liabilityStatus: 'CUSTOMER_RESPONSIBLE',
      liabilityNote: RAW_LIABILITY_NOTE,
    });
    unmount();
  });

  it('createRepairTask sends exact repair task payload', async () => {
    const damage = makeDamage();
    const { result, unmount } = renderHook(() =>
      useVehicleDamageActions({
        vehicleId: VEHICLE_ID,
        orgId: ORG_ID,
        reload: mockReload,
      }),
    );

    await act(async () => {
      await result.current.createRepairTask(damage, {
        dueDate: '2026-09-01',
        vendorId: 'vendor-x7',
        note: 'Provider repair note X7',
      });
    });

    expect(mockCreateDamageRepairTask).toHaveBeenCalledWith(VEHICLE_ID, DAMAGE_ID, {
      dueDate: '2026-09-01',
      vendorId: 'vendor-x7',
      note: 'Provider repair note X7',
    });
    unmount();
  });
});
