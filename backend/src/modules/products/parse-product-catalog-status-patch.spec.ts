import { BadRequestException } from '@nestjs/common';
import { ProductCatalogStatus } from '@prisma/client';
import { parseProductCatalogStatusPatchBody } from './parse-product-catalog-status-patch';

describe('parseProductCatalogStatusPatchBody', () => {
  it('accepts strict allowlist fields only', () => {
    expect(() =>
      parseProductCatalogStatusPatchBody({
        catalogStatus: 'DISABLED',
        ifCurrentCatalogStatus: 'ACTIVE',
        changeReason: 'Maintenance window',
        extra: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('parses ACTIVE/DISABLED transitions', () => {
    const parsed = parseProductCatalogStatusPatchBody({
      catalogStatus: 'disabled',
      ifCurrentCatalogStatus: 'ACTIVE',
      changeReason: 'Pause new admissions',
    });
    expect(parsed.catalogStatus).toBe(ProductCatalogStatus.DISABLED);
    expect(parsed.ifCurrentCatalogStatus).toBe(ProductCatalogStatus.ACTIVE);
    expect(parsed.changeReason).toBe('Pause new admissions');
  });

  it('rejects invalid catalog status values', () => {
    expect(() =>
      parseProductCatalogStatusPatchBody({
        catalogStatus: 'RETIRED',
        ifCurrentCatalogStatus: 'ACTIVE',
        changeReason: 'n/a',
      }),
    ).toThrow(BadRequestException);
  });
});