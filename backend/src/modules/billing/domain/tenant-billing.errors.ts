export const TenantBillingErrorCode = {
  INVOICE_NOT_FOUND: 'BILLING_INVOICE_NOT_FOUND',
  PAYMENT_METHOD_REQUIRED: 'BILLING_PAYMENT_METHOD_REQUIRED',
  PORTAL_UNAVAILABLE: 'BILLING_PORTAL_UNAVAILABLE',
  INVOICE_PDF_UNAVAILABLE: 'BILLING_INVOICE_PDF_UNAVAILABLE',
} as const;

export type TenantBillingErrorCode =
  (typeof TenantBillingErrorCode)[keyof typeof TenantBillingErrorCode];

export function tenantBillingError(
  code: TenantBillingErrorCode,
  message?: string,
): { code: TenantBillingErrorCode; message: string } {
  return { code, message: message ?? code };
}
