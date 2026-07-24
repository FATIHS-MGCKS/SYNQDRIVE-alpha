import * as fc from 'fast-check';
import { MoneyDomainError } from '@synq/money/money.contract';
import {
  addMoney,
  majorUnitsStringToMinor,
  moneyFromMinor,
  subtractMoney,
  sumMoney,
} from '@synq/money/money.util';

const eurArb = fc.integer({ min: -999_999_999, max: 999_999_999 });

describe('money domain property invariants (fast-check)', () => {
  it('addMoney is associative for same currency', () => {
    fc.assert(
      fc.property(eurArb, eurArb, eurArb, (a, b, c) => {
        const ma = moneyFromMinor(a, 'EUR');
        const mb = moneyFromMinor(b, 'EUR');
        const mc = moneyFromMinor(c, 'EUR');
        const left = addMoney(addMoney(ma, mb), mc);
        const right = addMoney(ma, addMoney(mb, mc));
        expect(left).toEqual(right);
      }),
    );
  });

  it('subtractMoney inverts addMoney', () => {
    fc.assert(
      fc.property(eurArb, eurArb, (a, b) => {
        const sum = addMoney(moneyFromMinor(a, 'EUR'), moneyFromMinor(b, 'EUR'));
        const back = subtractMoney(sum, moneyFromMinor(b, 'EUR'));
        expect(back.amountMinor).toBe(a);
      }),
    );
  });

  it('sumMoney never mixes currencies', () => {
    fc.assert(
      fc.property(eurArb, eurArb, (a, b) => {
        expect(() =>
          sumMoney([moneyFromMinor(a, 'EUR'), moneyFromMinor(b, 'USD')]),
        ).toThrow(MoneyDomainError);
      }),
    );
  });

  it('moneyFromMinor rejects non-integer amounts', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (n) => {
        fc.pre(!Number.isInteger(n));
        expect(() => moneyFromMinor(n, 'EUR')).toThrow(MoneyDomainError);
      }),
    );
  });

  it('majorUnitsStringToMinor round-trips display integers for EUR', () => {
    fc.assert(
      fc.property(fc.integer({ min: -999_999, max: 999_999 }), (major) => {
        const minor = majorUnitsStringToMinor(String(major), 'EUR');
        expect(minor).toBe(major * 100);
      }),
    );
  });

  it('JPY minor amounts stay integer with 0 decimal scale', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (yen) => {
        const m = moneyFromMinor(yen, 'JPY');
        expect(m.amountMinor).toBe(yen);
        expect(Number.isInteger(m.amountMinor)).toBe(true);
      }),
    );
  });
});
