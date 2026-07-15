import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(join(__dirname, '../../../../prisma/schema.prisma'), 'utf8');

describe('Billing email schema (Prompt 29)', () => {
  it('adds BILLING_EMAIL outbound source type', () => {
    expect(schema).toContain('BILLING_EMAIL');
  });
});
