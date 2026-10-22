import { isPdiInventoryRelationMissingError } from './pdi-identity-drift-shadow.data-loader.errors';

describe('isPdiInventoryRelationMissingError', () => {
  it('detects missing relation for physical_devices', () => {
    expect(
      isPdiInventoryRelationMissingError(new Error('relation "physical_devices" does not exist')),
    ).toBe(true);
    expect(
      isPdiInventoryRelationMissingError({
        code: '42P01',
        message: 'relation "physical_devices" does not exist',
      }),
    ).toBe(true);
  });

  it('does not treat unrelated SQL errors as missing schema', () => {
    expect(isPdiInventoryRelationMissingError(new Error('syntax error at or near SELECT'))).toBe(
      false,
    );
  });
});
