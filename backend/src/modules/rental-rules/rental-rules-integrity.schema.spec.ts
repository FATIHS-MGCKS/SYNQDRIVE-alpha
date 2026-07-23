import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeRentalCategoryName } from './rental-rules-category.util';
import {
  RENTAL_RULES_DB_LIMITS,
  RENTAL_RULES_INTEGRITY_MIGRATION_ID,
} from './rental-rules-db-integrity.constants';
import { RENTAL_RULES_VALIDATION_LIMITS } from './rental-rules-validation.constants';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  `prisma/migrations/${RENTAL_RULES_INTEGRITY_MIGRATION_ID}/migration.sql`,
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Rental rules DB integrity schema (Prompt 20)', () => {
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

  it('defines normalized category name uniqueness per organization', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model RentalVehicleCategory[\s\S]*?nameNormalized/);
    expect(schema).toContain(
      '@@unique([organizationId, nameNormalized], map: "rental_vehicle_categories_org_name_normalized_key")',
    );
  });

  it('keeps one override row per vehicle', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model VehicleRentalRequirementOverride[\s\S]*?vehicleId\s+String\s+@unique/);
  });

  it('indexes active organization rules and eligibility revision lookups', () => {
    const schema = readSchema();
    expect(schema).toContain('@@index([isActive], map: "organization_rental_rules_is_active_idx")');
    expect(schema).toContain(
      '@@index([organizationId, bookingId, ruleRevision], map: "booking_eligibility_approvals_org_booking_revision_idx")',
    );
    expect(schema).toContain(
      '@@index([organizationId, ruleRevision, createdAt], map: "booking_eligibility_approvals_org_revision_created_idx")',
    );
  });

  it('aligns DB CHECK bounds with validation constants', () => {
    expect(RENTAL_RULES_DB_LIMITS.minimumAgeYears).toEqual(RENTAL_RULES_VALIDATION_LIMITS.minimumAgeYears);
    expect(RENTAL_RULES_DB_LIMITS.minimumLicenseHoldingMonths).toEqual(
      RENTAL_RULES_VALIDATION_LIMITS.minimumLicenseHoldingMonths,
    );
    expect(RENTAL_RULES_DB_LIMITS.depositAmountCents).toEqual(
      RENTAL_RULES_VALIDATION_LIMITS.depositAmountCents,
    );
  });

  it('uses the same category normalization as the application layer', () => {
    expect(normalizeRentalCategoryName('  Premium   Fleet  ')).toBe('premium fleet');
  });

  it('migration repairs data before adding constraints (non-destructive)', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('rental_rules_integrity_repair_log');
    expect(sql).toContain('rename_empty_category_name');
    expect(sql).toContain('rename_duplicate_category_name');
    expect(sql).toContain('fix_override_organization_mismatch');
    expect(sql).toContain('clear_cross_tenant_category_assignment');
    expect(sql).toContain('rental_vehicle_categories_org_name_normalized_key');
    expect(sql).toContain('organization_rental_rules_minimum_age_years_check');
    expect(sql).toContain('rental_vehicle_categories_name_not_blank_check');
    expect(sql).toContain('booking_eligibility_approvals_org_booking_revision_idx');
    expect(sql).not.toMatch(/DROP TABLE/i);
  });
});
