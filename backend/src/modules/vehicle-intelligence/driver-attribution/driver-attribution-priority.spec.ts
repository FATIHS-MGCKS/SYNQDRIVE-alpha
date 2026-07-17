import { DriverAttributionType, DrivingAttributionConfidence } from '@prisma/client';
import {
  compareDriverAttributionPriority,
  pickCanonicalDriverAttribution,
} from './driver-attribution-priority';

describe('driver-attribution priority', () => {
  const base = (type: DriverAttributionType, confidence: DrivingAttributionConfidence = 'MEDIUM') => ({
    attributionType: type,
    confidence,
    resolvedAt: null,
    validFrom: new Date('2026-07-16T08:00:00Z'),
    validUntil: new Date('2026-07-16T09:00:00Z'),
  });

  it('CONFIRMED_DRIVER outranks TIME_WINDOW_MATCH', () => {
    expect(
      compareDriverAttributionPriority(
        base(DriverAttributionType.CONFIRMED_DRIVER),
        base(DriverAttributionType.TIME_WINDOW_MATCH),
      ),
    ).toBeGreaterThan(0);
  });

  it('ASSIGNED_DRIVER outranks BOOKING_CUSTOMER_ONLY', () => {
    expect(
      compareDriverAttributionPriority(
        base(DriverAttributionType.ASSIGNED_DRIVER),
        base(DriverAttributionType.BOOKING_CUSTOMER_ONLY),
      ),
    ).toBeGreaterThan(0);
  });

  it('manual resolution outranks stronger automatic type', () => {
    const manual = {
      ...base(DriverAttributionType.TIME_WINDOW_MATCH, 'LOW'),
      resolvedAt: new Date('2026-07-16T08:30:00Z'),
    };
    const automatic = base(DriverAttributionType.CONFIRMED_DRIVER, 'HIGH');
    expect(compareDriverAttributionPriority(manual, automatic)).toBeGreaterThan(0);
  });

  it('pickCanonicalDriverAttribution selects highest-priority active row', () => {
    const at = new Date('2026-07-16T08:30:00Z');
    const canonical = pickCanonicalDriverAttribution(
      [
        base(DriverAttributionType.TIME_WINDOW_MATCH),
        base(DriverAttributionType.CONFIRMED_DRIVER),
        base(DriverAttributionType.UNKNOWN),
      ],
      at,
    );
    expect(canonical?.attributionType).toBe(DriverAttributionType.CONFIRMED_DRIVER);
  });

  it('ignores rows outside validity window', () => {
    const at = new Date('2026-07-16T10:00:00Z');
    const canonical = pickCanonicalDriverAttribution(
      [base(DriverAttributionType.CONFIRMED_DRIVER)],
      at,
    );
    expect(canonical).toBeNull();
  });
});
