/**
 * Playwright fixtures for Operator WebApp E2E (Prompt 39).
 */
import { expect, type Page, type Route } from '@playwright/test';
import type { ApiTask, BookingDetailDto } from '../src/lib/api';

export const OPERATOR_E2E_ORG_ID = 'org-operator-e2e';
export const OPERATOR_E2E_FOREIGN_ORG_ID = 'org-foreign-operator-e2e';
export const OPERATOR_E2E_TOKEN = 'operator-e2e-token';

export const BOOKING_PICKUP_ID = 'bk-op-e2e-pickup';
export const BOOKING_RETURN_ID = 'bk-op-e2e-return';
export const BOOKING_FOREIGN_ID = 'bk-op-e2e-foreign';
export const VEHICLE_ID = 'veh-op-e2e-1';
export const DAMAGE_EXISTING_ID = 'dmg-op-e2e-1';
export const TASK_OPEN_ID = 'task-op-e2e-open';
export const SCAN_VALID_PLATE = 'M-OP E2E';
export const SCAN_INVALID_QUERY = 'ZZ-NOMATCH-404';

const now = new Date('2026-07-15T11:00:00.000Z');
const startIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
const endIso = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

export type OperatorE2EProfile = 'default' | 'driver-denied' | 'no-rental-org' | 'unauthenticated';

type NetworkControls = {
  offline: boolean;
  latencyMs: number;
  abortNextRequest: boolean;
  failNextUpload: boolean;
  failNextPickup: boolean;
  versionConflictOnTaskComplete: boolean;
  sessionExpired: boolean;
  foreignBookingDetail: boolean;
};

const network: NetworkControls = {
  offline: false,
  latencyMs: 0,
  abortNextRequest: false,
  failNextUpload: false,
  failNextPickup: false,
  versionConflictOnTaskComplete: false,
  sessionExpired: false,
  foreignBookingDetail: false,
};

let pickupAttempts = 0;
let taskCompleteAttempts = 0;

const bookings = new Map<string, Record<string, unknown>>();
const bookingDetails = new Map<string, BookingDetailDto>();
const tasks = new Map<string, ApiTask>();
const protocols = new Map<string, { pickup?: Record<string, unknown>; return?: Record<string, unknown> }>();
const handoverDrafts = new Map<string, { payload: Record<string, unknown>; updatedAt: string }>();
const activeDamages: Array<{
  id: string;
  damageType: string;
  severity: string;
  description: string;
  locationLabel: string | null;
}> = [];

function handoverDraftKey(bookingId: string, kind: string) {
  return `${bookingId}:${kind}`;
}

function basePermissions() {
  return {
    bookings: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    customers: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
    documents: { read: true, write: true, manage: true },
  };
}

export function buildOperatorWorkerUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-operator-e2e',
    email: 'operator-e2e@example.test',
    name: 'Operator E2E',
    platformRole: 'ORG_USER',
    membershipRole: 'WORKER',
    organizationId: OPERATOR_E2E_ORG_ID,
    organizationName: 'Operator E2E Rental GmbH',
    organizationLogoUrl: null,
    permissions: basePermissions(),
    ...overrides,
  };
}

export function buildOperatorDriverUser() {
  return buildOperatorWorkerUser({
    id: 'user-driver-e2e',
    membershipRole: 'DRIVER',
    permissions: {},
  });
}

function buildBookingDetail(
  bookingId: string,
  statusEnum: 'CONFIRMED' | 'ACTIVE' | 'COMPLETED',
  opts: { hasPickup?: boolean; hasReturn?: boolean; pickupKm?: number } = {},
): BookingDetailDto {
  const hasPickup = opts.hasPickup ?? statusEnum !== 'CONFIRMED';
  const hasReturn = opts.hasReturn ?? statusEnum === 'COMPLETED';
  return {
    core: {
      bookingId,
      bookingNumber: bookingId.slice(-6).toUpperCase(),
      organizationId: OPERATOR_E2E_ORG_ID,
      status: statusEnum === 'CONFIRMED' ? 'Bestätigt' : statusEnum === 'ACTIVE' ? 'Aktiv' : 'Abgeschlossen',
      statusEnum,
      startDate: startIso,
      endDate: endIso,
      pickupStationId: 'st-op-1',
      returnStationId: 'st-op-1',
      pickupStationName: 'Berlin Haupt',
      returnStationName: 'Berlin Haupt',
      notes: null,
      createdAt: startIso,
      updatedAt: startIso,
      cancelledAt: null,
      completedAt: hasReturn ? endIso : null,
      kmIncluded: 500,
      kmDriven: hasReturn ? 120 : null,
      insuranceOptions: [],
      extras: [],
      currency: 'EUR',
      isOneWayRental: false,
      pickupAddressOverride: null,
      returnAddressOverride: null,
    },
    stations: {
      pickup: { id: 'st-op-1', name: 'Berlin Haupt', handoverInstructions: null, returnInstructions: null },
      return: { id: 'st-op-1', name: 'Berlin Haupt', handoverInstructions: null, returnInstructions: null },
      actualPickup: null,
      actualReturn: null,
      isOneWayRental: false,
      hasPickupDeviation: false,
      hasReturnDeviation: false,
    },
    customer: {
      customerId: 'cust-op-e2e-1',
      fullName: 'E2E Kunde',
      email: 'kunde@example.test',
      phone: null,
      customerStatus: 'ACTIVE',
      identityStatus: 'VERIFIED',
      licenseStatus: 'VERIFIED',
      riskLevel: 'LOW',
      openInvoiceCount: 0,
      openFineCount: 0,
      noShowCount: 0,
    },
    vehicle: {
      vehicleId: VEHICLE_ID,
      displayName: 'VW Golf',
      licensePlate: SCAN_VALID_PLATE,
      vin: null,
      make: 'VW',
      model: 'Golf',
      year: 2024,
      vehicleStatus: 'AVAILABLE',
      rentalBlocked: false,
      blockingReasons: [],
      odometerKm: 14800,
      fuelPercent: 80,
      evSoc: null,
    },
    finance: {
      basePriceCents: 10000,
      extrasPriceCents: 0,
      discountAmountCents: 0,
      depositAmountCents: 50000,
      depositStatus: 'HELD',
      taxRate: 19,
      taxAmountCents: 1900,
      grossAmountCents: 11900,
      paidAmountCents: 11900,
      openAmountCents: 0,
      paymentStatus: 'PAID',
      invoiceStatus: 'SENT',
      finalInvoiceStatus: null,
      additionalChargesCents: 0,
      refundAmountCents: 0,
      retainedDepositAmountCents: 0,
      computed: true,
    },
    documents: {
      bundleStatus: 'COMPLETE',
      legalTermsAttached: true,
      legalWithdrawalAttached: true,
      legalMissing: [],
      warnings: [],
      slots: [],
    },
    handover: {
      pickup: hasPickup
        ? {
            id: 'proto-pickup-e2e',
            kind: 'PICKUP',
            performedAt: startIso,
            odometerKm: opts.pickupKm ?? 15000,
            hasCustomerSignature: true,
            hasStaffSignature: true,
          }
        : null,
      return: hasReturn
        ? {
            id: 'proto-return-e2e',
            kind: 'RETURN',
            performedAt: endIso,
            odometerKm: 15120,
            hasCustomerSignature: true,
            hasStaffSignature: true,
          }
        : null,
    },
    tasks: { openCount: 1, overdueCount: 0, completedCount: 0, nextDueAt: null, items: [] },
    health: { rentalBlocked: false, blockingReasons: [], overallState: 'OK', criticalWarnings: [], warningWarnings: [] },
    usage: {
      drivingStressScore: null,
      stressLevel: null,
      drivingEventsCount: null,
      abuseDetectionCount: null,
      roadDistribution: null,
      climate: null,
    },
    eligibility: { canStartRental: true, blockingReasons: [] },
    activity: { events: [] },
    payments: [],
  } as BookingDetailDto;
}

function todayPickupRow() {
  return {
    id: BOOKING_PICKUP_ID,
    vehicleId: VEHICLE_ID,
    customerId: 'cust-op-e2e-1',
    customerName: 'E2E Kunde',
    vehicleName: 'VW Golf',
    vehicleLicense: SCAN_VALID_PLATE,
    startDate: startIso,
    endDate: endIso,
    status: 'Bestätigt',
    statusEnum: 'CONFIRMED',
    pickupStationName: 'Berlin Haupt',
    returnStationName: 'Berlin Haupt',
    pickupStationId: 'st-op-1',
    returnStationId: 'st-op-1',
    isOverdue: false,
    pickupProtocol: null,
    returnProtocol: null,
  };
}

function todayReturnRow() {
  return {
    id: BOOKING_RETURN_ID,
    vehicleId: VEHICLE_ID,
    customerId: 'cust-op-e2e-1',
    customerName: 'E2E Kunde',
    vehicleName: 'VW Golf',
    vehicleLicense: SCAN_VALID_PLATE,
    startDate: startIso,
    endDate: endIso,
    status: 'Aktiv',
    statusEnum: 'ACTIVE',
    pickupStationName: 'Berlin Haupt',
    returnStationName: 'Berlin Haupt',
    pickupStationId: 'st-op-1',
    returnStationId: 'st-op-1',
    isOverdue: false,
    pickupProtocol: { id: 'proto-pickup-e2e', odometerKm: 15000 },
    returnProtocol: null,
  };
}

function operatorTaskDetail(task: ApiTask) {
  const terminal = task.status === 'DONE' || task.status === 'CANCELLED';
  return {
    ...task,
    checklist: [],
    comments: [],
    timeline: [],
    linkedObjects: [],
    summary: {
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      priority: task.priority,
      sourceType: task.sourceType,
      humanReadableSource: 'Manuell',
      completionMode: null,
    },
    reason: {
      title: 'Ursache',
      description: task.description,
      basis: 'E2E',
      detectedAt: task.createdAt,
    },
    nextAction: {
      label: terminal ? 'Abgeschlossen' : task.status === 'OPEN' ? 'Starten' : 'Erledigen',
      description: null,
      actionType: terminal ? 'NONE' : task.status === 'OPEN' ? 'START' : 'COMPLETE',
      targetType: 'TASK',
      targetId: task.id,
      enabled: !terminal,
      disabledReason: null,
    },
    checklistProgress: {
      totalItems: 0,
      completedItems: 0,
      requiredItems: 0,
      completedRequiredItems: 0,
      remainingRequiredItems: 0,
      progressPercent: null,
      hasChecklist: false,
      areRequiredItemsComplete: true,
      canCompleteByChecklist: true,
      completionBlockers: [],
    },
    assignment: {
      assignedUser: { id: 'user-operator-e2e', displayName: 'Operator E2E' },
      createdBy: { id: 'user-operator-e2e', displayName: 'Operator E2E' },
      responsibleRoleLabel: null,
    },
    timing: {
      createdAt: task.createdAt,
      activatesAt: task.createdAt,
      dueDate: task.dueDate,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      cancelledAt: task.cancelledAt,
      isActive: !terminal,
      isOverdue: Boolean(task.isOverdue),
      bucket: 'TODAY',
    },
    completion: {
      completionMode: null,
      resolutionCode: null,
      resolutionNote: task.resolutionNote,
      completedBy: null,
      supersededByTaskId: null,
    },
    technicalMetadata: {
      source: task.source,
      dedupKey: task.dedupKey,
      metadata: task.metadata ?? {},
    },
    availableActions: {
      start: { enabled: task.status === 'OPEN' },
      moveToWaiting: { enabled: task.status === 'OPEN' || task.status === 'IN_PROGRESS' },
      resume: { enabled: task.status === 'WAITING' },
      complete: { enabled: task.status === 'IN_PROGRESS' || task.status === 'WAITING' },
      cancel: { enabled: !terminal },
      comment: { enabled: !terminal },
      overrideCompletion: { enabled: false },
    },
  };
}

function seedOperatorState() {
  bookings.clear();
  bookingDetails.clear();
  tasks.clear();
  protocols.clear();
  handoverDrafts.clear();
  activeDamages.length = 0;
  activeDamages.push({
    id: DAMAGE_EXISTING_ID,
    damageType: 'SCRATCH',
    severity: 'MINOR',
    description: 'Kratzer Tür VL',
    locationLabel: 'Tür VL',
  });
  pickupAttempts = 0;
  taskCompleteAttempts = 0;
  Object.assign(network, {
    offline: false,
    latencyMs: 0,
    abortNextRequest: false,
    failNextUpload: false,
    failNextPickup: false,
    versionConflictOnTaskComplete: false,
    sessionExpired: false,
    foreignBookingDetail: false,
  });

  bookings.set(BOOKING_PICKUP_ID, todayPickupRow());
  bookings.set(BOOKING_RETURN_ID, todayReturnRow());
  bookingDetails.set(BOOKING_PICKUP_ID, buildBookingDetail(BOOKING_PICKUP_ID, 'CONFIRMED'));
  bookingDetails.set(BOOKING_RETURN_ID, buildBookingDetail(BOOKING_RETURN_ID, 'ACTIVE', { hasPickup: true, pickupKm: 15000 }));
  protocols.set(BOOKING_PICKUP_ID, {});
  protocols.set(BOOKING_RETURN_ID, { pickup: { id: 'proto-pickup-e2e', odometerKm: 15000 } });

  tasks.set(TASK_OPEN_ID, {
    organizationId: OPERATOR_E2E_ORG_ID,
    id: TASK_OPEN_ID,
    title: 'Fahrzeug reinigen E2E',
    description: '',
    category: 'Vehicle',
    type: 'VEHICLE_CLEANING',
    status: 'OPEN',
    priority: 'NORMAL',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: VEHICLE_ID,
    bookingId: BOOKING_RETURN_ID,
    customerId: 'cust-op-e2e-1',
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: 'user-operator-e2e',
    assignedUserName: 'Operator E2E',
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: startIso,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: startIso,
    updatedAt: startIso,
  });
}

export function resetOperatorMockState() {
  seedOperatorState();
}

export function setOperatorNetworkOffline(value: boolean) {
  network.offline = value;
}

export function setOperatorLatencyMs(ms: number) {
  network.latencyMs = ms;
}

export function setOperatorAbortNextRequest(value: boolean) {
  network.abortNextRequest = value;
}

export function setOperatorFailNextUpload(value: boolean) {
  network.failNextUpload = value;
}

export function setOperatorFailNextPickup(value: boolean) {
  network.failNextPickup = value;
}

export function setOperatorVersionConflictOnTaskComplete(value: boolean) {
  network.versionConflictOnTaskComplete = value;
}

export function setOperatorSessionExpired(value: boolean) {
  network.sessionExpired = value;
}

export function setOperatorForeignBookingDetail(value: boolean) {
  network.foreignBookingDetail = value;
}

export function setOperatorTaskStatus(status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'DONE') {
  const task = tasks.get(TASK_OPEN_ID);
  if (!task) return;
  tasks.set(TASK_OPEN_ID, {
    ...task,
    status,
    startedAt: status === 'IN_PROGRESS' || status === 'WAITING' || status === 'DONE' ? task.startedAt ?? new Date().toISOString() : null,
    completedAt: status === 'DONE' ? new Date().toISOString() : null,
  });
}

export function getPickupAttempts() {
  return pickupAttempts;
}

export function getTaskCompleteAttempts() {
  return taskCompleteAttempts;
}

async function maybeDelay() {
  if (network.latencyMs > 0) {
    await new Promise((r) => setTimeout(r, network.latencyMs));
  }
}

async function installOperatorRouteHandler(page: Page, profile: OperatorE2EProfile) {
  await page.route('**/api/**', async (route: Route) => {
    if (network.offline) {
      return route.abort('failed');
    }
    if (network.abortNextRequest) {
      network.abortNextRequest = false;
      return route.abort('failed');
    }

    const url = route.request().url();
    const method = route.request().method();

    if (network.sessionExpired && !url.includes('/auth/me')) {
      return route.fulfill({ status: 401, body: JSON.stringify({ message: 'Session expired' }) });
    }

    await maybeDelay();

    if (url.includes('/auth/me') && method === 'GET') {
      if (profile === 'unauthenticated') {
        return route.fulfill({ status: 401, body: '{}' });
      }
      const user = profile === 'driver-denied' ? buildOperatorDriverUser() : buildOperatorWorkerUser();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    }

    if (url.includes('/auth/memberships') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organizations: [{ id: OPERATOR_E2E_ORG_ID, name: 'Operator E2E Rental GmbH', businessType: 'RENTAL' }],
        }),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/profile`) && method === 'GET') {
      const businessType = profile === 'no-rental-org' ? 'FLEET' : 'RENTAL';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: OPERATOR_E2E_ORG_ID, businessType, companyName: 'Operator E2E Rental GmbH' }),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/today/pickups`) && method === 'GET') {
      const detail = bookingDetails.get(BOOKING_PICKUP_ID);
      if (detail?.core.statusEnum !== 'CONFIRMED') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([todayPickupRow()]) });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/today/returns`) && method === 'GET') {
      const detail = bookingDetails.get(BOOKING_RETURN_ID);
      if (detail?.core.statusEnum !== 'ACTIVE') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([todayReturnRow()]) });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/${BOOKING_PICKUP_ID}/detail`) && method === 'GET') {
      if (network.foreignBookingDetail) {
        return route.fulfill({ status: 403, body: JSON.stringify({ message: 'Forbidden' }) });
      }
      const detail = bookingDetails.get(BOOKING_PICKUP_ID);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/${BOOKING_RETURN_ID}/detail`) && method === 'GET') {
      const detail = bookingDetails.get(BOOKING_RETURN_ID);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/${BOOKING_FOREIGN_ID}`) && method === 'GET') {
      return route.fulfill({ status: 403, body: JSON.stringify({ message: 'Cross-tenant access denied' }) });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/${BOOKING_PICKUP_ID}`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bookings.get(BOOKING_PICKUP_ID)) });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/${BOOKING_RETURN_ID}`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bookings.get(BOOKING_RETURN_ID)) });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings`) && method === 'GET' && url.includes('search=')) {
      const q = decodeURIComponent(url.split('search=')[1]?.split('&')[0] ?? '').toUpperCase();
      if (q.includes('ZZ-NOMATCH')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
      }
      if (q.includes('M-OP') || q.includes(BOOKING_PICKUP_ID)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [bookings.get(BOOKING_PICKUP_ID)], meta: { total: 1 } }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }

    if (
      url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/`) &&
      url.includes('/handover/draft') &&
      method === 'GET'
    ) {
      const bookingId = url.split('/bookings/')[1]?.split('/')[0] ?? '';
      const kind = new URL(url, 'http://localhost').searchParams.get('kind') ?? 'PICKUP';
      const draft = handoverDrafts.get(handoverDraftKey(bookingId, kind));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(draft ?? null),
      });
    }

    if (
      url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/`) &&
      url.includes('/handover/draft') &&
      method === 'PUT'
    ) {
      const bookingId = url.split('/bookings/')[1]?.split('/')[0] ?? '';
      let body: { kind?: string; payload?: Record<string, unknown> } = {};
      try {
        const raw = route.request().postData();
        body = raw ? (JSON.parse(raw) as typeof body) : {};
      } catch {
        body = {};
      }
      const kind = body.kind ?? 'PICKUP';
      const updatedAt = new Date().toISOString();
      handoverDrafts.set(handoverDraftKey(bookingId, kind), {
        payload: body.payload ?? {},
        updatedAt,
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: `draft-${bookingId}-${kind}`,
          bookingId,
          kind,
          userId: 'user-operator-e2e',
          payload: body.payload ?? {},
          updatedAt,
          createdAt: updatedAt,
        }),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/${BOOKING_PICKUP_ID}/handover/pickup`) && method === 'POST') {
      pickupAttempts += 1;
      if (network.failNextPickup) {
        network.failNextPickup = false;
        return route.fulfill({ status: 503, body: JSON.stringify({ message: 'Pickup failed (E2E)' }) });
      }
      bookingDetails.set(BOOKING_PICKUP_ID, buildBookingDetail(BOOKING_PICKUP_ID, 'ACTIVE', { hasPickup: true, pickupKm: 15000 }));
      bookings.set(BOOKING_PICKUP_ID, { ...todayPickupRow(), status: 'Aktiv', statusEnum: 'ACTIVE', pickupProtocol: { id: 'proto-pickup-e2e' } });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          booking: { id: BOOKING_PICKUP_ID, status: 'ACTIVE' },
          protocol: { id: 'proto-pickup-e2e', bookingId: BOOKING_PICKUP_ID, odometerKm: 15000 },
        }),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/${BOOKING_RETURN_ID}/handover/return`) && method === 'POST') {
      bookingDetails.set(BOOKING_RETURN_ID, buildBookingDetail(BOOKING_RETURN_ID, 'COMPLETED', { hasPickup: true, hasReturn: true, pickupKm: 15000 }));
      bookings.set(BOOKING_RETURN_ID, {
        ...todayReturnRow(),
        status: 'Abgeschlossen',
        statusEnum: 'COMPLETED',
        returnProtocol: { id: 'proto-return-e2e' },
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          booking: { id: BOOKING_RETURN_ID, status: 'COMPLETED' },
          protocol: { id: 'proto-return-e2e', bookingId: BOOKING_RETURN_ID, odometerKm: 15120 },
        }),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/bookings/${BOOKING_PICKUP_ID}/documents`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ slots: [], bundleStatus: 'COMPLETE', warnings: [] }),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/users`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'user-operator-e2e', firstName: 'Operator', lastName: 'E2E', email: 'operator-e2e@example.test' }]),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: VEHICLE_ID,
            licensePlate: SCAN_VALID_PLATE,
            displayName: 'VW Golf',
            make: 'VW',
            model: 'Golf',
            year: 2024,
            status: 'AVAILABLE',
            rawVehicleStatus: 'AVAILABLE',
            operationalState: {
              status: 'AVAILABLE',
              reason: null,
              source: 'fleet-map',
              effectiveFrom: null,
              effectiveUntil: null,
              derivedAt: startIso,
              dataQualityState: 'RELIABLE',
              isReliable: true,
            },
            bookingContext: {
              activeBooking: null,
              reservedBooking: null,
              nextBooking: null,
              futureBookingCount: 0,
            },
            stationId: 'st-op-1',
            stationName: 'Berlin Haupt',
            latitude: 52.52,
            longitude: 13.405,
            odometerKm: 14800,
            fuelPercent: 80,
          },
        ]),
      });
    }

    if (url.includes(`/vehicles/${VEHICLE_ID}/damages/active`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activeDamages),
      });
    }

    if (url.includes(`/vehicles/${VEHICLE_ID}/damages`) && method === 'POST') {
      const created = {
        id: 'dmg-op-e2e-new',
        damageType: 'DENT',
        severity: 'MODERATE',
        description: 'Neuer Schaden E2E',
        locationLabel: 'Stoßstange hinten',
      };
      activeDamages.push(created);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    }

    if (url.includes('/document-extractions') && method === 'POST') {
      if (network.failNextUpload) {
        network.failNextUpload = false;
        return route.fulfill({ status: 422, body: JSON.stringify({ message: 'Upload rejected (E2E)' }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'ext-op-e2e-1', status: 'PROCESSING' }),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/customers/`) && url.includes('/documents') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/rental-health`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/tasks/summary`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          open: tasks.size,
          active: tasks.size,
          inProgress: [...tasks.values()].filter((t) => t.status === 'IN_PROGRESS').length,
          waiting: [...tasks.values()].filter((t) => t.status === 'WAITING').length,
          done: [...tasks.values()].filter((t) => t.status === 'DONE').length,
          cancelled: 0,
          dueToday: 1,
          overdue: 0,
          critical: 0,
          assignedToMe: tasks.size,
          byStatus: { OPEN: 1, IN_PROGRESS: 0, DONE: 0 },
          byPriority: { NORMAL: tasks.size },
          buckets: { ALL_OPEN: tasks.size, NOW: 0, TODAY: 1, UPCOMING: 0, PLANNED: 0, UNASSIGNED: 0 },
          timezone: 'Europe/Berlin',
        }),
      });
    }

    const taskDetailMatch = url.match(
      new RegExp(`/organizations/${OPERATOR_E2E_ORG_ID}/tasks/([^/?]+)$`),
    );
    if (taskDetailMatch && method === 'GET') {
      const task = tasks.get(taskDetailMatch[1]);
      if (!task) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(operatorTaskDetail(task)),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/tasks`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [...tasks.values()], meta: { total: tasks.size, page: 1, limit: 100 } }),
      });
    }

    const taskCompleteMatch = url.match(/\/tasks\/([^/]+)\/complete/);
    if (taskCompleteMatch && method === 'PATCH') {
      taskCompleteAttempts += 1;
      if (network.versionConflictOnTaskComplete) {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'TASK_OPTIMISTIC_LOCK', message: 'Version conflict (E2E)' }),
        });
      }
      const task = tasks.get(taskCompleteMatch[1]);
      if (!task) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) });
      }
      const done = { ...task, status: 'DONE' as const, completedAt: new Date().toISOString() };
      tasks.set(task.id, done);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(operatorTaskDetail(done)),
      });
    }

    const taskWaitingMatch = url.match(/\/tasks\/([^/]+)\/waiting/);
    if (taskWaitingMatch && method === 'PATCH') {
      const task = tasks.get(taskWaitingMatch[1]);
      if (!task) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) });
      }
      const waiting = { ...task, status: 'WAITING' as const };
      tasks.set(task.id, waiting);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(operatorTaskDetail(waiting)),
      });
    }

    const taskStartMatch = url.match(/\/tasks\/([^/]+)\/start/);
    if (taskStartMatch && method === 'PATCH') {
      const task = tasks.get(taskStartMatch[1]);
      if (!task) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) });
      }
      const started = { ...task, status: 'IN_PROGRESS' as const, startedAt: new Date().toISOString() };
      tasks.set(task.id, started);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(operatorTaskDetail(started)),
      });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts: [] }) });
    }

    if (url.includes(`/organizations/${OPERATOR_E2E_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'st-op-1', name: 'Berlin Haupt' }]),
      });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

export async function seedOperatorAuth(page: Page, profile: OperatorE2EProfile = 'default') {
  const user = profile === 'driver-denied' ? buildOperatorDriverUser() : buildOperatorWorkerUser();
  if (profile === 'unauthenticated') {
    await page.addInitScript(() => {
      localStorage.removeItem('synqdrive_token');
      localStorage.removeItem('synqdrive_user');
    });
    return;
  }
  await page.addInitScript(
    ({ token, storedUser, locale }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(storedUser));
      localStorage.setItem('synqdrive.locale', locale);
    },
    { token: OPERATOR_E2E_TOKEN, storedUser: user, locale: 'de' },
  );
}

export async function openOperatorApp(
  page: Page,
  options: { path?: string; profile?: OperatorE2EProfile; taskStatus?: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'DONE' } = {},
) {
  resetOperatorMockState();
  const profile = options.profile ?? 'default';
  await seedOperatorAuth(page, profile);
  await installOperatorRouteHandler(page, profile);
  if (options.taskStatus) {
    setOperatorTaskStatus(options.taskStatus);
  }
  await page.goto(options.path ?? '/operator', { waitUntil: 'domcontentloaded' });
  if (profile === 'unauthenticated') return;
  if (profile === 'driver-denied' || profile === 'no-rental-org') return;
  await expect(
    page
      .getByTestId('operator-shell')
      .or(page.getByTestId('operator-access-denied'))
      .or(page.getByTestId('operator-desktop-only')),
  ).toBeVisible({ timeout: 30_000 });
}

export function operatorNavButton(page: Page, label: string) {
  return page
    .getByRole('navigation', { name: 'Operator navigation' })
    .getByRole('button', { name: label, exact: true });
}

export async function drawSignaturePad(page: Page, labelText: string) {
  const section = page
    .locator('div')
    .filter({ has: page.getByText(labelText, { exact: false }) })
    .first();
  const canvas = section.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 10_000 });

  await canvas.hover({ position: { x: 24, y: 36 } });
  await page.mouse.down();
  await canvas.hover({ position: { x: 72, y: 52 } });
  await canvas.hover({ position: { x: 120, y: 68 } });
  await page.mouse.up();
}

export async function submitOperatorTaskCompleteDialog(page: Page) {
  const dialog = page.getByTestId('task-complete-dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.locator('select').selectOption('VEHICLE_CLEANED');
  await dialog.getByRole('button', { name: 'Abschließen' }).click();
}

const DAMAGE_CAPTURE_TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export async function advanceHandoverToDamagesStep(page: Page, odometerKm: string) {
  await expect(page.getByTestId('operator-handover-flow')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByPlaceholder('z. B. 48500').fill(odometerKm);
  await page.getByPlaceholder(/Technische Beobachtung beschreiben|Was ist aufgefallen/i).fill('Reifendruck niedrig E2E');
  await page.getByRole('button', { name: 'Beobachtung hinzufügen' }).click();
  await expect(page.getByText('Reifendruck niedrig E2E')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByRole('button', { name: 'Neuen Schaden erfassen' })).toBeVisible({ timeout: 15_000 });
}

export async function completeOperatorDamageCapture(page: Page) {
  const dialog = page.locator('[aria-labelledby="operator-damage-capture-title"]');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.locator('input[type="file"][accept="image/*"]').last().setInputFiles({
    name: 'damage-e2e.png',
    mimeType: 'image/png',
    buffer: DAMAGE_CAPTURE_TEST_PNG,
  });
  await expect(dialog.locator('img[alt="Schadenfoto"]')).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  await dialog.getByPlaceholder('Was ist passiert? Sichtbare Details…').fill('Neuer Schaden E2E');
  await dialog.getByRole('button', { name: 'Weiter' }).click();
  await dialog.getByRole('button', { name: 'Schaden speichern' }).click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
}

export async function advanceHandoverThroughSignatures(
  page: Page,
  odometerKm: string,
  kind: 'PICKUP' | 'RETURN' = 'PICKUP',
) {
  await expect(page.getByTestId('operator-handover-flow')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByPlaceholder('z. B. 48500').fill(odometerKm);
  await page.getByPlaceholder(/Technische Beobachtung beschreiben|Was ist aufgefallen/i).fill('Reifendruck niedrig E2E');
  await page.getByRole('button', { name: 'Beobachtung hinzufügen' }).click();
  await expect(page.getByText('Reifendruck niedrig E2E')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  if (kind === 'RETURN') {
    await page.getByText('Kratzer Tür VL').click();
  } else {
    await expect(page.getByText('Kratzer Tür VL')).toBeVisible({ timeout: 15_000 });
  }
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByText('Mietvertrag, Fahrzeugschein').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.locator('select').selectOption('user-operator-e2e');
  await drawSignaturePad(page, 'Unterschrift Kunde');
  await page.getByRole('button', { name: 'Mitarbeiter' }).click();
  await drawSignaturePad(page, 'Unterschrift Mitarbeiter');
  await page.getByRole('button', { name: 'Weiter' }).click();
}

export async function submitHandover(page: Page) {
  const submit = page.getByTestId('operator-handover-submit');
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();
  await expect(page.getByTestId('operator-handover-flow')).toHaveCount(0, { timeout: 45_000 });
}
