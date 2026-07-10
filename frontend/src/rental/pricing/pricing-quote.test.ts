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

  it('buildBookingCreatePayload supports quoteId without client totals', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/rental/lib/entityMappers.ts'),
      'utf8',
    );
    expect(source).toContain('quoteId?: string');
    expect(source).toContain('...(args.quoteId ? { quoteId: args.quoteId } : {})');
  });
});
