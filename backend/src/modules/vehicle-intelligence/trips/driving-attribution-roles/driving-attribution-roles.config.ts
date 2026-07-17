/** Version bump when role resolution semantics change. */
export const DRIVING_ATTRIBUTION_ROLES_VERSION = 'driving-attribution-roles-v1';

/** UUID v4-ish pattern — distinguishes Customer IDs from free-text driver names. */
export const CUSTOMER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
