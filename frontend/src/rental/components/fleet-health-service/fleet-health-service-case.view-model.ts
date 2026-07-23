import type { ApiServiceCase, ApiServiceCaseStatus } from '../../../lib/api';

export type FleetHealthServiceCaseKpiValue = number | null;

export interface FleetHealthServiceCaseKpis {
  dataReady: boolean;
  /** All non-terminal cases. */
  activeCases: FleetHealthServiceCaseKpiValue;
  /** Status === OPEN */
  openCases: FleetHealthServiceCaseKpiValue;
  scheduled: FleetHealthServiceCaseKpiValue;
  inProgress: FleetHealthServiceCaseKpiValue;
  waitingVendor: FleetHealthServiceCaseKpiValue;
  waitingParts: FleetHealthServiceCaseKpiValue;
  overdue: FleetHealthServiceCaseKpiValue;
  expectedReadyOverdue: FleetHealthServiceCaseKpiValue;
  rentalBlockingCases: FleetHealthServiceCaseKpiValue;
  withoutAppointment: FleetHealthServiceCaseKpiValue;
  withoutRequiredPartner: FleetHealthServiceCaseKpiValue;
}

export interface FleetHealthServiceCaseGroups {
  activeCases: ApiServiceCase[];
  openCases: ApiServiceCase[];
  scheduledCases: ApiServiceCase[];
  inProgressCases: ApiServiceCase[];
  waitingVendorCases: ApiServiceCase[];
  waitingPartsCases: ApiServiceCase[];
  overdueCases: ApiServiceCase[];
  expectedReadyOverdueCases: ApiServiceCase[];
  rentalBlockingCases: ApiServiceCase[];
  withoutAppointmentCases: ApiServiceCase[];
  withoutRequiredPartnerCases: ApiServiceCase[];
}

export interface FleetHealthServiceCaseLayer {
  kpis: FleetHealthServiceCaseKpis;
  groups: FleetHealthServiceCaseGroups;
  casesByVehicleId: Map<string, ApiServiceCase[]>;
}

export interface BuildFleetHealthServiceCaseLayerInput {
  serviceCases: ApiServiceCase[];
  dataReady: boolean;
  nowMs?: number;
}

const TERMINAL_STATUSES = new Set<ApiServiceCaseStatus>(['COMPLETED', 'CANCELLED']);

const VENDOR_REQUIRED_STATUSES = new Set<ApiServiceCaseStatus>([
  'SCHEDULED',
  'IN_PROGRESS',
  'WAITING_VENDOR',
  'WAITING_PARTS',
]);

export function isActiveServiceCase(
  serviceCase: Pick<ApiServiceCase, 'status'>,
): boolean {
  return !TERMINAL_STATUSES.has(serviceCase.status);
}

function parseTimestampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function isServiceCaseScheduledOverdue(
  serviceCase: Pick<ApiServiceCase, 'status' | 'scheduledAt'>,
  nowMs = Date.now(),
): boolean {
  if (!isActiveServiceCase(serviceCase)) return false;
  const scheduledMs = parseTimestampMs(serviceCase.scheduledAt);
  if (scheduledMs == null) return false;
  return scheduledMs < nowMs;
}

export function isServiceCaseExpectedReadyOverdue(
  serviceCase: Pick<ApiServiceCase, 'status' | 'expectedReadyAt'>,
  nowMs = Date.now(),
): boolean {
  if (!isActiveServiceCase(serviceCase)) return false;
  const expectedMs = parseTimestampMs(serviceCase.expectedReadyAt);
  if (expectedMs == null) return false;
  return expectedMs < nowMs;
}

export function isServiceCaseWithoutAppointment(
  serviceCase: Pick<ApiServiceCase, 'status' | 'scheduledAt'>,
): boolean {
  if (!isActiveServiceCase(serviceCase)) return false;
  return serviceCase.scheduledAt == null;
}

export function isServiceCaseMissingRequiredPartner(
  serviceCase: Pick<ApiServiceCase, 'status' | 'vendorId'>,
): boolean {
  if (!isActiveServiceCase(serviceCase)) return false;
  return VENDOR_REQUIRED_STATUSES.has(serviceCase.status) && !serviceCase.vendorId;
}

function unknownCaseKpis(): FleetHealthServiceCaseKpis {
  return {
    dataReady: false,
    activeCases: null,
    openCases: null,
    scheduled: null,
    inProgress: null,
    waitingVendor: null,
    waitingParts: null,
    overdue: null,
    expectedReadyOverdue: null,
    rentalBlockingCases: null,
    withoutAppointment: null,
    withoutRequiredPartner: null,
  };
}

function emptyCaseGroups(): FleetHealthServiceCaseGroups {
  return {
    activeCases: [],
    openCases: [],
    scheduledCases: [],
    inProgressCases: [],
    waitingVendorCases: [],
    waitingPartsCases: [],
    overdueCases: [],
    expectedReadyOverdueCases: [],
    rentalBlockingCases: [],
    withoutAppointmentCases: [],
    withoutRequiredPartnerCases: [],
  };
}

export function buildCasesByVehicleId(
  serviceCases: ApiServiceCase[],
): Map<string, ApiServiceCase[]> {
  const map = new Map<string, ApiServiceCase[]>();
  for (const serviceCase of serviceCases) {
    if (!isActiveServiceCase(serviceCase)) continue;
    const existing = map.get(serviceCase.vehicleId) ?? [];
    existing.push(serviceCase);
    map.set(serviceCase.vehicleId, existing);
  }
  return map;
}

export function buildFleetHealthServiceCaseLayer(
  input: BuildFleetHealthServiceCaseLayerInput,
): FleetHealthServiceCaseLayer {
  const nowMs = input.nowMs ?? Date.now();

  if (!input.dataReady) {
    return {
      kpis: unknownCaseKpis(),
      groups: emptyCaseGroups(),
      casesByVehicleId: new Map(),
    };
  }

  const activeCases = input.serviceCases.filter(isActiveServiceCase);
  const openCases = activeCases.filter((serviceCase) => serviceCase.status === 'OPEN');
  const scheduledCases = activeCases.filter((serviceCase) => serviceCase.status === 'SCHEDULED');
  const inProgressCases = activeCases.filter((serviceCase) => serviceCase.status === 'IN_PROGRESS');
  const waitingVendorCases = activeCases.filter(
    (serviceCase) => serviceCase.status === 'WAITING_VENDOR',
  );
  const waitingPartsCases = activeCases.filter(
    (serviceCase) => serviceCase.status === 'WAITING_PARTS',
  );
  const overdueCases = activeCases.filter((serviceCase) =>
    isServiceCaseScheduledOverdue(serviceCase, nowMs),
  );
  const expectedReadyOverdueCases = activeCases.filter((serviceCase) =>
    isServiceCaseExpectedReadyOverdue(serviceCase, nowMs),
  );
  const rentalBlockingCases = activeCases.filter((serviceCase) => serviceCase.blocksRental);
  const withoutAppointmentCases = activeCases.filter(isServiceCaseWithoutAppointment);
  const withoutRequiredPartnerCases = activeCases.filter(isServiceCaseMissingRequiredPartner);

  return {
    kpis: {
      dataReady: true,
      activeCases: activeCases.length,
      openCases: openCases.length,
      scheduled: scheduledCases.length,
      inProgress: inProgressCases.length,
      waitingVendor: waitingVendorCases.length,
      waitingParts: waitingPartsCases.length,
      overdue: overdueCases.length,
      expectedReadyOverdue: expectedReadyOverdueCases.length,
      rentalBlockingCases: rentalBlockingCases.length,
      withoutAppointment: withoutAppointmentCases.length,
      withoutRequiredPartner: withoutRequiredPartnerCases.length,
    },
    groups: {
      activeCases,
      openCases,
      scheduledCases,
      inProgressCases,
      waitingVendorCases,
      waitingPartsCases,
      overdueCases,
      expectedReadyOverdueCases,
      rentalBlockingCases,
      withoutAppointmentCases,
      withoutRequiredPartnerCases,
    },
    casesByVehicleId: buildCasesByVehicleId(input.serviceCases),
  };
}
