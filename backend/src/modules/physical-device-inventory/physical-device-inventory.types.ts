import type {
  PhysicalDeviceIdentityStatus,
  PhysicalDeviceInventoryStatus,
  PhysicalDeviceModelCode,
} from '@prisma/client';

export const PHYSICAL_DEVICE_MANUFACTURER_BY_MODEL: Record<PhysicalDeviceModelCode, string> = {
  RUPTELA_R1: 'Ruptela',
  RUPTELA_AIR_ONE: 'Ruptela',
  SMART5: 'SynqDrive',
  OTHER: 'Unknown',
};

export type PhysicalDeviceListItemDto = {
  id: string;
  internalInventoryNumber: string;
  manufacturer: string;
  modelCode: PhysicalDeviceModelCode;
  serialNumberMasked: string | null;
  imeiMasked: string | null;
  ownerOrganizationId: string | null;
  warehouseLocation: string;
  status: PhysicalDeviceInventoryStatus;
  identityStatus: PhysicalDeviceIdentityStatus;
  recordedAt: string;
  currentVehicleId: string | null;
  /** False for manual intake until independent identity confirmation exists (P1A). */
  installEligible: boolean;
};

export type PhysicalDeviceStockSummaryDto = {
  total: number;
  byStatus: Record<PhysicalDeviceInventoryStatus, number>;
  byModel: Record<PhysicalDeviceModelCode, number>;
  byWarehouseLocation: Array<{ warehouseLocation: string; count: number }>;
};

export type PhysicalDeviceAssignmentHistoryItemDto = {
  id: string;
  assignmentKind: string;
  vehicleId: string | null;
  organizationId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  actorUserId: string | null;
};

export type PhysicalDeviceAuditHistoryItemDto = {
  id: string;
  eventKind: string;
  createdAt: string;
  actorUserId: string | null;
  evidenceSummary: string;
};

export type PhysicalDeviceDetailDto = PhysicalDeviceListItemDto & {
  intakeNotes: string | null;
  identityEvidenceSummary: string | null;
  assignmentHistory: PhysicalDeviceAssignmentHistoryItemDto[];
  auditHistory: PhysicalDeviceAuditHistoryItemDto[];
};
