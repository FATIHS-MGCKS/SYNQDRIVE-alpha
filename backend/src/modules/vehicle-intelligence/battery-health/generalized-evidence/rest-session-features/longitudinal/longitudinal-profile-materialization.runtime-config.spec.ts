import * as fs from 'fs';
import * as os from 'os';
import {
  BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV,
  getBatteryV2LongitudinalMaterializationSessionLimit,
  parseCliSessionLimitArg,
  parseStrictPositiveIntegerString,
  resolveLongitudinalMaterializationSessionLimitOverride,
} from './longitudinal-profile-materialization.runtime-config';
import { LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS } from './longitudinal-input.constants';

describe('longitudinal-profile-materialization.runtime-config strict session limits', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function setEnvLimit(value: string | undefined): void {
    if (value == null) {
      delete process.env[BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV];
      return;
    }
    process.env[BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT_ENV] = value;
  }

  it('E — session limit absent => D1 DB safety max default', () => {
    setEnvLimit(undefined);
    expect(getBatteryV2LongitudinalMaterializationSessionLimit()).toBe(
      LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS,
    );
  });

  it.each(['1', '25', '100'])('accepts env %s', (value) => {
    setEnvLimit(value);
    expect(getBatteryV2LongitudinalMaterializationSessionLimit()).toBe(Number(value));
  });

  it('caps env 101 to D1 max', () => {
    setEnvLimit('101');
    expect(getBatteryV2LongitudinalMaterializationSessionLimit()).toBe(100);
  });

  it.each(['0', '-1', '1.5', '25foo', ' 1.5 ', 'NaN', 'Infinity', '1e2'])(
    'rejects env %s => default',
    (value) => {
      setEnvLimit(value);
      expect(getBatteryV2LongitudinalMaterializationSessionLimit()).toBe(100);
    },
  );

  it('rejects unsafe integer string => default', () => {
    const unsafe = `${Number.MAX_SAFE_INTEGER + 1}`;
    setEnvLimit(unsafe);
    expect(getBatteryV2LongitudinalMaterializationSessionLimit()).toBe(100);
  });

  describe('programmatic override', () => {
    it.each([1, 25, 100])('accepts %i', (value) => {
      expect(resolveLongitudinalMaterializationSessionLimitOverride(value)).toEqual({
        status: 'OK',
        sessionLimit: value,
      });
    });

    it('caps 101 to 100', () => {
      expect(resolveLongitudinalMaterializationSessionLimitOverride(101)).toEqual({
        status: 'OK',
        sessionLimit: 100,
      });
    });

    it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      'rejects %p',
      (value) => {
        expect(resolveLongitudinalMaterializationSessionLimitOverride(value as number)).toEqual({
          status: 'INVALID_OVERRIDE',
          message: 'sessionLimit must be a positive safe integer',
        });
      },
    );
  });

  describe('CLI session limit', () => {
    it('accepts --session-limit=25', () => {
      expect(parseCliSessionLimitArg('25')).toEqual({ status: 'OK', value: 25 });
    });

    it('rejects 25foo', () => {
      expect(parseCliSessionLimitArg('25foo').status).toBe('INVALID');
    });

    it('rejects 1.5', () => {
      expect(parseCliSessionLimitArg('1.5').status).toBe('INVALID');
    });

    it('omitted', () => {
      expect(parseCliSessionLimitArg(undefined)).toEqual({ status: 'OMITTED' });
    });
  });

  it('parseStrictPositiveIntegerString rejects partial parse', () => {
    expect(parseStrictPositiveIntegerString('25foo')).toBeNull();
  });
});
