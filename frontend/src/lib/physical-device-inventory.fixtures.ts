import type {
  PhysicalDeviceListResponseDto,
  PhysicalDeviceStockSummaryDto,
} from './physical-device-inventory.types';

/** Representative backend list payload for contract and UI tests. */
export const physicalDeviceListFixture: PhysicalDeviceListResponseDto = {
  total: 1,
  items: [
    {
      id: 'dev-contract-1',
      internalInventoryNumber: 'PDI-CONTRACT-001',
      manufacturer: 'Ruptela',
      modelCode: 'RUPTELA_R1',
      serialNumberMasked: 'R1-1***0068',
      imeiMasked: null,
      ownerOrganizationId: null,
      warehouseLocation: 'WH-EU-01',
      status: 'AVAILABLE',
      identityStatus: 'NEEDS_CLARIFICATION',
      recordedAt: '2026-10-15T10:00:00.000Z',
      currentVehicleId: null,
      installEligible: false,
    },
  ],
};

export const physicalDeviceSummaryFixture: PhysicalDeviceStockSummaryDto = {
  total: 1,
  byStatus: {
    AVAILABLE: 1,
    RESERVED: 0,
    INSTALLED: 0,
    PENDING_RETURN: 0,
    DEFECTIVE: 0,
    LOST: 0,
    RETIRED: 0,
  },
  byModel: {
    RUPTELA_R1: 1,
    RUPTELA_AIR_ONE: 0,
    SMART5: 0,
    OTHER: 0,
  },
  byWarehouseLocation: [{ warehouseLocation: 'WH-EU-01', count: 1 }],
};
