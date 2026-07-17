import {
  DocumentExtractionPlausibilityService,
  PlausibilityVehicleContext,
} from './document-extraction-plausibility.service';

describe('DocumentExtractionPlausibilityService', () => {
  const svc = new DocumentExtractionPlausibilityService();
  const baseCtx: PlausibilityVehicleContext = {
    vin: 'WVWZZZ1KZAW000001',
    licensePlate: 'B-AB-1234',
    lastKnownOdometerKm: 50_000,
    dimoContextAvailable: false,
  };

  const codes = (r: ReturnType<typeof svc.runChecks>) => r.checks.map((c) => c.code);

  it('returns OK with no checks for clean SERVICE data', () => {
    const result = svc.runChecks(
      'SERVICE',
      { eventDate: '2026-01-10', odometerKm: 50_500, workshopName: 'A' },
      baseCtx,
    );
    expect(result.overallStatus).toBe('OK');
    expect(result.checks).toHaveLength(0);
  });

  it('flags a negative odometer as a BLOCKER', () => {
    const result = svc.runChecks('SERVICE', { odometerKm: -5 }, baseCtx);
    expect(result.overallStatus).toBe('BLOCKER');
    expect(codes(result)).toContain('ODOMETER_NEGATIVE');
  });

  it('warns when odometer is far below last known mileage', () => {
    // Needs to be >= 50_000 km below last known to trip the check.
    const result = svc.runChecks(
      'SERVICE',
      { odometerKm: 1_000 },
      { ...baseCtx, lastKnownOdometerKm: 120_000 },
    );
    expect(result.overallStatus).toBe('WARNING');
    expect(codes(result)).toContain('ODOMETER_FAR_BELOW_KNOWN');
  });

  it('warns when odometer is far above last known mileage', () => {
    const result = svc.runChecks('SERVICE', { odometerKm: 400_000 }, baseCtx);
    expect(codes(result)).toContain('ODOMETER_FAR_ABOVE_KNOWN');
  });

  it('warns on a future event date', () => {
    const future = new Date(Date.now() + 1000 * 3600 * 24 * 30).toISOString().slice(0, 10);
    const result = svc.runChecks('SERVICE', { eventDate: future }, baseCtx);
    expect(codes(result)).toContain('EVENT_DATE_FUTURE');
  });

  it('warns when a document VIN does not match the selected vehicle', () => {
    const result = svc.runChecks('SERVICE', { vin: 'DIFFERENTVIN0000001' }, baseCtx);
    expect(codes(result)).toContain('VIN_MISMATCH');
  });

  it('blocks FINE when license plate does not match the selected vehicle', () => {
    const result = svc.runChecks(
      'FINE',
      { licensePlate: 'KS-FH-660E', eventDate: '2025-10-24', totalCents: 1750 },
      { ...baseCtx, licensePlate: 'B-AB-1234' },
    );
    expect(result.overallStatus).toBe('BLOCKER');
    expect(codes(result)).toContain('PLATE_MISMATCH');
  });

  it('runs invoice plausibility checks for INVOICE documents', () => {
    const result = svc.runChecks(
      'INVOICE',
      {
        invoiceNumber: 'INV-BAD',
        currency: 'EUR',
        subtotalNet: 10000,
        totalTax: 1900,
        totalGross: 12500,
        amountSemantics: 'EXPLICIT',
        taxSemantics: 'EXPLICIT',
      },
      baseCtx,
    );
    expect(codes(result)).toContain('INVOICE_NET_GROSS_INCONSISTENT');
  });

  it('warns when TUV validity is before the inspection date', () => {
    const result = svc.runChecks(
      'TUV_REPORT',
      { eventDate: '2026-05-01', validUntil: '2026-01-01' },
      baseCtx,
    );
    expect(codes(result)).toContain('VALIDITY_BEFORE_INSPECTION');
  });

  it('warns on an out-of-range 12V battery voltage', () => {
    const result = svc.runChecks('BATTERY', { scope: 'lv', voltageV: 99 }, baseCtx);
    expect(codes(result)).toContain('LV_VOLTAGE_RANGE');
  });

  it('warns on an out-of-range state of health', () => {
    const result = svc.runChecks('BATTERY', { scope: 'hv', sohPercent: 150 }, baseCtx);
    expect(codes(result)).toContain('SOH_RANGE');
  });

  it('blocks on a negative tread depth and warns on an implausibly high one', () => {
    const result = svc.runChecks(
      'TIRE',
      { treadDepthMm: { fl: -1, fr: 20, rl: 5, rr: 5 } },
      baseCtx,
    );
    expect(result.overallStatus).toBe('BLOCKER');
    expect(codes(result)).toContain('TREAD_NEGATIVE_FL');
    expect(codes(result)).toContain('TREAD_IMPLAUSIBLE_FR');
  });

  it('never asserts a crash for DAMAGE/ACCIDENT, only adds a review note', () => {
    const result = svc.runChecks('ACCIDENT', { description: 'rear bumper' }, baseCtx);
    expect(result.recommendedHumanReviewNotes.length).toBeGreaterThan(0);
    // No automatic collision claim → no BLOCKER from this alone.
    expect(result.overallStatus).not.toBe('BLOCKER');
  });
});
