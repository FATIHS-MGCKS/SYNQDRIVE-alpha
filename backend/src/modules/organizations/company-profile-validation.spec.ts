import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateTenantOrganizationProfileDto } from './dto/update-tenant-organization-profile.dto';

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateTenantOrganizationProfileDto, payload);
  return validate(dto);
}

describe('UpdateTenantOrganizationProfileDto validation', () => {
  it('rejects invalid email', async () => {
    const errors = await validateDto({ email: 'not-an-email' });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejects invalid invoice email', async () => {
    const errors = await validateDto({ invoiceEmail: 'bad@' });
    expect(errors.some((e) => e.property === 'invoiceEmail')).toBe(true);
  });

  it('rejects nextInvoiceNumber below 1', async () => {
    const errors = await validateDto({ nextInvoiceNumber: 0 });
    expect(errors.some((e) => e.property === 'nextInvoiceNumber')).toBe(true);
  });

  it('rejects negative paymentTermsDays', async () => {
    const errors = await validateDto({ paymentTermsDays: -1 });
    expect(errors.some((e) => e.property === 'paymentTermsDays')).toBe(true);
  });

  it('allows empty optional email as null', async () => {
    const errors = await validateDto({ managerEmail: '' });
    expect(errors.length).toBe(0);
  });

  it('accepts valid patch payload', async () => {
    const errors = await validateDto({
      companyName: 'Test GmbH',
      email: 'info@test.de',
      paymentTermsDays: 14,
      nextInvoiceNumber: 100,
    });
    expect(errors.length).toBe(0);
  });
});
