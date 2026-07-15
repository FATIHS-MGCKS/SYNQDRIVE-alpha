import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260715240000_billing_command_idempotency/migration.sql',
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Billing command idempotency schema (Prompt 18)', () => {
  it('passes prisma validate', () => {
    const output = execSync('npm run prisma:validate', {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive',
      },
    });
    expect(output).toContain('valid');
  });

  it('defines billing command inbox with idempotency and lifecycle timestamps', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingCommand[\s\S]*?idempotencyKey/);
    expect(schema).toMatch(/model BillingCommand[\s\S]*?commandType/);
    expect(schema).toMatch(/model BillingCommand[\s\S]*?requestHash/);
    expect(schema).toMatch(/model BillingCommand[\s\S]*?requestPayload/);
    expect(schema).toMatch(/model BillingCommand[\s\S]*?resultReference/);
    expect(schema).toMatch(/model BillingCommand[\s\S]*?completedAt/);
    expect(schema).toMatch(/model BillingCommand[\s\S]*?failedAt/);
    expect(schema).toContain('@@unique([organizationId, idempotencyKey])');
    expect(schema).toContain('@@map("billing_commands")');
  });

  it('extends billing audit logs with request metadata', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingAuditLog[\s\S]*?requestId/);
    expect(schema).toMatch(/model BillingAuditLog[\s\S]*?idempotencyKey/);
    expect(schema).toMatch(/model BillingAuditLog[\s\S]*?reason/);
    expect(schema).toMatch(/model BillingAuditLog[\s\S]*?changedFieldsJson/);
  });

  it('migration creates billing_commands and audit metadata columns', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('CREATE TABLE "billing_commands"');
    expect(sql).toContain('billing_commands_organization_id_idempotency_key_key');
    expect(sql).toContain('billing_audit_logs_idempotency_key_idx');
    expect(sql).toContain('"request_id"');
    expect(sql).toContain('"changed_fields_json"');
  });
});
