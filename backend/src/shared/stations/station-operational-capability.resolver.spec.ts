import { StationCalendarExceptionType, StationStatus } from '@prisma/client';
import {
  mergeEffectiveCapabilities,
  resolveStationOperationalCapabilities,
  StationOperationalCapabilityKind,
  StationOperationalCapabilityReasonCode,
} from './station-operational-capability.resolver';
import { zonedLocalTimeToUtc } from './station-opening-calendar.util';

const BERLIN = 'Europe/Berlin';

const BASE_SNAPSHOT = {
  stationId: 'station-1',
  status: 'ACTIVE' as StationStatus,
  pickupEnabled: true,
  returnEnabled: true,
  afterHoursReturnEnabled: false,
  keyBoxAvailable: false,
  timezone: BERLIN,
  openingHours: {
    version: 2,
    monday: { slots: [{ open: '09:00', close: '18:00' }] },
    tuesday: { slots: [{ open: '09:00', close: '18:00' }] },
    wednesday: { slots: [{ open: '09:00', close: '18:00' }] },
    thursday: { slots: [{ open: '09:00', close: '18:00' }] },
    friday: { slots: [{ open: '09:00', close: '18:00' }] },
    saturday: { closed: true },
    sunday: { closed: true },
  },
  calendarExceptions: [],
};

describe('station-operational-capability.resolver', () => {
  it('returns ARCHIVED for archived stations', () => {
    const result = resolveStationOperationalCapabilities(
      { ...BASE_SNAPSHOT, status: 'ARCHIVED' },
      { at: '2026-07-14T10:00:00.000Z' },
    );
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.ARCHIVED);
    expect(result.return.kind).toBe(StationOperationalCapabilityKind.ARCHIVED);
    expect(result.capabilityVersion).toBe(1);
  });

  it('returns INACTIVE for inactive stations', () => {
    const result = resolveStationOperationalCapabilities(
      { ...BASE_SNAPSHOT, status: 'INACTIVE' },
      { at: '2026-07-14T10:00:00.000Z' },
    );
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.INACTIVE);
    expect(result.return.kind).toBe(StationOperationalCapabilityKind.INACTIVE);
  });

  it('returns CONFIGURATION_INCOMPLETE when timezone is missing', () => {
    const result = resolveStationOperationalCapabilities(
      { ...BASE_SNAPSHOT, timezone: null },
      { at: '2026-07-14T10:00:00.000Z' },
    );
    expect(result.pickup.kind).toBe(
      StationOperationalCapabilityKind.CONFIGURATION_INCOMPLETE,
    );
    expect(result.pickup.reasons[0]?.code).toBe(
      StationOperationalCapabilityReasonCode.TIMEZONE_MISSING,
    );
  });

  it('returns PICKUP_AVAILABLE and RETURN_AVAILABLE during opening hours', () => {
    const at = zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(BASE_SNAPSHOT, { at });
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.PICKUP_AVAILABLE);
    expect(result.return.kind).toBe(StationOperationalCapabilityKind.RETURN_AVAILABLE);
    expect(result.pickup.nextOpeningWindow).not.toBeNull();
    expect(result.pickup.effectiveRule?.source).toBe('station.opening_hours');
  });

  it('returns CLOSED for pickup outside opening hours', () => {
    const at = zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(BASE_SNAPSHOT, { at });
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.CLOSED);
    expect(result.pickup.reasons.some((r) => r.code === StationOperationalCapabilityReasonCode.OUTSIDE_OPENING_HOURS)).toBe(true);
  });

  it('returns MANUAL_CONFIRMATION_REQUIRED for return outside hours without after-hours policy', () => {
    const at = zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(BASE_SNAPSHOT, { at });
    expect(result.return.kind).toBe(
      StationOperationalCapabilityKind.MANUAL_CONFIRMATION_REQUIRED,
    );
    expect(
      result.return.reasons.some(
        (r) => r.code === StationOperationalCapabilityReasonCode.AFTER_HOURS_RETURN_DISABLED,
      ),
    ).toBe(true);
  });

  it('returns AFTER_HOURS_RETURN_AVAILABLE when after-hours return and keybox are enabled', () => {
    const at = zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(
      {
        ...BASE_SNAPSHOT,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: true,
      },
      { at },
    );
    expect(result.return.kind).toBe(
      StationOperationalCapabilityKind.AFTER_HOURS_RETURN_AVAILABLE,
    );
  });

  it('returns MANUAL_CONFIRMATION_REQUIRED when after-hours return is enabled but keybox is missing', () => {
    const at = zonedLocalTimeToUtc('2026-07-14', '20:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(
      {
        ...BASE_SNAPSHOT,
        afterHoursReturnEnabled: true,
        keyBoxAvailable: false,
      },
      { at },
    );
    expect(result.return.kind).toBe(
      StationOperationalCapabilityKind.MANUAL_CONFIRMATION_REQUIRED,
    );
    expect(
      result.return.reasons.some(
        (r) => r.code === StationOperationalCapabilityReasonCode.KEYBOX_UNAVAILABLE,
      ),
    ).toBe(true);
  });

  it('applies temporary operational rules over base capabilities', () => {
    const at = zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(
      {
        ...BASE_SNAPSHOT,
        temporaryOperationalRules: [
          {
            effectiveFrom: '2026-07-14T00:00:00.000Z',
            effectiveTo: '2026-07-15T00:00:00.000Z',
            pickupEnabled: false,
            reason: 'Maintenance window',
          },
        ],
      },
      { at },
    );
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.CLOSED);
    expect(
      result.pickup.reasons.some(
        (r) => r.code === StationOperationalCapabilityReasonCode.TEMPORARY_RULE_OVERRIDE,
      ),
    ).toBe(true);
  });

  it('evaluates Berlin DST spring-forward Tuesday morning as open', () => {
    const at = zonedLocalTimeToUtc('2026-03-31', '10:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(BASE_SNAPSHOT, { at });
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.PICKUP_AVAILABLE);
    expect(result.return.kind).toBe(StationOperationalCapabilityKind.RETURN_AVAILABLE);
  });

  it('evaluates Berlin DST fall-back Monday evening return as manual confirmation', () => {
    const at = zonedLocalTimeToUtc('2026-10-26', '19:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(BASE_SNAPSHOT, { at });
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.CLOSED);
    expect(result.return.kind).toBe(
      StationOperationalCapabilityKind.MANUAL_CONFIRMATION_REQUIRED,
    );
  });

  it('respects calendar exception closure in Berlin timezone', () => {
    const at = zonedLocalTimeToUtc('2026-07-14', '10:00', BERLIN)!;
    const result = resolveStationOperationalCapabilities(
      {
        ...BASE_SNAPSHOT,
        calendarExceptions: [
          {
            id: 'exc-1',
            type: StationCalendarExceptionType.STATION_CLOSURE,
            calendarDate: '2026-07-14',
            closedAllDay: true,
            title: 'Closed for event',
          },
        ],
      },
      { at },
    );
    expect(result.pickup.kind).toBe(StationOperationalCapabilityKind.CLOSED);
    expect(result.pickup.effectiveRule?.source).toBe('station.calendar_exception');
  });

  it('merges overlapping temporary rules with latest effectiveFrom winning per field', () => {
    const at = new Date('2026-07-14T12:00:00.000Z');
    const merged = mergeEffectiveCapabilities(
      {
        ...BASE_SNAPSHOT,
        temporaryOperationalRules: [
          {
            effectiveFrom: '2026-07-14T00:00:00.000Z',
            pickupEnabled: false,
          },
          {
            effectiveFrom: '2026-07-14T10:00:00.000Z',
            pickupEnabled: true,
            returnEnabled: false,
          },
        ],
      },
      at,
    );
    expect(merged.pickupEnabled).toBe(true);
    expect(merged.returnEnabled).toBe(false);
  });
});
