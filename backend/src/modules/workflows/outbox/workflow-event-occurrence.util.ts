/** Stable occurrence keys for recurring state/findings — used in idempotencyKey. */
export function buildWorkflowOccurrenceId(parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p != null && String(p).length > 0).join(':');
}

export function buildBookingTimingOccurrenceId(
  eventType: string,
  bookingId: string,
  milestoneDateOnly: string,
): string {
  return buildWorkflowOccurrenceId([eventType, bookingId, milestoneDateOnly]);
}

export function buildVehicleFindingOccurrenceId(
  eventType: string,
  vehicleId: string,
  findingKey: string,
): string {
  return buildWorkflowOccurrenceId([eventType, vehicleId, findingKey]);
}

export function buildInvoiceTimingOccurrenceId(
  eventType: string,
  invoiceId: string,
  dueDateOnly: string,
): string {
  return buildWorkflowOccurrenceId([eventType, invoiceId, dueDateOnly]);
}

export function buildDocumentExpiringOccurrenceId(
  customerId: string,
  documentId: string,
  expiresOn: string,
): string {
  return buildWorkflowOccurrenceId([
    'customer.document.expiring',
    customerId,
    documentId,
    expiresOn,
  ]);
}
