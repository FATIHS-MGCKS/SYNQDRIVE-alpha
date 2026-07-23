import { normalizeRentalCategoryName } from './rental-rules-category.util';

describe('normalizeRentalCategoryName', () => {
  it('trims, collapses whitespace, and lowercases', () => {
    expect(normalizeRentalCategoryName('  Premium   Fleet  ')).toBe('premium fleet');
  });

  it('treats case variants as identical', () => {
    expect(normalizeRentalCategoryName('Economy')).toBe(normalizeRentalCategoryName('economy'));
  });
});
