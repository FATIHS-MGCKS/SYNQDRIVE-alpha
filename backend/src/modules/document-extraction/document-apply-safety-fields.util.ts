/** Maps apply-safety reason codes to confirmedData field keys for UI highlighting. */
export const APPLY_SAFETY_REASON_FIELD_MAP: Record<string, string> = {
  EVENT_DATE_REQUIRED: 'eventDate',
  BRAKE_SERVICE_DATE_REQUIRED: 'eventDate',
  BRAKE_SERVICE_KIND_REQUIRED: 'serviceKind',
  INVOICE_LINE_ITEM_FIELDS_REQUIRED: 'lineItems',
  FINE_OFFENSE_DATE_REQUIRED: 'eventDate',
  FINE_OFFENSE_TYPE_REQUIRED: 'offenseType',
  FINE_POSITIVE_AMOUNT_REQUIRED: 'totalCents',
  INVOICE_TOTAL_REQUIRED: 'totalCents',
  INVOICE_DATE_REQUIRED: 'invoiceDate',
  INVOICE_TAX_SEMANTICS_UNCLEAR: 'taxRate',
  INVOICE_LINE_ITEMS_REQUIRED: 'lineItems',
  DAMAGE_DESCRIPTION_OR_AREA_REQUIRED: 'description',
  DAMAGE_SEVERITY_REQUIRED: 'severity',
  DAMAGE_TYPE_REQUIRED: 'damageType',
  TIRE_MEASUREMENT_REQUIRED: 'treadDepthMm',
  BATTERY_VALID_MEASUREMENT_REQUIRED: 'voltageV',
  TUV_VALID_UNTIL_REQUIRED: 'validUntil',
  BOKRAFT_VALID_UNTIL_REQUIRED: 'validUntil',
};

export function missingFieldsFromApplyReasons(reasons: string[]): string[] {
  const fields = reasons
    .map((reason) => APPLY_SAFETY_REASON_FIELD_MAP[reason])
    .filter((field): field is string => Boolean(field));
  return Array.from(new Set(fields));
}
