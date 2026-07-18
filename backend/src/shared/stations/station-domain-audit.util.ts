import { StationDomainAuditAction, type StationDomainAuditActionCode } from './station-domain-audit.constants';

export type StationUpdateAuditHintCommand =
  | 'UpdateStationMasterData'
  | 'UpdateStationCapabilities'
  | 'UpdateOpeningCalendar'
  | 'UpdateStationTeam';

export interface StationDomainAuditCorrelationInput {
  auditAction: StationDomainAuditActionCode;
  organizationId: string;
  stationId: string;
  vehicleId?: string | null;
  bookingId?: string | null;
  transferId?: string | null;
  command?: string | null;
  performedAt?: string | null;
}

export function buildStationDomainCorrelationId(
  input: StationDomainAuditCorrelationInput,
): string {
  const parts = [
    input.organizationId,
    input.auditAction,
    input.stationId,
    input.transferId ?? '',
    input.vehicleId ?? '',
    input.bookingId ?? '',
    input.command ?? '',
    input.performedAt ?? '',
  ];
  return parts.join(':');
}

export function summarizeStationDomainValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return String(value);
}

export function buildStationDomainChangeSummary(
  from: unknown,
  to: unknown,
): string | undefined {
  const fromLabel = summarizeStationDomainValue(from);
  const toLabel = summarizeStationDomainValue(to);
  if (!fromLabel && !toLabel) return undefined;
  return `${fromLabel ?? '—'} → ${toLabel ?? '—'}`;
}

export function resolveStationUpdateAuditActions(
  auditHints: Array<{ command: StationUpdateAuditHintCommand }>,
): StationDomainAuditActionCode[] {
  const commands = new Set(auditHints.map((hint) => hint.command));
  const actions: StationDomainAuditActionCode[] = [];

  if (
    commands.has('UpdateStationMasterData') ||
    commands.has('UpdateStationTeam')
  ) {
    actions.push(StationDomainAuditAction.MASTER_DATA_UPDATED);
  }
  if (
    commands.has('UpdateStationCapabilities') ||
    commands.has('UpdateOpeningCalendar')
  ) {
    actions.push(StationDomainAuditAction.OPERATIONS_UPDATED);
  }

  return actions;
}

export function mapTransferCommandToAuditAction(
  command: string,
): StationDomainAuditActionCode | null {
  switch (command) {
    case 'PlanVehicleStationTransfer':
      return StationDomainAuditAction.TRANSFER_PLANNED;
    case 'StartVehicleStationTransfer':
      return StationDomainAuditAction.TRANSFER_STARTED;
    case 'ArriveVehicleStationTransfer':
      return StationDomainAuditAction.TRANSFER_COMPLETED;
    case 'CancelVehicleStationTransfer':
      return StationDomainAuditAction.TRANSFER_CANCELLED;
    default:
      return null;
  }
}

export function buildStationDomainAuditDescription(
  auditAction: StationDomainAuditActionCode,
): string {
  switch (auditAction) {
    case StationDomainAuditAction.STATION_CREATED:
      return 'Station created';
    case StationDomainAuditAction.MASTER_DATA_UPDATED:
      return 'Station master data updated';
    case StationDomainAuditAction.OPERATIONS_UPDATED:
      return 'Station operations updated';
    case StationDomainAuditAction.ACTIVATED:
      return 'Station activated';
    case StationDomainAuditAction.DEACTIVATED:
      return 'Station deactivated';
    case StationDomainAuditAction.ARCHIVED:
      return 'Station archived';
    case StationDomainAuditAction.RESTORED:
      return 'Station restored';
    case StationDomainAuditAction.PRIMARY_CHANGED:
      return 'Primary station changed';
    case StationDomainAuditAction.HOME_STATION_CHANGED:
      return 'Vehicle home station changed';
    case StationDomainAuditAction.CURRENT_STATION_CORRECTED:
      return 'Vehicle current location corrected';
    case StationDomainAuditAction.EXPECTED_STATION_CHANGED:
      return 'Vehicle expected station changed';
    case StationDomainAuditAction.TRANSFER_PLANNED:
      return 'Vehicle transfer planned';
    case StationDomainAuditAction.TRANSFER_STARTED:
      return 'Vehicle transfer started';
    case StationDomainAuditAction.TRANSFER_COMPLETED:
      return 'Vehicle transfer completed';
    case StationDomainAuditAction.TRANSFER_CANCELLED:
      return 'Vehicle transfer cancelled';
    case StationDomainAuditAction.BOOKING_RULE_OVERRIDDEN:
      return 'Station booking rule overridden';
    default:
      return auditAction;
  }
}
