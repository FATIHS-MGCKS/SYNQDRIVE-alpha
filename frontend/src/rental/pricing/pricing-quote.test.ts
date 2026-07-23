import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('booking pricing quote flow', () => {
  it('NewBookingView sends quoteId in booking payload', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/components/NewBookingView.tsx'),
      'utf8',
    );
    expect(source).toContain('quoteId: priceSim.quoteId');
    expect(source).not.toContain('totalPriceEuro');
    expect(source).toContain('isPricingQuoteStaleError');
  });

  it('OperatorBookingFormSheet requires quoteId for create', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/operator/bookings/OperatorBookingFormSheet.tsx'),
      'utf8',
    );
    expect(source).toContain('usePricingSimulation');
    expect(source).toContain('quoteId: priceSim.quoteId');
    expect(source).not.toContain("currency: 'eur'");
  });

  it('buildBookingCreatePayload uses flat ids and requires quoteId', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/lib/entityMappers.ts'),
      'utf8',
    );
    expect(source).toContain('quoteId: args.quoteId');
    expect(source).toContain('customerId: args.customerId');
    expect(source).toContain('vehicleId: args.vehicleId');
    expect(source).not.toContain('customer: { connect');
  });
});
