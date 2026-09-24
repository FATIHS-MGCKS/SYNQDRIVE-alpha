import { BrakingEventCanonicalType, BrakingEventPrimarySource } from '@prisma/client';
import {
  interpretLedgerRowForUncertainObdTime,
  isHfAbuseFullBrakingLedgerRow,
} from './braking-event-ledger.domain';
import { BrakeRecalculationInputLoader } from './brake-recalculation-input.loader';
import { BrakingEventLedgerService } from './braking-event-ledger.service';

const R1_RAW_JSON = { aftermarketDevice: { serial: 'R1-TEST-0001' } };
const TESLA_RAW_JSON = { aftermarketDevice: null, syntheticDevice: { tokenId: 7 } };

describe('Braking ledger read-time interpretation for uncertain OBD time (EXP-021 C0.3)', () => {
  const row = (canonicalType: BrakingEventCanonicalType, primarySource: BrakingEventPrimarySource) => ({
    id: 'r',
    canonicalType,
    primarySource,
  });

  it('excludes HF-abuse FULL_BRAKING incidents', () => {
    const r = row(BrakingEventCanonicalType.FULL_BRAKING, BrakingEventPrimarySource.SYNQDRIVE_HF_ABUSE);
    expect(isHfAbuseFullBrakingLedgerRow(r)).toBe(true);
    expect(interpretLedgerRowForUncertainObdTime(r)).toBeNull();
  });

  it('keeps provider evidence upgraded to FULL_BRAKING as EXTREME_BRAKING', () => {
    const r = row(BrakingEventCanonicalType.FULL_BRAKING, BrakingEventPrimarySource.DIMO_PROVIDER);
    expect(interpretLedgerRowForUncertainObdTime(r)).toEqual({
      ...r,
      canonicalType: BrakingEventCanonicalType.EXTREME_BRAKING,
    });
    expect(r.canonicalType).toBe(BrakingEventCanonicalType.FULL_BRAKING);
  });

  it('passes other incidents through unchanged', () => {
    const r = row(BrakingEventCanonicalType.HARSH_BRAKING, BrakingEventPrimarySource.SYNQDRIVE_HF_ABUSE);
    expect(interpretLedgerRowForUncertainObdTime(r)).toBe(r);
  });
});

describe('BrakingEventLedgerService.getCanonicalSummaryForTrip uncertain OBD option', () => {
  function ledgerRow(canonicalType: string, primarySource: string, minute: number) {
    return {
      organizationId: 'org-1',
      vehicleId: 'v1',
      tripId: 't1',
      occurredAt: new Date(`2026-02-01T08:${String(minute).padStart(2, '0')}:00Z`),
      canonicalType,
      severity: 'HIGH',
      primarySource,
      providerEventId: null,
      confidence: 'HIGH',
      peakDecelerationMs2: 8,
      startSpeedKmh: 60,
      correlatedSourceIds: [],
    };
  }

  function makeService(rows: unknown[]) {
    const prisma = {
      brakingEventLedger: {
        findMany: jest.fn().mockResolvedValue(rows),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    } as any;
    return { prisma, service: new BrakingEventLedgerService(prisma) };
  }

  it('drops HF-abuse FULL_BRAKING and downgrades upgraded provider incidents without writes', async () => {
    const { prisma, service } = makeService([
      ledgerRow('FULL_BRAKING', 'SYNQDRIVE_HF_ABUSE', 10),
      ledgerRow('FULL_BRAKING', 'DIMO_PROVIDER', 20),
    ]);
    const summary = await service.getCanonicalSummaryForTrip('t1', { uncertainObdRecordTime: true });
    expect(summary?.fullBrakingCount).toBe(0);
    expect(summary?.extremeBraking).toBe(1);
    expect(prisma.brakingEventLedger.update).not.toHaveBeenCalled();
    expect(prisma.brakingEventLedger.updateMany).not.toHaveBeenCalled();
  });

  it('returns the persisted classification without the option', async () => {
    const { service } = makeService([
      ledgerRow('FULL_BRAKING', 'SYNQDRIVE_HF_ABUSE', 10),
      ledgerRow('FULL_BRAKING', 'DIMO_PROVIDER', 20),
    ]);
    const summary = await service.getCanonicalSummaryForTrip('t1');
    expect(summary?.fullBrakingCount).toBe(2);
  });
});

describe('BrakeRecalculationInputLoader R1 containment (EXP-021 C0.3)', () => {
  function makePrisma(rawJson: unknown) {
    return {
      brakeHealthCurrent: {
        findUnique: jest.fn().mockResolvedValue({
          isInitialized: true,
          anchorServiceDate: new Date('2026-01-01T00:00:00Z'),
          anchorOdometerKm: 10_000,
          anchorValidationStatus: 'VALIDATED',
          calibrationCount: 0,
          frontPadAnchorMm: 10,
          rearPadAnchorMm: 9,
          frontDiscAnchorMm: 25,
          rearDiscAnchorMm: 20,
          frontPadKFactor: 1,
          rearPadKFactor: 1,
          frontDiscKFactor: 1,
          rearDiscKFactor: 1,
          lastRecalculatedAt: null,
          updatedAt: new Date('2026-02-01T00:00:00Z'),
        }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          fuelType: 'PETROL',
          brakeForceFrontPercent: 65,
          dimoVehicle: { rawJson },
        }),
      },
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue({ odometerKm: 12_000 }) },
      brakeComponentInstallation: { findMany: jest.fn().mockResolvedValue([]) },
      vehicleBrakeReferenceSpec: { findMany: jest.fn().mockResolvedValue([]) },
      brakeEvidence: { findMany: jest.fn().mockResolvedValue([]) },
      tripDrivingImpact: {
        findMany: jest.fn().mockResolvedValue([
          {
            tripStartedAt: new Date('2026-02-01T08:00:00Z'),
            updatedAt: new Date('2026-02-01T09:00:00Z'),
            distanceKm: 50,
            authoritativeDistanceKm: 50,
            hardBrakePer100Km: 4,
            fullBrakingPer100Km: 2,
          },
        ]),
      },
      brakingEventLedger: {
        findMany: jest.fn().mockResolvedValue([
          {
            canonicalType: 'FULL_BRAKING',
            primarySource: 'SYNQDRIVE_HF_ABUSE',
            occurredAt: new Date('2026-02-01T08:10:00Z'),
          },
          {
            canonicalType: 'FULL_BRAKING',
            primarySource: 'DIMO_PROVIDER',
            occurredAt: new Date('2026-02-01T08:20:00Z'),
          },
          {
            canonicalType: 'HARSH_BRAKING',
            primarySource: 'DIMO_PROVIDER',
            occurredAt: new Date('2026-02-01T08:30:00Z'),
          },
        ]),
      },
      vehicleDtcEvent: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
  }

  it('excludes R1 HF FULL_BRAKING from brake-wear inputs', async () => {
    const loader = new BrakeRecalculationInputLoader(makePrisma(R1_RAW_JSON));
    const ctx = await loader.loadAsOf('v1', new Date('2026-03-01T00:00:00Z'));
    expect(ctx?.tdiAggregate.fullBrakingPer100KmSum).toBe(0);
    expect(ctx?.tdiAggregate.hardBrakePer100KmSum).toBe(4);
    expect(ctx?.ledgerAggregate).toMatchObject({
      totalEvents: 2,
      fullBraking: 0,
      extremeBraking: 1,
      harshBraking: 1,
    });
  });

  it('keeps Tesla (API synthetic) brake-wear inputs unchanged', async () => {
    const loader = new BrakeRecalculationInputLoader(makePrisma(TESLA_RAW_JSON));
    const ctx = await loader.loadAsOf('v1', new Date('2026-03-01T00:00:00Z'));
    expect(ctx?.tdiAggregate.fullBrakingPer100KmSum).toBe(2);
    expect(ctx?.ledgerAggregate).toMatchObject({
      totalEvents: 3,
      fullBraking: 2,
      extremeBraking: 0,
      harshBraking: 1,
    });
  });
});
