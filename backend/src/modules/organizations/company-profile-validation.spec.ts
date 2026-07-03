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

  it('accepts full company information UI payload shape', async () => {
    const errors = await validateDto({
      companyName: 'SynqDrive GmbH',
      legalCompanyName: 'SynqDrive GmbH',
      legalForm: 'GMBH',
      managerName: 'Max Admin',
      managerEmail: 'admin@synq.test',
      language: 'de-DE',
      timezone: 'Europe/Berlin',
      address: 'Musterstraße 1',
      zip: '10115',
      city: 'Berlin',
      state: 'Berlin',
      country: 'DE',
      phone: '+49 30 123',
      email: 'info@synq.test',
      website: 'https://synq.test',
      invoiceEmail: 'billing@synq.test',
      taxNumber: '12/345/67890',
      vatId: 'DE123456789',
      isSmallBusiness: false,
      defaultVatRate: 19,
      paymentTermsDays: 14,
      invoicePrefix: 'RE-',
      nextInvoiceNumber: 42,
      bankName: 'Synq Bank',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      accentColor: '#0F766E',
      pdfFooterText: 'Footer',
      emailSignature: 'Grüße',
    });
    expect(errors.length).toBe(0);
  });
});
