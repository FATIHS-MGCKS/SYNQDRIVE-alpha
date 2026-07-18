import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertStationPositionVersionMatches,
  assertStationUpdatedAtMatches,
  parseExpectedUpdatedAt,
  stationUpdatedAtMatches,
} from './station-optimistic-concurrency.util';
import { StationConcurrencyErrorCode } from './station-optimistic-concurrency.constants';

describe('station-optimistic-concurrency.util', () => {
  it('parses ISO updatedAt values', () => {
    const value = '2026-07-18T12:00:00.000Z';
    expect(parseExpectedUpdatedAt(value).toISOString()).toBe(value);
  });

  it('rejects invalid updatedAt values', () => {
    expect(() => parseExpectedUpdatedAt('not-a-date')).toThrow(BadRequestException);
  });

  it('matches station updatedAt exactly', () => {
    const date = new Date('2026-07-18T12:00:00.000Z');
    expect(stationUpdatedAtMatches(date, new Date('2026-07-18T12:00:00.000Z'))).toBe(true);
    expect(stationUpdatedAtMatches(date, new Date('2026-07-18T12:00:01.000Z'))).toBe(false);
  });

  it('throws 409 when station updatedAt mismatches', () => {
    const actual = new Date('2026-07-18T12:00:00.000Z');

    expect(() =>
      assertStationUpdatedAtMatches({
        expectedUpdatedAt: '2026-07-18T12:00:01.000Z',
        actualUpdatedAt: actual,
      }),
    ).toThrow(ConflictException);

    try {
      assertStationUpdatedAtMatches({
        expectedUpdatedAt: '2026-07-18T12:00:01.000Z',
        actualUpdatedAt: actual,
      });
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: StationConcurrencyErrorCode.STATION_UPDATED_AT_CONFLICT,
      });
    }
  });

  it('throws 409 when station position version mismatches', () => {
    expect(() =>
      assertStationPositionVersionMatches({ expectedVersion: 2, actualVersion: 3 }),
    ).toThrow(ConflictException);
  });
});
