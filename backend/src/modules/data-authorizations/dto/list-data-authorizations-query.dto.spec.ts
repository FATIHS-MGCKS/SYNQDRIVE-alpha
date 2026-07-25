import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListDataAuthorizationsQueryDto } from './list-data-authorizations-query.dto';

function validateQuery(query: Record<string, unknown>) {
  const dto = plainToInstance(ListDataAuthorizationsQueryDto, query, {
    enableImplicitConversion: true,
  });
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('ListDataAuthorizationsQueryDto', () => {
  it('accepts the shared data-processing hub default sort (updatedAt)', () => {
    const errors = validateQuery({ sort: 'updatedAt', dir: 'desc', limit: '25' });
    expect(errors).toHaveLength(0);
  });

  it.each(['createdAt', 'updatedAt', 'title', 'expiresAt', 'status'])(
    'accepts sort=%s',
    (sort) => {
      expect(validateQuery({ sort })).toHaveLength(0);
    },
  );

  it('rejects an unsupported sort field', () => {
    const errors = validateQuery({ sort: 'nextReviewDate' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('sort');
  });

  it('accepts the provider access section filter set', () => {
    const errors = validateQuery({
      q: 'DIMO',
      status: 'ACTIVE',
      riskLevel: 'HIGH',
      dataCategory: 'telemetry',
      sort: 'updatedAt',
      dir: 'desc',
      limit: '25',
    });
    expect(errors).toHaveLength(0);
  });
});
