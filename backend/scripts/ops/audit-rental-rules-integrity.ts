/**
 * Read-only rental rules DB integrity audit (pre-migration preflight).
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/audit-rental-rules-integrity.ts
 *   ORG_ID=<uuid> npx ts-node -r tsconfig-paths/register scripts/ops/audit-rental-rules-integrity.ts
 *
 * Exit code 1 when blocking issues are found (empty names, norm mismatches, duplicates,
 * cross-tenant overrides/assignments, invalid numeric/currency fields).
 */
import { PrismaClient } from '@prisma/client';
import { normalizeRentalCategoryName } from '../../src/modules/rental-rules/rental-rules-category.util';
import { RENTAL_RULES_DB_LIMITS } from '../../src/modules/rental-rules/rental-rules-db-integrity.constants';

const prisma = new PrismaClient();

const { minimumAgeYears, minimumLicenseHoldingMonths, depositAmountCents } = RENTAL_RULES_DB_LIMITS;

async function countInvalidNumericRows(orgId?: string) {
  const orgFilter = orgId ? `AND organization_id = '${orgId}'` : '';
  return prisma.$queryRawUnsafe<Array<{ table_name: string; count: bigint }>>(`
    SELECT 'organization_rental_rules' AS table_name, COUNT(*)::bigint AS count
    FROM organization_rental_rules
    WHERE (
      (minimum_age_years IS NOT NULL AND (minimum_age_years < ${minimumAgeYears.min} OR minimum_age_years > ${minimumAgeYears.max}))
      OR (minimum_license_holding_months IS NOT NULL AND (minimum_license_holding_months < ${minimumLicenseHoldingMonths.min} OR minimum_license_holding_months > ${minimumLicenseHoldingMonths.max}))
      OR (deposit_amount_cents IS NOT NULL AND (deposit_amount_cents < ${depositAmountCents.min} OR deposit_amount_cents > ${depositAmountCents.max}))
    ) ${orgFilter}
    UNION ALL
    SELECT 'rental_vehicle_categories', COUNT(*)::bigint
    FROM rental_vehicle_categories
    WHERE (
      (minimum_age_years IS NOT NULL AND (minimum_age_years < ${minimumAgeYears.min} OR minimum_age_years > ${minimumAgeYears.max}))
      OR (minimum_license_holding_months IS NOT NULL AND (minimum_license_holding_months < ${minimumLicenseHoldingMonths.min} OR minimum_license_holding_months > ${minimumLicenseHoldingMonths.max}))
      OR (deposit_amount_cents IS NOT NULL AND (deposit_amount_cents < ${depositAmountCents.min} OR deposit_amount_cents > ${depositAmountCents.max}))
    ) ${orgFilter}
    UNION ALL
    SELECT 'vehicle_rental_requirement_overrides', COUNT(*)::bigint
    FROM vehicle_rental_requirement_overrides
    WHERE (
      (minimum_age_years IS NOT NULL AND (minimum_age_years < ${minimumAgeYears.min} OR minimum_age_years > ${minimumAgeYears.max}))
      OR (minimum_license_holding_months IS NOT NULL AND (minimum_license_holding_months < ${minimumLicenseHoldingMonths.min} OR minimum_license_holding_months > ${minimumLicenseHoldingMonths.max}))
      OR (deposit_amount_cents IS NOT NULL AND (deposit_amount_cents < ${depositAmountCents.min} OR deposit_amount_cents > ${depositAmountCents.max}))
    ) ${orgFilter}
  `);
}

async function countInvalidCurrencyRows(orgId?: string) {
  const orgFilter = orgId ? `AND organization_id = '${orgId}'` : '';
  return prisma.$queryRawUnsafe<Array<{ table_name: string; count: bigint }>>(`
    SELECT 'organization_rental_rules' AS table_name, COUNT(*)::bigint AS count
    FROM organization_rental_rules
    WHERE deposit_currency IS NULL
      OR length(trim(deposit_currency)) <> 3
      OR upper(trim(deposit_currency)) !~ '^[A-Z]{3}$'
      ${orgFilter}
    UNION ALL
    SELECT 'rental_vehicle_categories', COUNT(*)::bigint
    FROM rental_vehicle_categories
    WHERE deposit_currency IS NOT NULL
      AND (
        length(trim(deposit_currency)) <> 3
        OR upper(trim(deposit_currency)) !~ '^[A-Z]{3}$'
      )
      ${orgFilter}
    UNION ALL
    SELECT 'vehicle_rental_requirement_overrides', COUNT(*)::bigint
    FROM vehicle_rental_requirement_overrides
    WHERE deposit_currency IS NOT NULL
      AND (
        length(trim(deposit_currency)) <> 3
        OR upper(trim(deposit_currency)) !~ '^[A-Z]{3}$'
      )
      ${orgFilter}
  `);
}

async function countEmptyOverrideShells(orgId?: string) {
  const orgFilter = orgId ? `AND organization_id = '${orgId}'` : '';
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*)::bigint AS count
    FROM vehicle_rental_requirement_overrides
    WHERE minimum_age_years IS NULL
      AND minimum_license_holding_months IS NULL
      AND deposit_amount_cents IS NULL
      AND deposit_currency IS NULL
      AND credit_card_required IS NULL
      AND foreign_travel_policy IS NULL
      AND additional_driver_policy IS NULL
      AND young_driver_policy IS NULL
      AND insurance_requirement IS NULL
      AND manual_approval_required IS NULL
      AND notes IS NULL
      ${orgFilter}
  `);
  return Number(rows[0]?.count ?? 0n);
}

async function main() {
  const orgId = process.env.ORG_ID?.trim() || undefined;

  const categories = await prisma.rentalVehicleCategory.findMany({
    where: orgId ? { organizationId: orgId } : undefined,
    select: { id: true, organizationId: true, name: true, nameNormalized: true },
  });

  const emptyNames = categories.filter((c) => c.name.trim() === '');
  const normMismatches = categories.filter((c) => {
    if (c.nameNormalized == null) return true;
    return c.nameNormalized !== normalizeRentalCategoryName(c.name);
  });

  const byOrgNorm = new Map<string, string[]>();
  for (const cat of categories) {
    const norm = cat.nameNormalized ?? normalizeRentalCategoryName(cat.name);
    const key = `${cat.organizationId}::${norm}`;
    const list = byOrgNorm.get(key) ?? [];
    list.push(cat.id);
    byOrgNorm.set(key, list);
  }
  const duplicateNormGroups = [...byOrgNorm.entries()].filter(([, ids]) => ids.length > 1);

  const overrideMismatches = orgId
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT o.id
        FROM vehicle_rental_requirement_overrides o
        JOIN vehicles v ON v.id = o.vehicle_id
        WHERE o.organization_id <> v.organization_id
          AND o.organization_id = ${orgId}
      `
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT o.id
        FROM vehicle_rental_requirement_overrides o
        JOIN vehicles v ON v.id = o.vehicle_id
        WHERE o.organization_id <> v.organization_id
      `;

  const crossTenantAssignments = orgId
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT v.id
        FROM vehicles v
        JOIN rental_vehicle_categories c ON c.id = v.rental_category_id
        WHERE v.organization_id <> c.organization_id
          AND v.organization_id = ${orgId}
      `
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT v.id
        FROM vehicles v
        JOIN rental_vehicle_categories c ON c.id = v.rental_category_id
        WHERE v.organization_id <> c.organization_id
      `;

  const invalidNumericRows = await countInvalidNumericRows(orgId);
  const invalidCurrencyRows = await countInvalidCurrencyRows(orgId);
  const emptyOverrideShells = await countEmptyOverrideShells(orgId);

  const report = {
    organizationId: orgId ?? 'ALL',
    emptyCategoryNames: emptyNames.length,
    normalizedNameMismatches: normMismatches.length,
    duplicateNormalizedNameGroups: duplicateNormGroups.length,
    overrideOrganizationMismatches: overrideMismatches.length,
    crossTenantCategoryAssignments: crossTenantAssignments.length,
    invalidNumericRows: invalidNumericRows.map((r) => ({
      table: r.table_name,
      count: Number(r.count),
    })),
    invalidCurrencyRows: invalidCurrencyRows.map((r) => ({
      table: r.table_name,
      count: Number(r.count),
    })),
    emptyOverrideShells,
  };

  console.log(JSON.stringify(report, null, 2));

  const blocking =
    emptyNames.length > 0 ||
    normMismatches.length > 0 ||
    duplicateNormGroups.length > 0 ||
    overrideMismatches.length > 0 ||
    crossTenantAssignments.length > 0 ||
    invalidNumericRows.some((r) => Number(r.count) > 0) ||
    invalidCurrencyRows.some((r) => Number(r.count) > 0);

  if (blocking) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
