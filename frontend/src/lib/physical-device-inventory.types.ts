/**
 * Physical Device Inventory — frontend API contract (aligned with backend DTOs).
 * Mirrors Prisma enums in `backend/prisma/schema.prisma` (PhysicalDevice*).
 */

export const PHYSICAL_DEVICE_MODEL_CODES = [
  'RUPTELA_R1',
  'RUPTELA_AIR_ONE',
  'SMART5',
  'OTHER',
] as const;

export type PhysicalDeviceModelCode = (typeof PHYSICAL_DEVICE_MODEL_CODES)[number];

export const PHYSICAL_DEVICE_INVENTORY_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'INSTALLED',
  'DEFECTIVE',
  'LOST',
  'RETIRED',
] as const;

export type PhysicalDeviceInventoryStatus = (typeof PHYSICAL_DEVICE_INVENTORY_STATUSES)[number];

export const PHYSICAL_DEVICE_IDENTITY_STATUSES = ['VERIFIED', 'NEEDS_CLARIFICATION'] as const;

export type PhysicalDeviceIdentityStatus = (typeof PHYSICAL_DEVICE_IDENTITY_STATUSES)[number];

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
  installEligible: boolean;
};

export type PhysicalDeviceListResponseDto = {
  items: PhysicalDeviceListItemDto[];
  total: number;
};

export type PhysicalDeviceStockSummaryDto = {
  total: number;
  byStatus: Record<PhysicalDeviceInventoryStatus, number>;
  byModel: Record<PhysicalDeviceModelCode, number>;
  byWarehouseLocation: Array<{ warehouseLocation: string; count: number }>;
};

export type ManualIntakePhysicalDeviceRequest = {
  modelCode: PhysicalDeviceModelCode;
  serialNumber?: string;
  imei?: string;
  warehouseLocation: string;
  ownerOrganizationId?: string | null;
  intakeNotes?: string;
  idempotencyKey?: string;
};

export type ManualIntakePhysicalDeviceResponse = PhysicalDeviceListItemDto;

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
  activeInstallAssignmentId: string | null;
  assignmentHistory: PhysicalDeviceAssignmentHistoryItemDto[];
  auditHistory: PhysicalDeviceAuditHistoryItemDto[];
};

export type VerifyPhysicalDeviceIdentityRequest = {
  attestationKind: 'PROVIDER_DIMO_SERIAL_RECONCILIATION';
  providerReconciliationVehicleId?: string;
  reviewerUserId: string;
  reviewerNotes?: string;
  idempotencyKey?: string;
};

export type InstallPhysicalDeviceRequest = {
  vehicleId: string;
  installConfirmation: boolean;
  idempotencyKey?: string;
  installNotes?: string;
};

export type UninstallPhysicalDeviceRequest = {
  vehicleId: string;
  assignmentId: string;
  physicalUninstallConfirmed: boolean;
  uninstallReason: string;
  deviceConditionAfterUninstall: 'FUNCTIONAL' | 'DEFECTIVE';
  physicalReturnConfirmed: boolean;
  warehouseLocation?: string;
  defectDescription?: string;
  idempotencyKey?: string;
};

export type ReturnPhysicalDeviceToStockRequest = {
  warehouseLocation: string;
  physicalReturnConfirmed: boolean;
  returnNotes?: string;
  idempotencyKey?: string;
};

export type MarkPhysicalDeviceDefectiveRequest = {
  defectDescription: string;
  physicalInspectionConfirmed: boolean;
  idempotencyKey?: string;
};

export type MarkPhysicalDeviceLostRequest = {
  lossAttestationKind: 'MASTER_ADMIN_LOSS_CONFIRMATION';
  lossEvidenceNotes: string;
  idempotencyKey?: string;
};

export type RetirePhysicalDeviceRequest = {
  retireReason: string;
  retirementConfirmation: boolean;
  idempotencyKey?: string;
};

export type ListPhysicalDevicesQuery = {
  search?: string;
  status?: PhysicalDeviceInventoryStatus;
  modelCode?: PhysicalDeviceModelCode;
  warehouseLocation?: string;
  ownerOrganizationId?: string;
  limit?: number;
  offset?: number;
};

export function isPhysicalDeviceModelCode(value: string): value is PhysicalDeviceModelCode {
  return (PHYSICAL_DEVICE_MODEL_CODES as readonly string[]).includes(value);
}

export function isPhysicalDeviceInventoryStatus(
  value: string,
): value is PhysicalDeviceInventoryStatus {
  return (PHYSICAL_DEVICE_INVENTORY_STATUSES as readonly string[]).includes(value);
}
