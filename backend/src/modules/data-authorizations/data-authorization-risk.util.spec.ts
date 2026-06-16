import { calculateAuthorizationRiskLevel, normalizeDataCategories } from './data-authorization-risk.util';

describe('normalizeDataCategories', () => {
  it('maps legacy keys to canonical categories', () => {
    expect(normalizeDataCategories(['trip_data', 'customer_data'])).toEqual([
      'TRIP_DATA',
      'CUSTOMER_DATA',
    ]);
  });
});

describe('calculateAuthorizationRiskLevel', () => {
  it('returns LOW for basic vehicle identity only', () => {
    expect(
      calculateAuthorizationRiskLevel({
        dataCategories: ['VEHICLE_IDENTITY', 'VEHICLE_STATUS'],
      }),
    ).toBe('LOW');
  });

  it('returns HIGH for GPS telemetry categories', () => {
    expect(
      calculateAuthorizationRiskLevel({
        dataCategories: ['GPS_LOCATION', 'TELEMETRY_DATA'],
      }),
    ).toBe('HIGH');
  });

  it('returns CRITICAL for customer + GPS combination', () => {
    expect(
      calculateAuthorizationRiskLevel({
        dataCategories: ['CUSTOMER_DATA', 'GPS_LOCATION'],
      }),
    ).toBe('CRITICAL');
  });

  it('returns CRITICAL for financial data shared with external partner', () => {
    expect(
      calculateAuthorizationRiskLevel({
        dataCategories: ['FINANCIAL_DATA'],
        processorType: 'EXTERNAL_PARTNER',
      }),
    ).toBe('CRITICAL');
  });

  it('matches DIMO telemetry authorization risk', () => {
    expect(
      calculateAuthorizationRiskLevel({
        dataCategories: [
          'GPS_LOCATION',
          'TELEMETRY_DATA',
          'VEHICLE_IDENTITY',
          'VEHICLE_STATUS',
          'ODOMETER',
          'TRIP_DATA',
          'HEALTH_SIGNALS',
          'DTC_CODES',
        ],
      }),
    ).toBe('HIGH');
  });
});
