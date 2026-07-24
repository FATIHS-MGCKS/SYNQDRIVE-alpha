import {
  minimizeMcpToolOutput,
  minimizeRecordFields,
  sanitizeAiPromptContext,
} from './external-access-data-minimizer';

describe('external-access-data-minimizer', () => {
  it('minimizeRecordFields — allowedFields strips non-listed keys', () => {
    const result = minimizeRecordFields(
      { plate: 'B-AB 123', vin: 'SECRET', mileage: 12000 },
      { allowedFields: ['plate', 'mileage'] },
    );
    expect(result).toEqual({ plate: 'B-AB 123', mileage: 12000 });
  });

  it('minimizeRecordFields — deniedFields removes sensitive keys', () => {
    const result = minimizeRecordFields(
      { email: 'a@b.de', phone: '+49123', status: 'ACTIVE' },
      { deniedFields: ['email', 'phone'] },
    );
    expect(result).toEqual({ status: 'ACTIVE' });
  });

  it('sanitizeAiPromptContext — marks minimized AI context', () => {
    const result = sanitizeAiPromptContext(
      { iban: 'DE123', name: 'Fleet GmbH' },
      { deniedFields: ['iban'] },
    );
    expect(result.name).toBe('Fleet GmbH');
    expect(result.iban).toBeUndefined();
    expect(result._accessMinimized).toBe(true);
  });

  it('minimizeMcpToolOutput — recursively filters nested customer records', () => {
    const result = minimizeMcpToolOutput(
      {
        customers: [
          { reference: 'c-1', email: 'secret@x.de', status: 'ACTIVE' },
          { reference: 'c-2', phone: '+49111', status: 'PENDING' },
        ],
      },
      { allowedFields: ['reference', 'status'] },
    );
    expect(result.customers).toEqual([
      { reference: 'c-1', status: 'ACTIVE' },
      { reference: 'c-2', status: 'PENDING' },
    ]);
    expect(result._outputMinimized).toBe(true);
  });
});
