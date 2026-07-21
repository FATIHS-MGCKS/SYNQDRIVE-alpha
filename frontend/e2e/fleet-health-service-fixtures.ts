/**
 * Playwright fixtures for Fleet Health Service E2E (Zustand & Service).
 */
import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';
import type {
  ApiServiceCase,
  ApiTask,
  RentalHealthModule,
  RentalHealthState,
  TechnicalObservation,
  VehicleHealthResponse,
  Vendor,
} from '../src/lib/api';

export { assertNoHorizontalOverflow };

export const TEST_ORG_ID = 'org-fhs-e2e';

export const VEH_MULTI = 'veh-fhs-multi';
export const VEH_CREATE_TASK = 'veh-fhs-create';
export const VEH_CASE = 'veh-fhs-case';
export const VEH_UNKNOWN = 'veh-fhs-unknown';
export const VEH_VENDOR = 'veh-fhs-vendor';
export const VEH_OBS = 'veh-fhs-obs';
export const VEH_HEALTHY = 'veh-fhs-healthy';

export const CASE_BLOCKING = 'case-fhs-blocking';
export const CASE_SCHEDULED = 'case-fhs-scheduled';
export const CASE_NEW = 'case-fhs-new';

export const TASK_VENDOR = 'task-fhs-vendor';
export const TASK_OVERDUE = 'task-fhs-overdue';
export const TASK_LINKED = 'task-fhs-linked';
export const TASK_NEW = 'task-fhs-new';

export const VENDOR_A = 'vendor-fhs-a';
export const OBS_ACTIVE = 'obs-fhs-active';

export type FleetHealthServiceE2EMode = 'default' | 'permission-denied' | 'service-error' | 'vendor-stats-error';

export const mockUser = {
  id: 'user-fhs-e2e',
  email: 'fhs@synqdrive.eu',
  name: 'FHS E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Fleet Health Service E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    fleet: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
    vendors: { read: true, write: true, manage: true },
  },
};

export const mockUserReadOnly = {
  ...mockUser,
  id: 'user-fhs-readonly',
  permissions: {
    fleet: { read: true, write: false, manage: false },
    vehicles: { read: true, write: false, manage: false },
    bookings: { read: true, write: false, manage: false },
    tasks: { read: true, write: false, manage: false },
    vendors: { read: true, write: false, manage: false },
  },
};

interface FleetHealthServiceMockState {
  mode: FleetHealthServiceE2EMode;
  healthFetchCount: number;
  tasksFetchCount: number;
  serviceCasesFetchCount: number;
  vendorsFetchCount: number;
  vendorStatsFetchCount: number;
  failServiceCasesOnce: boolean;
  tasks: ApiTask[];
  serviceCases: ApiServiceCase[];
  vendors: Vendor[];
  observations: TechnicalObservation[];
  createdServiceCaseCount: number;
  createdTaskCount: number;
  denyWrites: boolean;
}

const state: FleetHealthServiceMockState = {
  mode: 'default',
  healthFetchCount: 0,
  tasksFetchCount: 0,
  serviceCasesFetchCount: 0,
  vendorsFetchCount: 0,
  vendorStatsFetchCount: 0,
  failServiceCasesOnce: false,
  tasks: [],
  serviceCases: [],
  vendors: [],
  observations: [],
  createdServiceCaseCount: 0,
  createdTaskCount: 0,
  denyWrites: false,
};

function mod(state: RentalHealthState, reason: string): RentalHealthModule {
  return {
    state,
    reason,
    last_updated_at: '2026-07-20T12:00:00.000Z',
    data_stale: false,
  };
}

function buildHealth(
  vehicleId: string,
  profile:
    | 'healthy'
    | 'multi'
    | 'create-task'
    | 'blocked'
    | 'unknown'
    | 'vendor'
    | 'case',
): VehicleHealthResponse {
  const baseModules: VehicleHealthResponse['modules'] = {
    battery: mod('good', 'OK'),
    tires: mod('good', 'OK'),
    brakes: mod('good', 'OK'),
    error_codes: mod('good', 'OK'),
    service_compliance: mod('good', 'OK'),
    complaints: mod('good', 'OK'),
    vehicle_alerts: mod('good', 'OK'),
  };

  switch (profile) {
    case 'multi':
      return {
        vehicle_id: vehicleId,
        organization_id: TEST_ORG_ID,
        overall_state: 'critical',
        rental_blocked: false,
        blocking_reasons: ['Bremsen kritisch', 'Reifen prüfen'],
        modules: {
          ...baseModules,
          brakes: mod('critical', 'Bremsbelag kritisch'),
          tires: mod('warning', 'Profiltiefe niedrig'),
          complaints: mod('warning', 'Aktive Meldung'),
        },
        generated_at: '2026-07-20T12:00:00.000Z',
      };
    case 'create-task':
      return {
        vehicle_id: vehicleId,
        organization_id: TEST_ORG_ID,
        overall_state: 'critical',
        rental_blocked: false,
        blocking_reasons: ['Bremsen kritisch'],
        modules: { ...baseModules, brakes: mod('critical', 'Bremsbelag kritisch') },
        generated_at: '2026-07-20T12:00:00.000Z',
      };
    case 'blocked':
      return {
        vehicle_id: vehicleId,
        organization_id: TEST_ORG_ID,
        overall_state: 'critical',
        rental_blocked: true,
        blocking_reasons: ['TÜV überfällig'],
        modules: { ...baseModules, service_compliance: mod('critical', 'TÜV überfällig') },
        generated_at: '2026-07-20T12:00:00.000Z',
      };
    case 'unknown':
      return {
        vehicle_id: vehicleId,
        organization_id: TEST_ORG_ID,
        overall_state: 'unknown',
        rental_blocked: false,
        blocking_reasons: [],
        modules: {
          ...baseModules,
          battery: mod('unknown', 'Keine Daten'),
          tires: mod('unknown', 'Keine Daten'),
        },
        generated_at: '2026-07-20T12:00:00.000Z',
      };
    case 'vendor':
      return {
        vehicle_id: vehicleId,
        organization_id: TEST_ORG_ID,
        overall_state: 'warning',
        rental_blocked: false,
        blocking_reasons: ['Wartet auf Partner'],
        modules: { ...baseModules, brakes: mod('warning', 'Werkstatt') },
        generated_at: '2026-07-20T12:00:00.000Z',
      };
    case 'case':
      return {
        vehicle_id: vehicleId,
        organization_id: TEST_ORG_ID,
        overall_state: 'critical',
        rental_blocked: true,
        blocking_reasons: ['Service offen'],
        modules: { ...baseModules, brakes: mod('warning', 'Service offen') },
        generated_at: '2026-07-20T12:00:00.000Z',
      };
    default:
      return {
        vehicle_id: vehicleId,
        organization_id: TEST_ORG_ID,
        overall_state: 'good',
        rental_blocked: false,
        blocking_reasons: [],
        modules: baseModules,
        generated_at: '2026-07-20T12:00:00.000Z',
      };
  }
}

const healthProfiles: Record<string, VehicleHealthResponse> = {
  [VEH_MULTI]: buildHealth(VEH_MULTI, 'multi'),
  [VEH_CREATE_TASK]: buildHealth(VEH_CREATE_TASK, 'create-task'),
  [VEH_CASE]: buildHealth(VEH_CASE, 'case'),
  [VEH_UNKNOWN]: buildHealth(VEH_UNKNOWN, 'unknown'),
  [VEH_VENDOR]: buildHealth(VEH_VENDOR, 'vendor'),
  [VEH_OBS]: buildHealth(VEH_OBS, 'create-task'),
  [VEH_HEALTHY]: buildHealth(VEH_HEALTHY, 'healthy'),
};

function fleetVehicleRow(
  id: string,
  license: string,
  profile: Parameters<typeof buildHealth>[1] = 'healthy',
) {
  const health = buildHealth(id, profile);
  const now = '2026-07-20T12:00:00.000Z';
  return {
    id,
    licensePlate: license,
    displayName: `VW Golf ${license}`,
    make: 'VW',
    model: 'Golf',
    year: 2022,
    status: health.rental_blocked ? 'Maintenance' : 'Available',
    rawVehicleStatus: health.rental_blocked ? 'MAINTENANCE' : 'AVAILABLE',
    operationalState: {
      status: 'AVAILABLE',
      reason: null,
      source: 'fleet-map',
      effectiveFrom: null,
      effectiveUntil: null,
      derivedAt: now,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    bookingContext: {
      activeBooking: null,
      reservedBooking: null,
      nextBooking: null,
      futureBookingCount: 0,
    },
    fuelType: 'Petrol',
    healthStatus: health.overall_state === 'good' ? 'Good Health' : 'Warning',
    cleaningStatus: 'Clean',
    stationId: 'st-fhs-1',
    stationName: 'Kassel',
    homeStationId: 'st-fhs-1',
    currentStationId: 'st-fhs-1',
    expectedStationId: null,
    latitude: 51.312,
    longitude: 9.48,
    lastSeenAt: now,
    signalAgeMs: 5_000,
    isFresh: true,
    onlineStatus: 'ONLINE',
    telemetryFreshness: 'live',
    displayState: 'PARKED',
    displayIgnition: 'OFF',
    isLiveTracking: false,
    heading: null,
    imageUrl: null,
    odometerKm: 12_000,
    fuelPercent: 72,
    evSoc: null,
    isElectric: false,
    dataQualityState: 'RELIABLE',
    isReliable: true,
    reservedBookingId: null,
    reservedCustomerName: null,
    reservedPickupAt: null,
    reservedReturnAt: null,
    reservedPickupStationName: null,
    reservedIsOverdue: false,
    activeBookingId: null,
    activeCustomerName: null,
    activeReturnAt: null,
    activeReturnStationName: null,
    activeIsOverdue: false,
    activeKmIncluded: null,
    activeKmDriven: null,
    nextBookingId: null,
    nextBookingCustomerName: null,
    nextBookingPickupAt: null,
    nextBookingPickupStationName: null,
    futureBookingCount: 0,
  };
}

function baseTask(over: Partial<ApiTask> & Pick<ApiTask, 'id' | 'title' | 'vehicleId'>): ApiTask {
  return {
    organizationId: TEST_ORG_ID,
    description: 'E2E Beschreibung',
    category: 'Service',
    type: 'VEHICLE_SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'HEALTH',
    sourceType: 'HEALTH',
    dedupKey: null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: null,
    assignedUserName: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: {},
    isOverdue: false,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-19T08:00:00.000Z',
    updatedAt: '2026-07-19T08:00:00.000Z',
    bucket: 'TODAY',
    linkedObjects: [],
    ...over,
  };
}

function baseVendor(over: Partial<Vendor> & Pick<Vendor, 'id' | 'name'>): Vendor {
  return {
    organizationId: TEST_ORG_ID,
    category: 'WORKSHOP',
    sourceType: 'MANUAL',
    source: 'MANUAL',
    externalPlaceId: null,
    street: 'Hauptstr. 1',
    addressLine2: null,
    city: 'Kassel',
    postalCode: '34117',
    country: 'DE',
    latitude: 51.312,
    longitude: 9.48,
    website: null,
    phone: '+49123456789',
    email: 'werkstatt@example.com',
    notes: null,
    serviceAreas: [],
    contactName: null,
    contactRole: null,
    contactPhone: null,
    contactEmail: null,
    contactNotes: null,
    isActive: true,
    linkedVehicles: [],
    linkedVehicleCount: 0,
    invoiceCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function baseServiceCase(
  over: Partial<ApiServiceCase> & Pick<ApiServiceCase, 'id' | 'title' | 'vehicleId'>,
): ApiServiceCase {
  return {
    organizationId: TEST_ORG_ID,
    description: '',
    category: 'SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    openedAt: '2026-07-20T12:00:00.000Z',
    scheduledAt: null,
    expectedReadyAt: null,
    completedAt: null,
    cancelledAt: null,
    estimatedCostCents: null,
    actualCostCents: null,
    downtimeStart: null,
    downtimeEnd: null,
    blocksRental: false,
    completionNotes: null,
    documentId: null,
    metadata: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
    taskCount: 0,
    tasks: [],
    comments: [],
    attachments: [],
    vendorId: null,
    ...over,
  };
}

function seedState() {
  state.tasks = [
    baseTask({
      id: TASK_VENDOR,
      title: 'Ersatzteil bestellen E2E',
      vehicleId: VEH_VENDOR,
      status: 'WAITING',
      vendorId: VENDOR_A,
      serviceCaseId: CASE_SCHEDULED,
      dueDate: '2026-07-25T08:00:00.000Z',
    }),
    baseTask({
      id: TASK_OVERDUE,
      title: 'Überfällige Inspektion E2E',
      vehicleId: VEH_MULTI,
      status: 'OPEN',
      isOverdue: true,
      dueDate: '2026-07-10T08:00:00.000Z',
      bucket: 'OVERDUE',
    }),
    baseTask({
      id: TASK_LINKED,
      title: 'Bremsen prüfen E2E',
      vehicleId: VEH_CASE,
      status: 'OPEN',
      serviceCaseId: CASE_BLOCKING,
      metadata: { healthModule: 'brakes' },
    }),
  ];

  state.serviceCases = [
    baseServiceCase({
      id: CASE_BLOCKING,
      title: 'Bremsenreparatur E2E',
      vehicleId: VEH_CASE,
      status: 'OPEN',
      blocksRental: true,
      tasks: [{ id: TASK_LINKED, title: 'Bremsen prüfen E2E', status: 'OPEN', type: 'VEHICLE_SERVICE', dueDate: null }],
      taskCount: 1,
    }),
    baseServiceCase({
      id: CASE_SCHEDULED,
      title: 'Werkstatttermin E2E',
      vehicleId: VEH_VENDOR,
      status: 'WAITING_VENDOR',
      vendorId: VENDOR_A,
      scheduledAt: '2026-07-25T08:00:00.000Z',
      expectedReadyAt: '2026-07-26T16:00:00.000Z',
      tasks: [
        { id: TASK_VENDOR, title: 'Ersatzteil bestellen E2E', status: 'WAITING', type: 'VEHICLE_SERVICE', dueDate: '2026-07-25T08:00:00.000Z' },
      ],
      taskCount: 1,
    }),
  ];

  state.vendors = [baseVendor({ id: VENDOR_A, name: 'Werkstatt Nord E2E' })];

  state.observations = [
    {
      id: OBS_ACTIVE,
      organizationId: TEST_ORG_ID,
      vehicleId: VEH_OBS,
      bookingId: null,
      title: 'Motorgeräusch E2E',
      shortLabel: 'Motorgeräusch',
      description: 'Ungewöhnliches Motorgeräusch beim Kaltstart',
      source: 'manual',
      status: 'active',
      category: 'engine',
      affectedArea: 'engine_bay',
      severity: 'high',
      blocksRental: true,
      linkedDamageId: null,
      linkedServiceCaseId: null,
      linkedServiceTaskId: null,
      createdAt: '2026-07-20T10:00:00.000Z',
      updatedAt: '2026-07-20T10:00:00.000Z',
      resolvedAt: null,
      dismissedAt: null,
    } as TechnicalObservation,
  ];
}

export function resetFleetHealthServiceMockState(
  mode: FleetHealthServiceE2EMode = 'default',
  options?: { readOnly?: boolean },
) {
  state.mode = mode;
  state.healthFetchCount = 0;
  state.tasksFetchCount = 0;
  state.serviceCasesFetchCount = 0;
  state.vendorsFetchCount = 0;
  state.vendorStatsFetchCount = 0;
  state.failServiceCasesOnce = mode === 'service-error';
  state.createdServiceCaseCount = 0;
  state.createdTaskCount = 0;
  state.denyWrites = mode === 'permission-denied' || Boolean(options?.readOnly);
  seedState();
}

export function getHealthFetchCount() {
  return state.healthFetchCount;
}

export function getTasksFetchCount() {
  return state.tasksFetchCount;
}

export function getServiceCasesFetchCount() {
  return state.serviceCasesFetchCount;
}

export function getVendorsFetchCount() {
  return state.vendorsFetchCount;
}

export function getCreatedServiceCaseCount() {
  return state.createdServiceCaseCount;
}

export function getCreatedTaskCount() {
  return state.createdTaskCount;
}

export function clearServiceCasesError() {
  state.failServiceCasesOnce = false;
  state.mode = 'default';
}

function taskSummary() {
  const open = state.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
  return {
    open: open.length,
    active: open.length,
    inProgress: open.filter((t) => t.status === 'IN_PROGRESS').length,
    waiting: open.filter((t) => t.status === 'WAITING').length,
    done: 0,
    cancelled: 0,
    dueToday: open.filter((t) => t.bucket === 'TODAY').length,
    overdue: open.filter((t) => t.isOverdue).length,
    critical: 1,
    assignedToMe: 0,
    byStatus: { OPEN: open.length },
    byPriority: { NORMAL: open.length },
    buckets: {
      NOW: 0,
      TODAY: open.length,
      UPCOMING: 0,
      PLANNED: 0,
      OVERDUE: open.filter((t) => t.isOverdue).length,
      UNASSIGNED: 0,
      ALL_OPEN: open.length,
      COMPLETED: 0,
    },
    timezone: 'Europe/Berlin',
  };
}

function rentalHealthFleetResponse() {
  state.healthFetchCount += 1;
  const data = Object.values(healthProfiles);
  return {
    summary: {
      availability: {
        totalSelected: data.length,
        byVehicleStatus: { AVAILABLE: data.length },
        semantics: 'vehicle_status_operational_vs_rental_health_per_row',
      },
      pageHealth: {
        rentalBlocked: data.filter((row) => row.rental_blocked).length,
        byOverallState: {
          good: data.filter((row) => row.overall_state === 'good').length,
          warning: data.filter((row) => row.overall_state === 'warning').length,
          critical: data.filter((row) => row.overall_state === 'critical').length,
          unknown: data.filter((row) => row.overall_state === 'unknown').length,
        },
        vehiclesWithDetail: data.length,
      },
    },
    data,
    meta: {
      limit: 50,
      nextCursor: null,
    },
  };
}

export async function installFleetHealthServiceMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      const user = state.denyWrites ? mockUserReadOnly : mockUser;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/profile`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: TEST_ORG_ID,
          name: mockUser.organizationName,
          businessType: 'RENTAL',
          timezone: 'Europe/Berlin',
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'st-fhs-1', name: 'Kassel', city: 'Kassel' }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/members`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: mockUser.id, name: mockUser.name, email: mockUser.email }]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks/summary`) && method === 'GET') {
      state.tasksFetchCount += 1;
      if (state.mode === 'service-error') {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"tasks unavailable"}' });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(taskSummary()),
      });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/tasks`) &&
      method === 'GET' &&
      !url.match(/\/tasks\/[^/?]+/)
    ) {
      state.tasksFetchCount += 1;
      if (state.mode === 'service-error') {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"tasks unavailable"}' });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.tasks),
      });
    }

    const vehicleTasksMatch = url.match(
      /\/organizations\/[^/]+\/vehicles\/([^/]+)\/tasks$/,
    );
    if (vehicleTasksMatch && method === 'GET') {
      const vehicleId = vehicleTasksMatch[1];
      const rows = state.tasks.filter((t) => t.vehicleId === vehicleId);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/tasks`) && method === 'POST') {
      if (state.denyWrites) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Keine Berechtigung' }),
        });
      }
      const body = route.request().postDataJSON() as Partial<ApiTask>;
      state.createdTaskCount += 1;
      const created = baseTask({
        id: TASK_NEW,
        title: String(body.title ?? 'Neue Aufgabe E2E'),
        vehicleId: String(body.vehicleId ?? VEH_CREATE_TASK),
        type: (body.type as ApiTask['type']) ?? 'VEHICLE_SERVICE',
        status: 'OPEN',
        metadata: body.metadata ?? {},
      });
      state.tasks.push(created);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/service-cases`) && method === 'GET') {
      state.serviceCasesFetchCount += 1;
      if (state.failServiceCasesOnce) {
        state.failServiceCasesOnce = false;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'service cases unavailable' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.serviceCases),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/service-cases`) && method === 'POST') {
      if (state.denyWrites) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Keine Berechtigung' }),
        });
      }
      const body = route.request().postDataJSON() as Partial<ApiServiceCase>;
      state.createdServiceCaseCount += 1;
      const created = baseServiceCase({
        id: CASE_NEW,
        title: String(body.title ?? 'Neuer Servicefall E2E'),
        vehicleId: String(body.vehicleId ?? VEH_OBS),
        category: (body.category as ApiServiceCase['category']) ?? 'DIAGNOSTIC',
        blocksRental: Boolean(body.blocksRental),
      });
      state.serviceCases.push(created);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vendors/stats`) && method === 'GET') {
      state.vendorStatsFetchCount += 1;
      if (state.mode === 'vendor-stats-error') {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Partnerstatistik nicht verfügbar' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: state.vendors.length, active: state.vendors.length }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vendors`) && method === 'GET') {
      state.vendorsFetchCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.vendors),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          fleetVehicleRow(VEH_MULTI, 'FHS-MULTI', 'multi'),
          fleetVehicleRow(VEH_CREATE_TASK, 'FHS-CREATE', 'create-task'),
          fleetVehicleRow(VEH_CASE, 'FHS-CASE', 'case'),
          fleetVehicleRow(VEH_UNKNOWN, 'FHS-UNK', 'unknown'),
          fleetVehicleRow(VEH_VENDOR, 'FHS-VEND', 'vendor'),
          fleetVehicleRow(VEH_OBS, 'FHS-OBS', 'create-task'),
          fleetVehicleRow(VEH_HEALTHY, 'FHS-OK', 'healthy'),
        ]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health/fleet`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rentalHealthFleetResponse()),
      });
    }

    if (url.includes('/rental-health') && method === 'GET') {
      const vehicleMatch = url.match(/\/vehicles\/([^/?]+)/);
      if (vehicleMatch) {
        const health = healthProfiles[vehicleMatch[1]] ?? buildHealth(vehicleMatch[1], 'healthy');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(health),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rentalHealthFleetResponse()),
      });
    }

    if (url.includes('/technical-observations') && method === 'GET') {
      const vehicleMatch = url.match(/\/vehicles\/([^/]+)\/technical-observations/);
      const vehicleId = vehicleMatch?.[1];
      const rows = state.observations.filter((row) => !vehicleId || row.vehicleId === vehicleId);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ active: rows, history: [], all: rows }),
      });
    }

    const linkServiceMatch = url.match(
      /\/vehicles\/([^/]+)\/technical-observations\/([^/]+)\/link-service$/,
    );
    if (linkServiceMatch && method === 'POST') {
      if (state.denyWrites) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Keine Berechtigung' }),
        });
      }
      const vehicleId = linkServiceMatch[1];
      const observationId = linkServiceMatch[2];
      const body = route.request().postDataJSON() as { createServiceCase?: boolean; serviceCaseTitle?: string };
      state.createdServiceCaseCount += 1;
      const created = baseServiceCase({
        id: CASE_NEW,
        title: body.serviceCaseTitle ?? 'Diagnose Motorgeräusch E2E',
        vehicleId,
        category: 'DIAGNOSTIC',
        blocksRental: true,
      });
      state.serviceCases.push(created);
      const observation = state.observations.find((row) => row.id === observationId);
      if (observation) {
        observation.linkedServiceCaseId = created.id;
        observation.status = 'converted';
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...observation,
          linkedServiceCaseId: created.id,
        }),
      });
    }

    if (url.match(/\/vehicles\/[^/]+\/health\/summary/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleId: 'veh-fhs-obs',
          generatedAt: '2026-07-20T12:00:00.000Z',
          overall: {
            state: 'critical',
            label: 'Critical',
            headline: 'Brakes',
            description: 'Bremsbelag kritisch',
            rentalBlocked: false,
            blockingReasons: [],
          },
          dataQuality: { level: 'good', label: 'Good', reasons: [] },
          findings: [],
          moduleStates: {},
          sourceStatus: {
            rentalHealth: 'loaded',
            aiHealthCare: 'not_available',
            highMobility: 'no_data',
            dimo: 'no_data',
          },
          degradedDependencies: [],
        }),
      });
    }

    if (url.includes('/health-tab-summary') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ modules: {}, generatedAt: '2026-07-20T12:00:00.000Z' }),
      });
    }

    if (url.includes('/dashboard-warning-lights') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicleId: 'veh-fhs-obs',
          provider: 'NONE',
          connectionStatus: 'unknown',
          supportStatus: 'no_data',
          freshness: 'no_data',
          overallStatus: 'unknown',
          lastObservedAt: null,
          message: '',
          lights: [],
          rentalHealthReady: false,
        }),
      });
    }

    if (url.includes('/dtc') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.match(/\/vehicles\/[^/]+\/damages\/stats/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 0,
          open: 0,
          inRepair: 0,
          repaired: 0,
          archived: 0,
          active: 0,
          blockingRental: 0,
          safetyCritical: 0,
          missingEvidence: 0,
          unplaced: 0,
          estimatedOpenCostCents: 0,
          oldestOpenDamageAt: null,
        }),
      });
    }

    if (url.match(/\/vehicles\/[^/]+\/trips\/stats/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalTrips: 0,
          totalDistanceKm: 0,
          avgDrivingStressScore: null,
          stressLevel: null,
          avgDrivingScore: null,
          avgDrivingStyleScore: null,
          totalAccelerationEvents: 0,
          totalHardAccelerationEvents: 0,
          totalBrakingEvents: 0,
          totalHardBrakingEvents: 0,
          totalAbuseEvents: 0,
          totalSpeedingEvents: 0,
          privateTripCount: 0,
          assignedTripCount: 0,
        }),
      });
    }

    if (url.match(/\/vehicles\/[^/]+\/trips(\?|$)/) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.match(/\/vehicles\/[^/]+\/file-summary/) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          vehicle: {
            id: 'veh-fhs-obs',
            vin: null,
            licensePlate: 'FHS-OBS',
            make: 'VW',
            model: 'Golf',
            year: 2022,
            odometerKm: 12000,
            organizationId: TEST_ORG_ID,
          },
          canonicalStatus: {
            rentalHealthStatus: 'critical',
            rentalHealthSource: 'rental_health_service',
            rentalBlocked: false,
            blockingReasons: [],
            serviceCompliance: { tuv: null, bokraft: null, nextService: null },
            note: '',
          },
          documentCategories: [],
          mandatoryDocumentCoverage: { configured: 0, total: 0 },
          fixedCosts: { currency: 'EUR', monthlyTotal: null, items: [] },
        }),
      });
    }

    if (url.includes('/tire-health-summary') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }

    if (url.includes('/brake-health-summary') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }

    if (url.includes('/service-info-status') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }

    if (url.includes('/battery-health-summary') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orgId: TEST_ORG_ID,
          vehicleId: 'veh-fhs-obs',
          lv: null,
          hv: null,
          generatedAt: '2026-07-20T12:00:00.000Z',
        }),
      });
    }

    if (url.includes('/driving-impact/rolling') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    if (url.includes('/device-connection') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lteR1Capable: false,
          dimoLinked: false,
          lastDeviceUnpluggedAt: null,
          lastDevicePluggedInAt: null,
          currentDeviceConnectionStatus: 'plugged',
          openUnpluggedEpisode: false,
          openUnpluggedSince: null,
          openUnpluggedDurationMs: null,
          severity: null,
          rentalRelevant: false,
          activeBookingId: null,
          webhookConfigured: 'not_configured',
          webhookConfiguration: {
            unplugTriggerState: { configured: false, active: false, triggerId: null },
            plugTriggerState: { configured: false, active: false, triggerId: null },
            recoveryPolicy: 'NONE',
            lastSuccessfulDeliveryAt: null,
            lastDeliveryErrorAt: null,
            configSyncedAt: null,
            configSource: 'REGISTRY_CACHE',
          },
          lastWebhookReceivedAt: null,
          unpluggedCount24h: 0,
          unpluggedCount7d: 0,
          pluggedCount24h: 0,
          pluggedCount7d: 0,
          recentEvents: [],
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/invoices`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/notifications`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-connectivity`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicles: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/price-tariffs`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ priceBook: null, groups: [], assignments: [], unassignedVehicleCount: 0 }),
      });
    }

    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }

    return route.continue();
  });
}

async function navigateToFleetView(page: Page) {
  if (await page.getByRole('heading', { name: /^Flotte$/ }).isVisible().catch(() => false)) return;

  const viewport = page.viewportSize();
  const fleetLabel = /^(Flotte|Fleet)$/;

  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page.locator('div.lg\\:hidden.fixed.top-0').getByRole('button', { name: fleetLabel }).click();
  } else {
    const fleetNav = page.getByRole('button', { name: fleetLabel });
    await fleetNav.first().waitFor({ state: 'visible', timeout: 30_000 });
    await fleetNav.first().click();
  }

  await page.getByRole('heading', { name: /^Flotte$/ }).waitFor({ state: 'visible', timeout: 30_000 });
}

export async function openFleetHealthServicePage(
  page: Page,
  options?: {
    path?: string;
    theme?: 'light' | 'dark';
    mode?: FleetHealthServiceE2EMode;
    readOnly?: boolean;
    preserveMockState?: boolean;
  },
) {
  if (!options?.preserveMockState) {
    resetFleetHealthServiceMockState(options?.mode ?? 'default', { readOnly: options?.readOnly });
  }
  await page.addInitScript(
    ({ token, user, locale, theme, fleetTab }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
      sessionStorage.setItem('synqdrive_rental_fleet_tab', fleetTab);
    },
    {
      token: 'fhs-e2e-token',
      user: options?.readOnly ? mockUserReadOnly : mockUser,
      locale: 'de',
      theme: options?.theme,
      fleetTab: 'condition-service',
    },
  );
  await installFleetHealthServiceMocks(page);
  await page.goto(options?.path ?? '/rental', { waitUntil: 'load' });
  await page
    .getByRole('button', { name: /^(Dashboard|Übersicht)$/ })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
  await navigateToFleetView(page);
  await page.getByRole('tab', { name: 'Zustand & Service' }).click();
  await expect(page.locator('#fhs-tab-overview, #fhs-tab-work').first()).toBeVisible({
    timeout: 30_000,
  });
}

export async function clickFhsTab(page: Page, label: string | RegExp) {
  await page.getByRole('tab', { name: label }).click();
}

export async function clickFhsKpi(page: Page, label: string | RegExp) {
  await page.getByRole('button', { name: label }).first().click();
}

export function fhsVehicleTrigger(page: Page, vehicleId: string) {
  return page.locator(`#fhs-vehicle-trigger-vehicle-${vehicleId}`);
}

export async function expandVehicleRow(page: Page, vehicleId: string, plate: string) {
  const trigger = fhsVehicleTrigger(page, vehicleId);
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click();
    return;
  }
  await page
    .getByRole('button', { name: new RegExp(`Fahrzeug ${plate}.*Details`, 'i') })
    .first()
    .click();
}

export function fhsHealthDetailRoot(page: Page) {
  const viewport = page.viewportSize();
  const isMobile = viewport != null && viewport.width < 1024;
  if (isMobile) {
    return page.getByRole('dialog');
  }
  return page
    .locator('div.hidden.lg\\:flex')
    .filter({ has: page.getByRole('heading', { name: 'Why this status?' }) });
}

export async function openHealthDetailForPlate(page: Page, plate: string) {
  await clickFhsTab(page, 'Fahrzeuge');
  const actionGroup = page.getByRole('button', { name: /^Handlungsbedarf\b/ });
  if (await actionGroup.isVisible().catch(() => false)) {
    await actionGroup.click();
  }
  await page.getByText(plate, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  const openHealth = page.getByRole('button', { name: new RegExp(`Open health for ${plate}`, 'i') });
  await openHealth.first().waitFor({ state: 'visible', timeout: 30_000 });
  await openHealth.first().click();
  const detail = fhsHealthDetailRoot(page);
  await detail.getByRole('heading', { name: 'Why this status?' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  return detail;
}

export async function openHealthErrorsForPlate(page: Page, plate: string) {
  await page.getByRole('tablist', { name: 'Flotte' }).getByRole('tab', { name: 'Status' }).click();
  const fleetPanel = page
    .locator('.surface-premium.rounded-2xl')
    .filter({ hasText: 'Fleet Command' });
  await fleetPanel.getByText(plate, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await fleetPanel
    .getByRole('button', { name: new RegExp(plate) })
    .getByRole('button', { name: /Open vehicle details/i })
    .click();
  await page.getByRole('button', { name: 'Health', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mängelliste', level: 3 })).toBeVisible({ timeout: 20_000 });
}

export async function openTechnicalObservationsModal(page: Page) {
  await page.getByRole('heading', { name: 'Mängelliste', level: 3 }).click();
  const modalHeading = page.getByRole('heading', { name: 'Mängelliste', level: 2 });
  await expect(modalHeading).toBeVisible({ timeout: 15_000 });
  return modalHeading.locator('xpath=ancestor::div[contains(@class,"max-h")]').first();
}

export async function closeTechnicalObservationsModal(page: Page) {
  const overlay = page.locator('.fixed.inset-0.z-50').filter({
    has: page.getByRole('heading', { name: 'Mängelliste', level: 2 }),
  });
  await overlay.locator('button.absolute.top-4.right-4').click();
  await expect(page.getByRole('heading', { name: 'Mängelliste', level: 2 })).toHaveCount(0);
}

export async function returnToFleetHealthServiceTab(page: Page) {
  await page.getByRole('button', { name: /^Flotte$/ }).click();
  await page.getByRole('tab', { name: 'Zustand & Service' }).click();
  await expect(page.locator('#fhs-tab-overview, #fhs-tab-work').first()).toBeVisible({
    timeout: 30_000,
  });
}

export async function openServiceCaseDrawer(page: Page, caseTitle: string) {
  await page.getByRole('button', { name: new RegExp(`Servicefall ${caseTitle}`, 'i') }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
}

resetFleetHealthServiceMockState();
