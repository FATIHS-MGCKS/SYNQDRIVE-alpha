import type { VehicleStatus } from '@prisma/client';
import type { VbhDiagnosticReport } from './vehicle-booking-handover-diagnostic.types';

export const VBH_REPAIR_SCRIPT_VERSION = '1.0.0';

export type VbhRepairActionId =
  | 'clear_stale_reserved_vehicle_status'
  | 'clear_stale_rented_after_return'
  | 'complete_booking_after_return_protocol'
  | 'activate_booking_after_pickup_protocol';

export type VbhRepairRuleId =
  | 'raw_reserved_without_window'
  | 'raw_rented_after_completed_return'
  | 'active_booking_with_return_protocol'
  | 'pickup_protocol_booking_not_active';

export interface VbhRepairRunOptions {
  organizationId?: string;
  vehicleId?: string;
  /** When false (default), only plan repairs without writes. */
  apply?: boolean;
  batchSize?: number;
  referenceNow?: Date;
}

export interface VbhRepairAction {
  actionId: VbhRepairActionId;
  ruleId: VbhRepairRuleId;
  organizationId: string;
  vehicleId: string;
  bookingId?: string;
  description: string;
  reason: string;
  before: Record<string, string | number | boolean | null>;
  after: Record<string, string | number | boolean | null>;
  applied: boolean;
  skipped?: boolean;
  skipReason?: string;
}

export interface VbhRepairUnresolved {
  organizationId: string;
  vehicleId?: string;
  bookingId?: string;
  ruleId: string;
  reason: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface VbhRepairSkipped {
  organizationId: string;
  vehicleId?: string;
  bookingId?: string;
  ruleId: string;
  reason: string;
}

export interface VbhRepairAuditLogEntry {
  at: string;
  level: 'info' | 'action' | 'skip' | 'error' | 'unresolved';
  scriptVersion: string;
  message: string;
  actionId?: VbhRepairActionId;
  ruleId?: VbhRepairRuleId;
  vehicleId?: string;
  bookingId?: string;
  before?: Record<string, string | number | boolean | null>;
  after?: Record<string, string | number | boolean | null>;
  reason?: string;
}

export interface VbhRepairReport {
  mode: 'repair';
  dryRun: boolean;
  apply: boolean;
  scriptVersion: string;
  generatedAt: string;
  referenceNow: string;
  organizationId: string | null;
  organizationCount: number;
  vehiclesScanned: number;
  bookingsScanned: number;
  summary: {
    planned: number;
    applied: number;
    skipped: number;
    unresolved: number;
    errors: number;
    byAction: Partial<Record<VbhRepairActionId, number>>;
  };
  actions: VbhRepairAction[];
  unresolved: VbhRepairUnresolved[];
  skipped: VbhRepairSkipped[];
  auditLog: VbhRepairAuditLogEntry[];
  diagnosticBefore: VbhDiagnosticReport;
  diagnosticAfter?: VbhDiagnosticReport;
}

export interface VbhRepairVehicleRow {
  id: string;
  organizationId: string;
  licensePlate: string | null;
  status: VehicleStatus;
}

export interface VbhRepairBookingRow {
  id: string;
  organizationId: string;
  vehicleId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  completedAt: Date | null;
  notes: string | null;
}

export interface VbhRepairHandoverRow {
  id: string;
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  kind: 'PICKUP' | 'RETURN';
  performedAt: Date;
  odometerKm: number;
}

export interface VbhRepairOrgContext {
  organizationId: string;
  vehicles: VbhRepairVehicleRow[];
  bookings: VbhRepairBookingRow[];
  handovers: VbhRepairHandoverRow[];
  handoversByBooking: Map<string, VbhRepairHandoverRow[]>;
  bookingsByVehicle: Map<string, VbhRepairBookingRow[]>;
}
