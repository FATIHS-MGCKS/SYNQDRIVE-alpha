import { BadRequestException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { assertPlatformProductAssignable } from './retired-platform-product-slugs';

describe('retired-platform-product-slugs', () => {
  it('rejects TAXI assignment', () => {
    expect(() => assertPlatformProductAssignable(ProductSlug.TAXI)).toThrow(BadRequestException);
    expect(() => assertPlatformProductAssignable('taxi')).toThrow(/retired/i);
  });

  it('allows RENTAL, FLEET, and VYMOD', () => {
    expect(() => assertPlatformProductAssignable(ProductSlug.RENTAL)).not.toThrow();
    expect(() => assertPlatformProductAssignable(ProductSlug.FLEET)).not.toThrow();
    expect(() => assertPlatformProductAssignable(ProductSlug.VYMOD)).not.toThrow();
  });
});