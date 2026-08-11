/**
 * Synthetic demo tenant used to render real SynqDrive views for the public
 * marketing site.
 *
 * Everything in here is fictional: a made-up operator, made-up vehicles and
 * masked contact data. It exists so marketing screenshots never touch a
 * production tenant or personal data.
 */
import type { Page } from '@playwright/test';

export const DEMO_ORG_ID = 'org-synqdrive-demo';
export const DEMO_ORG_NAME = 'Meridian Mobility';
export const DEMO_USER_NAME = 'Operations';

export const demoTenantUser = {
  id: 'user-synqdrive-demo',
  email: 'ops@demo.synqdrive.eu',
  name: DEMO_USER_NAME,
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: DEMO_ORG_ID,
  organizationName: DEMO_ORG_NAME,
  organizationLogoUrl: null,
  permissions: {
    fleet: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    customers: { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
    invoices: { read: true, write: true, manage: true },
    chat: { read: true, write: true, manage: true },
    rental_rules: { read: true, write: true, manage: true },
    'workflow-automation': { read: true, write: true, manage: true },
  },
};

const NOW = Date.now();
const isoAgo = (ms: number) => new Date(NOW - ms).toISOString();
const isoIn = (ms: number) => new Date(NOW + ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const demoStations = [
  { id: 'st-nord', name: 'Station Nord', city: 'Hamburg', latitude: 53.5511, longitude: 9.9937 },
  { id: 'st-mitte', name: 'Station Mitte', city: 'Berlin', latitude: 52.52, longitude: 13.405 },
  { id: 'st-sued', name: 'Station Sued', city: 'Munich', latitude: 48.1351, longitude: 11.582 },
];

type DemoVehicleSeed = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  station: (typeof demoStations)[number];
  status: 'AVAILABLE' | 'ACTIVE_RENTED' | 'RESERVED' | 'MAINTENANCE';
  health: 'Good Health' | 'Warning' | 'Critical';
  freshness: 'live' | 'standby';
  odometerKm: number;
};

const seeds: DemoVehicleSeed[] = [
  { id: 'v-1', plate: 'HH-MM 214', make: 'Mercedes', model: 'Vito', year: 2024, fuelType: 'Diesel', station: demoStations[0], status: 'AVAILABLE', health: 'Warning', freshness: 'live', odometerKm: 48_120 },
  { id: 'v-2', plate: 'HH-MM 118', make: 'VW', model: 'Transporter', year: 2023, fuelType: 'Diesel', station: demoStations[0], status: 'ACTIVE_RENTED', health: 'Good Health', freshness: 'live', odometerKm: 76_540 },
  { id: 'v-3', plate: 'HH-MM 302', make: 'Ford', model: 'Transit Custom', year: 2025, fuelType: 'Diesel', station: demoStations[0], status: 'AVAILABLE', health: 'Good Health', freshness: 'live', odometerKm: 12_310 },
  { id: 'v-4', plate: 'B-MM 407', make: 'Skoda', model: 'Octavia', year: 2024, fuelType: 'Petrol', station: demoStations[1], status: 'ACTIVE_RENTED', health: 'Good Health', freshness: 'live', odometerKm: 61_890 },
  { id: 'v-5', plate: 'B-MM 512', make: 'Tesla', model: 'Model Y', year: 2025, fuelType: 'Electric', station: demoStations[1], status: 'AVAILABLE', health: 'Good Health', freshness: 'live', odometerKm: 22_450 },
  { id: 'v-6', plate: 'B-MM 588', make: 'Renault', model: 'Master', year: 2022, fuelType: 'Diesel', station: demoStations[1], status: 'MAINTENANCE', health: 'Critical', freshness: 'standby', odometerKm: 148_720 },
  { id: 'v-7', plate: 'B-MM 601', make: 'VW', model: 'Caddy', year: 2024, fuelType: 'Diesel', station: demoStations[1], status: 'AVAILABLE', health: 'Good Health', freshness: 'live', odometerKm: 34_960 },
  { id: 'v-8', plate: 'M-MM 733', make: 'BMW', model: '320d Touring', year: 2024, fuelType: 'Diesel', station: demoStations[2], status: 'RESERVED', health: 'Good Health', freshness: 'live', odometerKm: 41_200 },
  { id: 'v-9', plate: 'M-MM 780', make: 'Audi', model: 'A4 Avant', year: 2023, fuelType: 'Diesel', station: demoStations[2], status: 'AVAILABLE', health: 'Good Health', freshness: 'live', odometerKm: 58_430 },
  { id: 'v-10', plate: 'M-MM 815', make: 'Mercedes', model: 'Sprinter', year: 2025, fuelType: 'Diesel', station: demoStations[2], status: 'ACTIVE_RENTED', health: 'Good Health', freshness: 'live', odometerKm: 9_870 },
  { id: 'v-11', plate: 'M-MM 842', make: 'Opel', model: 'Vivaro', year: 2023, fuelType: 'Diesel', station: demoStations[2], status: 'AVAILABLE', health: 'Good Health', freshness: 'live', odometerKm: 67_010 },
  { id: 'v-12', plate: 'M-MM 903', make: 'Hyundai', model: 'Ioniq 5', year: 2025, fuelType: 'Electric', station: demoStations[2], status: 'AVAILABLE', health: 'Good Health', freshness: 'live', odometerKm: 15_640 },
];

const statusLabel: Record<DemoVehicleSeed['status'], string> = {
  AVAILABLE: 'Available',
  ACTIVE_RENTED: 'Rented',
  RESERVED: 'Reserved',
  MAINTENANCE: 'Maintenance',
};

function fleetMapRow(seed: DemoVehicleSeed) {
  const signalAgeMs = seed.freshness === 'live' ? 45_000 : 22 * 60_000;
  const rented = seed.status === 'ACTIVE_RENTED';
  const reserved = seed.status === 'RESERVED';

  return {
    id: seed.id,
    licensePlate: seed.plate,
    displayName: `${seed.make} ${seed.model}`,
    make: seed.make,
    model: seed.model,
    year: seed.year,
    status: statusLabel[seed.status],
    rawVehicleStatus: seed.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'AVAILABLE',
    operationalState: {
      status: seed.status,
      reason: seed.status === 'MAINTENANCE' ? 'MAINTENANCE_BLOCK' : null,
      source: 'fleet-map',
      effectiveFrom: rented ? isoAgo(2 * DAY) : null,
      effectiveUntil: rented ? isoIn(1 * DAY) : null,
      derivedAt: isoAgo(signalAgeMs),
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
    },
    bookingContext: {
      activeBooking: rented
        ? { id: `bk-${seed.id}`, startDate: isoAgo(2 * DAY), endDate: isoIn(1 * DAY), customerName: 'Business account' }
        : null,
      reservedBooking: reserved
        ? { id: `bk-${seed.id}`, startDate: isoIn(4 * HOUR), endDate: isoIn(3 * DAY), customerName: 'Business account' }
        : null,
      nextBooking: seed.status === 'AVAILABLE' && seed.id === 'v-3'
        ? { id: 'bk-next-1', startDate: isoIn(1 * DAY), endDate: isoIn(4 * DAY) }
        : null,
      futureBookingCount: seed.status === 'AVAILABLE' ? 1 : 0,
    },
    fuelType: seed.fuelType,
    healthStatus: seed.health,
    cleaningStatus: 'Clean',
    stationId: seed.station.id,
    stationName: seed.station.name,
    homeStationId: seed.station.id,
    currentStationId: seed.station.id,
    expectedStationId: null,
    latitude: seed.station.latitude,
    longitude: seed.station.longitude,
    lastSeenAt: isoAgo(signalAgeMs),
    signalAgeMs,
    isFresh: seed.freshness === 'live',
    onlineStatus: seed.freshness === 'live' ? 'ONLINE' : 'STANDBY',
    telemetryFreshness: seed.freshness,
    displayState: rented ? 'MOVING' : 'PARKED',
    displayIgnition: rented ? 'ON' : 'OFF',
    isLiveTracking: seed.freshness === 'live',
    heading: null,
    imageUrl: null,
    odometerKm: seed.odometerKm,
  };
}

export const demoFleetMap = seeds.map(fleetMapRow);

const demoConnectivity = {
  vehicles: seeds.map((seed) => ({
    vehicleId: seed.id,
    licensePlate: seed.plate,
    onlineStatus: seed.freshness === 'live' ? 'ONLINE' : 'STANDBY',
    telemetryFreshness: seed.freshness,
    lastSeenAt: isoAgo(seed.freshness === 'live' ? 45_000 : 22 * 60_000),
    signalAgeMs: seed.freshness === 'live' ? 45_000 : 22 * 60_000,
    isFresh: seed.freshness === 'live',
  })),
  meta: { total: seeds.length },
};

function invoice(
  id: string,
  type: string,
  status: string,
  totalCents: number,
  invoiceDaysAgo: number,
  options: { dueInDays?: number; paid?: boolean; paidCents?: number } = {},
) {
  const invoiceDate = isoAgo(invoiceDaysAgo * DAY);
  const dueDate = isoIn((options.dueInDays ?? 14 - invoiceDaysAgo) * DAY);
  return {
    id,
    type,
    status,
    totalCents,
    paidCents: options.paid ? totalCents : (options.paidCents ?? null),
    outstandingCents: options.paid ? 0 : totalCents - (options.paidCents ?? 0),
    currency: 'EUR',
    invoiceDate,
    dueDate,
    paidAt: options.paid ? isoAgo(Math.max(0, invoiceDaysAgo - 2) * DAY) : null,
    createdAt: invoiceDate,
    customerId: null,
    vehicleId: null,
    bookingId: null,
    title: null,
    invoiceNumberDisplay: id.toUpperCase(),
  };
}

/** Month-to-date figures for the demo tenant, expressed as invoices. */
export const demoInvoices = [
  invoice('inv-2481', 'OUTGOING_BOOKING', 'PAID', 184_500, 9, { paid: true }),
  invoice('inv-2482', 'OUTGOING_BOOKING', 'PAID', 96_000, 8, { paid: true }),
  invoice('inv-2483', 'OUTGOING_FINAL', 'PAID', 142_000, 7, { paid: true }),
  invoice('inv-2484', 'OUTGOING_BOOKING', 'ISSUED', 121_500, 6, { dueInDays: 8 }),
  invoice('inv-2485', 'OUTGOING_MANUAL', 'ISSUED', 68_000, 5, { dueInDays: 9 }),
  invoice('inv-2486', 'OUTGOING_BOOKING', 'ISSUED', 154_000, 4, { dueInDays: 10 }),
  invoice('inv-2487', 'OUTGOING_FINAL', 'ISSUED', 87_500, 3, { dueInDays: 11 }),
  invoice('inv-2488', 'OUTGOING_BOOKING', 'ISSUED', 62_000, 2, { dueInDays: 12 }),
  invoice('inv-2461', 'OUTGOING_BOOKING', 'ISSUED', 78_000, 26, { dueInDays: -12 }),
  invoice('inv-2455', 'OUTGOING_FINAL', 'ISSUED', 45_500, 33, { dueInDays: -19 }),
  invoice('inv-in-118', 'INCOMING_VENDOR', 'ISSUED', 54_000, 6, { dueInDays: 8 }),
  invoice('inv-in-119', 'INCOMING_UPLOADED', 'PAID', 31_500, 4, { paid: true }),
];

function todayBooking(id: string, seed: DemoVehicleSeed, atHour: number, stationName: string) {
  const at = new Date(NOW);
  at.setHours(atHour, 0, 0, 0);
  return {
    id,
    vehicleId: seed.id,
    vehicleLicense: seed.plate,
    vehicleName: `${seed.make} ${seed.model}`,
    customerId: `cust-${id}`,
    customerName: 'Business account',
    startDate: at.toISOString(),
    endDate: isoIn(3 * DAY),
    status: 'CONFIRMED',
    statusEnum: 'CONFIRMED',
    stationName,
    pickupStationName: stationName,
    returnStationName: stationName,
    pickupStationId: seed.station.id,
    returnStationId: seed.station.id,
  };
}

export const demoTodayPickups = [
  todayBooking('bk-4821', seeds[0], 10, 'Station Nord'),
  todayBooking('bk-4823', seeds[4], 13, 'Station Mitte'),
  todayBooking('bk-4826', seeds[8], 16, 'Station Sued'),
];

export const demoTodayReturns = [
  todayBooking('bk-4790', seeds[1], 9, 'Station Nord'),
  todayBooking('bk-4802', seeds[3], 17, 'Station Mitte'),
];

function healthModule(state: 'good' | 'attention' | 'critical' = 'good', reason = 'ok') {
  return { state, reason, last_updated_at: isoAgo(2 * HOUR), data_stale: false };
}

function rentalHealthVehicle(seed: DemoVehicleSeed) {
  const critical = seed.health === 'Critical';
  const warning = seed.health === 'Warning';
  return {
    vehicle_id: seed.id,
    organization_id: DEMO_ORG_ID,
    overall_state: critical ? 'critical' : warning ? 'attention' : 'good',
    rental_blocked: critical,
    blocking_reasons: critical ? ['brakes'] : [],
    generated_at: isoAgo(2 * HOUR),
    modules: {
      battery: healthModule(),
      tires: healthModule(),
      brakes: critical ? healthModule('critical', 'brake_pad_wear') : healthModule(),
      error_codes: healthModule(),
      service_compliance: warning ? healthModule('attention', 'service_overdue') : healthModule(),
      complaints: healthModule(),
      vehicle_alerts: healthModule(),
    },
  };
}

const demoRentalHealthFleet = {
  summary: {
    availability: { ready: 10, partial: 1, unavailable: 1 },
    pageHealth: {
      rentalBlocked: 1,
      byOverallState: { good: 10, attention: 1, critical: 1 },
      vehiclesWithDetail: seeds.length,
    },
  },
  data: seeds.map(rentalHealthVehicle),
  meta: { limit: 50, nextCursor: null },
};

/**
 * Every demo vehicle is priced, so the dashboard shows a clean tariff state
 * instead of a configuration warning.
 */
const demoTariffCatalog = {
  priceBook: { id: 'pb-demo', name: 'Standard price book', currency: 'EUR', taxRatePercent: 19, isActive: true },
  groups: [
    {
      id: 'tg-vans',
      name: 'Vans',
      description: 'Transporter and cargo van class',
      category: 'VAN',
      isActive: true,
      sortOrder: 1,
      updatedAt: isoAgo(6 * DAY),
      activeVersion: null,
      draftVersion: null,
      scheduledVersions: [],
      archivedVersions: [],
      versions: [],
    },
    {
      id: 'tg-cars',
      name: 'Cars',
      description: 'Passenger car class',
      category: 'CAR',
      isActive: true,
      sortOrder: 2,
      updatedAt: isoAgo(9 * DAY),
      activeVersion: null,
      draftVersion: null,
      scheduledVersions: [],
      archivedVersions: [],
      versions: [],
    },
  ],
  assignments: seeds.map((seed) => ({
    id: `as-${seed.id}`,
    vehicleId: seed.id,
    tariffGroupId: seed.fuelType === 'Electric' ? 'tg-cars' : 'tg-vans',
    priceBookId: 'pb-demo',
    isActive: true,
    validFrom: isoAgo(90 * DAY),
    validTo: null,
  })),
  unassignedVehicleCount: 0,
};

const demoInsights = {
  generatedAt: isoAgo(4 * 60_000),
  hasRun: true,
  stale: false,
  activeInsightCount: 3,
  error: null,
  insights: [
    {
      id: 'return-overdue',
      domain: 'BOOKINGS',
      category: 'CRITICAL',
      title: 'Return overdue, next booking at risk',
      description:
        'HH-MM 118 was due back at Station Nord this morning and is still on trip. The next booking starts in 4 hours.',
      actionLabel: 'Open booking',
      url: '/rental/bookings',
      count: 1,
      details: [{ vehicleId: 'v-2', licensePlate: 'HH-MM 118', bookingId: 'bk-4790' }],
    },
    {
      id: 'rental-block-brakes',
      domain: 'FLEET',
      category: 'WARNING',
      title: 'Vehicle blocked for rental, brake wear beyond limit',
      description:
        'B-MM 588 is out of service until the brake work is closed. A workshop task is open for Station Mitte.',
      actionLabel: 'Open vehicle',
      url: '/rental/fleet',
      count: 1,
      details: [{ vehicleId: 'v-6', licensePlate: 'B-MM 588' }],
    },
    {
      id: 'service-due',
      domain: 'FLEET',
      category: 'WARNING',
      title: 'Service inspection overdue on 1 vehicle',
      description: 'HH-MM 214 passed its service interval 12 days ago. Schedule the inspection before the next handover.',
      actionLabel: 'Open service',
      url: '/rental/fleet',
      count: 1,
      details: [{ vehicleId: 'v-1', licensePlate: 'HH-MM 214' }],
    },
  ],
  summary: { total: 3, critical: 1, warning: 2, opportunity: 0, info: 0 },
};

// ── Bookings ────────────────────────────────────────────────────────────────
// Fictional business customers only — no private individuals, no contact data.

function booking(
  id: string,
  seedIndex: number,
  customerName: string,
  startsInDays: number,
  days: number,
  status: string,
  totalPriceCents: number,
) {
  const seed = seeds[seedIndex];
  const start = new Date(NOW + startsInDays * DAY);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + days * DAY);
  end.setHours(17, 0, 0, 0);
  return {
    id,
    vehicleId: seed.id,
    vehicleName: `${seed.make} ${seed.model}`,
    vehicleLicense: seed.plate,
    customerId: `cust-${id}`,
    customerName,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status,
    statusEnum: status,
    pickupStationId: seed.station.id,
    returnStationId: seed.station.id,
    pickupStationName: seed.station.name,
    returnStationName: seed.station.name,
    totalPriceCents,
    currency: 'EUR',
    insuranceOptions: ['Liability'],
    paymentMethod: 'Card',
    fuelLevel: 'Full',
    pickupProtocol: null,
    returnProtocol: null,
    createdAt: isoAgo(6 * DAY),
    updatedAt: isoAgo(1 * DAY),
  };
}

const demoBookings = [
  booking('104821', 0, 'Lindberg Bau GmbH', 0, 3, 'CONFIRMED', 62_400),
  booking('104817', 4, 'Wenger Logistik', 0, 2, 'CONFIRMED', 41_800),
  booking('104790', 1, 'Nordwerk Handwerk', -3, 3, 'ACTIVE', 58_900),
  booking('104802', 3, 'Keller Elektrotechnik', -2, 4, 'ACTIVE', 74_600),
  booking('104826', 8, 'Sudhaus Catering', 1, 5, 'CONFIRMED', 96_500),
  booking('104829', 11, 'Aurum Immobilien', 2, 2, 'CONFIRMED', 38_400),
  booking('104788', 9, 'Meridian Facility Services', -8, 6, 'COMPLETED', 148_200),
  booking('104781', 2, 'Brandt Sanitaer', -12, 3, 'COMPLETED', 61_500),
];

// ── Workflow automation ─────────────────────────────────────────────────────

function workflow(
  id: string,
  name: string,
  description: string,
  category: string,
  trigger: string,
  conditions: Array<{ field: string; operator: string; value: unknown }>,
  actions: Array<{ type: string; config?: Record<string, unknown> }>,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    organizationId: DEMO_ORG_ID,
    name,
    description,
    category,
    trigger: { type: trigger },
    conditions,
    actions,
    scope: { type: 'organization' },
    status: 'active',
    statusLabel: 'Active',
    enabled: true,
    version: 3,
    createdById: demoTenantUser.id,
    createdByName: DEMO_USER_NAME,
    updatedById: demoTenantUser.id,
    updatedByName: DEMO_USER_NAME,
    lastTriggeredAt: isoAgo(3 * HOUR),
    triggerCount: 124,
    isTemplate: false,
    createdAt: isoAgo(100 * DAY),
    updatedAt: isoAgo(2 * DAY),
    riskClass: 'LOW',
    sourceType: 'custom',
    approvalStatus: 'none',
    activeVersion: 3,
    lastRunAt: isoAgo(3 * HOUR),
    lastRunOutcome: 'success',
    lastRunLabel: 'Succeeded',
    hasLegacyMapping: false,
    unavailableActionCount: 0,
    ...extra,
  };
}

const demoWorkflows = [
  workflow(
    'wf-return-inspection',
    'Return damage check',
    'Create a damage inspection task for every vehicle return.',
    'vehicle_return',
    'booking.returned',
    [],
    [{ type: 'create_task', config: { title: 'Damage inspection required', priority: 'HIGH', category: 'inspection' } }],
    { triggerCount: 312 },
  ),
  workflow(
    'wf-health-critical',
    'Critical health blocks the vehicle',
    'Take the vehicle out of service and open a repair task when critical health is detected.',
    'maintenance',
    'vehicle.health.critical',
    [{ field: 'health_score', operator: 'less_than', value: 40 }],
    [
      { type: 'change_vehicle_status', config: { status: 'OUT_OF_SERVICE' } },
      { type: 'create_task', config: { title: 'Critical vehicle issue - repair required', priority: 'CRITICAL' } },
      { type: 'create_alert', config: { severity: 'critical', message: 'Vehicle blocked due to critical health' } },
    ],
    { riskClass: 'HIGH', triggerCount: 27 },
  ),
  workflow(
    'wf-service-due',
    'Service due reminder',
    'Open a service task when the maintenance interval is reached.',
    'maintenance',
    'health_threshold',
    [{ field: 'days_since_last_service', operator: 'greater_than', value: 330 }],
    [{ type: 'create_task', config: { title: 'Service inspection required', priority: 'HIGH' } }],
    { triggerCount: 86 },
  ),
  workflow(
    'wf-document-expiry',
    'Document expiry reminder',
    'Notify the team before a vehicle document expires.',
    'compliance',
    'document.expiring',
    [{ field: 'days_until_expiry', operator: 'less_than', value: 30 }],
    [{ type: 'send_notification', config: { target: 'admin', message: 'Vehicle document expires soon' } }],
    { triggerCount: 58 },
  ),
  workflow(
    'wf-invoice-overdue',
    'Invoice overdue escalation',
    'Escalate to billing when an invoice is overdue for more than 14 days.',
    'finance',
    'invoice.overdue',
    [{ field: 'overdue_days', operator: 'greater_than', value: 14 }],
    [
      { type: 'create_task', config: { title: 'Invoice overdue - escalate', priority: 'HIGH', category: 'billing' } },
      { type: 'send_notification', config: { target: 'admin', message: 'Invoice overdue requires attention' } },
    ],
    { triggerCount: 41 },
  ),
  workflow(
    'wf-ai-suggestion',
    'AI suggestion with approval',
    'AI proposes an operational action. Nothing runs before a person approves it.',
    'ai_permissions',
    'manual',
    [],
    [{ type: 'ai_suggest', config: { summary: 'Review suggested fleet action' } }],
    {
      riskClass: 'CRITICAL',
      approvalStatus: 'pending',
      status: 'pending_activation',
      statusLabel: 'Pending approval',
      enabled: false,
      lastRunOutcome: 'waiting_approval',
      lastRunLabel: 'Waiting for approval',
      triggerCount: 6,
    },
  ),
];

const demoWorkflowStats = {
  total: 6,
  active: 5,
  draft: 0,
  disabled: 0,
  invalid: 0,
  pendingActivation: 1,
  archived: 0,
  totalRuns: 528,
  successfulRuns: 511,
  failedRuns: 11,
  waitingApprovalRuns: 6,
  runsLast24h: 23,
  lastRunAt: isoAgo(3 * HOUR),
};

const demoTaskAutomationRules = {
  rules: [
    {
      ruleId: 'booking.lifecycle.confirmed.prep',
      label: 'Prepare vehicle after booking confirmation',
      description: 'Creates the preparation task as soon as a booking is confirmed.',
      category: 'bookings',
      enabled: true,
      defaultEnabled: true,
      overridden: false,
      version: 1,
      lastTriggeredAt: isoAgo(5 * HOUR),
    },
    {
      ruleId: 'booking.lifecycle.returned.inspection',
      label: 'Inspect vehicle after return',
      description: 'Creates the return inspection task when a booking is returned.',
      category: 'bookings',
      enabled: true,
      defaultEnabled: true,
      overridden: false,
      version: 1,
      lastTriggeredAt: isoAgo(3 * HOUR),
    },
    {
      ruleId: 'vehicle.document.expiry.reminder',
      label: 'Remind before document expiry',
      description: 'Creates a task before a vehicle document expires.',
      category: 'compliance',
      enabled: true,
      defaultEnabled: true,
      overridden: true,
      version: 2,
      lastTriggeredAt: isoAgo(2 * DAY),
    },
  ],
};

// ── Customer communication ──────────────────────────────────────────────────
// Fictional business contacts, masked numbers, no real customer data.

function conversation(
  id: string,
  contactName: string,
  contactPhone: string,
  lastMessagePreview: string,
  lastMessageAgoMs: number,
  unreadCount: number,
  status: string,
  intent: string | null,
) {
  return {
    id,
    contactPhone,
    contactName,
    customerId: `cust-${id}`,
    bookingId: '104821',
    vehicleId: 'v-1',
    lastMessageAt: isoAgo(lastMessageAgoMs),
    lastMessagePreview,
    unreadCount,
    status,
    assignedTo: null,
    intent,
    createdAt: isoAgo(9 * DAY),
  };
}

const demoConversations = [
  conversation(
    'cv-1',
    'Lindberg Bau GmbH',
    '+49 40 ••• ••21',
    'Perfect, see you at 10:00.',
    35 * 60_000,
    0,
    'OPEN',
    'pickup_question',
  ),
  conversation(
    'cv-2',
    'Wenger Logistik',
    '+49 30 ••• ••07',
    'Could you share the pickup address again?',
    2 * HOUR,
    2,
    'OPEN',
    'pickup_question',
  ),
  conversation(
    'cv-3',
    'Keller Elektrotechnik',
    '+49 89 ••• ••63',
    'The return is scheduled for Friday.',
    20 * HOUR,
    0,
    'PENDING_HUMAN',
    'return_change',
  ),
  conversation(
    'cv-4',
    'Nordwerk Handwerk',
    '+49 40 ••• ••88',
    'Thanks for the invoice.',
    2 * DAY,
    0,
    'CLOSED',
    'invoice_question',
  ),
];

function message(
  id: string,
  direction: 'incoming' | 'outgoing',
  content: string,
  agoMs: number,
  status: string,
  senderName: string | null,
  aiGenerated = false,
) {
  return {
    id,
    direction,
    senderType: direction === 'incoming' ? 'CUSTOMER' : aiGenerated ? 'AI' : 'AGENT',
    senderName,
    content,
    aiGenerated,
    aiSuggested: false,
    status,
    messageType: 'text',
    templateName: null,
    providerMessageId: null,
    failureReason: null,
    createdAt: isoAgo(agoMs),
  };
}

const demoMessages = [
  message('ms-1', 'incoming', 'Hi, is the van ready for pickup tomorrow morning?', 3 * HOUR, 'DELIVERED', 'Lindberg Bau GmbH'),
  message(
    'ms-2',
    'outgoing',
    'Yes. Booking BK-104821 is confirmed for 10:00 at Station Nord. Vehicle HH-MM 214, Mercedes Vito.',
    2.5 * HOUR,
    'READ',
    DEMO_USER_NAME,
  ),
  message(
    'ms-3',
    'outgoing',
    'The handover protocol and the invoice are sent automatically right after pickup.',
    2.4 * HOUR,
    'READ',
    'SynqDrive AI',
    true,
  ),
  message('ms-4', 'incoming', 'Perfect, see you at 10:00.', 35 * 60_000, 'DELIVERED', 'Lindberg Bau GmbH'),
];

const demoWhatsAppConfig = {
  id: 'wa-demo',
  organizationId: DEMO_ORG_ID,
  isConnected: true,
  isActive: true,
  phoneNumber: '+49 40 ••• ••00',
  phoneNumberId: 'pn-demo',
  wabaId: 'waba-demo',
  businessName: DEMO_ORG_NAME,
  providerStatus: 'CONNECTED',
  providerConfigured: true,
  accessTokenConfigured: true,
  appSecretConfigured: true,
  serviceWindowOpen: true,
  aiMode: 'SUGGEST_ONLY',
  aiCanCreateTasks: true,
  aiCanCreateSupport: true,
  aiCanUseBookings: true,
  aiCanContactVendors: false,
  aiEscalationEnabled: true,
  connectedAt: isoAgo(60 * DAY),
  connectedByName: DEMO_USER_NAME,
  lastWebhookAt: isoAgo(4 * 60_000),
  createdAt: isoAgo(60 * DAY),
  updatedAt: isoAgo(2 * DAY),
};

const demoWhatsAppStats = {
  totalConversations: 34,
  openConversations: 12,
  totalMessages: 486,
  aiMessages: 128,
  unreadTotal: 2,
  isConnected: true,
  isActive: true,
  providerStatus: 'CONNECTED',
  aiMode: 'SUGGEST_ONLY',
  lastWebhookAt: isoAgo(4 * 60_000),
};

const demoConversationContext = {
  conversation: {
    id: 'cv-1',
    status: 'OPEN',
    contactPhone: '+49 40 ••• ••21',
    contactName: 'Lindberg Bau GmbH',
    customerId: 'cust-cv-1',
    bookingId: '104821',
    vehicleId: 'v-1',
    assignedTo: null,
    lastDetectedIntent: 'pickup_question',
    unreadCount: 0,
  },
  customer: {
    id: 'cust-cv-1',
    displayName: 'Lindberg Bau GmbH',
    phone: '+49 40 ••• ••21',
    email: null,
    status: 'ACTIVE',
  },
  booking: {
    id: '104821',
    bookingNumber: 'BK-104821',
    status: 'CONFIRMED',
    startDate: isoIn(20 * HOUR),
    endDate: isoIn(4 * DAY),
    pickupStationName: 'Station Nord',
    returnStationName: 'Station Nord',
  },
  vehicle: { id: 'v-1', displayName: 'Mercedes Vito', licensePlate: 'HH-MM 214', status: 'AVAILABLE' },
  station: {
    id: 'st-nord',
    name: 'Station Nord',
    address: 'Hafenstrasse 12, Hamburg',
    handoverInstructions: null,
    returnInstructions: null,
  },
  documents: { bundleStatus: 'COMPLETE', missingCount: 0, missingLabels: [], warnings: [] },
  payment: {
    depositStatus: 'AUTHORIZED',
    paymentStatus: 'OPEN',
    depositAmountCents: 50_000,
    openAmountCents: 62_400,
    openInvoiceCount: 1,
  },
  damages: { openCount: 0 },
  tasks: {
    openCount: 1,
    overdueCount: 0,
    items: [
      {
        id: 'tk-prep-4821',
        title: 'Prepare vehicle for handover',
        status: 'OPEN',
        priority: 'HIGH',
        dueAt: isoIn(16 * HOUR),
      },
    ],
  },
  handover: {
    pickupCompleted: false,
    pickupCompletedAt: null,
    returnCompleted: false,
    returnCompletedAt: null,
    operatorBookingUrl: null,
  },
  whatsapp: { isConnected: true, isActive: true, providerConfigured: true, customerOptedOut: false },
  quickActions: [
    { id: 'send_pickup_instructions', label: 'Send pickup instructions', enabled: true },
    { id: 'send_handover_link', label: 'Send handover link', enabled: true },
    { id: 'human_review', label: 'Request human review', enabled: true },
    { id: 'create_task', label: 'Create task', enabled: true },
  ],
};

// ── AI assistant history ────────────────────────────────────────────────────

const aiOverdueStructured = {
  responseType: 'OVERDUE_EXPLANATION',
  vehicle: { displayName: 'VW Transporter', licensePlate: 'HH-MM 118' },
  dataFreshness: { freshness: 'live', observedAt: isoAgo(4 * 60_000), isLastKnown: false, label: null },
  sources: [{ label: 'Booking calendar' }, { label: 'Vehicle telemetry' }, { label: 'Task workflow' }],
  warnings: [],
  partial: false,
  generatedAt: isoAgo(3 * 60_000),
  usedDeterministicFallback: false,
  compactSummary: {
    headline: 'Return is 6 hours overdue and the vehicle is still on trip',
    statusTone: 'critical',
    facts: [
      { id: 'booking', label: 'Booking', value: 'BK-4790', tone: 'neutral' },
      { id: 'due', label: 'Overdue since', value: '6 hours', tone: 'critical' },
      { id: 'station', label: 'Return station', value: 'Station Nord', tone: 'info' },
      { id: 'next', label: 'Next booking', value: 'Starts in 4 hours', tone: 'warning' },
    ],
  },
  actions: [
    {
      kind: 'OPEN_BOOKING',
      messageDe: 'Buchung oeffnen und Rueckgabe bestaetigen',
      messageEn: 'Open the booking and confirm the return',
    },
  ],
};

const aiHealthStructured = {
  responseType: 'HEALTH_SUMMARY',
  vehicle: { displayName: 'Mercedes Vito', licensePlate: 'HH-MM 214' },
  dataFreshness: { freshness: 'live', observedAt: isoAgo(2 * 60_000), isLastKnown: false, label: null },
  sources: [{ label: 'Vehicle health' }, { label: 'Telemetry signals' }, { label: 'Service history' }],
  warnings: ['Limited tyre pressure data on the rear axle'],
  partial: false,
  generatedAt: isoAgo(60_000),
  usedDeterministicFallback: false,
  compactSummary: {
    headline: 'Two items need attention before the next handover',
    statusTone: 'warning',
    facts: [
      { id: 'service', label: 'Service inspection', value: 'Overdue by 12 days', tone: 'critical' },
      { id: 'brakes', label: 'Brakes front / rear', value: '4.2 mm / 3.1 mm', tone: 'warning' },
      { id: 'battery', label: 'Battery state of health', value: '87 %', tone: 'info' },
      { id: 'tires', label: 'Tyres', value: '6.2 / 5.8 / 4.9 / 4.7 mm', tone: 'neutral' },
    ],
  },
};

export const demoAiHistory = [
  {
    id: 'hist-user-1',
    role: 'user',
    content: 'Which vehicles are not ready for their next booking?',
    createdAt: isoAgo(9 * 60_000),
  },
  {
    id: 'hist-overdue',
    role: 'assistant',
    content:
      '**Booking BK-4790 is overdue**\n\n- Overdue since: 6 hours\n- Return station: Station Nord\n- Next booking starts in 4 hours',
    createdAt: isoAgo(8 * 60_000),
    structured: aiOverdueStructured,
  },
  {
    id: 'hist-user-2',
    role: 'user',
    content: 'What is the health status of HH-MM 214?',
    createdAt: isoAgo(3 * 60_000),
  },
  {
    id: 'hist-health',
    role: 'assistant',
    content:
      '**Health summary Mercedes Vito (HH-MM 214)**\n\n1. Service inspection: overdue by 12 days\n2. Brakes: front 4.2 mm / rear 3.1 mm\n3. Battery state of health: 87 %',
    createdAt: isoAgo(60_000),
    structured: aiHealthStructured,
  },
];

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

/**
 * Serves the endpoints the rental dashboard and fleet views request.
 * Anything unknown resolves to an empty payload so no view can hang.
 */
export async function installDemoTenantMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const scoped = (segment: string) => url.includes(`/organizations/${DEMO_ORG_ID}${segment}`);

    if (url.includes('/auth/me')) return route.fulfill(json(demoTenantUser));
    if (url.includes('/auth/memberships')) {
      return route.fulfill(
        json([
          {
            organizationId: DEMO_ORG_ID,
            organizationName: DEMO_ORG_NAME,
            membershipRole: 'ORG_ADMIN',
            organizationLogoUrl: null,
          },
        ]),
      );
    }
    if (scoped('/profile')) {
      return route.fulfill(
        json({ id: DEMO_ORG_ID, name: DEMO_ORG_NAME, businessType: 'RENTAL', timezone: 'Europe/Berlin', currency: 'EUR' }),
      );
    }
    if (scoped('/fleet-map')) return route.fulfill(json(demoFleetMap));
    if (scoped('/fleet-connectivity')) return route.fulfill(json(demoConnectivity));
    if (scoped('/rental-health/fleet')) return route.fulfill(json(demoRentalHealthFleet));
    const perVehicleHealth = url.match(new RegExp(`/organizations/${DEMO_ORG_ID}/vehicles/([^/?]+)/rental-health`));
    if (perVehicleHealth) {
      const seed = seeds.find((s) => s.id === perVehicleHealth[1]) ?? seeds[0];
      return route.fulfill(json(rentalHealthVehicle(seed)));
    }
    if (scoped('/rental-health')) {
      return route.fulfill(json({ vehicles: demoRentalHealthFleet.data, summary: demoRentalHealthFleet.summary }));
    }
    if (scoped('/bookings/today/pickups')) return route.fulfill(json(demoTodayPickups));
    if (scoped('/bookings/today/returns')) return route.fulfill(json(demoTodayReturns));
    if (scoped('/bookings') && method === 'GET') {
      return route.fulfill(
        json({
          data: demoBookings,
          meta: { total: demoBookings.length, page: 1, limit: 100, totalPages: 1 },
        }),
      );
    }
    if (scoped('/customers') && method === 'GET') {
      return route.fulfill(
        json(
          demoBookings.map((b) => ({
            id: b.customerId,
            name: b.customerName,
            companyName: b.customerName,
            type: 'BUSINESS',
            email: null,
            phone: null,
          })),
        ),
      );
    }
    if (scoped('/invoices')) return route.fulfill(json(demoInvoices));
    if (scoped('/stations/feature-flags')) return route.fulfill(json({ modules: {} }));
    if (scoped('/stations')) return route.fulfill(json(demoStations));
    if (scoped('/price-tariffs')) return route.fulfill(json(demoTariffCatalog));
    if (scoped('/dashboard-insights')) return route.fulfill(json(demoInsights));
    if (scoped('/notifications') && url.includes('/counts')) {
      return route.fulfill(
        json({ totalActive: 2, unread: 2, critical: 1, warning: 1, info: 0, resolvedRecent: 0, byDomain: {} }),
      );
    }
    if (scoped('/support/unread-count')) return route.fulfill(json({ count: 0 }));

    if (scoped('/chat/agent')) {
      return route.fulfill(json({ agent: { agentName: 'meridian-ops', dimoAgentId: 'demo-agent' } }));
    }
    if (scoped('/chat/history')) return route.fulfill(json(demoAiHistory));

    if (scoped('/workflows/stats')) return route.fulfill(json(demoWorkflowStats));
    if (scoped('/workflows/catalog')) return route.fulfill(json({ items: [] }));
    if (scoped('/workflows/audit-events')) return route.fulfill(json({ items: [], total: 0 }));
    if (/\/workflows\/[^/]+\/(runs|change-requests)/.test(url)) return route.fulfill(json([]));
    if (scoped('/task-automation/rules')) return route.fulfill(json(demoTaskAutomationRules));
    if (scoped('/workflows') && method === 'GET') return route.fulfill(json(demoWorkflows));

    if (scoped('/whatsapp/config')) return route.fulfill(json(demoWhatsAppConfig));
    if (scoped('/whatsapp/stats')) return route.fulfill(json(demoWhatsAppStats));
    if (scoped('/whatsapp/templates')) return route.fulfill(json([]));
    if (/\/whatsapp\/conversations\/[^/]+\/messages/.test(url)) return route.fulfill(json(demoMessages));
    if (/\/whatsapp\/conversations\/[^/]+\/context/.test(url)) {
      return route.fulfill(json(demoConversationContext));
    }
    if (scoped('/whatsapp/conversations')) return route.fulfill(json(demoConversations));
    if (scoped('/users')) {
      return route.fulfill(json([{ id: demoTenantUser.id, name: DEMO_USER_NAME, email: demoTenantUser.email }]));
    }
    if (scoped('/service-cases') || scoped('/vendors')) return route.fulfill(json([]));
    if (scoped('/tasks')) return route.fulfill(json({ data: [], meta: { total: 0 } }));

    if (method === 'GET') return route.fulfill(json({ data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } }));
    return route.fulfill(json({}));
  });
}
