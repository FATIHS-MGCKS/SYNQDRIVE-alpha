/**
 * Future feature-gating modules that should migrate to `BillingEntitlementResolver`.
 *
 * Prompt 19 wires billing-near reads only. Do not gate product features here yet.
 */
export const BILLING_ENTITLEMENT_MIGRATION_MODULES = [
  'rental.bookings',
  'rental.pricing',
  'fleet.vehicles',
  'fleet.telemetry',
  'addon.voice_agent',
  'addon.ai_package',
  'addon.whatsapp',
] as const;

export type BillingEntitlementMigrationModule =
  (typeof BILLING_ENTITLEMENT_MIGRATION_MODULES)[number];

/**
 * OrganizationProduct remains a legacy projection target — never an entitlement source of truth.
 * Sync projections from billing contract via future backfill jobs, not direct reads for access.
 */
export const BILLING_ENTITLEMENT_PROJECTION_TARGETS = [
  'organization_products',
] as const;
