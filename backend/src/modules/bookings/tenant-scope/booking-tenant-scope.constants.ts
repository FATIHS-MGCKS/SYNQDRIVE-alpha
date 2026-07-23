export const BOOKING_TENANT_SCOPE_ERROR_CODE = 'BOOKING_TENANT_SCOPE_NOT_FOUND' as const;

/** Uniform message — avoids leaking whether a resource exists in another org. */
export const BOOKING_TENANT_SCOPE_MESSAGE =
  'Resource not found for organization' as const;
