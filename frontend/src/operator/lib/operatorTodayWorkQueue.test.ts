import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import type { VehicleData } from '../../rental/data/vehicles';
import type { TodayBookingApiRow } from '../../rental/components/dashboard/dashboardTypes';
import {
  assertNoDuplicateTodayWorkItems,
  buildOperatorTodayWorkQueue,
  compareOperatorTodayWorkItems,
  deriveOperatorTodayWorkState,
} from './operatorTodayWorkQueue';
import type { OperatorTodayBookingItem } from './operatorData';

const REFERENCE_NOW = new Date('2026-07-25T10:00:00.000Z');
const ORG_TZ = 'Europe/Berlin';

function vehicle(overrides: Partial<VehicleData> = {}): VehicleData {
  return {
    id: overrides.id ?? 'veh-1',
    license: overrides.license ?? 'KS-AB 1',
    make: overrides.make ?? 'VW',
    model: overrides.model ?? 'Golf',
    year: overrides.year ?? 2024,
    station: overrides.station ?? 'Zentrale',
    stationId: overrides.stationId ?? 'st-1',
    fuelType: overrides.fuelType ?? 'Petrol',
    status: overrides.status ?? 'Available',
    cleaningStatus: overrides.cleaningStatus ?? 'Clean',
    healthStatus: overrides.healthStatus ?? 'Good Health',
    online: overrides.online ?? true,
    lastSignal: overrides.lastSignal ?? REFERENCE_NOW.toISOString(),
    badge: overrides.badge ?? 0,
    odometer: overrides.odometer ?? 10000,
    fuel: overrides.fuel ?? 72,
    battery: overrides.battery ?? 100,
    speed: overrides.speed ?? 0,
    coolant: overrides.coolant ?? 90,
    brakes: overrides.brakes ?? 90,
    tires: overrides.tires ?? 90,
    engineOil: overrides.engineOil ?? 90,
    isElectric: overrides.isElectric ?? false,
    hvBatteryCapacityKwh: overrides.hvBatteryCapacityKwh ?? null,
    isFresh: overrides.isFresh ?? false,
    onlineStatus: overrides.onlineStatus ?? 'STANDBY',
    leasingRate: overrides.leasingRate ?? '',
    insuranceCost: overrides.insuranceCost ?? '',
    taxCost: overrides.taxCost ?? '',
    totalMonthlyCost: overrides.totalMonthlyCost ?? '',
    ...overrides,
  };
}

function pickupRow(overrides: Partial<TodayBookingApiRow> = {}): TodayBookingApiRow {
  return {
    id: 'bk-pickup',
    vehicleId: 'veh-1',
    vehicleName: 'VW Golf',
    vehicleLicense: 'KS-AB 1',
    customerName: 'Max Mustermann',
    startDate: '2026-07-25T14:00:00.000Z',
    endDate: '2026-07-27T14:00:00.000Z',
    statusEnum: 'CONFIRMED',
    status: 'Confirmed',
    isOverdue: false,
    pickupStationName: 'Kassel',
    ...overrides,
  };
}

function returnRow(overrides: Partial<TodayBookingApiRow> = {}): TodayBookingApiRow {
  return {
    id: 'bk-return',
    vehicleId: 'veh-2',
    vehicleName: 'Audi Q4',
    vehicleLicense: 'KS-CD 2',
    customerName: 'Anna Test',
    startDate: '2026-07-23T10:00:00.000Z',
    endDate: '2026-07-25T16:00:00.000Z',
    statusEnum: 'ACTIVE',
    status: 'Active',
    isOverdue: false,
    pickupProtocol: { id: 'proto-1' },
    returnStationName: 'Fulda',
    ...overrides,
  };
}

function buildQueue(input: {
  pickups?: TodayBookingApiRow[];
  returns?: TodayBookingApiRow[];
  fleetVehicles?: VehicleData[];
  healthMap?: Map<string, VehicleHealthResponse>;
}) {
  return buildOperatorTodayWorkQueue({
    pickups: input.pickups ?? [],
    returns: input.returns ?? [],
    fleetVehicles: input.fleetVehicles ?? [vehicle(), vehicle({ id: 'veh-2', license: 'KS-CD 2' })],
    healthMap: input.healthMap ?? new Map(),
    orgTimezone: ORG_TZ,
    referenceNow: REFERENCE_NOW,
    locale: 'de',
  });
}

describe('deriveOperatorTodayWorkState', () => {
  it('maps terminal protocol completion to abgeschlossen', () => {
    const state = deriveOperatorTodayWorkState({
      kind: 'PICKUP',
      isDone: true,
      isOverdue: false,
      raw: pickupRow({ pickupProtocol: { id: 'p1' } }),
      pickupGate: { allowed: false, reason: 'Pickup-Protokoll bereits vorhanden' },
      returnGate: { allowed: false },
    });
    expect(state.workState).toBe('abgeschlossen');
  });

  it('uses server overdue flag for verspaetet', () => {
    const state = deriveOperatorTodayWorkState({
      kind: 'RETURN',
      isDone: false,
      isOverdue: true,
      raw: returnRow({ isOverdue: true }),
      pickupGate: { allowed: false },
      returnGate: { allowed: true },
    });
    expect(state.workState).toBe('verspaetet');
  });

  it('surfaces server gate reason for blockiert', () => {
    const state = deriveOperatorTodayWorkState({
      kind: 'PICKUP',
      isDone: false,
      isOverdue: false,
      raw: pickupRow(),
      pickupGate: { allowed: false, reason: 'Pickup nicht möglich: Fahrzeug rental_blocked' },
      returnGate: { allowed: false },
    });
    expect(state.workState).toBe('blockiert');
    expect(state.blockerReason).toContain('rental_blocked');
  });

  it('detects in-progress handover protocol drafts', () => {
    const state = deriveOperatorTodayWorkState({
      kind: 'RETURN',
      isDone: false,
      isOverdue: false,
      raw: returnRow({ returnProtocol: { status: 'DRAFT' } }),
      pickupGate: { allowed: false },
      returnGate: { allowed: true },
    });
    expect(state.workState).toBe('in_bearbeitung');
  });
});

describe('buildOperatorTodayWorkQueue', () => {
  it('excludes cancelled and completed bookings', () => {
    const queue = buildQueue({
      pickups: [
        pickupRow({ id: 'cancelled', statusEnum: 'CANCELLED', status: 'Cancelled' }),
        pickupRow({ id: 'done', pickupProtocol: { id: 'p1' } }),
        pickupRow({ id: 'open', statusEnum: 'CONFIRMED' }),
      ],
    });

    expect(queue.pickupsToday.map((item) => item.bookingId)).toEqual(['open']);
    expect(queue.overduePickups).toHaveLength(0);
  });

  it('splits overdue from today lists without duplicates', () => {
    const queue = buildQueue({
      pickups: [
        pickupRow({ id: 'late', isOverdue: true, startDate: '2026-07-25T08:00:00.000Z' }),
        pickupRow({ id: 'today', isOverdue: false, startDate: '2026-07-25T16:00:00.000Z' }),
      ],
    });

    expect(queue.overduePickups.map((item) => item.bookingId)).toEqual(['late']);
    expect(queue.pickupsToday.map((item) => item.bookingId)).toEqual(['today']);
    expect(queue.urgentHandovers.map((item) => item.bookingId)).toEqual(['late']);

    const allTodaySection = [...queue.pickupsToday, ...queue.returnsToday, ...queue.urgentHandovers];
    assertNoDuplicateTodayWorkItems(allTodaySection);
  });

  it('respects org timezone midnight boundary', () => {
    const reference = new Date('2026-07-25T22:30:00.000Z');
    const queue = buildOperatorTodayWorkQueue({
      pickups: [
        pickupRow({
          id: 'berlin-tomorrow',
          startDate: '2026-07-26T06:00:00.000Z',
          statusEnum: 'CONFIRMED',
        }),
      ],
      returns: [],
      fleetVehicles: [vehicle()],
      healthMap: new Map(),
      orgTimezone: ORG_TZ,
      referenceNow: reference,
    });

    expect(queue.pickupsToday).toHaveLength(1);
    expect(queue.pickupsToday[0]?.bookingId).toBe('berlin-tomorrow');
  });

  it('prioritizes verspaetet before blockiert before bereit with stable tie-breakers', () => {
    const item = (partial: Partial<OperatorTodayBookingItem>): OperatorTodayBookingItem => ({
      bookingId: partial.bookingId ?? 'bk',
      kind: partial.kind ?? 'PICKUP',
      vehicleId: 'veh-1',
      vehicleName: 'VW',
      plate: 'KS-AB 1',
      customerName: 'Test',
      station: 'Kassel',
      scheduledAt: partial.scheduledAt ?? '2026-07-25T12:00:00.000Z',
      timeLabel: '12:00',
      status: 'confirmed',
      statusLabel: 'Bestätigt',
      isOverdue: partial.workState === 'verspaetet',
      isDueNow: partial.workState === 'verspaetet',
      isDone: partial.workState === 'abgeschlossen',
      workState: partial.workState ?? 'bereit',
      pickupGate: { allowed: true },
      returnGate: { allowed: false },
      raw: pickupRow({ id: partial.bookingId }),
    });

    const sorted = [
      item({ bookingId: 'ready-late', workState: 'bereit', scheduledAt: '2026-07-25T18:00:00.000Z' }),
      item({ bookingId: 'blocked-early', workState: 'blockiert', scheduledAt: '2026-07-25T08:00:00.000Z' }),
      item({ bookingId: 'overdue', workState: 'verspaetet', scheduledAt: '2026-07-25T06:00:00.000Z' }),
    ].sort(compareOperatorTodayWorkItems);

    expect(sorted.map((entry) => entry.bookingId)).toEqual([
      'overdue',
      'blocked-early',
      'ready-late',
    ]);
  });

  it('marks blocked pickup when vehicle health rental_blocked', () => {
    const healthMap = new Map<string, VehicleHealthResponse>([
      [
        'veh-1',
        {
          vehicle_id: 'veh-1',
          organization_id: 'org-1',
          overall_state: 'critical',
          rental_blocked: true,
          blocking_reasons: ['Offene Service-Aufgabe'],
          modules: {
            battery: { state: 'good', reason: '', last_updated_at: REFERENCE_NOW.toISOString(), data_stale: false },
            tires: { state: 'good', reason: '', last_updated_at: REFERENCE_NOW.toISOString(), data_stale: false },
            brakes: { state: 'good', reason: '', last_updated_at: REFERENCE_NOW.toISOString(), data_stale: false },
            error_codes: { state: 'good', reason: '', last_updated_at: REFERENCE_NOW.toISOString(), data_stale: false },
            service_compliance: { state: 'good', reason: '', last_updated_at: REFERENCE_NOW.toISOString(), data_stale: false },
            complaints: { state: 'good', reason: '', last_updated_at: REFERENCE_NOW.toISOString(), data_stale: false },
            vehicle_alerts: { state: 'good', reason: '', last_updated_at: REFERENCE_NOW.toISOString(), data_stale: false },
          },
          generated_at: REFERENCE_NOW.toISOString(),
        },
      ],
    ]);

    const queue = buildQueue({
      pickups: [pickupRow({ id: 'blocked-pickup' })],
      healthMap,
    });

    expect(queue.pickupsToday[0]?.workState).toBe('blockiert');
    expect(queue.pickupsToday[0]?.blockerReason).toBeTruthy();
  });
});
