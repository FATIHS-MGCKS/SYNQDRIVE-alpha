import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { StationBookingRuleOutcome } from '@shared/stations/station-booking-rules.contract';
import { assessBookingRulesManualOverride } from '@shared/stations/station-booking-rules-manual-override';
import { evaluateStationBookingRules } from '@shared/stations/station-booking-rules.resolver';
import { StationRuleManualOverrideReferenceType } from '@shared/stations/station-rule-manual-override.contract';
import { StationRuleManualOverrideService } from './station-rule-manual-override.service';
import { StationBookingRulesService } from './station-booking-rules.service';
import { StationsAccessService } from './stations-access.service';
import { StationAccessScopeService } from '@shared/stations/station-access-scope.service';

const ORG = 'org-override';
const STATION = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: ORG,
  status: 'ACTIVE' as const,
  pickupEnabled: true,
  returnEnabled: true,
  afterHoursReturnEnabled: false,
  keyBoxAvailable: false,
  timezone: 'Europe/Berlin',
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
  capacity: null,
};

describe('Station rule manual override integration', () => {
  const prisma = {
    station: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn(), findMany: jest.fn() },
    booking: { count: jest.fn() },
    vehicleStationTransfer: { count: jest.fn() },
    stationRuleManualOverride: { create: jest.fn() },
  } as unknown as PrismaService;

  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  const stationAccessScope = {
    resolveFromContextOrEmpty: jest.fn().mockReturnValue({ orgId: ORG }),
    requireReadableStation: jest.fn().mockResolvedValue(STATION),
  } as unknown as StationAccessScopeService;

  const stationsAccess = {
    assertStationsPermission: jest.fn().mockResolvedValue(undefined),
  } as unknown as StationsAccessService;

  const manualOverrideService = new StationRuleManualOverrideService(prisma, audit);
  const service = new StationBookingRulesService(
    prisma,
    stationAccessScope,
    stationsAccess,
    manualOverrideService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.stationRuleManualOverride.create as jest.Mock).mockResolvedValue({
      id: 'override-1',
      organizationId: ORG,
      referenceType: StationRuleManualOverrideReferenceType.BOOKING_RULES,
      bookingId: null,
      transferId: null,
      scopeFingerprint: 'fingerprint',
      scopeSnapshot: {},
      permission: 'stations.override_rules',
      reason: 'Operator approved after-hours pickup',
      actorUserId: 'user-1',
      originalRuleResults: [],
      grantedAt: new Date('2026-07-14T18:00:00.000Z'),
      expiresAt: new Date('2026-07-14T19:00:00.000Z'),
    });
  });

  it('marks manualOverrideRequired without persisting when override is missing', async () => {
    const result = await service.evaluateRequest(
      ORG,
      {
        pickupStationId: STATION.id,
        returnStationId: STATION.id,
        pickupDateTime: '2026-07-14T20:00:00.000Z',
        returnDateTime: '2026-07-17T10:00:00.000Z',
        bookingType: 'STANDARD',
      },
      undefined,
    );

    expect(result.manualOverrideRequired).toBe(true);
    expect(result.manualOverrideApplied).toBe(false);
    expect(prisma.stationRuleManualOverride.create).not.toHaveBeenCalled();
  });

  it('persists audited override when permission, reason, and actor are supplied', async () => {
    const result = await service.evaluateRequest(
      ORG,
      {
        pickupStationId: STATION.id,
        returnStationId: STATION.id,
        pickupDateTime: '2026-07-14T20:00:00.000Z',
        returnDateTime: '2026-07-17T10:00:00.000Z',
        bookingType: 'STANDARD',
        bookingContext: {
          manualOverride: {
            reason: 'Operator approved after-hours pickup',
          },
        },
      },
      undefined,
      { id: 'user-1' },
    );

    expect(result.manualOverrideApplied).toBe(true);
    expect(result.pickup.outcome).toBe(StationBookingRuleOutcome.ALLOWED);
    expect(prisma.stationRuleManualOverride.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects override without authenticated actor', async () => {
    await expect(
      service.evaluateRequest(
        ORG,
        {
          pickupStationId: STATION.id,
          returnStationId: STATION.id,
          pickupDateTime: '2026-07-14T20:00:00.000Z',
          returnDateTime: '2026-07-17T10:00:00.000Z',
          bookingType: 'STANDARD',
          bookingContext: {
            manualOverride: {
              reason: 'Operator approved after-hours pickup',
            },
          },
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('assessBookingRulesManualOverride', () => {
  it('does not auto-reuse override when evaluate is called again without manualOverride', () => {
    const base = evaluateStationBookingRules({
      organizationId: ORG,
      pickupStation: STATION,
      returnStation: STATION,
      pickupDateTime: '2026-07-14T20:00:00.000Z',
      returnDateTime: '2026-07-17T10:00:00.000Z',
      bookingType: 'STANDARD',
    });

    const first = assessBookingRulesManualOverride({
      result: base,
      manualOverride: { reason: 'Operator approved after-hours pickup' },
      actorUserId: 'user-1',
      scope: {
        organizationId: ORG,
        pickupStationId: STATION.id,
        returnStationId: STATION.id,
        pickupDateTime: '2026-07-14T20:00:00.000Z',
        returnDateTime: '2026-07-17T10:00:00.000Z',
        bookingType: 'STANDARD',
      },
      reference: { type: StationRuleManualOverrideReferenceType.BOOKING_RULES },
    });

    const second = assessBookingRulesManualOverride({
      result: base,
      scope: {
        organizationId: ORG,
        pickupStationId: STATION.id,
        returnStationId: STATION.id,
        pickupDateTime: '2026-07-14T20:00:00.000Z',
        returnDateTime: '2026-07-17T10:00:00.000Z',
        bookingType: 'STANDARD',
      },
      reference: { type: StationRuleManualOverrideReferenceType.BOOKING_RULES },
    });

    expect(first.manualOverrideApplied).toBe(true);
    expect(second.manualOverrideRequired).toBe(true);
    expect(second.manualOverrideApplied).toBe(false);
  });
});
