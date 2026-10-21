import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import {
  buildUpsertPayload,
  canonicalMeasurementEquals,
  coalesceSegments,
  isMateriallyIdentical,
  normalizeRawDetectionMeta,
  roundToCanonicalMeasurementPrecision,
  type EnergyEventUpsertPayload,
  type MaterializedEnergyEventRow,
} from './energy-events.pipeline';
import { simulateRecoveryWindow } from './energy-events-recovery-dry-run';

const VEHICLE_ID = 'clveh1234567890123456789012';
const TOKEN_ID = 4242;

function buildRecharge(
  overrides: Partial<DimoEnergyEventSegment> = {},
): DimoEnergyEventSegment {
  return {
    segmentId: `dimo-recharge-${TOKEN_ID}-1784246702926`,
    mechanism: 'recharge',
    startTime: '2026-07-17T00:05:02.926Z',
    endTime: '2026-07-17T07:22:51.875Z',
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 26268,
    startLatitude: 51.31,
    startLongitude: 9.49,
    endLatitude: 51.31,
    endLongitude: 9.49,
    odometerStartKm: 179360.35151915916,
    odometerEndKm: 179361.51151921425,
    fuelStartLiters: null,
    fuelEndLiters: null,
    fuelDeltaLiters: null,
    fuelStartPercent: null,
    fuelEndPercent: null,
    fuelDeltaPercent: null,
    socStartPercent: 96.7032967032967,
    socEndPercent: 100,
    socDeltaPercent: 3.296703296703299,
    energyStartKwh: 52.999998815357685,
    energyEndKwh: 55.23999876528978,
    energyDeltaKwh: 2.2399999499320984,
    ...overrides,
  };
}

function payloadFor(segment: DimoEnergyEventSegment): EnergyEventUpsertPayload {
  return buildUpsertPayload(VEHICLE_ID, coalesceSegments([segment])[0]);
}

function rowFor(
  payload: EnergyEventUpsertPayload,
  overrides: Partial<MaterializedEnergyEventRow> = {},
): MaterializedEnergyEventRow {
  return {
    kind: payload.kind,
    detectionMechanism: payload.detectionMechanism,
    startTime: payload.startTime,
    endTime: payload.endTime,
    durationSeconds: payload.durationSeconds,
    startLatitude: payload.startLatitude,
    startLongitude: payload.startLongitude,
    endLatitude: payload.endLatitude,
    endLongitude: payload.endLongitude,
    fuelDeltaLiters: payload.fuelDeltaLiters,
    fuelDeltaPercent: payload.fuelDeltaPercent,
    socDeltaPercent: payload.socDeltaPercent,
    energyDeltaKwh: payload.energyDeltaKwh,
    odometerStartKm: payload.odometerStartKm,
    odometerEndKm: payload.odometerEndKm,
    confidence: payload.confidence,
    rawDetectionMeta: payload.rawDetectionMeta,
    ...overrides,
  };
}

/**
 * The database driver serializes doubles with at most 16 significant decimal
 * digits, so a stored measurement is the 16-digit rounding of the detected one.
 * Values below reproduce production rows observed during the E3A recovery.
 */
function to16SignificantDigits(value: number): number {
  return Number(value.toPrecision(16));
}

describe('canonical measurement precision', () => {
  it('treats a 16-significant-digit storage round-trip as the same measurement', () => {
    expect(canonicalMeasurementEquals(2.2399999499320984, 2.239999949932098)).toBe(
      true,
    );
    expect(canonicalMeasurementEquals(11.636887154233477, 11.63688715423348)).toBe(
      true,
    );
    expect(
      canonicalMeasurementEquals(179360.35151915916, 179360.3515191592),
    ).toBe(true);
    expect(canonicalMeasurementEquals(12.941176470588236, 12.94117647058824)).toBe(
      true,
    );
  });

  it('still separates measurements that differ at canonical precision', () => {
    expect(canonicalMeasurementEquals(11.636887154233477, 11.736887154233477)).toBe(
      false,
    );
    expect(canonicalMeasurementEquals(1.00000000000001, 1.00000000000002)).toBe(
      false,
    );
    expect(canonicalMeasurementEquals(0, 0.0000001)).toBe(false);
  });

  it('keeps null semantics distinct from zero', () => {
    expect(canonicalMeasurementEquals(null, null)).toBe(true);
    expect(canonicalMeasurementEquals(undefined, null)).toBe(true);
    expect(canonicalMeasurementEquals(null, 0)).toBe(false);
    expect(canonicalMeasurementEquals(0, 0)).toBe(true);
  });

  it('rounds to canonical precision without shifting magnitude', () => {
    expect(roundToCanonicalMeasurementPrecision(0)).toBe(0);
    expect(roundToCanonicalMeasurementPrecision(2.2399999499320984)).toBe(
      2.2399999499321,
    );
    expect(roundToCanonicalMeasurementPrecision(Number.NaN)).toBeNaN();
  });
});

describe('isMateriallyIdentical — storage precision', () => {
  it('is stable for a repeated detection of the same segment', () => {
    const payload = payloadFor(buildRecharge());
    expect(isMateriallyIdentical(rowFor(payload), payload)).toBe(true);
  });

  it('returns NO_OP for a row that only lost storage precision on write', () => {
    const payload = payloadFor(buildRecharge());
    const storedRow = rowFor(payload, {
      energyDeltaKwh: to16SignificantDigits(payload.energyDeltaKwh!),
      odometerStartKm: to16SignificantDigits(payload.odometerStartKm!),
      odometerEndKm: to16SignificantDigits(payload.odometerEndKm!),
    });

    expect(storedRow.energyDeltaKwh).not.toBe(payload.energyDeltaKwh);
    expect(isMateriallyIdentical(storedRow, payload)).toBe(true);
  });

  it('converges after a write instead of re-issuing the same UPDATE forever', () => {
    const segment = buildRecharge();
    // Model the write path: persisting a payload rounds every measurement to the
    // precision the driver can serialize, so the row read back is never the
    // exact double the detector produced.
    const persist = (
      payload: EnergyEventUpsertPayload,
    ): MaterializedEnergyEventRow =>
      rowFor(payload, {
        socDeltaPercent: to16SignificantDigits(payload.socDeltaPercent!),
        energyDeltaKwh: to16SignificantDigits(payload.energyDeltaKwh!),
        odometerStartKm: to16SignificantDigits(payload.odometerStartKm!),
        odometerEndKm: to16SignificantDigits(payload.odometerEndKm!),
        rawDetectionMeta: Object.fromEntries(
          Object.entries(payload.rawDetectionMeta).map(([key, value]) => [
            key,
            typeof value === 'number' ? to16SignificantDigits(value) : value,
          ]),
        ),
      });

    let storedRow = persist(payloadFor(segment));
    for (let detectionRun = 0; detectionRun < 3; detectionRun++) {
      const payload = payloadFor(segment);
      expect(isMateriallyIdentical(storedRow, payload)).toBe(true);
      storedRow = persist(payload);
    }
  });

  it('still reports an UPDATE for a real measurement change', () => {
    const payload = payloadFor(buildRecharge());
    const storedRow = rowFor(payload, { socDeltaPercent: 3.4 });

    expect(isMateriallyIdentical(storedRow, payload)).toBe(false);
  });

  it('returns NO_OP when only rawDetectionMeta lost storage precision', () => {
    const payload = payloadFor(
      buildRecharge({
        mechanism: 'refuel',
        segmentId: `dimo-refuel-${TOKEN_ID}-1787501715000`,
        socStartPercent: null,
        socEndPercent: null,
        socDeltaPercent: null,
        energyStartKwh: null,
        energyEndKwh: null,
        energyDeltaKwh: null,
        fuelStartLiters: 12,
        fuelEndLiters: 28,
        fuelDeltaLiters: 16,
        fuelStartPercent: 12.941176470588236,
        fuelEndPercent: 42.35294117647059,
        fuelDeltaPercent: 29.41176470588235,
      }),
    );
    const meta = payload.rawDetectionMeta as Record<string, unknown>;
    const storedRow = rowFor(payload, {
      rawDetectionMeta: {
        ...meta,
        fuelStartPercent: to16SignificantDigits(meta.fuelStartPercent as number),
      },
    });

    expect((storedRow.rawDetectionMeta as Record<string, unknown>).fuelStartPercent)
      .not.toBe(meta.fuelStartPercent);
    expect(isMateriallyIdentical(storedRow, payload)).toBe(true);
  });

  it('still reports an UPDATE for a semantic rawDetectionMeta change', () => {
    const payload = payloadFor(buildRecharge());
    const meta = payload.rawDetectionMeta as Record<string, unknown>;
    const storedRow = rowFor(payload, {
      rawDetectionMeta: { ...meta, socEndPercent: 98 },
    });

    expect(isMateriallyIdentical(storedRow, payload)).toBe(false);
  });

  it('ignores jsonb key ordering but not provenance content', () => {
    const payload = payloadFor(buildRecharge());
    const meta = payload.rawDetectionMeta as Record<string, unknown>;
    const reordered = Object.fromEntries(
      Object.entries(meta).reverse(),
    ) as Record<string, unknown>;

    expect(isMateriallyIdentical(rowFor(payload, { rawDetectionMeta: reordered }), payload)).toBe(
      true,
    );
    expect(
      isMateriallyIdentical(
        rowFor(payload, {
          rawDetectionMeta: { ...meta, coalescedFromSegmentIds: ['other'] },
        }),
        payload,
      ),
    ).toBe(false);
  });

  it('normalizes metadata for comparison without mutating semantics', () => {
    expect(
      normalizeRawDetectionMeta({ b: 1, a: 2.2399999499320984 }),
    ).toEqual({ a: 2.2399999499321, b: 1 });
    expect(normalizeRawDetectionMeta(null)).toEqual({});
    expect(normalizeRawDetectionMeta('not-an-object')).toEqual({});
  });
});

describe('recovery classification — storage precision', () => {
  it('classifies a precision-only difference as ALREADY_IDENTICAL', () => {
    const segment = buildRecharge();
    const payload = payloadFor(segment);
    const storedRow = {
      id: 'row-1',
      dimoSegmentId: payload.dimoSegmentId,
      kind: payload.kind as string,
      detectionMechanism: payload.detectionMechanism,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationSeconds: payload.durationSeconds,
      startLatitude: payload.startLatitude,
      startLongitude: payload.startLongitude,
      endLatitude: payload.endLatitude,
      endLongitude: payload.endLongitude,
      fuelDeltaLiters: payload.fuelDeltaLiters,
      fuelDeltaPercent: payload.fuelDeltaPercent,
      socDeltaPercent: to16SignificantDigits(payload.socDeltaPercent!),
      energyDeltaKwh: to16SignificantDigits(payload.energyDeltaKwh!),
      odometerStartKm: to16SignificantDigits(payload.odometerStartKm!),
      odometerEndKm: to16SignificantDigits(payload.odometerEndKm!),
      confidence: payload.confidence,
      rawDetectionMeta: payload.rawDetectionMeta,
    };

    const result = simulateRecoveryWindow({
      vehicleId: VEHICLE_ID,
      label: 'V1',
      tokenId: TOKEN_ID,
      windowFrom: new Date('2026-07-17T00:00:00.000Z'),
      windowTo: new Date('2026-07-18T00:00:00.000Z'),
      segments: [segment],
      mechanismOutcomes: [
        {
          mechanism: 'recharge',
          status: 'SUCCESS_WITH_EVENTS',
          segments: [segment],
          windowFrom: '2026-07-17T00:00:00.000Z',
          windowTo: '2026-07-18T00:00:00.000Z',
          tokenId: TOKEN_ID,
        },
      ],
      existingEvents: [storedRow],
      detectorConfigVersion: 'e2-2026-08',
    });

    expect(
      result.candidates.map((candidate) => candidate.classification),
    ).toEqual(['ALREADY_IDENTICAL']);
  });

  it('keeps WOULD_UPDATE when the stored measurement really changed', () => {
    const segment = buildRecharge();
    const payload = payloadFor(segment);
    const storedRow = {
      id: 'row-1',
      dimoSegmentId: payload.dimoSegmentId,
      kind: payload.kind as string,
      detectionMechanism: payload.detectionMechanism,
      startTime: payload.startTime,
      endTime: payload.endTime,
      durationSeconds: payload.durationSeconds,
      startLatitude: payload.startLatitude,
      startLongitude: payload.startLongitude,
      endLatitude: payload.endLatitude,
      endLongitude: payload.endLongitude,
      fuelDeltaLiters: payload.fuelDeltaLiters,
      fuelDeltaPercent: payload.fuelDeltaPercent,
      socDeltaPercent: 2.5,
      energyDeltaKwh: payload.energyDeltaKwh,
      odometerStartKm: payload.odometerStartKm,
      odometerEndKm: payload.odometerEndKm,
      confidence: payload.confidence,
      rawDetectionMeta: payload.rawDetectionMeta,
    };

    const result = simulateRecoveryWindow({
      vehicleId: VEHICLE_ID,
      label: 'V1',
      tokenId: TOKEN_ID,
      windowFrom: new Date('2026-07-17T00:00:00.000Z'),
      windowTo: new Date('2026-07-18T00:00:00.000Z'),
      segments: [segment],
      mechanismOutcomes: [
        {
          mechanism: 'recharge',
          status: 'SUCCESS_WITH_EVENTS',
          segments: [segment],
          windowFrom: '2026-07-17T00:00:00.000Z',
          windowTo: '2026-07-18T00:00:00.000Z',
          tokenId: TOKEN_ID,
        },
      ],
      existingEvents: [storedRow],
      detectorConfigVersion: 'e2-2026-08',
    });

    expect(
      result.candidates.map((candidate) => candidate.classification),
    ).toEqual(['WOULD_UPDATE']);
  });
});
