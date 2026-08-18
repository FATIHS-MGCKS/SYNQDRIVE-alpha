import {
  assertAllowedTemplateParamKeys,
  NotificationTemplateParamsValidationError,
  sanitizeTemplateParams,
} from './notification-template-params.validator';

describe('notification-template-params.validator', () => {
  it('strips secret-like keys and HTML content', () => {
    const result = sanitizeTemplateParams({
      label: 'WOB L 7503',
      apiKey: 'sk-live-secret',
      reason: '<b>Low tread</b>',
      password: 'hunter2',
    });
    expect(result).toEqual({
      label: 'WOB L 7503',
      reason: 'Low tread',
    });
  });

  it('filters to allowed keys when whitelist provided', () => {
    const result = sanitizeTemplateParams(
      { label: 'ABC', stationId: 'st-1', customerEmail: 'a@b.c' },
      ['label', 'stationId'],
    );
    expect(result).toEqual({ label: 'ABC', stationId: 'st-1' });
  });

  it('truncates overly long string values', () => {
    const long = 'x'.repeat(600);
    const result = sanitizeTemplateParams({ label: long });
    expect(String(result.label).length).toBe(500);
  });

  it('rejects disallowed keys', () => {
    expect(() =>
      assertAllowedTemplateParamKeys({ label: 'x', unknownKey: 'y' }, ['label']),
    ).toThrow(NotificationTemplateParamsValidationError);
  });

  it('preserves numeric and boolean params', () => {
    expect(
      sanitizeTemplateParams({ available: 2, totalVehicles: 5, active: true }),
    ).toEqual({ available: 2, totalVehicles: 5, active: true });
  });
});
