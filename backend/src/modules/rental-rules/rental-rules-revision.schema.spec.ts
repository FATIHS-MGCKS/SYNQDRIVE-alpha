import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260723130000_rental_rule_revisions/migration.sql',
);

describe('Rental rule revisions schema (Prompt 24)', () => {
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

  it('defines RentalRuleRevision with required columns and enums', () => {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    expect(schema).toContain('enum RentalRuleRevisionScopeType');
    expect(schema).toContain('enum RentalRuleRevisionStatus');
    expect(schema).toMatch(/model RentalRuleRevision[\s\S]*?scopeType/);
    expect(schema).toMatch(/model RentalRuleRevision[\s\S]*?normalizedRules\s+Json/);
    expect(schema).toMatch(/model RentalRuleRevision[\s\S]*?rulesHash\s+String/);
    expect(schema).toMatch(/model RentalRuleRevision[\s\S]*?effectiveFrom/);
    expect(schema).toMatch(/model RentalRuleRevision[\s\S]*?effectiveTo/);
    expect(schema).toMatch(/model RentalRuleRevision[\s\S]*?supersedesRevisionId/);
    expect(schema).toMatch(/model RentalRuleRevision[\s\S]*?lockVersion\s+Int/);
    expect(schema).toContain(
      '@@unique([organizationId, scopeType, scopeId, version], map: "rental_rule_revisions_scope_version_key")',
    );
  });

  it('migration backfills initial ACTIVE revisions for all scopes', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('CREATE TYPE "RentalRuleRevisionScopeType"');
    expect(sql).toContain('rental_rule_revisions_one_active_per_scope_idx');
    expect(sql).toContain('FROM "organization_rental_rules"');
    expect(sql).toContain('FROM "rental_vehicle_categories"');
    expect(sql).toContain('FROM "vehicle_rental_requirement_overrides"');
    expect(sql).toContain('Initial revision backfill (Prompt 24)');
    expect(sql).toContain('ON CONFLICT ("organization_id", "scope_type", "scope_id", "version") DO NOTHING');
  });
});
