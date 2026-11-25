import { BadRequestException } from '@nestjs/common';
import { parseProductMetadataPatchBody } from './parse-product-metadata-patch';

describe('parseProductMetadataPatchBody', () => {
  it('accepts valid patch with nullable description', () => {
    const parsed = parseProductMetadataPatchBody({
      name: 'SYNQDRIVE Rental',
      description: '  Ops product  ',
      ifCurrentName: 'Rental',
      ifCurrentDescription: null,
    });
    expect(parsed.name).toBe('SYNQDRIVE Rental');
    expect(parsed.description).toBe('Ops product');
    expect(parsed.ifCurrentName).toBe('Rental');
    expect(parsed.ifCurrentDescription).toBeNull();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      parseProductMetadataPatchBody({
        name: 'A',
        slug: 'RENTAL',
        ifCurrentName: 'A',
        ifCurrentDescription: null,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects empty name', () => {
    expect(() =>
      parseProductMetadataPatchBody({
        name: '   ',
        ifCurrentName: 'A',
        ifCurrentDescription: null,
      }),
    ).toThrow(BadRequestException);
  });
});