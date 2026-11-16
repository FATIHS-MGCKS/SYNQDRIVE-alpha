import { BadRequestException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { parseProductSlugParam } from './parse-product-slug';

describe('parseProductSlugParam', () => {
  it('accepts valid slugs case-insensitively', () => {
    expect(parseProductSlugParam('rental')).toBe(ProductSlug.RENTAL);
  });

  it('rejects missing slug', () => {
    expect(() => parseProductSlugParam(undefined)).toThrow(BadRequestException);
  });

  it('accepts VYMOD (P3-PR12A catalog)', () => {
    expect(parseProductSlugParam('vymod')).toBe(ProductSlug.VYMOD);
  });

  it('accepts legacy TAXI', () => {
    expect(parseProductSlugParam('taxi')).toBe(ProductSlug.TAXI);
  });

  it('rejects unknown slug', () => {
    expect(() => parseProductSlugParam('UNKNOWN_PRODUCT')).toThrow(BadRequestException);
  });
});